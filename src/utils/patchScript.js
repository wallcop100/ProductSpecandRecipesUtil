/**
 * patchScript.js — generate Office Scripts (ExcelScript) patches from the dirty
 * registries.
 *
 * The app no longer writes the xlsx files. Each export produces a runnable
 * Office Script (one per file): a `main(workbook)` function that resolves
 * columns by header name, then applies the changes. Row lookup keys:
 *   - PS  → sheet "Form",         key EntityRef (unique)
 *   - DB  → sheet "ElementTypes",  key Ref (unique)
 *   - RS  → sheet "Form",         composite key ContextType+ContextRef+RecipeIndex+EntityRef
 *
 * Duplicates are resolved HERE (before generating): entries are coalesced to
 * one deterministic operation per target — update / append / soft-delete.
 *
 * EVERY SCRIPT IS IDEMPOTENT. A row the tool believes is new is still looked up by its
 * key before being appended, because `_isNew` is a belief about the workbook, not a fact
 * about it: after you paste a patch, the tool still has the old workbook in memory, so
 * the next export would append the same rows again. It used to. Pasting a patch twice —
 * or exporting twice — duplicated every new row in the DesignDB, the Product Spec and
 * the Recipes alike.
 *
 * Running any script a second time is now a no-op.
 */

// Canonical field → Excel column header (ported from backend/app.py).
const PS_FIELD_TO_EXCEL = {
  ElementTypeRef: 'EntityRef',
  Manufacturer: 'Manufacturer',
  ProductCode: 'ProductCode',
  ComponentDescription: 'ComponentDescription',
  InternalNotesText: 'InternalNotesText',
  IsTBC: 'IsTBC',
  IsDeleted: 'IsDeleted',
  IsPropertiesTBC: 'IsPropertiesTBC',
}

const RS_FIELD_TO_EXCEL = {
  ContextType: 'ContextType',
  ContextRef: 'ContextRef',
  RecipeIndex: 'RecipeIndex',
  ElementTypeRef: 'EntityRef',
  SortOrder: 'Sort Order',
  Quantity: 'Quantity',
  PackQuantity: 'PackQuantity',
  IsDeleted: 'IsDeleted',
  IsDesign: 'IsDesign',
  IsContractItem: 'IsContractItem',
  IsTRItem: 'IsTRItem',
  Dim_QuantityMultiplier: 'Dim_QuantityMultiplier',
  IsInteger: 'IsInteger',
}

const DB_FIELD_TO_EXCEL = {
  ElementTypeRef: 'Ref',
  Name: 'Name',
  Description: 'Description',
  // Free-form attributes ("Colour: Blue"). A new ElementType records its product
  // identity here — a product is (manufacturer, code) and the two never travel apart.
  Details: 'Details',
  Family: 'ParentRef',
  IsCollection: 'IsCollection',
  IsDeleted: 'IsDeleted',
  SortOrder: 'SortOrder',
}

// RS row objects may carry camelCase aliases; changedFields/before are PascalCase.
const RS_FIELD_ALIASES = {
  ContextType: 'contextType', ContextRef: 'contextRef', RecipeIndex: 'recipeIndex',
  ElementTypeRef: 'elementTypeRef', SortOrder: 'sortOrder', Quantity: 'quantity',
  PackQuantity: 'packQuantity', IsDeleted: 'isDeleted', IsDesign: 'isDesign',
  IsContractItem: 'isContractItem', IsTRItem: 'isTRItem',
  Dim_QuantityMultiplier: 'dimQtyMultiplier', IsInteger: 'isInteger',
}

const RS_KEY_FIELDS = ['ContextType', 'ContextRef', 'RecipeIndex', 'ElementTypeRef']
const NUMERIC_FIELDS = new Set(['RecipeIndex', 'Quantity', 'PackQuantity', 'SortOrder', 'Dim_QuantityMultiplier'])

