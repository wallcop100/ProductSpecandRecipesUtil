/**
 * formBuild.js — build many recipes from the Form in one go.
 *
 * After an import, every position knows its Form products (formCaptures.byPosition). A
 * Form template (templateLoader.isFormTemplate) says what goes around them — wrapper,
 * driver, cables — so each position's recipe is that template with its own products
 * dropped in. This plans it: one row per position, with the template it would use.
 *
 * Which template: a Form template whose main product is in the same family as this
 * position's main product (a point-source template for ET-PS, a tape-and-profile one for
 * ET-LIN-TAPE). A position that already has a recipe is skipped unless you choose
 * otherwise. Pure.
 */

import { isFormTemplate } from './templateLoader'

const lc = s => String(s ?? '').trim().toLowerCase()
const famOf = e => e?.Family || e?.family || e?.ParentRef || e?.parentRef || ''
const ingredientsOf = t => {
  if (Array.isArray(t?.ingredients)) return t.ingredients
  try { return JSON.parse(t?.ingredients || '[]') } catch { return [] }
}

/** The family of a Form template's main product. */
function leadFamily(template, familyOf) {
  const lead = ingredientsOf(template).find(i => i.fromForm === 'lead')
  return lead ? familyOf(lead.slotLabel) : ''
}

/**
 * planFormBuild({ posRefs, formCaptures, templates, recipes, elementTypes })
 * → [{ posRef, lead, extras, family, hasRecipe, candidates: [template], choice }]
 *
 * `choice` is a template id, 'products' (just the Form products: main product as the
 * design element, extras beside it) or 'skip'.
 */
export function planFormBuild({ posRefs, formCaptures, templates = [], recipes = [], elementTypes = [] }) {
  const byPos = formCaptures?.byPosition || {}
  const etFamily = new Map(elementTypes.map(e => [lc(e.ElementTypeRef || e.elementTypeRef), famOf(e)]))
  const familyOf = ref => etFamily.get(lc(ref)) || ''
  const formTemplates = templates
    .map(t => ({ ...t, ingredients: ingredientsOf(t) }))
    .filter(isFormTemplate)
    .map(t => ({ ...t, _family: lc(leadFamily(t, familyOf)) }))
  const withRecipe = new Set(recipes
    .filter(r => (r.IsDeleted || r.isDeleted) !== 'Y')
    .map(r => r.PositionTypeRef || r.positionTypeRef))

  const refs = posRefs?.length ? posRefs : Object.keys(byPos)
  return refs.map(posRef => {
    const caps = (byPos[posRef] || []).filter(c => c.elementTypeRef)
    const lead = caps.find(c => c.role === 'lead') || caps[0] || null
    const extras = caps.filter(c => c !== lead)
    const family = lead ? familyOf(lead.elementTypeRef) : ''
    const candidates = lead ? formTemplates.filter(t => t._family && t._family === lc(family)) : []
    const hasRecipe = withRecipe.has(posRef)
    const choice = !lead || hasRecipe ? 'skip' : candidates[0]?.id || 'products'
    return { posRef, lead, extras, family, hasRecipe, candidates, choice }
  })
}
