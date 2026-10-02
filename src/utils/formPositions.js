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
export function positionPaintStatus(draft, posRef, { buildRefMap, targetFor } = {}) {
  if (!draft?.rows?.length) return { state: 'noForm', rows: 0, unconfirmed: 0, formRefs: [] }
  const refMap = draft.map?.pt && buildRefMap ? buildRefMap(draft.resolutions || [], draft.refOverrides || {}) : null
  const target = f => (refMap ? targetFor(refMap, f) : f)
  const want = String(posRef || '').toLowerCase()
  const groups = groupPositions(draft.rows).filter(g => String(target(g.formRef) || '').toLowerCase() === want)
  const rows = groups.flatMap(g => g.rows)
  if (!rows.length) return { state: 'absent', rows: 0, unconfirmed: 0, formRefs: [] }
  // What the Form says here, raw, one entry per row (W24D3V: shown as is, painting optional).
  const texts = rows.map(r => String(r.rawText || '').trim()).filter(Boolean)
  // …and per row, each cell under its Form column name: code, manufacturer, the context columns.
  const cells = rows.map(r => [
    [draft.map?.code || 'Product code', r.rawText],
    [draft.map?.mfr || 'Manufacturer', r.manufacturer],
    ...Object.entries(r.context || {}),
  ].map(([col, v]) => ({ col, value: String(v ?? '').trim() })).filter(c => c.value))
  // No product anywhere in its rows ("n/a", "by others"): nothing to add, nothing to do.
  if (rows.every(r => isNothingText(r.rawText))) return { state: 'nothing', rows: rows.length, unconfirmed: 0, formRefs: groups.map(g => g.formRef), texts, cells }
  const unconfirmed = rows.filter(r => !r.confirmed).length
  // In product codes, not rows: the code-shaped words still to confirm (at least one a row).
  const newCodes = rows.filter(r => !r.confirmed)
    .reduce((n, r) => n + Math.max(1, String(r.rawText || '').split(/\s+/).filter(w => w && looksLikeProductCode(w)).length), 0)
  const staged = new Set(draft.stagedRefs || [])
  const formRefs = groups.map(g => g.formRef)
  const state = unconfirmed ? 'todo' : formRefs.every(f => staged.has(f)) ? 'added' : 'ready'
  return { state, rows: rows.length, unconfirmed, newCodes, formRefs, texts, cells }
}
