/**
 * formPositions.js — the Form taken one position (or a few) at a time.
 *
 * "By position" mode (import toggle) works a selection of Form refs end to end: its
 * rows, its codes' ElementTypes, its Product Spec rows, then its recipe in the builder.
 * Staging a selection must not disturb what the other positions already captured, so
 * captures are MERGED for the staged positions rather than replaced. Pure.
 */

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
