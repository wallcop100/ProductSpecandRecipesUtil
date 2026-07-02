/**
 * collectionStatus.js — infers ElementTypeCollection coverage for a position.
 *
 * Collections are never assigned directly; status is computed by comparing
 * the position's recipe contents against each collection's ingredient list.
 * Collections with applicable_tags are only evaluated when those tags intersect
 * the position's own tags. Collections with no applicable_tags apply everywhere.
 */

function parseIngredients(collection) {
  if (!collection) return []
  if (Array.isArray(collection.Ingredients)) return collection.Ingredients
  try { return JSON.parse(collection.Ingredients || '[]') } catch { return [] }
}

function parseTags(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw) } catch { return [] }
}

/**
 * collectionStatusForPosition(posRef, tags, recipe, collections)
 *
 * @param {string}   posRef      — PositionTypeRef for this position
 * @param {string[]} tags        — tags for this position (e.g. ['Local', '5-pin'])
 * @param {object[]} recipe      — all recipe rows (any section) for this position
 * @param {object[]} collections — all virtual ET collections from store
 *
 * @returns {{ collection, status, missing, extra }[]}
 *   status: 'complete' | 'partial' | 'missing' | 'na'
 *   missing: ET refs expected but absent
 *   extra:   ET refs from this collection also present (always empty for inferred model,
 *            included for potential future use)
 */
export function collectionStatusForPosition(posRef, tags, recipe, collections) {
  const posTags = Array.isArray(tags) ? tags : []
  const recipeRefs = (recipe || [])
    .filter(r => !(r.IsDeleted === 'Y' || r.isDeleted === 'Y'))
    .map(r => (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase())

  return (collections || []).map(collection => {
    const collTags     = parseTags(collection.ApplicableTags)
    const excludedTags = parseTags(collection.ExcludedTags)

    // Excluded takes priority: if ANY position tag matches ExcludedTags, skip.
    if (excludedTags.length > 0 && excludedTags.some(t => posTags.includes(t))) {
      return { collection, status: 'na', missing: [], extra: [] }
    }

    // Included tag gate: if the collection declares included tags, at least one must match
    const applicable = collTags.length === 0 || collTags.some(t => posTags.includes(t))
    if (!applicable) {
      return { collection, status: 'na', missing: [], extra: [] }
    }

    const ingredients = parseIngredients(collection)
    const expected = ingredients.map(i => (i.ElementTypeRef || i.slotLabel || '').toLowerCase()).filter(Boolean)

    if (expected.length === 0) {
      return { collection, status: 'na', missing: [], extra: [] }
    }

    const missing = expected.filter(ref => !recipeRefs.includes(ref))

    let status
    if (missing.length === 0) {
      status = 'complete'
    } else if (missing.length === expected.length) {
      status = 'missing'
    } else {
      status = 'partial'
    }

    return { collection, status, missing, extra: [] }
  })
}

/**
 * overallCollectionStatus(statuses) — highest-severity status across all results.
 * Ignores 'na'. Returns null when all are 'na'.
 */
export function overallCollectionStatus(statuses) {
  const relevant = (statuses || []).filter(s => s.status !== 'na')
  if (relevant.length === 0) return null
  if (relevant.some(s => s.status === 'missing')) return 'missing'
  if (relevant.some(s => s.status === 'partial')) return 'partial'
  return 'complete'
}
