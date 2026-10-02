/**
 * recipeSignature.js — a position's WHOLE recipe as one key (A59TJK): every live row's
 * place (site, or inside which wrapper kind of slot), ElementType and quantity, sorted.
 * Two positions with the same key are built identically. Pure.
 */
import { rowSlot } from './recipePresence'

const live = r => (r.IsDeleted || r.isDeleted) !== 'Y'

export function recipeSignature(recipes, posRef) {
  const parts = recipes
    .filter(r => live(r) && (r.PositionTypeRef || r.positionTypeRef) === posRef)
    .map(r => `${rowSlot(r).section}:${String(r.ElementTypeRef || r.elementTypeRef || '').toUpperCase()}×${Number(r.Quantity ?? r.quantity ?? 1) || 1}`)
  return parts.length ? parts.sort().join('|') : ''
}

/** Map(posRef → [other positions with the identical recipe]). */
export function sameRecipeGroups(recipes, posRefs) {
  const bySig = new Map()
  for (const p of posRefs) {
    const s = recipeSignature(recipes, p)
    if (!s) continue
    if (!bySig.has(s)) bySig.set(s, [])
    bySig.get(s).push(p)
  }
  const out = new Map()
  for (const list of bySig.values()) for (const p of list) out.set(p, list.filter(x => x !== p))
  return out
}
