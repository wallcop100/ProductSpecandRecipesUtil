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

const posOf = r => r.PositionTypeRef || r.positionTypeRef
const ctxOf = r => r.ContextType || r.contextType
const crefOf = r => r.ContextRef || r.contextRef || ''
const etOf = r => r.ElementTypeRef || r.elementTypeRef || ''

/**
 * positionRecipeWithWrapperInternals(recipes, posRef)
 *
 * A position's coverage must consider BOTH its own rows AND the internal rows
 * of any DL/LIN wrapper it uses — a wrapper is a universal, shareable
 * definition, so its internals may be stored under a different PositionTypeRef.
 *
 * Returns { own, wrapperInternal, wrapperRefs, combined }:
 *   own             — rows keyed to this position (position level + its own internals)
 *   wrapperInternal — one copy of the internals of each wrapper used here whose
 *                     rows live under another position
 *   wrapperRefs     — lowercased ET refs of the wrappers used at position level
 *   combined        — own + wrapperInternal (feed this to collectionStatusForPosition)
 */
export function positionRecipeWithWrapperInternals(recipes, posRef) {
  const own = (recipes || []).filter(r => posOf(r) === posRef)

  // Internal rows anywhere, grouped by their container ref
  const internalByCtx = new Map()
  for (const r of recipes || []) {
    if (ctxOf(r) !== 'ElementType') continue
    const key = crefOf(r).toLowerCase()
    if (!key) continue
    if (!internalByCtx.has(key)) internalByCtx.set(key, [])
    internalByCtx.get(key).push(r)
  }

  const wrapperRefs = [...new Set(
    own
      .filter(r => ctxOf(r) === 'PositionType' && (r.IsDeleted || r.isDeleted) !== 'Y')
      .map(r => etOf(r).toLowerCase())
      .filter(ref => ref && internalByCtx.has(ref))
  )]

  const wrapperInternal = []
  for (const ref of wrapperRefs) {
    const rows = internalByCtx.get(ref)
    // This position's own copy (if any) is already in `own`
    if (rows.some(r => posOf(r) === posRef)) continue
    // Shared assembly stored under another position — take the first copy
    const firstPos = posOf(rows[0])
    wrapperInternal.push(...rows.filter(r => posOf(r) === firstPos))
  }

  return { own, wrapperInternal, wrapperRefs, combined: [...own, ...wrapperInternal] }
}

/**
 * wrapperUsedBy(recipes, wrapperRef) — the distinct PositionTypeRefs whose
 * position-level recipe uses this wrapper ET (live rows only). Length > 1
 * means edits to the wrapper's internals ripple to every listed position.
 */
export function wrapperUsedBy(recipes, wrapperRef) {
  const lc = (wrapperRef || '').toLowerCase()
  if (!lc) return []
  const s = new Set()
  for (const r of recipes || []) {
    if (ctxOf(r) !== 'PositionType') continue
    if ((r.IsDeleted || r.isDeleted) === 'Y') continue
    if (etOf(r).toLowerCase() !== lc) continue
    const p = posOf(r)
    if (p) s.add(p)
  }
  return [...s]
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

const SECTION_PHRASE = {
  position: 'at free-issue (PositionType) level',
  dl_internal: 'inside the wrapper',
  lin_internal: 'inside the wrapper',
}

/**
 * connectorGapsForPosition(recipes, posRef, tags, collections)
 *
 * The gaps in a position's connector coverage, sourced ENTIRELY from the user's
 * Connector Templates (etCollections) — the same source of truth as the matrix.
 * Every ref returned is a real ref the user put in a template; nothing is
 * guessed or hardcoded.
 *
 * A template is only considered "started" for this position when at least one
 * of its ingredients is already present (wrapper-aware). For a started
 * template, the still-absent ingredients are the gaps. A fully-satisfied
 * template yields nothing; a template the position hasn't touched yields
 * nothing (so we never push a whole set the user never began).
 *
 * Returns [{ ref, section, collectionName }] — ref/section straight from the
 * template ingredient.
 */
export function connectorGapsForPosition(recipes, posRef, tags, collections) {
  const posTags = Array.isArray(tags) ? tags : []
  const { combined } = positionRecipeWithWrapperInternals(recipes, posRef)
  const present = new Set(
    combined
      .filter(r => (r.IsDeleted || r.isDeleted) !== 'Y')
      .map(r => (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase())
      .filter(Boolean)
  )
  if (present.size === 0) return []

  const refOfIng = i => (i.ElementTypeRef || i.slotLabel || '')
  const gaps = []
  const seen = new Set()

  for (const collection of collections || []) {
    const excl = parseTags(collection.ExcludedTags)
    if (excl.length > 0 && excl.some(t => posTags.includes(t))) continue
    const collTags = parseTags(collection.ApplicableTags)
    const applicable = collTags.length === 0 || collTags.some(t => posTags.includes(t))
    if (!applicable) continue

    const ings = parseIngredients(collection).filter(i => refOfIng(i))
    if (ings.length === 0) continue

    const started = ings.some(i => present.has(refOfIng(i).toLowerCase()))
    if (!started) continue   // only complete sets the position has begun

    for (const ing of ings) {
      const ref = refOfIng(ing)
      if (present.has(ref.toLowerCase())) continue
      const section = ing.section || 'position'
      const key = ref.toLowerCase() + '|' + section
      if (seen.has(key)) continue
      seen.add(key)
      gaps.push({
        ref,
        section,
        collectionName: collection.Name,
        label: `Add ${ref} ${SECTION_PHRASE[section] || section} — completes "${collection.Name}"`,
      })
    }
  }
  return gaps
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
