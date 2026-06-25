/**
 * etRef.js — heuristic parsing of element type refs.
 *
 * Element type refs follow the convention (see process.md §4.1):
 *   ET- + <category> + [ <family segments…> ] + [ -<NN> variant ]
 * e.g. ET-LIN-PROFILE-ACME-01 → category LIN, family PROFILE-ACME, variant 01
 *      ET-DL-02              → category DL,  family DL,            variant 02
 *
 * This is approximate — refs are project-specific and not guaranteed to follow
 * the convention. Where a DB `Family` field exists it should be preferred; this
 * is the fallback used for grouping/filtering in the palette and element views.
 */

/**
 * parseETRef(ref) → { category, family, variant }
 * - category: the first segment after the ET- prefix (e.g. DL, LIN, PROFILE)
 * - family:   the middle segments joined by '-', or the category if there are none
 * - variant:  the trailing numeric suffix (string), or null
 */
export function parseETRef(ref) {
  const empty = { category: null, family: null, variant: null }
  if (!ref || typeof ref !== 'string') return empty

  // Strip a leading ET- (case-insensitive)
  const body = ref.replace(/^ET-/i, '').trim()
  if (!body) return empty

  const segments = body.split('-').filter(Boolean)
  if (segments.length === 0) return empty

  // Trailing all-digits segment is the variant
  let variant = null
  if (segments.length > 1 && /^\d+$/.test(segments[segments.length - 1])) {
    variant = segments.pop()
  }

  const category = segments[0] || null
  const middle = segments.slice(1)
  const family = middle.length > 0 ? middle.join('-') : category

  return { category, family, variant }
}

/**
 * familyOf(ref, etObj?) — resolves the family for grouping/filtering.
 * Prefers an explicit DB Family field, falling back to parseETRef.
 */
export function familyOf(ref, etObj = null) {
  const explicit = etObj && (etObj.Family || etObj.family)
  if (explicit) return explicit
  return parseETRef(ref).family || 'Ungrouped'
}
