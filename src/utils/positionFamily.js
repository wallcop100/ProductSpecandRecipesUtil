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
