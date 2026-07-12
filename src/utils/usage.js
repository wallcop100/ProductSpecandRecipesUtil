/**
 * usage.js — "where else is this used?", answered from TWO sources that must never
 * be conflated.
 *
 *   FORM   — what the imported Form template asks for. An intention.
 *   RECIPE — what the built recipe actually holds. A fact.
 *
 * They routinely differ, and the difference is the work: a product the Form names
 * but no recipe holds is stage ③ still to do; a product a recipe holds that the Form
 * never named is derived detail (a connector, a kit). Showing one number for both
 * would hide exactly the thing the user came to find out.
 *
 * Everything here is pure and read-only.
 */

import { getInternalItems } from './containerUtils'
import { findProductET, norm } from './productCodes'

const lc = s => String(s ?? '').trim().toLowerCase()
const etOf = r => r.ElementTypeRef || r.elementTypeRef || ''
const posOf = r => r.PositionTypeRef || r.positionTypeRef || ''
const ctxOf = r => r.ContextType || r.contextType
const crefOf = r => r.ContextRef || r.contextRef || ''
const live = r => (r.IsDeleted || r.isDeleted) !== 'Y'

/**
 * elementTypeUsage(ref, { recipes, psRows, elementTypes, formCaptures, containerETRefs })
 *
 * → {
 *     recipe:  { positions, containers, contains, isContainer },
 *     form:    { positions, codes },
 *     spec:    { manufacturer, productCode } | null,
 *     onlyInForm, onlyInRecipe, differs
 *   }
 *
 * `recipe.positions`  — positions whose recipe holds this ET (at any level)
 * `recipe.containers` — the wrapper ETs it sits inside
 * `recipe.contains`   — if it IS a wrapper, what it holds
 * `form.positions`    — positions whose FORM asks for this ET (resolved refs)
 */
export function elementTypeUsage(ref, { recipes = [], psRows = [], elementTypes = [], formCaptures = null, containerETRefs = new Set() } = {}) {
  const key = lc(ref)
  const recipePositions = new Set()
  const containers = new Set()

  for (const r of recipes) {
    if (!live(r) || lc(etOf(r)) !== key) continue
    if (posOf(r)) recipePositions.add(posOf(r))
    if (ctxOf(r) === 'ElementType' && crefOf(r)) containers.add(crefOf(r))
  }

  const isContainer = containerETRefs.has(key)
  const contains = isContainer ? getInternalItems(ref, recipes, elementTypes) : []

  // What the Form asks for, keyed by the RESOLVED PositionTypeRef.
  const formPositions = []
  const formCodes = new Set()
  for (const [posRef, entries] of Object.entries(formCaptures?.byPosition || {})) {
    for (const e of entries || []) {
      if (lc(e.elementTypeRef) !== key) continue
      formPositions.push(posRef)
      if (e.code) formCodes.add(e.code)
      break
    }
  }

  const specRow = psRows.find(r => live(r) && lc(etOf(r)) === key)
  const spec = specRow
    ? { manufacturer: specRow.Manufacturer || specRow.manufacturer || '', productCode: specRow.ProductCode || specRow.productCode || '' }
    : null

  const inRecipe = new Set([...recipePositions].map(lc))
  const inForm = new Set(formPositions.map(lc))
  const onlyInForm = formPositions.filter(p => !inRecipe.has(lc(p))).sort()
  const onlyInRecipe = [...recipePositions].filter(p => !inForm.has(lc(p))).sort()

  return {
    ref,
    recipe: {
      positions: [...recipePositions].sort(),
      containers: [...containers].sort(),
      contains,
      isContainer,
    },
    form: { positions: formPositions.sort(), codes: [...formCodes] },
    spec,
    onlyInForm,
    onlyInRecipe,
    // Only meaningful once a Form is attached AND it mentions this ET somewhere.
    differs: !!formCaptures && (onlyInForm.length > 0 || (inForm.size > 0 && onlyInRecipe.length > 0)),
  }
}

