/**
 * specAlignment.js — the one definition of "these three documents disagree".
 *
 * Two invariants, and they point in opposite directions. Getting the arrow the
 * wrong way round is what made the old check flag 25 cables nobody bought:
 *
 *   1. THE DESIGNDB IS THE MASTER.
 *      Every ElementType named in the Product Spec or the Recipes must exist in the
 *      DesignDB's ElementTypes sheet. (PS ∪ RS) → DB.
 *
 *   2. A RECIPE IMPLIES A SPEC.
 *      Every ElementType used in a recipe must have a Product Spec row, or there is
 *      nowhere to record what to buy. RS → PS.
 *
 * And the corollary that kills the old behaviour: a DesignDB entry used in NO recipe
 * needs nothing at all. The catalogue is a master list, not a shopping list.
 *
 * Pure and read-only. Three surfaces (the Product Spec pill, the validation panel,
 * the export summary) used to answer this question three different ways and get
 * three different numbers; they all call this now.
 */

const lc = s => String(s ?? '').trim().toLowerCase()
const live = r => (r.IsDeleted || r.isDeleted) !== 'Y'
const etOf = r => r.ElementTypeRef || r.elementTypeRef || ''
const posOf = r => r.PositionTypeRef || r.positionTypeRef || ''
const ctxTypeOf = r => r.ContextType || r.contextType
const ctxRefOf = r => r.ContextRef || r.contextRef || ''

/**
 * Which ElementTypes exist in the DesignDB *workbook*.
 *
 * `elementTypes` is the merged catalogue: rows parsed from the workbook, plus the
 * ones this app minted locally. A parsed row carries `_row_num` (its Excel row);
 * `createElementType` sets `_row_num: null` and SQLite's local rows have none. So
 * `_row_num != null` means "the DesignDB workbook has heard of this".
 *
 * We do NOT subtract `localElementTypes`: once you paste the patch and reopen, an ET
 * lives in both lists, and subtracting would call it missing from the very sheet it
 * now sits in.
 *
 * `collectionRefs` are the collections parseDb filters out of `element_types`. They
 * are in the master, so a recipe naming one is not a gap.
 */
export function masterRefs(elementTypes = [], collectionRefs = []) {
  const set = new Set(collectionRefs.map(lc).filter(Boolean))
  for (const e of elementTypes) {
    if (e._row_num == null) continue
    const ref = lc(etOf(e))
    if (ref) set.add(ref)
  }
  return set
}

/**
 * alignmentGaps({ elementTypes, psRows, recipes, containerETRefs, collectionRefs, ignoredPosRefs })
 *
 * → {
 *     specRows: {
 *       wrappers: [{ ref, usedBy }],   // Ideaworks / N/A — fully determined, safe to fill
 *       products: [{ ref, usedBy }],   // needs a manufacturer and a code; only a human knows
 *     },
 *     dbRows: [{ ref, inSpec, inRecipe, isWrapper }],
 *   }
 *
 * `ignoredPosRefs` (lowercase) drops rows on ignored positions, per the standing rule
 * that an ignored position leaves every total.
 */
export function alignmentGaps({
  elementTypes = [],
  psRows = [],
  recipes = [],
  containerETRefs = new Set(),
  collectionRefs = [],
  ignoredPosRefs = new Set(),
} = {}) {
  const master = masterRefs(elementTypes, collectionRefs)
  const collections = new Set(collectionRefs.map(lc).filter(Boolean))

  const specced = new Set()
  for (const r of psRows) {
    if (!live(r)) continue
    const ref = lc(etOf(r))
    if (ref) specced.add(ref)
  }

  // What the recipes actually use. A wrapper named only as a ContextRef is used too:
  // its internals sit inside it, so it needs both a spec row and a master entry.
  const usedBy = new Map()       // lc ref -> { ref, positions:Set }
  const note = (ref, posRef) => {
    const key = lc(ref)
    if (!key) return
    if (!usedBy.has(key)) usedBy.set(key, { ref, positions: new Set() })
    if (posRef) usedBy.get(key).positions.add(posRef)
  }
  for (const r of recipes) {
    if (!live(r)) continue
    const posRef = posOf(r)
    if (ignoredPosRefs.has(lc(posRef))) continue
    note(etOf(r), posRef)
    if (ctxTypeOf(r) === 'ElementType') note(ctxRefOf(r), posRef)
  }

  // Invariant 2 — recipe ⇒ spec. Collections are groupings, never purchasable.
  const wrappers = []
  const products = []
  for (const [key, { ref, positions }] of usedBy) {
    if (specced.has(key) || collections.has(key)) continue
    const entry = { ref, usedBy: [...positions].sort() }
    ;(containerETRefs.has(key) ? wrappers : products).push(entry)
  }

  // Invariant 1 — everything in PS or RS ⇒ the master.
  const dbRows = []
  const seen = new Set()
  const considerDb = (ref, inSpec, inRecipe) => {
    const key = lc(ref)
    if (!key || master.has(key) || seen.has(key)) return
    seen.add(key)
    dbRows.push({ ref, inSpec, inRecipe, isWrapper: containerETRefs.has(key) })
  }
  for (const r of psRows) {
    if (!live(r)) continue
    const key = lc(etOf(r))
    considerDb(etOf(r), true, usedBy.has(key))
  }
  for (const [, { ref }] of usedBy) considerDb(ref, specced.has(lc(ref)), true)

  const byRef = (a, b) => a.ref.localeCompare(b.ref)
  return {
    specRows: { wrappers: wrappers.sort(byRef), products: products.sort(byRef) },
    dbRows: dbRows.sort(byRef),
  }
}

/** Total outstanding work, for a badge. Wrappers are one click; products are not. */
export const gapCounts = gaps => ({
  wrappers: gaps.specRows.wrappers.length,
  products: gaps.specRows.products.length,
  dbRows: gaps.dbRows.length,
  total: gaps.specRows.wrappers.length + gaps.specRows.products.length + gaps.dbRows.length,
})