function rsValue(row, field) {
  if (row[field] !== undefined) return row[field]
  const alias = RS_FIELD_ALIASES[field]
  return alias !== undefined ? row[alias] : undefined
}

function isBlank(v) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
}

/** setValue literal: numbers stay numeric, strings quote, blank -> null (-> .clear()). */
function literal(field, v) {
  if (isBlank(v)) return 'null'
  if (NUMERIC_FIELDS.has(field)) {
    const s = String(v).trim()
    if (/^-?\d+(\.\d+)?$/.test(s)) return s
  }
  if (typeof v === 'number') return String(v)
  return JSON.stringify(String(v))
}

const q = s => JSON.stringify(s)

// Top-level helpers, appended after main(). Office Scripts is TypeScript, so
// every parameter/return is typed with the ExcelScript.* type names.
const HELPERS = `function colMap(header: (string | number | boolean)[], names: string[]): { [key: string]: number } {
  // The schema is fixed, so the header row is read ONCE (it is data[0]) and mapped in
  // memory. No live header search over a 16,384-cell row per column, which hung Excel.
  const idx: { [key: string]: number } = {};
  for (let c = 0; c < header.length; c++) idx[String(header[c]).trim()] = c;
  const m: { [key: string]: number } = {};
  for (const name of names) {
    m[name] = (idx[name] === undefined) ? -1 : idx[name];
    if (m[name] < 0) console.log("WARNING: column not found: " + name);
  }
  return m;
}
function findKey(data: (string | number | boolean)[][], keyCol: number, val: string): number {
  if (keyCol < 0) return -1;
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][keyCol]).trim() === val) return r;
  }
  return -1;
}
function rowWhere(data: (string | number | boolean)[][], crit: { c: number; v: string }[]): number {
  for (let r = 1; r < data.length; r++) {
    let ok = true;
    for (const k of crit) {
      if (k.c < 0 || String(data[r][k.c]).trim() !== k.v) { ok = false; break; }
    }
    if (ok) return r;
  }
  return -1;
}
function writeCell(S: ExcelScript.Worksheet, r: number, c: number, v: string | number | null): void {
  if (c < 0 || r < 0) return;
  const cell = S.getCell(r, c);
  if (v === null) cell.clear(ExcelScript.ClearApplyTo.contents);
  else cell.setValue(v);
}`

/**
 * Wrap the operation blocks in a runnable main() + helpers. USED is a placeholder.
 *
 * The whole sheet is read ONCE (getUsedRange → getValues) and everything after —
 * column resolution AND row lookups — happens against that in-memory array. The only
 * live Excel calls are that one read and the setValue writes. No find(), no
 * getEntireRow, no getEntireColumn: those live searches are what froze Excel.
 */
function wrapMain(filename, sheet, blocks, { needAppend }) {
  if (blocks.length === 0) return ''
  const pre = [
    `    const S = workbook.getWorksheet(${q(sheet)});`,
    '    const used = S.getUsedRange();',
    '    if (!used) { console.log("Sheet has no data - nothing to patch."); return; }',
    '    const data = used.getValues();',
    '    const col = colMap(data[0], USED);',
  ]
  // Append past the last used row. data.length IS the row count — no second round-trip.
  if (needAppend) pre.push('    let apR = data.length;')
  return (
    `// Patch for ${filename} - generated by Recipe Builder.\n` +
    `// Paste into Excel: Automate tab -> New Script -> paste -> Run. Safe to run twice.\n\n` +
    'function main(workbook: ExcelScript.Workbook) {\n' +
    '  try {\n' +
    pre.join('\n') + '\n\n' +
    blocks.join('\n\n') + '\n\n' +
    `    console.log(${q(filename + ' patch complete.')});\n` +
    '  } catch (e) {\n    console.log("Script error: " + e);\n    throw e;\n  }\n}\n\n' +
    HELPERS + '\n'
  )
}

