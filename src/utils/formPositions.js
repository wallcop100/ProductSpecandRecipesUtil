/**
 * formPositions.js — the Form taken one position (or a few) at a time.
 *
 * "By position" mode (import toggle) works a selection of Form refs end to end: its
 * rows, its codes' ElementTypes, its Product Spec rows, then its recipe in the builder.
 * Staging a selection must not disturb what the other positions already captured, so
 * captures are MERGED for the staged positions rather than replaced. Pure.
 */

import { isNothingText } from './obviousRows'
import { looksLikeProductCode } from './codeHeuristics'
import { deriveCaptures, hasProductIdentity } from './productCodes'

/** Rows grouped by Form ref, in the order the Form first mentions each. */
export function groupPositions(rows = []) {
  const byRef = new Map()
  for (const r of rows) {
    const ref = String(r.positionType ?? '').trim()
    if (!byRef.has(ref)) byRef.set(ref, { formRef: ref, rows: [] })
    byRef.get(ref).rows.push(r)
  }
  return [...byRef.values()]
}

/**
 * 'done' (added, rows still confirmed) · 'ready' (every row confirmed, every code has an
 * ElementType) · 'todo'. needsEt(row) → bool.
 */
export function positionStatus(group, { needsEt = () => false, stagedRefs = new Set() } = {}) {
  const allConfirmed = group.rows.every(r => r.confirmed)
  if (!allConfirmed) return 'todo'
  if (group.rows.some(needsEt)) return 'todo'
  return stagedRefs.has(group.formRef) ? 'done' : 'ready'
}

const pick = (obj, keys) => Object.fromEntries(Object.entries(obj || {}).filter(([k]) => keys.has(k)))
const omit = (obj, keys) => Object.fromEntries(Object.entries(obj || {}).filter(([k]) => !keys.has(k)))
const PER_POSITION = ['byPosition', 'pendingByPosition', 'contextByPosition', 'orphansByPosition']

/** Only the given (resolved) positions of a captures object — to diff a selection. */
export function restrictCaptures(caps, targets) {
  if (!caps) return caps
  const keys = new Set(targets)
  const out = { ...caps }
  for (const f of PER_POSITION) out[f] = pick(caps[f], keys)
  return out
}

/**
 * mergeCaptures(prev, next, targets, formRefs) — `next` holds only the staged positions
 * (`targets`, resolved PositionTypeRefs; `formRefs`, the Form refs they came from). Every
 * other position keeps what it had.
 */
export function mergeCaptures(prev, next, targets, formRefs = []) {
  if (!prev) return next
  const keys = new Set(targets)
  const refs = new Set(formRefs)
  const out = { ...prev, ...next }
  for (const f of PER_POSITION) out[f] = { ...omit(prev[f], keys), ...(next[f] || {}) }
  out.excludedFormRefs = [...new Set([...(prev.excludedFormRefs || []), ...(next.excludedFormRefs || [])])]
  out.unrouted = [...(prev.unrouted || []).filter(u => !refs.has(u.formRef)), ...(next.unrouted || [])]
  out.divergence = [...(prev.divergence || []), ...(next.divergence || [])]
  return out
}

/**
 * positionPaintStatus(draft, posRef) → { state, rows, unconfirmed, formRefs, texts, cells }
 * Where ONE PositionType stands in the saved import (the builder's Form spec pane):
 * 'noForm' (nothing loaded), 'absent' (the Form has no rows for it), 'todo' (rows to
 * confirm), 'ready' (confirmed, not added yet), 'added', or 'nothing' (no product in its rows). A Form ref lands on posRef
 * through the import's resolutions (ptResolve), as Import itself routes it.
 */
