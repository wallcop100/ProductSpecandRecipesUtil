import { describe, it, expect } from 'vitest'
import { positionMakeup, sameKindAs, matchKind, usuallyMissing, elementTypesForJob, sectionFor, rowFromSlot, powerOf } from '../../src/utils/recipeKinds'

const row = (pos, ref, ctx = 'PositionType', extra = {}) => ({
  PositionTypeRef: pos, ContextType: ctx, ContextRef: ctx === 'PositionType' ? pos : 'ET-LIN-01', ElementTypeRef: ref, ...extra })
const state = {
  positionTypes: ['C01r', 'C03r', 'C05r'].map(r => ({ PositionTypeRef: r, DriverLocation: 'Remote', SecondaryPowerType: 'CV' })),
  elementTypes: [
    { ElementTypeRef: 'ET-LIN-01', Family: 'ET-LIN' }, { ElementTypeRef: 'ET-LIN-TAPE-01', Family: 'ET-LIN-TAPE' },
    { ElementTypeRef: 'ET-LIN-PROF-01', Family: 'ET-LIN-PROF' }, { ElementTypeRef: 'ET-LIN-CAP-01', Family: 'ET-LIN-PROF' },
    { ElementTypeRef: 'ET-LIN-DIFF-01', Family: 'ET-LIN-PROF' },
  ],
  psRows: [{ ElementTypeRef: 'ET-LIN-PROF-01', Manufacturer: 'LEDFlex', ProductCode: '021-8810-02' }],
  recipes: [
    ...['C01r', 'C03r', 'C05r'].flatMap(p => [row(p, 'ET-LIN-01', 'PositionType', { IsDesign: 'Y' }),
      row(p, 'ET-LIN-TAPE-01', 'ElementType'), row(p, 'ET-LIN-PROF-01', 'ElementType')]),
    row('C01r', 'ET-LIN-CAP-01', 'ElementType'), row('C03r', 'ET-LIN-CAP-01', 'ElementType'),
    row('C01r', 'ET-2Pin-LIN-Socket'),
  ],
}
const KIND = { id: 2, name: 'Linear tape in profile — remote CV', design: 'LIN', driver: 'remote', secondary: 'CV', projects: 16,
  defining: ['PROFILE', 'TAPE:tape'],
  slots: [{ slot: 'PROFILE', core: true, share: 1 }, { slot: 'TAPE:tape', core: true, share: 1 },
    { slot: 'END_CAPS', core: false, share: 0.96, section: 'lin_internal', qty: 2, contract: 1, integer: 0 },
    { slot: 'DIFFUSER', core: false, share: 0.96, section: 'lin_internal', dim: 1, contract: 1, integer: 0 },
    { slot: 'CLIPS', core: false, share: 0.4, section: 'lin_internal' }] }

describe('recipe make-up by job', () => {
  it('reads design, power and the defining jobs; connectors stay out', () => {
    const m = positionMakeup('C01r', state)
    expect([m.design, m.driver, m.secondary, m.defining]).toEqual(['LIN', 'remote', 'CV', ['PROFILE', 'TAPE:tape']])
    expect([...m.jobs.keys()].sort()).toEqual(['END_CAPS', 'PROFILE', 'TAPE:tape'])
  })
  it('"same as" names the position of the same make-up and what it adds', () => {
    const [s] = sameKindAs('C05r', state)
    expect(s.posRef).toBe('C01r')
    expect(s.adds.map(a => a.job)).toEqual(['END_CAPS'])
  })
  it('matches a kind and lists what positions like it usually also have', () => {
    const m = positionMakeup('C05r', state)
    expect(matchKind(m, [KIND]).id).toBe(2)
    expect(matchKind({ ...m, driver: 'local' }, [KIND])).toBeNull()
    expect(usuallyMissing(m, KIND).map(s => s.slot)).toEqual(['END_CAPS', 'DIFFUSER'])
  })
  it('offers the project\'s ElementTypes for a job, most used first, with the slot\'s rule', () => {
    expect(elementTypesForJob('DIFFUSER', state).map(e => e.ElementTypeRef)).toEqual(['ET-LIN-DIFF-01'])
    expect(sectionFor(KIND.slots[2], 'LIN')).toBe('lin_internal')
    expect(rowFromSlot(KIND.slots[2], 'ET-LIN-CAP-01')).toEqual({ elementTypeRef: 'ET-LIN-CAP-01', quantity: 2, dimQtyMultiplier: null, isContractItem: 'Y', isInteger: null })
    expect(powerOf({ DriverLocation: 'Local to fitting', SecondaryPowerType: 'CC' })).toEqual({ driver: 'local', secondary: 'CC' })
  })
})