/** Replace the USED placeholder with the array of header names actually touched. */
function fillUsed(script, used) {
  return script.replace('USED', `[${[...used].map(q).join(', ')}]`)
}

// --- PS / DB (unique-key) -------------------------------------------------
function buildUniqueKeyScript(changes, map, sheet, keyHeader, filename, { withEntityType }) {
  const byRef = new Map()
  for (const e of changes || []) byRef.set(e.elementTypeRef, e)   // coalesce, last wins

  const used = new Set([keyHeader])
  const blocks = []
  let needAppend = false

  for (const [ref, entry] of byRef) {
    if (!ref) continue
    const updates = entry.updates || {}
    const isNew = !!entry._isNew
    if (isNew && updates.IsDeleted === 'Y') continue   // created then deleted -> no-op

    const fields = Object.entries(updates).filter(([f]) => f !== 'ElementTypeRef' && map[f])

    // Look up in the in-memory `data` (the used range, read once), NOT via a live
    // getEntireColumn().find(). find() on a MISS scans all 1,048,576 cells, and a patch
    // full of genuinely-new rows is all misses — 45 of those froze Excel outright.
    const lookup = `      const r = findKey(data, col[${q(keyHeader)}], ${q(ref)});`

    if (isNew) {
      // UPSERT, never a blind append. `_isNew` says the TOOL has not seen this ref; the
      // sheet may disagree — because you already pasted this patch, or a colleague added
      // the row by hand. Appending on that belief is what duplicated the DesignDB.
      needAppend = true
      const write = target => {
        const l = []
        for (const [f, v] of fields) {
          if (isBlank(v)) continue   // a blank never clears a cell the sheet already has
          used.add(map[f])
          l.push(`        writeCell(S, ${target}, col[${q(map[f])}], ${literal(f, v)});`)
        }
        return l
      }
      const add = [`        writeCell(S, apR, col[${q(keyHeader)}], ${q(ref)});`]
      if (withEntityType) { used.add('EntityType'); add.push('        writeCell(S, apR, col["EntityType"], "ElementType");') }
      add.push(...write('apR'), '        apR++;')

      blocks.push([
        `    // add ${ref} (idempotent: updates in place if it is already there)`,
        '    {',
        lookup,
        '      if (r < 0) {',
        add.join('\n'),
        '      } else {',
        `        console.log(${q('NOTE: ' + ref + ' already present - updated in place, not duplicated.')});`,
        write('r').join('\n'),
        '      }',
        '    }',
      ].filter(Boolean).join('\n'))
    } else {
      if (fields.length === 0) continue
      const l = [`    // update ${ref}`, '    {',
        lookup,
        `      if (r < 0) { console.log(${q('WARNING: ' + ref + ' not found - skipped.')}); }`,
        '      else {']
      for (const [f, v] of fields) {
        used.add(map[f])
        l.push(`        writeCell(S, r, col[${q(map[f])}], ${literal(f, v)});`)
      }
      l.push('      }\n    }')
      blocks.push(l.join('\n'))
    }
  }

  return fillUsed(wrapMain(filename, sheet, blocks, { needAppend }), used)
}

export function buildPsScript(psChanges, filename = 'Product Spec') {
  return buildUniqueKeyScript(psChanges, PS_FIELD_TO_EXCEL, 'Form', 'EntityRef', filename, { withEntityType: true })
}

export function buildDbScript(dbChanges, filename = 'ElementTypes (DB)') {
  return buildUniqueKeyScript(dbChanges, DB_FIELD_TO_EXCEL, 'ElementTypes', 'Ref', filename, { withEntityType: false })
}

// --- RS (composite-key) ---------------------------------------------------
function rsNaturalKey(entry) {
  const row = entry.row || {}
  const before = entry.before || {}
  // Prefer the ORIGINAL key so an edit still locates its on-disk row.
  return RS_KEY_FIELDS.map(f => {
    const v = before[f] !== undefined ? before[f] : rsValue(row, f)
    return v == null ? '' : String(v)
  })
}

