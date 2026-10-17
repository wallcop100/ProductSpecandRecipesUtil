/**
 * reconcile.js — which pending changes a workbook already holds. Pure.
 *
 * The one answer to "I ran the patch: what now?". After a workbook is read again (the file
 * changed, the project was reopened, `psr open --refresh`), every pending change is put
 * against what the file says now, field by field:
 *
 *   applied   the file holds the change          → it leaves the queue
 *   pending   the file still holds the old value → it stays, to be exported (again)
 *   conflict  the file holds something else      → it stays, flagged, until a person picks
 *             (someone edited that cell by hand)    "keep mine" or "take the file's"
 *
 * Nothing is dropped unless the file shows it, and nothing the file shows is pushed back.
 * Timestamps and "which file changed" play no part: the content decides.
 *
 * A change exported in a batch (`exported`: the values the patch carried) and edited again
 * since keeps the newer edit: the file holding the EXPORTED value means that patch ran, so
 * the field's base moves on and the newer value stays pending for the next batch.
 *
 *   reconcileAll(pending, fresh) → { ps, rs, db, counts }
 *     pending: { ps: [entry], rs: [entry], db: [entry] }       the dirty registries
 *     fresh:   { psRows, recipes, elementTypes, collectionRefs } the workbooks as just read
 *     each file → { keep: [entry], applied: [entry], conflicts: [{ entry, fields }] }
 *     `keep` includes the conflicts (flagged `conflict`), with bases moved where a batch landed.
 */

const U = s => String(s ?? '').trim().toUpperCase()
const lc = s => String(s ?? '').trim().toLowerCase()

// SortOrder is the patch's to set: the DesignDB patch re-sorts the whole sheet (tree order),
// so the file's value is never the app's. It never decides anything here.
const IGNORED = new Set(['SortOrder', 'ElementTypeRef'])

// What the app's parsers read back (platform/xlsx.js). A column a patch writes but the parser
// never reads (the DesignDB's Details) cannot be checked, so it never decides either.
const READS = {
  ps: new Set(['Manufacturer', 'ProductCode', 'ComponentDescription', 'InternalNotesText', 'IsTBC', 'IsDeleted', 'IsPropertiesTBC']),
  db: new Set(['Name', 'Description', 'Family', 'IsCollection', 'IsDeleted']),
}

const RS_KEY_FIELDS = ['ContextType', 'ContextRef', 'RecipeIndex', 'ElementTypeRef']
const RS_FIELDS = ['ContextType', 'ContextRef', 'RecipeIndex', 'ElementTypeRef', 'Quantity', 'PackQuantity',
  'IsDeleted', 'IsDesign', 'IsContractItem', 'IsTRItem', 'Dim_QuantityMultiplier', 'IsInteger']
const RS_ALIASES = {
  ContextType: 'contextType', ContextRef: 'contextRef', RecipeIndex: 'recipeIndex', ElementTypeRef: 'elementTypeRef',
  Quantity: 'quantity', PackQuantity: 'packQuantity', IsDeleted: 'isDeleted', IsDesign: 'isDesign',
  IsContractItem: 'isContractItem', IsTRItem: 'isTRItem', Dim_QuantityMultiplier: 'dimQtyMultiplier', IsInteger: 'isInteger',
}
const rsv = (row, f) => (row?.[f] !== undefined ? row[f] : row?.[RS_ALIASES[f]])

/** Cell equality as Excel stores it: blank == null, 1 == "1", "Y " == "Y". */
export function same(a, b) {
  const n = v => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim())
  const x = n(a), y = n(b)
  if (x === y) return true
  if (x === null || y === null) return false
  const fx = Number(x), fy = Number(y)
  return !Number.isNaN(fx) && !Number.isNaN(fy) && fx === fy
}

// ---- keyed by ElementTypeRef (Product Spec, DesignDB ElementTypes) ----------------------------

