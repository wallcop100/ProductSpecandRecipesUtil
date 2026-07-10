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
//
// The design, learned from a hand-written patch that never froze: touch ONLY what you
// need. We never read the whole sheet. getUsedRange(true).getValues() materialises the
// entire grid — and on these templates the used range is padded with formatting to the
// bottom of the sheet (~1,048,576 rows), so that read is tens of millions of cells and
// hangs Excel. Instead we read one header row and one key column, each BOUNDED to the
// real row count, and do every lookup in memory.
const HELPERS = `function colMap(header: (string | number | boolean)[], names: string[]): { [key: string]: number } {
  const idx: { [key: string]: number } = {};
  for (let c = 0; c < header.length; c++) idx[String(header[c]).trim()] = c;
  const m: { [key: string]: number } = {};
  for (const name of names) {
    m[name] = (idx[name] === undefined) ? -1 : idx[name];
    if (m[name] < 0) console.log("WARNING: column not found: " + name);
  }
  return m;
}
function keyIndex(S: ExcelScript.Worksheet, keyCol: number, nRows: number): { [key: string]: number } {
  // One bounded column read (nRows x 1) -> value -> row. Never a whole-grid read, never a
  // live find(). Serves both updates (look the row up) and idempotent appends (already there?).
  const m: { [key: string]: number } = {};
  if (keyCol < 0 || nRows < 2) return m;
  const vals = S.getRangeByIndexes(0, keyCol, nRows, 1).getValues();
  for (let i = 1; i < vals.length; i++) { const k = String(vals[i][0]).trim(); if (k !== "") m[k] = i; }
  return m;
}
function compositeIndex(S: ExcelScript.Worksheet, cols: number[], nRows: number): { [key: string]: number } {
  // Same idea for a multi-column key: read each key column bounded, join with "|".
  const m: { [key: string]: number } = {};
  if (nRows < 2) return m;
  const colVals = cols.map(c => c >= 0 ? S.getRangeByIndexes(0, c, nRows, 1).getValues() : null);
  for (let i = 1; i < nRows; i++) {
    let key = "";
    for (let j = 0; j < colVals.length; j++) { const cv = colVals[j]; key += (j ? "|" : "") + (cv ? String(cv[i][0]).trim() : ""); }
    m[key] = i;
  }
  return m;
}
function writeCell(S: ExcelScript.Worksheet, r: number, c: number, v: string | number | null): void {
  if (c < 0 || r < 0) return;
  const cell = S.getCell(r, c);
  if (v === null) cell.clear(ExcelScript.ClearApplyTo.contents);
  else cell.setValue(v);
}`

/** Wrap preamble + operation blocks in a runnable main() + helpers. */
function wrapScript(filename, preLines, blocks) {
  if (blocks.length === 0) return ''
  return (
    `// Patch for ${filename} - generated by Recipe Builder.\n` +
    `// Paste into Excel: Automate tab -> New Script -> paste -> Run. Safe to run twice.\n\n` +
    'function main(workbook: ExcelScript.Workbook) {\n' +
    '  try {\n' +
    preLines.join('\n') + '\n\n' +
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

/**
 * The shared preamble: resolve the sheet, its real extent (valuesOnly row/col count —
 * metadata only, no cell values), the column map from a single bounded header read, and
 * the append cursor. `indexLine` builds whichever key index the caller needs.
 */
function preamble(sheet, indexLine) {
  return [
    `    const S = workbook.getWorksheet(${q(sheet)});`,
    '    const used = S.getUsedRange(true);   // valuesOnly: ignore formatting-only padding',
    '    if (!used) { console.log("Sheet has no data - nothing to patch."); return; }',
    '    const nRows = used.getRowCount();',
    '    const nCols = used.getColumnCount();',
    '    const col = colMap(S.getRangeByIndexes(0, 0, 1, nCols).getValues()[0], USED);',
    indexLine,
    '    let apR = nRows;',
  ]
}

// --- PS / DB (unique-key) -------------------------------------------------
function buildUniqueKeyScript(changes, map, sheet, keyHeader, filename, { withEntityType }) {
  const byRef = new Map()
  for (const e of changes || []) byRef.set(e.elementTypeRef, e)   // coalesce, last wins

  const used = new Set([keyHeader])
  const blocks = []

  for (const [ref, entry] of byRef) {
    if (!ref) continue
    const updates = entry.updates || {}
    const isNew = !!entry._isNew
    if (isNew && updates.IsDeleted === 'Y') continue   // created then deleted -> no-op

    const fields = Object.entries(updates).filter(([f]) => f !== 'ElementTypeRef' && map[f])

    // Look the row up in the in-memory key index (one bounded column read at the top),
    // never a live find. `rowOf` maps every key value in the sheet to its row.
    const lookup = `      const r = (rowOf[${q(ref)}] === undefined) ? -1 : rowOf[${q(ref)}];`

    if (isNew) {
      // UPSERT, never a blind append. `_isNew` says the TOOL has not seen this ref; the
      // sheet may disagree — because you already pasted this patch, or a colleague added
      // the row by hand. Appending on that belief is what duplicated the DesignDB.
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
      add.push(...write('apR'), `        rowOf[${q(ref)}] = apR; apR++;`)

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

  const pre = preamble(sheet, `    const rowOf = keyIndex(S, col[${q(keyHeader)}], nRows);`)
  return fillUsed(wrapScript(filename, pre, blocks), used)
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

/** The composite key string for an entry, matching compositeIndex's "|"-joined shape. */
function rsCompositeKey(entry) {
  const row = entry.row || {}
  const before = entry.before || {}
  return RS_KEY_FIELDS.map(f => {
    const v = before[f] !== undefined ? before[f] : rsValue(row, f)
    return v == null ? '' : String(v).trim()
  }).join('|')
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

  for (const entry of byKey.values()) {
    const action = entry.action || 'upsert'
    const row = entry.row || {}
    const isAppend = action === 'upsert' && !row._row_num && !entry.changedFields
    const key = rsCompositeKey(entry)
    const lookup = `      const r = (rowOf[${q(key)}] === undefined) ? -1 : rowOf[${q(key)}];`

    if (action === 'delete') {
      used.add('IsDeleted')
      otherBlocks.push([
        '    {', lookup,
        '      if (r < 0) { console.log("WARNING: recipe row not found - skipped."); }',
        '      else { writeCell(S, r, col["IsDeleted"], "Y"); }',
        '    }',
      ].join('\n'))
    } else if (isAppend) {
      // UPSERT on the composite key. A recipe row the tool believes is new may already be
      // on the sheet — you pasted this patch once. rowOf holds the sheet's keys, so a
      // second run finds it and updates in place instead of duplicating.
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
      const add = ['        writeCell(S, apR, col["EntityType"], "ElementType");', ...write('apR'), `        rowOf[${q(key)}] = apR; apR++;`]

      appendBlocks.push([
        '    // add recipe row (idempotent: updates in place if it is already there)',
        '    {', lookup,
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
      const l = ['    {', lookup,
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
  const keyCols = RS_KEY_FIELDS.map(f => `col[${q(RS_FIELD_TO_EXCEL[f])}]`).join(', ')
  const pre = preamble('Form', `    const rowOf = compositeIndex(S, [${keyCols}], nRows);`)
  return fillUsed(wrapScript(filename, pre, blocks), used)
}
