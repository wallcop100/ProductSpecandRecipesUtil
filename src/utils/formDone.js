/**
 * formDone.js: is a position done with respect to the loaded Form (WVYVW6)? One answer
 * for the rail's ticks and the toolbar chip, so the two can't disagree.
 *
 *   - a code still needs an ElementType (state 'todo') → not done;
 *   - saved for the position (formCaptures) → done when its recipe holds everything
 *     saved (`incomplete` is formWorklist's set of positions that don't);
 *   - not saved yet, every code known (state 'ready', e.g. just after a refresh) → done
 *     when the recipe holds every ElementType the Product Spec names for its codes.
 * Pure.
 */
import { compareFormToRecipe } from './formSpec'
import { findProductET } from './productCodes'
import { positionPaintStatus } from './formPositions'
import { buildRefMap, targetFor } from './ptResolve'

export function draftKnownEntries(formRows = [], psRows = []) {
  const seen = new Set()
  const out = []
  for (const r of formRows) {
    for (const code of String(r.rawText || '').split(/\s+/).filter(Boolean)) {
      const et = findProductET(psRows, r.manufacturer, code)
      if (!et || seen.has(et)) continue
      seen.add(et)
      out.push({ code, manufacturer: r.manufacturer || '', elementTypeRef: et, formRef: r.positionType })
    }
  }
  return out
}

export function positionFormDone(ref, { importDraft, formCaptures, recipes = [], psRows = [], containerETRefs = new Set(), incomplete = new Set() }) {
  const st = positionPaintStatus(importDraft, ref, { buildRefMap, targetFor })
  if (st.state === 'todo') return false
  if (formCaptures?.byPosition?.[ref]) return !incomplete.has(ref)
  if (st.state === 'ready' || st.state === 'added') {
    const r = compareFormToRecipe(recipes, ref, draftKnownEntries(st.formRows, psRows), containerETRefs)
    return r.missing.length === 0
  }
  return !incomplete.has(ref)
}