function reconcileKeyed(entries = [], rows = [], { familyRefs = [], reads = null } = {}) {
  const fieldOf = (r, f) => r?.[f]
  const families = new Set(familyRefs.map(lc))
  const byRef = new Map()
  for (const r of rows) {
    const k = lc(r.ElementTypeRef || r.elementTypeRef)
    if (k && !byRef.has(k)) byRef.set(k, r)
  }
  const out = { keep: [], applied: [], conflicts: [] }
  for (const e of entries) {
    const from = e.elementTypeRef
    const to = e.updates?.ElementTypeRef && lc(e.updates.ElementTypeRef) !== lc(from) ? e.updates.ElementTypeRef : null
    const atNew = to ? byRef.get(lc(to)) : null
    const atOld = byRef.get(lc(from))
    const row = atNew || atOld
    const fields = Object.keys(e.updates || {}).filter(f => !IGNORED.has(f) && (!reads || reads.has(f)))
    const exported = e.exported || {}

    // A rename is applied when the new ref is there and the old one is gone.
    const renameState = !to ? 'applied' : atNew && !atOld ? 'applied' : atOld && !atNew ? 'pending' : atNew && atOld ? 'conflict' : 'pending'
    if (!row) {
      // A family row: the DesignDB parse files those under collection_refs, not element_types.
      if (families.has(lc(to || from))) { out.applied.push(e); continue }
      // A soft delete: the DesignDB parse leaves IsDeleted rows out, so gone is done.
      if (U(e.updates?.IsDeleted) === 'Y' && !e._isNew) { out.applied.push(e); continue }
      out.keep.push(stripConflict(e)); continue  // a new row the file does not have yet (or a rename not run)
    }
    const states = {}, moved = {}
    for (const f of fields) {
      const want = e.updates[f], file = fieldOf(row, f), base = e.before?.[f] ?? null   // no base: it was blank
      if (same(file, want)) states[f] = 'applied'
      else if (f in exported && same(file, exported[f])) { states[f] = 'pending'; moved[f] = exported[f] }   // the batch landed; a newer edit stays
      else if (same(file, base)) states[f] = 'pending'
      else states[f] = 'conflict'
    }
    const vals = Object.values(states)
    if (renameState === 'applied' && vals.every(s => s === 'applied')) { out.applied.push(e); continue }
    const conflictFields = fields.filter(f => states[f] === 'conflict')
      .map(f => ({ field: f, mine: e.updates[f], file: fieldOf(row, f), base: e.before?.[f] ?? null }))
    if (renameState === 'conflict') conflictFields.unshift({ field: 'ElementTypeRef', mine: to, file: `${from} and ${to} both exist`, base: from })
    // What stays: the fields not yet in the file, against the base the file now has.
    const left = Object.fromEntries(Object.entries(e.updates).filter(([f]) => states[f] && states[f] !== 'applied'))
    if (to && renameState !== 'applied') left.ElementTypeRef = to
    const before = { ...(e.before || {}), ...moved }
    const kept = { ...e, elementTypeRef: renameState === 'applied' && to ? to : from, updates: left, before }
    // Once the row is in the file it is no longer new: the next patch updates it.
    if (atOld || atNew) delete kept._isNew
    restamp(kept, 'updates', exported, moved)
    if (Object.keys(kept.updates).length === 0 && renameState === 'applied') { out.applied.push(e); continue }
    if (conflictFields.length) { kept.conflict = conflictFields; out.conflicts.push({ entry: kept, fields: conflictFields }) } else delete kept.conflict
    out.keep.push(kept)
  }
  return out
}

/** What still waits on the batch: the exported values of fields the file does not hold yet, and
 *  that were not edited again since. Nothing left → the entry is no longer that batch's. */
function restamp(kept, fieldsKey, exported, moved) {
  const still = Object.fromEntries(Object.entries(exported || {})
    .filter(([f, v]) => f in (kept[fieldsKey] || {}) && !(f in moved) && same(kept[fieldsKey][f], v)))
  if (Object.keys(still).length) kept.exported = still
  else { delete kept.exported; delete kept.batch }
}

const stripConflict = e => { const { conflict, ...rest } = e; return rest }   // eslint-disable-line no-unused-vars

// ---- the Recipe Spec: rows by composite key ----------------------------------------------------

const rsKey = vals => RS_KEY_FIELDS.map(f => lc(vals[f])).join('|')
const keyOf = row => Object.fromEntries(RS_KEY_FIELDS.map(f => [f, rsv(row, f)]))

