/**
 * mergePlan.js — "these ElementTypes are the same product: fold B, C into A."
 *
 * Pure. Returns what WOULD happen; the store applies it (mergeElementTypes).
 *
 * A merge is allowed only when nothing is lost:
 *   - every ref is the same maker + code in the Product Spec;
 *   - a wrapper merges only with an IDENTICAL wrapper (same rows, quantities, flags);
 *   - rows that land on the same context collapse into one, quantities summed, but only if
 *     they differ in nothing but quantity — else the merge is blocked and names where.
 * A deleted row counts as absent.
 */
import { productKey, hasProductIdentity } from './productCodes'

const lc = s => String(s ?? '').trim().toLowerCase()
const live = r => (r.IsDeleted || r.isDeleted) !== 'Y'
const etOf = r => r.ElementTypeRef || r.elementTypeRef || ''
const posOf = r => r.PositionTypeRef || r.positionTypeRef || ''
const ctxOf = r => r.ContextType || r.contextType || ''
const crefOf = r => r.ContextRef || r.contextRef || ''

// Everything on a row that is neither identity nor quantity: if these differ, the rows are not the same row.
const FLAGS = [
  ['IsDesign', 'isDesign'], ['IsContractItem', 'isContractItem'], ['IsTRItem', 'isTRItem'],
  ['PackQuantity', 'packQuantity'], ['IsInteger', 'isInteger'], ['Dim_QuantityMultiplier', 'dimQtyMultiplier'],
]
const DIM = FLAGS[5]
const flag = (r, [a, b]) => lc(r[a] ?? r[b] ?? '')
const qtyOf = r => {
  const q = r.Quantity ?? r.quantity
  return q == null || q === '' ? 1 : Number(q)
}
const differsIn = (a, b) => FLAGS.find(f => flag(a, f) !== flag(b, f))?.[0] || null

export function planMerge({ recipes = [], psRows = [] }, keepRef, dropRefs = []) {
  const keep = lc(keepRef)
  const drops = [...new Set(dropRefs.map(lc))].filter(d => d && d !== keep)
  const blocked = []
  const plan = { ok: false, blocked, rewrites: [], collapses: [], retire: [], positions: 0 }
  if (!keep || !drops.length) {
    blocked.push({ ref: keepRef, reason: 'nothing', detail: 'Pick at least two ElementTypes.' })
    return plan
  }

  // 1. Same product.
  const psOf = ref => psRows.find(r => lc(etOf(r)) === ref && !((r.IsDeleted || r.isDeleted) === 'Y'))
  const keyOf = ref => {
    const r = psOf(ref)
    return r ? productKey(r.Manufacturer ?? r.manufacturer, r.ProductCode ?? r.productCode) : null
  }
  const keepPs = psOf(keep)
  const keepKey = keyOf(keep)
  if (!keepPs || !hasProductIdentity(keepPs.ProductCode ?? keepPs.productCode)) {
    blocked.push({ ref: keepRef, reason: 'noProduct', detail: 'Has no maker and code to match on.' })
  }
  for (const d of drops) {
    if (keyOf(d) !== keepKey) blocked.push({ ref: d, reason: 'notDuplicate', detail: `A different maker or code from ${keepRef}.` })
  }

  // 2. A wrapper merges only with an identical wrapper.
  const rows = recipes.filter(live)
  const inside = ref => rows.filter(r => ctxOf(r) === 'ElementType' && lc(crefOf(r)) === ref)
  const sig = ref => inside(ref)
    .map(r => [lc(etOf(r)), qtyOf(r), ...FLAGS.map(f => flag(r, f))].join('|')).sort().join(';')
  const keepSig = sig(keep)
  for (const d of drops) {
    if (sig(d) !== keepSig) {
      blocked.push({ ref: d, reason: 'wrapperDiffers', detail: `Its contents (${inside(d).length} rows) are not identical to ${keepRef}'s (${inside(keep).length}).` })
    }
  }

  // 3. Rewrites, rows retired with a dropped wrapper, and rows that collapse.
  const dropSet = new Set(drops)
  plan.retire = rows.filter(r => ctxOf(r) === 'ElementType' && dropSet.has(lc(crefOf(r)))).map(r => ({ _id: r._id, posRef: posOf(r) }))
  const retiring = new Set(plan.retire.map(r => r._id))
  const mine = rows.filter(r => !retiring.has(r._id) && (lc(etOf(r)) === keep || dropSet.has(lc(etOf(r)))))
  plan.rewrites = mine.filter(r => dropSet.has(lc(etOf(r)))).map(r => ({ _id: r._id, posRef: posOf(r) }))

  const groups = new Map()
  for (const r of mine) {
    const k = `${posOf(r)}|${ctxOf(r)}|${lc(crefOf(r))}`
    groups.set(k, [...(groups.get(k) || []), r])
  }
  for (const g of groups.values()) {
    if (g.length < 2 || !g.some(r => dropSet.has(lc(etOf(r))))) continue
    const first = g.find(r => lc(etOf(r)) === keep) || g[0]
    const where = ctxOf(first) === 'ElementType' ? `inside ${crefOf(first)}` : `on ${posOf(first)}`
    const bad = g.slice(1).map(r => differsIn(first, r)).find(Boolean)
    if (bad) { blocked.push({ ref: etOf(first), reason: 'rowsDiffer', detail: `Rows ${where} differ in ${bad}.` }); continue }
    if (flag(first, DIM)) { blocked.push({ ref: etOf(first), reason: 'rowsDiffer', detail: `Rows ${where} use a dimension multiplier, not a quantity.` }); continue }
    plan.collapses.push({
      keepId: first._id, keepPos: posOf(first), where,
      quantity: g.reduce((n, r) => n + qtyOf(r), 0),
      remove: g.slice(1).map(r => ({ _id: r._id, posRef: posOf(r) })),
    })
  }

  const collapsed = new Set(plan.collapses.flatMap(c => c.remove.map(r => r._id)))
  plan.rewrites = plan.rewrites.filter(r => !collapsed.has(r._id))
  plan.positions = new Set([...plan.rewrites.map(r => r.posRef), ...plan.collapses.map(c => c.keepPos)]).size
  plan.ok = blocked.length === 0
  return plan
}
