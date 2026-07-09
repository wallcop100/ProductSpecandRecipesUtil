/**
 * recipePresence.js — the single answer to "is this ingredient actually in?"
 *
 * Three places used to ask that question and each rolled its own check: a flat
 * Set of ElementTypeRefs, compared by ref alone. That set is blind to WHERE a row
 * sits and to HOW MANY there are, so a plug required *inside the wrapper* read as
 * present when a copy happened to sit at position level — or inside somebody
 * else's wrapper. Coverage said complete, the recipe was wrong.
 *
 * Presence is a triple, not a ref:
 *
 *     (ElementTypeRef, container, quantity)
 *
 * where `container` is null for a position-level row and the wrapper's ET ref for
 * an internal one. An ingredient is PRESENT only where its ref sits in the slot
 * its template asked for, in at least the quantity asked for. A row with the right
 * ref in the wrong slot is MISPLACED — a distinct state, because the fix is to move
 * it, not to add a second copy.
 *
 * Sections collapse to two: 'position' and 'internal'. `dl_internal` and
 * `lin_internal` name the same slot — the inside of whatever wrapper this position
 * uses — and the caller already coerces one to the other (see addConnection).
 */

const lc = s => String(s || '').toLowerCase()
const live = r => (r.IsDeleted || r.isDeleted) !== 'Y'
const etOf = r => r.ElementTypeRef || r.elementTypeRef || ''
const ctxOf = r => r.ContextType || r.contextType
const crefOf = r => r.ContextRef || r.contextRef || ''
const posOf = r => r.PositionTypeRef || r.positionTypeRef || ''
const isDesign = r => (r.IsDesign || r.isDesign) === 'Y'
const qtyOf = r => {
  const q = r.Quantity ?? r.quantity
  const n = Number(q)
  return Number.isFinite(n) && n > 0 ? n : 1
}

export const POSITION = 'position'
export const INTERNAL = 'internal'

/** dl_internal / lin_internal both mean "inside the wrapper". */
export function normalizeSection(section) {
  return !section || section === POSITION ? POSITION : INTERNAL
}

/** The slot a recipe row occupies: { section, container }. */
export function rowSlot(row) {
  if (ctxOf(row) === 'PositionType') return { section: POSITION, container: null }
  return { section: INTERNAL, container: lc(crefOf(row)) || null }
}

/**
 * The wrapper ET refs this position uses, most authoritative first.
 *
 * Only two things make an ET the container for a position, and both are evidence
 * rather than inference:
 *
 *   1. It is the position's DESIGN ELEMENT and is known to be a container. That is
 *      what "design element" means, and it covers a brand-new wrapper that holds
 *      nothing yet.
 *   2. It already HOLDS internal rows on this position. Nothing else could.
 *
 * Note what is deliberately excluded: a position-level row that merely *looks* like
 * a container. `containerETRefs` is a soft, multi-signal guess — on the real project
 * it flags every ET-LIN-TAPE-* and every driver marked Ideaworks/N/A. Trusting it
 * for a non-design row picks a driver as the wrapper and files a plug inside it.
 *
 * Returns [] when the position has no wrapper. That is a fact about the recipe, and
 * callers must treat it as a refusal — never as licence to write a blank ContextRef.
 */
export function containersForPosition(recipes, posRef, containerETRefs = new Set()) {
  const hasInternals = new Set()
  for (const r of recipes || []) {
    if (ctxOf(r) === 'ElementType' && crefOf(r) && live(r)) hasInternals.add(lc(crefOf(r)))
  }
  const own = (recipes || []).filter(r => posOf(r) === posRef && ctxOf(r) === 'PositionType' && live(r))

  const out = []
  const design = own.find(r => isDesign(r) && etOf(r))
  if (design && (containerETRefs.has(lc(etOf(design))) || hasInternals.has(lc(etOf(design))))) {
    out.push(etOf(design))
  }
  for (const r of own) {
    if (etOf(r) && hasInternals.has(lc(etOf(r)))) out.push(etOf(r))   // holds rows: proof, not a hint
  }
  return [...new Set(out)]
}

/** The one container to file an internal row under, or null when there is none. */
export function containerForPosition(recipes, posRef, containerETRefs) {
  return containersForPosition(recipes, posRef, containerETRefs)[0] || null
}

/**
 * buildPresence(rows, wrapperRefs) — index a position's rows by slot.
 *
 * `rows` should already include the internals of the wrappers this position uses
 * (see positionRecipeWithWrapperInternals), and `wrapperRefs` names those wrappers.
 * Internal rows filed under anything else are indexed but will never satisfy an
 * ingredient — they surface as `misplaced`.
 */
export function buildPresence(rows, wrapperRefs = []) {
  const wrappers = new Set((wrapperRefs || []).map(lc))
  const bySlot = new Map()   // `${section}|${ref}` -> { quantity, rows }
  const byRef = new Map()    // ref -> [{ section, container, quantity, row }]

  for (const row of rows || []) {
    if (!live(row)) continue
    const ref = lc(etOf(row))
    if (!ref) continue
    const { section, container } = rowSlot(row)

    // An internal row under a wrapper this position does not use cannot count.
    const counts = section === POSITION || (container && wrappers.has(container))
    if (counts) {
      const key = `${section}|${ref}`
      const cur = bySlot.get(key) || { quantity: 0, rows: [] }
      cur.quantity += qtyOf(row)
      cur.rows.push(row)
      bySlot.set(key, cur)
    }
    if (!byRef.has(ref)) byRef.set(ref, [])
    byRef.get(ref).push({ section, container, quantity: qtyOf(row), row })
  }

  return { bySlot, byRef, wrappers }
}

/**
 * ingredientPresence(presence, ingredient) → { status, have, need, rows, foundAt }
 *
 *   present   — right slot, enough of them
 *   short     — right slot, not enough (bulk "top up" acts on this)
 *   misplaced — the ref exists, but only in the wrong slot: move it, don't add
 *   missing   — not there at all
 *
 * `foundAt` describes where a misplaced row actually sits, so the UI can say so.
 */
export function ingredientPresence(presence, ingredient) {
  const ref = lc(ingredient.ElementTypeRef || ingredient.elementTypeRef || ingredient.ref || ingredient.slotLabel)
  const section = normalizeSection(ingredient.section)
  const need = Number(ingredient.quantity) > 0 ? Number(ingredient.quantity) : 1
  if (!ref) return { status: 'missing', have: 0, need, rows: [], foundAt: null }

  const hit = presence.bySlot.get(`${section}|${ref}`)
  if (hit) {
    return {
      status: hit.quantity >= need ? 'present' : 'short',
      have: hit.quantity, need, rows: hit.rows, foundAt: null,
    }
  }

  const elsewhere = presence.byRef.get(ref) || []
  if (elsewhere.length > 0) {
    const at = elsewhere[0]
    return {
      status: 'misplaced',
      have: 0,
      need,
      rows: elsewhere.map(e => e.row),
      foundAt: at.section === POSITION
        ? { section: POSITION, container: null }
        : { section: INTERNAL, container: at.container },
    }
  }
  return { status: 'missing', have: 0, need, rows: [], foundAt: null }
}

/** Ingredient refs, normalised, skipping the blanks. */
export function ingredientRef(ing) {
  return ing.ElementTypeRef || ing.slotLabel || ing.ref || ''
}

/** True when the status means the recipe already satisfies the ingredient. */
export const isSatisfied = status => status === 'present'
