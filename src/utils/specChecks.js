/**
 * specChecks.js — which ElementTypes the Product Spec checks skip.
 *
 * Some families carry no manufacturer or product code by nature (cables, by default:
 * ET-CABLES / ET-CABLE). They are never counted as missing, partial or TBC. The list is
 * per project (Product Spec ⋯ → Checks skip), so a family can be turned back on.
 */
import { familyOf } from './etRef'

const lc = s => String(s ?? '').toLowerCase()

/** Lowercased refs, among `refs`, in a skipped family. */
export function skippedRefs(refs, elementTypes, families) {
  const skip = new Set((families || []).map(lc))
  if (!skip.size) return new Set()
  const byRef = new Map((elementTypes || []).map(e => [lc(e.ElementTypeRef || e.elementTypeRef), e]))
  const out = new Set()
  for (const r of refs) {
    const k = lc(r)
    if (skip.has(lc(familyOf(r, byRef.get(k))))) out.add(k)
  }
  return out
}
