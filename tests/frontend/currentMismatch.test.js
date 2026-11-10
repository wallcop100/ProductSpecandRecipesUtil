import { describe, test, expect } from 'vitest'
import { runValidation } from '../../src/utils/validationRules.js'

describe('CURRENT_MISMATCH', () => {
  const run = (ref, code, description = '') => runValidation(
    { element_types: [{ ElementTypeRef: ref, Description: description }], position_types: [] },
    [{ ElementTypeRef: ref, Manufacturer: 'EldoLED', ProductCode: code }], [], {},
  ).filter(i => i.rule === 'CURRENT_MISMATCH')

  test('a code set to another current than the ref or the description is flagged', () => {
    // 5489: a 350mA type carrying the 700mA code
    expect(run('ET-CCR-D-350-2CH-02', 'SL0560A3-700MA', 'for remote fittings (mA: 350)')[0].message).toMatch(/700mA code.*ref says 350mA/)
    // 5351: ref and code agree, the description is the odd one
    expect(run('ET-CCR-D-250-2CH-01', 'DL0562A3-250mA', 'with lightshape (mA:350)')[0].message).toMatch(/description says 350mA/)
    expect(run('ET-CCR-D-250-2CH-01', 'DL0562A3-250mA', 'with lightshape (mA:350)')[0].fixKind).toBe('spec')
  })

  test('agreement, a range, and codes with no current say nothing', () => {
    expect(run('ET-CCR-D-350-1CH-01', 'SL0360A6-350mA', 'DALI driver (mA:350)')).toEqual([])
    expect(run('ET-CCL-D-350-1CH-01', 'SL20CA E1Z0D-350mA', 'adjustable 150-1400mA, 350mA default 700mA max')).toEqual([])
    expect(run('ET-CVR-D-24-2CH-01', 'LIN220D2', '24V 350mA')).toEqual([])
  })
})