/**
 * divergingRefs({ recipes, formCaptures }) → Set of lowercased ElementType refs whose Form
 * and recipe disagree about WHERE they are used.
 *
 * The same predicate as `elementTypeUsage(...).differs`, computed for every ref in ONE pass
 * instead of one full scan of `recipes` per ref. That is the whole point: the divergence was
 * only ever visible inside a popover, on hover, because computing it per-ref was too
 * expensive to do for a panel full of rows. Once it is one pass, the panel can simply SHOW
 * which rows disagree, and the popover is left to explain the ones you ask about.
 *
 * Pure, read-only, and null-safe: no Form attached means nothing can diverge.
 */
export function divergingRefs({ recipes = [], formCaptures = null } = {}) {
  const out = new Set()
  if (!formCaptures) return out

  const inRecipe = new Map()   // lc(etRef) -> Set of lc(posRef)
  for (const r of recipes) {
    if (!live(r)) continue
    const key = lc(etOf(r))
    const pos = lc(posOf(r))
    if (!key || !pos) continue
    if (!inRecipe.has(key)) inRecipe.set(key, new Set())
    inRecipe.get(key).add(pos)
  }

  const inForm = new Map()     // lc(etRef) -> Set of lc(posRef)
  for (const [posRef, entries] of Object.entries(formCaptures.byPosition || {})) {
    for (const e of entries || []) {
      const key = lc(e.elementTypeRef)
      if (!key) continue
      if (!inForm.has(key)) inForm.set(key, new Set())
      inForm.get(key).add(lc(posRef))
    }
  }

  for (const [key, formPos] of inForm) {
    const recipePos = inRecipe.get(key) || new Set()
    // The Form asks for it somewhere the recipe has not got it — outstanding work.
    const onlyInForm = [...formPos].some(p => !recipePos.has(p))
    // ...or the recipe has it somewhere the Form does not. Only meaningful for an ET the
    // Form mentions AT ALL; otherwise every connector and kit would "diverge".
    const onlyInRecipe = [...recipePos].some(p => !formPos.has(p))
    if (onlyInForm || onlyInRecipe) out.add(key)
  }
  return out
}

/**
 * productUsage(manufacturer, code, ctx) — the same question asked of a PRODUCT.
 *
 * A product is (manufacturer, code); it resolves to at most one ElementType (see
 * findProductET), and then the ET's usage is the answer. Returns `null` when the
 * pair names no ElementType — a code the spec has never seen, or an ambiguous one
 * claimed by two makers.
 */
export function productUsage(manufacturer, code, ctx = {}) {
  const ref = findProductET(ctx.psRows || [], manufacturer, code)
  if (!ref) return null
  return { ...elementTypeUsage(ref, ctx), matchedBy: { manufacturer, code } }
}

/**
 * wrapperUsage(ref, ctx) — a container's two audiences.
 *
 * `positions` are the positions that USE the wrapper; `contains` is what is inside
 * it. Editing the inside ripples to every position in `positions`, which is the
 * whole reason a fork is ever needed.
 */
export function wrapperUsage(ref, ctx = {}) {
  const u = elementTypeUsage(ref, ctx)
  return { ...u, shared: u.recipe.positions.length > 1 }
}

/** Every PositionType a Form ref could not be matched to. See ptResolve for `via`. */
export function unmatchedFormPositions(resolutions = [], recipes = []) {
  const withRecipe = new Set(recipes.filter(live).map(r => lc(posOf(r))).filter(Boolean))
  return resolutions
    .filter(r => !r.target || !withRecipe.has(lc(r.target)))
    .map(r => ({
      formRef: r.formRef,
      target: r.target || null,
      rows: r.rows,
      // Two different problems, and they need different fixes.
      reason: !r.target ? 'notInDb' : 'noRecipe',
    }))
}

/** A short label for a code's identity, used wherever a code is printed. */
export const productLabel = (manufacturer, code) =>
  manufacturer ? `${manufacturer} · ${code}` : String(code ?? '')

export { norm }
