import { describe, it, expect } from 'vitest'
import { templateRecords, templatesFor } from '../../src/utils/templateRules'

const row = (pos, ref, ctx = 'PositionType', extra = {}) => ({
  PositionTypeRef: pos, ContextType: ctx, ContextRef: ctx === 'PositionType' ? pos : 'ET-LIN-01', ElementTypeRef: ref, ...extra })
const pt = (PositionTypeRef, DriverLocation, SecondaryPowerType) => ({ PositionTypeRef, DriverLocation, SecondaryPowerType })
const state = {
  positionTypes: [pt('C01r', 'Remote', 'CV'), pt('C02', 'Local', 'CV'), pt('C09r', 'Remote', 'CV')],
  elementTypes: [
    { ElementTypeRef: 'ET-LIN-01', Family: 'ET-LIN' }, { ElementTypeRef: 'ET-LIN-TAPE-01', Family: 'ET-LIN-TAPE' },
    { ElementTypeRef: 'ET-LIN-PROF-01', Family: 'ET-LIN-PROF' }, { ElementTypeRef: 'ET-DL-01', Family: 'ET-DL' },
  ],
  psRows: [{ ElementTypeRef: 'ET-LIN-PROF-01', Manufacturer: 'LEDFlex', ProductCode: '021-8810-02' }],
  recipes: [
    row('C01r', 'ET-LIN-01', 'PositionType', { IsDesign: 'Y' }), row('C01r', 'ET-LIN-TAPE-01', 'ElementType'), row('C01r', 'ET-LIN-PROF-01', 'ElementType'),
    row('C02', 'ET-DL-01', 'PositionType', { IsDesign: 'Y' }),
  ],
  formCaptures: { byPosition: { C09r: [{ elementTypeRef: 'ET-LIN-TAPE-01' }, { elementTypeRef: 'ET-LIN-PROF-01' }] } },
}
const cond = (column, op, value) => ({ column, op, value })
const seeded = { id: 'served:t1', name: 'Tape in profile', rule: { match: 'all', conditions: [
  cond('Design', 'equals', 'LIN'), cond('DriverLocation', 'equals', 'remote'), cond('DriverType', 'equals', 'CV'),
  cond('Jobs', 'contains', 'PROFILE'), cond('Jobs', 'contains', 'TAPE:tape')] } }
const unruled = { id: 'served:t2', name: 'No rule yet', rule: { match: 'all', conditions: [] } }

describe('templatesFor', () => {
  it('a LIN tape-in-profile remote CV position matches the seeded rule', () => {
    const { matches, others } = templatesFor('C01r', { ...state, templates: [seeded, unruled] })
    expect(matches.map(t => t.id)).toEqual(['served:t1'])
    expect(others.map(t => t.id)).toEqual(['served:t2'])
  })
  it('a DL local position does not, and says which conditions fail', () => {
    const { matches, others } = templatesFor('C02', { ...state, templates: [seeded] })
    expect(matches).toEqual([])
    expect(others[0].why.filter(w => !w.ok).map(w => w.cond.column)).toEqual(['Design', 'DriverLocation', 'Jobs', 'Jobs'])
    expect(others[0].why[0]).toMatchObject({ ok: false, has: 'DL' })
  })
  it('an empty position takes its Jobs from the Form capture', () => {
    expect(templateRecords(state).get('C09r')).toMatchObject({ Design: 'LIN', Jobs: ['PROFILE', 'TAPE:tape'] })
    expect(templatesFor('C09r', { ...state, templates: [seeded] }).matches).toHaveLength(1)
  })
})
