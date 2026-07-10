/**
 * positionFamily.js — resolves the "family" a PositionType belongs to, used for
 * family-level ignore (ignored families drop out of the connector matrix and
 * high-level totals).
 *
 * A family is the position's parent/collection in the source DB hierarchy:
 *   - ParentRef    → the parent collection this PositionType rolls up to
 *   - IsCollection → whether this PositionType is itself a grouping node
 *
 * A position with no ParentRef has no family (returns null) — it can still be
 * ignored individually, just not as part of a family.
 */

/**
 * positionFamilyOf(pt) → parent ref string, or null when the position has no parent.
 * @param {object} pt — a PositionType row ({ PositionTypeRef, ParentRef, ... })
 */
export function positionFamilyOf(pt) {
  if (!pt) return null
  const parent = pt.ParentRef || pt.parentRef
  const trimmed = parent != null ? String(parent).trim() : ''
  return trimmed || null
}

/**
 * ignoredPositionRefs({ positionTypes, positionUI, ignoredPositionFamilies })
 *   → Set of LOWERCASE PositionTypeRefs that are out of scope.
 *
 * A position is ignored outright, or by its family. The standing rule is that an
 * ignored position leaves every total, so anything that counts outstanding work must
 * subtract these — validation already did, by hand; nothing else did.
 */
export function ignoredPositionRefs({ positionTypes = [], positionUI = {}, ignoredPositionFamilies = [] } = {}) {
  const families = new Set(ignoredPositionFamilies)
  const out = new Set()
  for (const [ref, ui] of Object.entries(positionUI)) {
    if (ui?.ignored) out.add(String(ref).toLowerCase())
  }
  if (families.size > 0) {
    for (const pt of positionTypes) {
      const ref = pt.PositionTypeRef || pt.positionTypeRef
      if (ref && families.has(positionFamilyOf(pt))) out.add(String(ref).toLowerCase())
    }
  }
  return out
}
