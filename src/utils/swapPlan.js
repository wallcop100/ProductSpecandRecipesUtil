/**
 * swapPlan.js — "I am trying to swap ET-A for ET-B."
 *
 * There was no answer to that. `handleReplace` changes ONE row, so substituting a
 * product mid-project — an entirely ordinary event — cost one manual edit per position,
 * with nothing to check them against afterwards.
 *
 * The subtlety, and the reason this is a plan rather than a loop:
 *
 *   A row INSIDE a wrapper is not that position's row. parseRs projects one shared
 *   internal sheet row onto every position using the wrapper, so swapping "C01r's copy"
 *   swaps C03r's too. The plan states that once, names the sharers, and never counts the
 *   same assembly twice — a second copy looks correct and is not.
 *
 * Pure. Returns what WOULD happen; the store applies it.
 */

import { wrapperUsedBy } from './collectionStatus'

const lc = s => String(s ?? '').trim().toLowerCase()
const live = r => (r.IsDeleted || r.isDeleted) !== 'Y'
const etOf = r => r.ElementTypeRef || r.elementTypeRef || ''
const posOf = r => r.PositionTypeRef || r.positionTypeRef || ''
const ctxOf = r => r.ContextType || r.contextType
const crefOf = r => r.ContextRef || r.contextRef || ''

export const SCOPE = { ROW: 'row', POSITION: 'position', EVERYWHERE: 'everywhere' }

/**
 * planSwap(recipes, fromRef, toRef, { scope, posRef, rowId })
 *
 * → {
 *     rows:           [{ _id, posRef, section, container, sharedWith, isDesign }],
 *     positions:      [posRef]           — every position the swap touches, sharers included
 *     sharedWrappers: [{ container, sharedWith }]
 *     skipped:        [{ _id, reason }]  — already ET-B, or deleted
 *     counts:         { rows, positions, shared, skipped }
 *   }
 *
 * `rows` are the rows to rewrite. A shared wrapper's internal row appears ONCE, under the
 * position whose copy we edit; `sharedWith` names who else it changes.
 */
export function planSwap(recipes = [], fromRef, toRef, { scope = SCOPE.EVERYWHERE, posRef = null, rowId = null } = {}) {
  const from = lc(fromRef)
  const to = lc(toRef)
  const empty = { rows: [], positions: [], sharedWrappers: [], skipped: [], counts: { rows: 0, positions: 0, shared: 0, skipped: 0 } }
  if (!from || !to || from === to) return empty

  const candidates = recipes.filter(r => live(r) && lc(etOf(r)) === from)

  const inScope = r => {
    if (scope === SCOPE.ROW) return r._id === rowId
    if (scope === SCOPE.POSITION) return posOf(r) === posRef
    return true
  }

  const rows = []
  const skipped = []
  const sharedWrappers = new Map()
  // A shared wrapper's internals are ONE assembly. Editing any position's copy edits
  // them all, so the plan claims each (container, ref) exactly once.
  const claimedInternals = new Set()

  for (const r of candidates) {
    if (!inScope(r)) continue

    const isInternal = ctxOf(r) === 'ElementType'
    const container = isInternal ? crefOf(r) : ''

    if (isInternal) {
      const key = `${lc(container)}|${from}`
      if (claimedInternals.has(key)) { skipped.push({ _id: r._id, reason: 'sharedAssembly' }); continue }
      claimedInternals.add(key)
    }

    const sharedWith = isInternal
      ? wrapperUsedBy(recipes, container).filter(p => p !== posOf(r))
      : []
    if (sharedWith.length > 0) sharedWrappers.set(lc(container), { container, sharedWith })

    rows.push({
      _id: r._id,
      posRef: posOf(r),
      section: isInternal ? 'internal' : 'position',
      container: container || null,
      sharedWith,
      isDesign: (r.IsDesign || r.isDesign) === 'Y',
    })
  }

  // Every position that ends up different, including those reached through a wrapper.
  const positions = new Set()
  for (const row of rows) {
    positions.add(row.posRef)
    for (const p of row.sharedWith) positions.add(p)
  }

  return {
    rows,
    positions: [...positions].sort(),
    sharedWrappers: [...sharedWrappers.values()],
    skipped,
    counts: {
      rows: rows.length,
      positions: positions.size,
      shared: sharedWrappers.size,
      skipped: skipped.length,
    },
  }
}

/** Rows already pointing at the destination: swapping them is a no-op worth stating. */
export function alreadySwapped(recipes = [], toRef, { scope = SCOPE.EVERYWHERE, posRef = null } = {}) {
  const to = lc(toRef)
  return recipes.filter(r => {
    if (!live(r) || lc(etOf(r)) !== to) return false
    if (scope === SCOPE.POSITION) return posOf(r) === posRef
    return scope !== SCOPE.ROW
  }).length
}

/** The patch applied to each row. `keepFields` preserves quantity and the flags. */
export function swapPatch(toRef, keepFields = true) {
  const patch = { elementTypeRef: toRef, ElementTypeRef: toRef }
  if (!keepFields) {
    Object.assign(patch, {
      quantity: 1, Quantity: 1,
      packQuantity: null, PackQuantity: null,
      isDesign: null, IsDesign: null,
      isContractItem: null, IsContractItem: null,
      isTRItem: null, IsTRItem: null,
      dimQtyMultiplier: null, Dim_QuantityMultiplier: null,
      isInteger: null, IsInteger: null,
    })
  }
  return patch
}