/** [{ c: col[Header], v: "value" }, ...] criteria array for rowWhere. */
function rsCriteria(entry) {
  const row = entry.row || {}
  const before = entry.before || {}
  const parts = RS_KEY_FIELDS.map(f => {
    const v = before[f] !== undefined ? before[f] : rsValue(row, f)
    return `{ c: col[${q(RS_FIELD_TO_EXCEL[f])}], v: ${q(v == null ? '' : String(v))} }`
  })
  return `[${parts.join(', ')}]`
}

export function buildRsScript(rsChanges, filename = 'Recipe Spec') {
  // Coalesce by natural key (resolve duplicates in the tool): last wins,
  // and skip unresolved template slots (held back from export, T-E4).
  const byKey = new Map()
  for (const e of rsChanges || []) {
    const row = e.row || {}
    if (row.resolved === false) continue
    byKey.set(rsNaturalKey(e).join(' '), e)
  }

  const used = new Set(RS_KEY_FIELDS.map(f => RS_FIELD_TO_EXCEL[f]))
  const appendBlocks = []
  const otherBlocks = []
  let needAppend = false

  for (const entry of byKey.values()) {
    const action = entry.action || 'upsert'
    const row = entry.row || {}
    const isAppend = action === 'upsert' && !row._row_num && !entry.changedFields

    if (action === 'delete') {
      used.add('IsDeleted')
      otherBlocks.push(
        '    {\n' +
        `      const r = rowWhere(data, ${rsCriteria(entry)});\n` +
        '      if (r < 0) { console.log("WARNING: recipe row not found - skipped."); }\n' +
        '      else { writeCell(S, r, col["IsDeleted"], "Y"); }\n    }'
      )
    } else if (isAppend) {
      // UPSERT on the composite key. A recipe row the tool believes is new may already
      // be on the sheet — you pasted this patch once already. Appending on that belief
      // duplicated it. `data` is read before any append, so a second run finds it.
      needAppend = true
      used.add('EntityType')

      const write = target => {
        const l = []
        for (const f of Object.keys(RS_FIELD_TO_EXCEL)) {
          const v = rsValue(row, f)
          if (isBlank(v)) continue
          used.add(RS_FIELD_TO_EXCEL[f])
          l.push(`        writeCell(S, ${target}, col[${q(RS_FIELD_TO_EXCEL[f])}], ${literal(f, v)});`)
        }
        return l
      }
      const add = ['        writeCell(S, apR, col["EntityType"], "ElementType");', ...write('apR'), '        apR++;']

      appendBlocks.push([
        '    // add recipe row (idempotent: updates in place if it is already there)',
        '    {',
        `      const r = rowWhere(data, ${rsCriteria(entry)});`,
        '      if (r < 0) {',
        add.join('\n'),
        '      } else {',
        '        console.log("NOTE: recipe row already present - updated in place, not duplicated.");',
        write('r').join('\n'),
        '      }',
        '    }',
      ].join('\n'))
    } else {
      const changed = entry.changedFields || {}
      const fields = Object.entries(changed).filter(([f]) => RS_FIELD_TO_EXCEL[f])
      if (fields.length === 0) continue
      const l = ['    {', `      const r = rowWhere(data, ${rsCriteria(entry)});`,
        '      if (r < 0) { console.log("WARNING: recipe row not found - skipped."); }',
        '      else {']
      for (const [f, v] of fields) {
        used.add(RS_FIELD_TO_EXCEL[f])
        l.push(`        writeCell(S, r, col[${q(RS_FIELD_TO_EXCEL[f])}], ${literal(f, v)});`)
      }
      l.push('      }\n    }')
      otherBlocks.push(l.join('\n'))
    }
  }

  const blocks = [...otherBlocks, ...appendBlocks]
  return fillUsed(wrapMain(filename, 'Form', blocks, { needAppend }), used)
}
