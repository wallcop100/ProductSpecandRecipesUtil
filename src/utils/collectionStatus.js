/**
 * collectionStatus.js — infers ElementTypeCollection coverage for a position.
 *
 * Collections are never assigned directly; status is computed by comparing
 * the position's recipe contents against each collection's ingredient list.
 * Collections with applicable_tags are only evaluated when those tags intersect
 * the position's own tags. Collections with no applicable_tags apply everywhere.
 *
 * The comparison itself lives in recipePresence.js and is slot- and quantity-aware:
 * an ingredient the template puts inside the wrapper counts only when it is really
 * inside THIS position's wrapper, in at least the quantity asked for.
 */

import {
  buildPresence, ingredientPresence, ingredientRef, isSatisfied,
  containerForPosition, normalizeSection, INTERNAL,
} from './recipePresence'

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
 * collectionStatusForPosition(posRef, tags, recipe, collections, wrapperRefs)
 *
 * @param {string}   posRef      — PositionTypeRef for this position
 * @param {string[]} tags        — tags for this position (e.g. ['Local', '5-pin'])
 * @param {object[]} recipe      — this position's rows PLUS its wrappers' internals,
 *                                 i.e. positionRecipeWithWrapperInternals().combined
 * @param {object[]} collections — all virtual ET collections from store
 * @param {string[]} wrapperRefs — the wrappers this position uses. An internal row
 *                                 filed under any other container satisfies nothing.
 *
 * @returns {{ collection, status, missing, misplaced, short, items }[]}
 *   status    — 'complete' | 'partial' | 'missing' | 'na'
 *   missing   — refs absent altogether
 *   misplaced — ingredients whose ref exists but in the wrong slot (move, don't add)
 *   short     — ingredients in the right slot but under the required quantity
 *   items     — every ingredient with its full presence result
 *
 * Presence is slot- AND quantity-aware (see recipePresence.js): an ingredient
 * required inside the wrapper is NOT satisfied by a copy at position level, which
 * is what made positions read 'complete' while the recipe was wrong.
 */
export function collectionStatusForPosition(posRef, tags, recipe, collections, wrapperRefs = []) {
  const posTags = Array.isArray(tags) ? tags : []
  const presence = buildPresence(recipe, wrapperRefs)

  return (collections || []).map(collection => {
    const collTags     = parseTags(collection.ApplicableTags)
    const excludedTags = parseTags(collection.ExcludedTags)
    const na = { collection, status: 'na', missing: [], misplaced: [], short: [], items: [] }

    // Excluded takes priority: if ANY position tag matches ExcludedTags, skip.
    if (excludedTags.length > 0 && excludedTags.some(t => posTags.includes(t))) return na

    // Included tag gate: if the collection declares included tags, at least one must match
    const applicable = collTags.length === 0 || collTags.some(t => posTags.includes(t))
    if (!applicable) return na

    const ingredients = parseIngredients(collection).filter(i => ingredientRef(i))
    if (ingredients.length === 0) return na

    const items = ingredients.map(ing => ({ ingredient: ing, ...ingredientPresence(presence, ing) }))
    const satisfied = items.filter(i => isSatisfied(i.status))

    let status
    if (satisfied.length === items.length) status = 'complete'
    else if (satisfied.length === 0) status = 'missing'
    else status = 'partial'

    return {
      collection,
      status,
      items,
      missing:   items.filter(i => i.status === 'missing').map(i => ingredientRef(i.ingredient)),
      misplaced: items.filter(i => i.status === 'misplaced'),
      short:     items.filter(i => i.status === 'short'),
    }
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
export function connectorGapsForPosition(recipes, posRef, tags, collections, containerETRefs = new Set()) {
  const posTags = Array.isArray(tags) ? tags : []
  const { combined, wrapperRefs } = positionRecipeWithWrapperInternals(recipes, posRef)
  const presence = buildPresence(combined, wrapperRefs)
  if (presence.byRef.size === 0) return []

  // Where an internal row belongs on this position. A gap that cannot name its
  // container is not offered — adding it would write a blank ContextRef.
  const container = containerForPosition(recipes, posRef, containerETRefs)

  const gaps = []
  const seen = new Set()

  for (const collection of collections || []) {
    const excl = parseTags(collection.ExcludedTags)
    if (excl.length > 0 && excl.some(t => posTags.includes(t))) continue
    const collTags = parseTags(collection.ApplicableTags)
    const applicable = collTags.length === 0 || collTags.some(t => posTags.includes(t))
    if (!applicable) continue

    const ings = parseIngredients(collection).filter(i => ingredientRef(i))
    if (ings.length === 0) continue

    const results = ings.map(ing => ({ ingredient: ing, ...ingredientPresence(presence, ing) }))
    const started = results.some(r => r.status !== 'missing')
    if (!started) continue   // only sets the position has begun

    for (const r of results) {
      if (isSatisfied(r.status)) continue
      const ref = ingredientRef(r.ingredient)
      const section = normalizeSection(r.ingredient.section)
      const wants = section === INTERNAL ? (r.ingredient.section || 'dl_internal') : 'position'
      const key = `${ref.toLowerCase()}|${section}|${r.status}`
      if (seen.has(key)) continue
      seen.add(key)

      // An internal gap with nowhere to live is a recipe problem, not an add button.
      const blocked = section === INTERNAL && !container

      gaps.push({
        ref,
        section: wants,
        status: r.status,                 // 'missing' | 'short' | 'misplaced'
        need: r.need,
        have: r.have,
        rows: r.rows,
        foundAt: r.foundAt,
        container,
        blocked,
        collectionName: collection.Name,
        label: gapLabel(r, ref, section, collection.Name, container, blocked),
      })
    }
  }
  return gaps
}

/** Human phrasing for a gap — what is wrong, and what the button will do. */
function gapLabel(r, ref, section, collectionName, container, blocked) {
  const where = section === INTERNAL
    ? (container ? `inside ${container}` : 'inside the wrapper')
    : 'at free-issue (PositionType) level'
  if (blocked) {
    return `${ref} belongs inside a wrapper, but this position has no design element to hold it`
  }
  if (r.status === 'misplaced') {
    const at = r.foundAt?.section === INTERNAL
      ? `inside ${r.foundAt.container}`
      : 'at position level'
    return `Move ${ref} — it sits ${at}, but "${collectionName}" wants it ${where}`
  }
  if (r.status === 'short') {
    return `Raise ${ref} to ×${r.need} ${where} (only ×${r.have} present) — completes "${collectionName}"`
  }
  return `Add ${ref} ${where} — completes "${collectionName}"`
}

/**
 * planCollectionBulk(recipes, posRefs, collection, containerETRefs)
 *
 * What applying a collection across many positions would ACTUALLY do — computed
 * before anything is written, so the user confirms it.
 *
 * Bulk used to append every ingredient to every target, including positions that
 * already had some of them, so a 'partial' position collected duplicates and a
 * quantity that fell short was never noticed. Here each (position, ingredient) is
 * resolved against the real recipe and becomes exactly one action:
 *
 *   add     — absent; append a row (in the right slot)
 *   topUp   — present but under quantity; raise it to what the template asks
 *   move    — right ref, wrong slot; re-file the existing row
 *   skip    — already satisfied
 *   blocked — belongs inside a wrapper, but the position has none
 *
 * A wrapper shared by several positions has its internals planned ONCE: editing it
 * ripples to every position that uses it, so a second copy would be a duplicate.
 * `sharedWith` names those positions, so the preview can say so.
 *
 * Returns { actions, byPosition, counts }.
 */
export function planCollectionBulk(recipes, posRefs, collection, containerETRefs = new Set()) {
  const ings = parseIngredients(collection).filter(i => ingredientRef(i))
  const actions = []
  const plannedWrappers = new Map()   // wrapper ref -> first position that planned it

  for (const posRef of posRefs || []) {
    const { combined, wrapperRefs } = positionRecipeWithWrapperInternals(recipes, posRef)
    const presence = buildPresence(combined, wrapperRefs)
    const container = containerForPosition(recipes, posRef, containerETRefs)

    for (const ing of ings) {
      const ref = ingredientRef(ing)
      const section = normalizeSection(ing.section)
      const r = ingredientPresence(presence, ing)

      const base = {
        posRef, ref, section,
        rawSection: section === INTERNAL ? (ing.section || 'dl_internal') : 'position',
        container, need: r.need, have: r.have, rows: r.rows, foundAt: r.foundAt,
      }

      if (isSatisfied(r.status)) { actions.push({ ...base, action: 'skip' }); continue }

      if (section === INTERNAL) {
        if (!container) { actions.push({ ...base, action: 'blocked' }); continue }
        // Internals of a shared wrapper are planned once — the coverage read is
        // wrapper-aware, so one copy covers every position using that wrapper.
        const key = container.toLowerCase()
        const owner = plannedWrappers.get(key)
        if (owner && owner !== posRef) {
          actions.push({ ...base, action: 'skip', reason: 'sharedWrapper', sharedWith: owner })
          continue
        }
        plannedWrappers.set(key, posRef)
      }

      if (r.status === 'misplaced') actions.push({ ...base, action: 'move' })
      else if (r.status === 'short') actions.push({ ...base, action: 'topUp' })
      else actions.push({ ...base, action: 'add' })
    }
  }

  const counts = actions.reduce((c, a) => ({ ...c, [a.action]: (c[a.action] || 0) + 1 }), {})
  const byPosition = new Map()
  for (const a of actions) {
    if (!byPosition.has(a.posRef)) byPosition.set(a.posRef, [])
    byPosition.get(a.posRef).push(a)
  }
  return { actions, byPosition, counts }
}

/** The actions that actually change something. */
export const effectiveActions = plan =>
  plan.actions.filter(a => a.action === 'add' || a.action === 'topUp' || a.action === 'move')

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