function reconcileRs(entries = [], recipes = []) {
  const byKey = new Map()
  for (const r of recipes) {
    const k = rsKey(keyOf(r))
    if (!byKey.has(k) || U(rsv(byKey.get(k), 'IsDeleted')) === 'Y') byKey.set(k, r)
  }
  const out = { keep: [], applied: [], conflicts: [] }
  for (const e of entries) {
    const row = e.row || {}
    const action = e.action || 'upsert'
    const before = e.before || {}
    const oldKey = { ...keyOf(row), ...Object.fromEntries(RS_KEY_FIELDS.filter(f => before[f] !== undefined).map(f => [f, before[f]])) }

    if (action === 'delete') {
      const at = byKey.get(rsKey(oldKey))
      if (!at || U(rsv(at, 'IsDeleted')) === 'Y') out.applied.push(e)
      else out.keep.push(stripConflict(e))
      continue
    }
    if (!e.changedFields) {                       // a row the file did not have: appended by the patch
      const at = byKey.get(rsKey(keyOf(row)))
      if (!at) { out.keep.push(stripConflict(e)); continue }
      const diff = RS_FIELDS.filter(f => !RS_KEY_FIELDS.includes(f) && rsv(row, f) != null && String(rsv(row, f)).trim() !== '' && !same(rsv(at, f), rsv(row, f)))
      if (!diff.length) { out.applied.push(e); continue }
      // The row is there now: what is left is an update of it.
      const fields = diff.map(f => ({ field: f, mine: rsv(row, f), file: rsv(at, f), base: null }))
      const kept = { ...e, row: { ...row, _row_num: at._row_num ?? row._row_num }, changedFields: Object.fromEntries(diff.map(f => [f, rsv(row, f)])),
        before: Object.fromEntries(RS_FIELDS.map(f => [f, rsv(at, f) ?? null])), conflict: fields }
      delete kept.exported
      out.conflicts.push({ entry: kept, fields }); out.keep.push(kept)
      continue
    }
    const changed = e.changedFields
    const exported = e.exported || {}
    const newKey = { ...oldKey, ...Object.fromEntries(RS_KEY_FIELDS.filter(f => f in changed).map(f => [f, changed[f]])) }
    const at = byKey.get(rsKey(newKey)) || byKey.get(rsKey(oldKey))
    if (!at) {
      const fields = [{ field: 'row', mine: 'this recipe row', file: 'not in the file', base: null }]
      const kept = { ...e, conflict: fields }
      delete kept.exported
      out.conflicts.push({ entry: kept, fields }); out.keep.push(kept)
      continue
    }
    const states = {}, moved = {}
    for (const [f, want] of Object.entries(changed)) {
      if (f === 'SortOrder') { states[f] = 'applied'; continue }
      const file = rsv(at, f)
      if (same(file, want)) states[f] = 'applied'
      else if (f in exported && same(file, exported[f])) { states[f] = 'pending'; moved[f] = exported[f] }
      else if (same(file, before[f])) states[f] = 'pending'
      else states[f] = 'conflict'
    }
    if (Object.values(states).every(s => s === 'applied')) { out.applied.push(e); continue }
    const left = Object.fromEntries(Object.entries(changed).filter(([f]) => states[f] !== 'applied'))
    const kept = { ...e, changedFields: left, before: { ...before, ...moved }, row: { ...row, _row_num: at._row_num ?? row._row_num } }
    restamp(kept, 'changedFields', exported, moved)
    const conflicts = Object.keys(left).filter(f => states[f] === 'conflict').map(f => ({ field: f, mine: left[f], file: rsv(at, f), base: before[f] ?? null }))
    if (conflicts.length) { kept.conflict = conflicts; out.conflicts.push({ entry: kept, fields: conflicts }) } else delete kept.conflict
    out.keep.push(kept)
  }
  return out
}

export function reconcileAll(pending = {}, fresh = {}) {
  const ps = reconcileKeyed(pending.ps, fresh.psRows, { reads: READS.ps })
  // Only rows the workbook has count (a local ElementType carries no Excel row yet).
  const inFile = rows => (rows || []).filter(r => r._row_num != null)
  const db = reconcileKeyed(pending.db, inFile(fresh.elementTypes), { familyRefs: fresh.collectionRefs || [], reads: READS.db })
  const rs = reconcileRs(pending.rs, fresh.recipes)
  const counts = Object.fromEntries(Object.entries({ ps, rs, db }).map(([k, r]) => [k, {
    applied: r.applied.length, pending: r.keep.length - r.conflicts.length, conflicts: r.conflicts.length,
  }]))
  return { ps, rs, db, counts }
}

/**
 * Stamp what an export carried: each entry remembers the values its patch writes, so the next
 * reconcile can tell "that patch ran" from "edited again since". → { ps, rs, db } stamped.
 */
/** Has this entry anything an export has not carried yet? (edited since, or never exported) */
export function hasUnexported(e) {
  const fields = e.changedFields || e.updates
  if (!e.batch) return true
  if (!fields) return false                        // an appended or deleted recipe row: carried whole
  return Object.entries(fields).some(([f, v]) => f !== 'SortOrder' && !(e.exported && f in e.exported && same(v, e.exported[f])))
}

export function stampExported({ ps = [], rs = [], db = [] } = {}, batch) {
  const keyed = e => ({ ...e, batch, exported: { ...(e.updates || {}) } })
  return {
    ps: ps.map(keyed), db: db.map(keyed),
    rs: rs.map(e => ({ ...e, batch, exported: e.changedFields ? { ...e.changedFields } : undefined })),
  }
}