export function positionPaintStatus(draft, posRef, { buildRefMap, targetFor, knows = null } = {}) {
  if (!draft?.rows?.length) return { state: 'noForm', rows: 0, unconfirmed: 0, formRefs: [] }
  const refMap = draft.map?.pt && buildRefMap ? buildRefMap(draft.resolutions || [], draft.refOverrides || {}) : null
  const target = f => (refMap ? targetFor(refMap, f) : f)
  const want = String(posRef || '').toLowerCase()
  const groups = groupPositions(draft.rows).filter(g => String(target(g.formRef) || '').toLowerCase() === want)
  const rows = groups.flatMap(g => g.rows)
  if (!rows.length) return { state: 'absent', rows: 0, unconfirmed: 0, formRefs: [] }
  // What the Form says here, raw, one entry per row (W24D3V: shown as is, painting optional).
  const texts = rows.map(r => String(r.rawText || '').trim()).filter(Boolean)
  // …and per row, each cell under its Form column name (TKJTDE): manufacturer, product code
  // and accessories (when given) up front; the other columns marked `more`, behind a ⋯.
  const cells = rows.map(r => {
    const raw = String(r.rawText ?? '')
    const cut = r.accFrom != null && r.accFrom > 0 ? r.accFrom : null
    const code = r.accFrom === 0 ? '' : cut != null ? raw.slice(0, cut - 1) : raw
    const acc = r.accFrom === 0 ? raw : cut != null ? raw.slice(cut) : ''
    return [
      [draft.map?.mfr || 'Manufacturer', r.manufacturer],
      [draft.map?.code || 'Product code', code, false, true],
      [draft.map?.acc || 'Accessories', acc],
      ...Object.entries(r.context || {}).map(([c, v]) => [c, v, true]),
    ].map(([col, v, more, isCode]) => ({ col, value: String(v ?? '').trim(), more: !!more, ...(isCode && { code: true }) })).filter(c => c.value)
  })
  // No product anywhere in its rows ("n/a", "by others"): nothing to add, nothing to do.
  if (rows.every(r => isNothingText(r.rawText))) return { state: 'nothing', rows: rows.length, unconfirmed: 0, formRefs: groups.map(g => g.formRef), texts, cells }
  const unconfirmed = rows.filter(r => !r.confirmed).length
  // In product codes, not rows: the code-shaped words still to confirm (an entry with no
  // code at all counts as one). With `knows(manufacturer, code)`, codes the Product Spec
  // already names are not counted: only the ones that need an ElementType (44VCYZ).
  const newCodes = rows.filter(r => !r.confirmed).reduce((n, r) => {
    const ws = String(r.rawText || '').split(/\s+/).filter(w => w && looksLikeProductCode(w))
    if (!ws.length) return n + 1
    return n + (knows ? ws.filter(w => !knows(r.manufacturer, w)).length : ws.length)
  }, 0)
  // Confirmed entries can still hold a code with no ElementType (U737Z6): those count too,
  // read as the painter reads them, so the chip never says "ready" while the painter asks.
  const codesOf = r => (r.tokens && r.roles ? deriveCaptures(r).captures.map(c => c.code).filter(hasProductIdentity)
    : String(r.rawText || '').split(/\s+/).filter(w => w && looksLikeProductCode(w)))
  const waitingEt = knows ? rows.filter(r => r.confirmed)
    .reduce((n, r) => n + codesOf(r).filter(c => !knows(r.manufacturer, c)).length, 0) : 0
  const staged = new Set(draft.stagedRefs || [])
  const formRefs = groups.map(g => g.formRef)
  const added = formRefs.every(f => staged.has(f))
  const state = unconfirmed || (waitingEt && !added) ? 'todo' : added ? 'added' : 'ready'
  return { state, rows: rows.length, unconfirmed, newCodes: newCodes + (added ? 0 : waitingEt), formRefs, texts, cells, formRows: rows }
}

/**
 * The Form's row for a code at these positions, as the pane shows it (positionPaintStatus
 * cells), for the New ElementType dialog's side column: the row naming the code, else the
 * first. "n/a" values and a column repeating the code text are left out.
 * → { ref, cols: [[column, value]] } | null
 */
// The Form's own bookkeeping, nothing about the product: left out of the dialog's side column.
const FORM_HOUSEKEEPING = new Set(['sortorder', 'pagetype', 'positiontypedescription'])

export function formColumnsFor(draft, refs = [], code = '', opts = {}) {
  const c = String(code || '').trim().toUpperCase()
  for (const ref of (refs || []).filter(Boolean)) {
    // A Form ref with no PositionType yet only matches itself (B206 "no match").
    let st = positionPaintStatus(draft, ref, opts)
    if (!st.formRows?.length) st = positionPaintStatus(draft, ref)
    const rows = st.formRows || []
    const i = Math.max(0, c ? rows.findIndex(r => String(r.rawText || '').toUpperCase().includes(c)) : 0)
    const raw = String(rows[i]?.rawText || '').trim()
    const cols = (st.cells?.[i] || []).filter(x => !(x.more && x.value === raw) && !isNothingText(x.value) && !FORM_HOUSEKEEPING.has(x.col.toLowerCase())).map(x => [x.col, x.value])
    if (cols.length) return { ref: st.formRefs?.[0] || ref, cols }
  }
  return null
}
