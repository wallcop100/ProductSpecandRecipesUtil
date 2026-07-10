import { describe, test, expect } from 'vitest'
import { alignmentGaps, masterRefs, gapCounts } from '../../src/utils/specAlignment.js'

/**
 * Two invariants, pointing opposite ways:
 *   1. (Product Spec ∪ Recipes) → the DesignDB master
 *   2. Recipes → the Product Spec
 * And the corollary that killed the old check: a catalogue entry used in no recipe
 * needs nothing at all.
 */

// A workbook ET carries _row_num; a locally-minted one does not.
const dbEt = (ref, n) => ({ ElementTypeRef: ref, _row_num: n })
const localEt = ref => ({ ElementTypeRef: ref, _row_num: null })
const psRow = (ref, extra = {}) => ({ ElementTypeRef: ref, ...extra })
const pos = (posRef, ref, extra = {}) => ({
  PositionTypeRef: posRef, ContextType: 'PositionType', ContextRef: posRef, ElementTypeRef: ref, ...extra,
})
const inside = (posRef, container, ref, extra = {}) => ({
  PositionTypeRef: posRef, ContextType: 'ElementType', ContextRef: container, ElementTypeRef: ref, ...extra,
})

describe('masterRefs — what the DesignDB workbook has heard of', () => {
  test('a parsed row is in the master; a locally-minted one is not', () => {
    const m = masterRefs([dbEt('ET-PROF-01', 4), localEt('ET-LIN-01')])
    expect(m.has('et-prof-01')).toBe(true)
    expect(m.has('et-lin-01')).toBe(false)
  })

  test('collections filtered out by parseDb are still in the master', () => {
    // parseDb strips collections from element_types. ET-CABLE is in the sheet.
    expect(masterRefs([], ['ET-CABLE']).has('et-cable')).toBe(true)
  })

  test('an ET minted locally and later pasted into the workbook counts as master', () => {
    // On reload it comes back parsed, with a _row_num. Subtracting localElementTypes
    // would have called it missing from the sheet it now sits in.
    expect(masterRefs([dbEt('ET-LIN-01', 9)]).has('et-lin-01')).toBe(true)
  })
})

