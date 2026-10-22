import { describe, test, expect, beforeEach } from 'vitest'
import useStore from '../../src/store/useStore'
import { planMerge } from '../../src/utils/mergePlan'

const pos = (posRef, ref, id, extra = {}) => ({
  _id: id, PositionTypeRef: posRef, ContextType: 'PositionType', ContextRef: posRef, ElementTypeRef: ref, Quantity: 1, ...extra,
})
const inside = (posRef, container, ref, id, extra = {}) => ({
  _id: id, PositionTypeRef: posRef, ContextType: 'ElementType', ContextRef: container, ElementTypeRef: ref, Quantity: 1, ...extra,
})
const ps = (ref, code = 'FPSC0808ECG') => ({ ElementTypeRef: ref, Manufacturer: 'LEDFlex', ProductCode: code })
const PS = [ps('ET-LIN-CAP-06'), ps('ET-LIN-CAP-07'), ps('ET-LIN-CAP-11'), ps('ET-OTHER-01', 'ZZZ999')]
const KEEP = 'ET-LIN-CAP-06'

describe('planMerge', () => {
  test('rewrites rows and sums two on the same context', () => {
    const recipes = [pos('P1', KEEP, 'a', { Quantity: 1 }), pos('P1', 'ET-LIN-CAP-07', 'b', { Quantity: 2 }), pos('P2', 'ET-LIN-CAP-07', 'c')]
    const plan = planMerge({ recipes, psRows: PS }, KEEP, ['ET-LIN-CAP-07'])
    expect(plan.ok).toBe(true)
    expect(plan.collapses).toHaveLength(1)
    expect(plan.collapses[0]).toMatchObject({ keepId: 'a', quantity: 3 })
    expect(plan.rewrites.map(r => r._id)).toEqual(['c'])
  })

  test('same context differing in a flag blocks, naming the field', () => {
    const recipes = [pos('P1', KEEP, 'a'), pos('P1', 'ET-LIN-CAP-07', 'b', { IsContractItem: 'Y' })]
    const plan = planMerge({ recipes, psRows: PS }, KEEP, ['ET-LIN-CAP-07'])
    expect(plan.ok).toBe(false)
    expect(plan.blocked[0].detail).toMatch(/P1.*IsContractItem/)
  })

  test('a different maker or code is not a duplicate', () => {
    const plan = planMerge({ recipes: [], psRows: PS }, KEEP, ['ET-OTHER-01'])
    expect(plan.blocked[0].reason).toBe('notDuplicate')
  })

  test('identical wrappers merge, different wrappers do not', () => {
    const w = (c, extra) => [pos('P1', c, `w-${c}`), inside('P1', c, 'ET-PART-1', `i-${c}`, extra)]
    const same = planMerge({ recipes: [...w(KEEP), ...w('ET-LIN-CAP-07')], psRows: PS }, KEEP, ['ET-LIN-CAP-07'])
    expect(same.ok).toBe(true)
    expect(same.retire.map(r => r._id)).toEqual(['i-ET-LIN-CAP-07'])
    const diff = planMerge({ recipes: [...w(KEEP), ...w('ET-LIN-CAP-07', { Quantity: 4 })], psRows: PS }, KEEP, ['ET-LIN-CAP-07'])
    expect(diff.blocked[0].reason).toBe('wrapperDiffers')
  })

  test('a deleted row counts as absent', () => {
    const recipes = [pos('P1', KEEP, 'a'), pos('P1', 'ET-LIN-CAP-07', 'b', { IsDeleted: 'Y', IsContractItem: 'Y' })]
    expect(planMerge({ recipes, psRows: PS }, KEEP, ['ET-LIN-CAP-07']).ok).toBe(true)
  })
})

describe('mergeElementTypes', () => {
  beforeEach(() => {
    useStore.setState({
      recipes: [pos('P1', KEEP, 'a'), pos('P1', 'ET-LIN-CAP-07', 'b', { Quantity: 2 }), pos('P2', 'ET-LIN-CAP-11', 'c')],
      elementTypes: ['ET-LIN-CAP-06', 'ET-LIN-CAP-07', 'ET-LIN-CAP-11'].map(r => ({ ElementTypeRef: r })),
      psRows: PS.map(r => ({ ...r })), containerETRefs: new Set(), containerReasons: {},
      rsChanges: [], psChanges: [], dbChanges: [], past: [], future: [], localElementTypes: [],
      formCaptures: null, importDraft: null, slotMappings: {}, activeContextType: 'PositionType', activeETRef: null,
    })
  })
  const live = () => useStore.getState().recipes.filter(r => r.IsDeleted !== 'Y')

  test('leaves no row on a dropped ref, sums quantities, and undoes in one step', () => {
    useStore.getState().mergeElementTypes(KEEP, ['ET-LIN-CAP-07', 'ET-LIN-CAP-11'])
    expect(live().map(r => [r.PositionTypeRef, r.ElementTypeRef, r.Quantity])).toEqual([['P1', KEEP, 3], ['P2', KEEP, 1]])
    expect(useStore.getState().psRows.filter(r => r.IsDeleted !== 'Y').map(r => r.ElementTypeRef)).not.toContain('ET-LIN-CAP-07')
    useStore.getState().undo()
    expect(live()).toHaveLength(3)
    expect(live().map(r => r.ElementTypeRef)).toContain('ET-LIN-CAP-11')
  })

  test('a new ref renames the survivor in the same undo step', () => {
    useStore.getState().mergeElementTypes(KEEP, ['ET-LIN-CAP-07', 'ET-LIN-CAP-11'], { newRef: 'ET-LIN-CAP-20' })
    expect(live().every(r => r.ElementTypeRef === 'ET-LIN-CAP-20')).toBe(true)
    useStore.getState().undo()
    expect(live().map(r => r.ElementTypeRef)).toContain('ET-LIN-CAP-07')
  })

  test('a blocked merge changes nothing', () => {
    const plan = useStore.getState().mergeElementTypes(KEEP, ['ET-OTHER-01'])
    expect(plan.ok).toBe(false)
    expect(useStore.getState().past).toHaveLength(0)
  })
})
