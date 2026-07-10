import { describe, test, expect } from 'vitest'
import { planSwap, alreadySwapped, swapPatch, SCOPE } from '../../src/utils/swapPlan.js'

/**
 * "I am trying to swap ET-A for ET-B" had no answer: handleReplace changes one row, so a
 * product substitution cost one manual edit per position. The hard part is not the loop —
 * it is that a row inside a shared wrapper is not that position's row.
 */
const pos = (posRef, ref, id, extra = {}) => ({
  _id: id, PositionTypeRef: posRef, ContextType: 'PositionType', ContextRef: posRef, ElementTypeRef: ref, ...extra,
})
const inside = (posRef, container, ref, id, extra = {}) => ({
  _id: id, PositionTypeRef: posRef, ContextType: 'ElementType', ContextRef: container, ElementTypeRef: ref, ...extra,
})

// ET-LIN-01 is shared by C01r and C03r. parseRs projects its internals onto both.
const recipes = [
  pos('C01r', 'ET-LIN-01', 'w1'),
  pos('C03r', 'ET-LIN-01', 'w2'),
  inside('C01r', 'ET-LIN-01', 'ET-TAPE-01', 'i1'),
  inside('C03r', 'ET-LIN-01', 'ET-TAPE-01', 'i2'),   // the same sheet row, projected
  pos('D07', 'ET-TAPE-01', 'p3'),                    // an unrelated position-level row
]

describe('scope', () => {
  test('everywhere rewrites every live row that names the old ref', () => {
    const plan = planSwap(recipes, 'ET-TAPE-01', 'ET-TAPE-09')
    // i1 and i2 are ONE assembly, so only one row is rewritten; p3 is its own.
    expect(plan.counts.rows).toBe(2)
    expect(plan.positions).toEqual(['C01r', 'C03r', 'D07'])
  })

  test('position scope touches only that position', () => {
    const plan = planSwap(recipes, 'ET-TAPE-01', 'ET-TAPE-09', { scope: SCOPE.POSITION, posRef: 'D07' })
    expect(plan.rows.map(r => r._id)).toEqual(['p3'])
    expect(plan.positions).toEqual(['D07'])
  })

  test('row scope is a single row', () => {
    const plan = planSwap(recipes, 'ET-TAPE-01', 'ET-TAPE-09', { scope: SCOPE.ROW, rowId: 'p3' })
    expect(plan.counts.rows).toBe(1)
  })
})

describe('a shared assembly is one thing, not two', () => {
  test('the internal row is claimed once and its sharers are named', () => {
    const plan = planSwap(recipes, 'ET-TAPE-01', 'ET-TAPE-09')
    const internal = plan.rows.find(r => r.section === 'internal')
    expect(internal.container).toBe('ET-LIN-01')
    expect(internal.sharedWith).toEqual(['C03r'])
    expect(plan.skipped).toEqual([{ _id: 'i2', reason: 'sharedAssembly' }])
  })

  test('the sharers are counted among the positions the swap changes', () => {
    // Swapping inside C01r's wrapper changes C03r, which nothing else would tell you.
    const plan = planSwap(recipes, 'ET-TAPE-01', 'ET-TAPE-09', { scope: SCOPE.POSITION, posRef: 'C01r' })
    expect(plan.rows).toHaveLength(1)
    expect(plan.positions).toEqual(['C01r', 'C03r'])
    expect(plan.sharedWrappers).toEqual([{ container: 'ET-LIN-01', sharedWith: ['C03r'] }])
  })

  test('an unshared wrapper reports no sharers', () => {
    const solo = [pos('C01r', 'ET-LIN-01', 'w1'), inside('C01r', 'ET-LIN-01', 'ET-TAPE-01', 'i1')]
    const plan = planSwap(solo, 'ET-TAPE-01', 'ET-TAPE-09')
    expect(plan.sharedWrappers).toEqual([])
    expect(plan.positions).toEqual(['C01r'])
  })

  test('swapping the WRAPPER itself is a position-level row, one per position', () => {
    const plan = planSwap(recipes, 'ET-LIN-01', 'ET-LIN-02')
    expect(plan.counts.rows).toBe(2)                 // C01r's and C03r's own rows
    expect(plan.rows.every(r => r.section === 'position')).toBe(true)
  })
})

describe('nothing silly', () => {
  test('deleted rows are not swapped', () => {
    const rows = [pos('C01r', 'ET-TAPE-01', 'p1', { IsDeleted: 'Y' })]
    expect(planSwap(rows, 'ET-TAPE-01', 'ET-TAPE-09').counts.rows).toBe(0)
  })

  test('swapping a ref for itself does nothing', () => {
    expect(planSwap(recipes, 'ET-TAPE-01', 'ET-TAPE-01').counts.rows).toBe(0)
    expect(planSwap(recipes, 'ET-TAPE-01', 'et-tape-01').counts.rows).toBe(0)
  })

  test('an absent ref plans nothing', () => {
    expect(planSwap(recipes, 'ET-NOPE', 'ET-TAPE-09').counts.rows).toBe(0)
    expect(planSwap(recipes, '', 'ET-X').counts.rows).toBe(0)
  })

  test('matching is case-insensitive', () => {
    expect(planSwap(recipes, 'et-tape-01', 'ET-TAPE-09').counts.rows).toBe(2)
  })

  test('the design flag travels with the row so the preview can say so', () => {
    const rows = [pos('C01r', 'ET-LAMP', 'p1', { IsDesign: 'Y' })]
    expect(planSwap(rows, 'ET-LAMP', 'ET-LAMP-2').rows[0].isDesign).toBe(true)
  })
})

describe('alreadySwapped — a no-op worth stating', () => {
  test('counts rows that already point at the destination', () => {
    expect(alreadySwapped(recipes, 'ET-LIN-01')).toBe(2)
    expect(alreadySwapped(recipes, 'ET-NOPE')).toBe(0)
  })
})

describe('swapPatch', () => {
  test('keepFields preserves quantity and the flags, like the row-level swap', () => {
    expect(swapPatch('ET-B', true)).toEqual({ elementTypeRef: 'ET-B', ElementTypeRef: 'ET-B' })
  })

  test('without keepFields the row is reset to defaults', () => {
    const p = swapPatch('ET-B', false)
    expect(p.Quantity).toBe(1)
    expect(p.IsDesign).toBeNull()
    expect(p.Dim_QuantityMultiplier).toBeNull()
  })
})