describe('invariant 2 — a recipe implies a spec row', () => {
  const containerETRefs = new Set(['et-lin-01'])

  test('a recipe-used ET with no spec row is a gap; wrappers and products are separated', () => {
    const gaps = alignmentGaps({
      elementTypes: [dbEt('ET-LIN-01', 2), dbEt('ET-PROF-01', 3)],
      psRows: [],
      recipes: [pos('C01r', 'ET-LIN-01'), inside('C01r', 'ET-LIN-01', 'ET-PROF-01')],
      containerETRefs,
    })
    expect(gaps.specRows.wrappers.map(w => w.ref)).toEqual(['ET-LIN-01'])
    expect(gaps.specRows.products.map(p => p.ref)).toEqual(['ET-PROF-01'])
  })

  test('the positions using it travel with the gap', () => {
    const gaps = alignmentGaps({
      recipes: [pos('C01r', 'ET-X'), pos('C03r', 'ET-X')],
      elementTypes: [dbEt('ET-X', 2)],
    })
    expect(gaps.specRows.products[0].usedBy).toEqual(['C01r', 'C03r'])
  })

  test('a wrapper named ONLY as a ContextRef is still used, so it still needs a spec row', () => {
    const gaps = alignmentGaps({
      recipes: [inside('C01r', 'ET-LIN-01', 'ET-PROF-01')],
      psRows: [psRow('ET-PROF-01')],
      elementTypes: [dbEt('ET-LIN-01', 2), dbEt('ET-PROF-01', 3)],
      containerETRefs,
    })
    expect(gaps.specRows.wrappers.map(w => w.ref)).toEqual(['ET-LIN-01'])
  })

  test('THE COROLLARY: a catalogue entry used in no recipe needs nothing', () => {
    // This is the whole bug. The old check flagged 25 cables and connectors here.
    const gaps = alignmentGaps({
      elementTypes: [dbEt('DC Plug', 2), dbEt('ET-2Pin-Socket', 3)],
      psRows: [], recipes: [],
    })
    expect(gaps.specRows.wrappers).toEqual([])
    expect(gaps.specRows.products).toEqual([])
    expect(gaps.dbRows).toEqual([])
  })

  test('a spec row that exists closes the gap', () => {
    const gaps = alignmentGaps({
      elementTypes: [dbEt('ET-PROF-01', 3)],
      psRows: [psRow('ET-PROF-01')],
      recipes: [pos('C01r', 'ET-PROF-01')],
    })
    expect(gapCounts(gaps).total).toBe(0)
  })

  test('deleted rows are invisible on both sides', () => {
    const specDeleted = alignmentGaps({
      elementTypes: [dbEt('ET-PROF-01', 3)],
      psRows: [psRow('ET-PROF-01', { IsDeleted: 'Y' })],
      recipes: [pos('C01r', 'ET-PROF-01')],
    })
    expect(specDeleted.specRows.products.map(p => p.ref)).toEqual(['ET-PROF-01'])

    const recipeDeleted = alignmentGaps({
      elementTypes: [dbEt('ET-PROF-01', 3)],
      psRows: [],
      recipes: [pos('C01r', 'ET-PROF-01', { IsDeleted: 'Y' })],
    })
    expect(recipeDeleted.specRows.products).toEqual([])
  })

  test('an ET used only by an ignored position is out of scope', () => {
    const args = {
      elementTypes: [dbEt('ET-X', 2)],
      recipes: [pos('W01', 'ET-X')],
    }
    expect(alignmentGaps(args).specRows.products.map(p => p.ref)).toEqual(['ET-X'])
    expect(alignmentGaps({ ...args, ignoredPosRefs: new Set(['w01']) }).specRows.products).toEqual([])
  })

  test('a collection is a grouping, never purchasable', () => {
    const gaps = alignmentGaps({
      recipes: [pos('C01r', 'ET-CABLE')],
      collectionRefs: ['ET-CABLE'],
    })
    expect(gaps.specRows.products).toEqual([])
    expect(gaps.dbRows).toEqual([])
  })
})

describe('invariant 1 — the DesignDB is the master', () => {
  test('an ET in the Product Spec but not the DesignDB is a gap', () => {
    const gaps = alignmentGaps({ elementTypes: [], psRows: [psRow('ET-PS-01')] })
    expect(gaps.dbRows).toEqual([{ ref: 'ET-PS-01', inSpec: true, inRecipe: false, isWrapper: false }])
  })

  test('an ET in a recipe but not the DesignDB is a gap, and says it is used', () => {
    const gaps = alignmentGaps({ elementTypes: [], recipes: [pos('C01r', 'ET-DL-01')] })
    expect(gaps.dbRows).toEqual([{ ref: 'ET-DL-01', inSpec: false, inRecipe: true, isWrapper: false }])
  })

  test('a locally-minted ET has not reached the master yet', () => {
    const gaps = alignmentGaps({
      elementTypes: [localEt('ET-LIN-01')],
      psRows: [psRow('ET-LIN-01')],
      containerETRefs: new Set(['et-lin-01']),
    })
    expect(gaps.dbRows).toEqual([{ ref: 'ET-LIN-01', inSpec: true, inRecipe: false, isWrapper: true }])
  })

  test('each ref is reported once, however many rows name it', () => {
    const gaps = alignmentGaps({
      psRows: [psRow('ET-X')],
      recipes: [pos('C01r', 'ET-X'), pos('C03r', 'ET-X')],
    })
    expect(gaps.dbRows).toHaveLength(1)
    expect(gaps.dbRows[0]).toMatchObject({ inSpec: true, inRecipe: true })
  })

  test('a deleted spec row does not demand a master entry', () => {
    expect(alignmentGaps({ psRows: [psRow('ET-GONE', { IsDeleted: 'Y' })] }).dbRows).toEqual([])
  })
})
