import { describe, test, expect } from 'vitest'
import {
  harvestExemplars, nearestExemplars, refShape, carryMiddle, styleFor, codeTokens,
} from '../../src/utils/styleLibrary.js'

const ex = (maker, code, ref, family, name = '', description = '') => ({ maker, code, ref, family, name, description, source: 'P2' })

describe('harvest: only real products with a family teach anything', () => {
  test('ETs joined to their spec row; wrappers, orphans and deleted rows skipped', () => {
    const out = harvestExemplars({
      source: 'P2',
      elementTypes: [
        { ElementTypeRef: 'ET-LIN-TAPE-NANO160-01', Name: 'LEDFlex - Nano Flex Solo', Family: 'ET-LIN-TAPE' },
        { ElementTypeRef: 'ET-DL-01', Name: 'Downlight, Driver & Connectors', Family: 'ET-DL' },
        { ElementTypeRef: 'ET-NOFAM-01', Name: 'x' },
        { ElementTypeRef: 'ET-GONE-01', Family: 'ET-GONE' },
      ],
      psRows: [
        { ElementTypeRef: 'ET-LIN-TAPE-NANO160-01', Manufacturer: 'LEDFlex', ProductCode: 'NFS160-27-2009' },
        { ElementTypeRef: 'ET-DL-01', Manufacturer: 'Ideaworks', ProductCode: 'N/A' },
        { ElementTypeRef: 'ET-NOFAM-01', Manufacturer: 'A', ProductCode: 'B1' },
        { ElementTypeRef: 'ET-GONE-01', Manufacturer: 'A', ProductCode: 'C1', IsDeleted: 'Y' },
      ],
    })
    expect(out).toEqual([{
      maker: 'LEDFlex', code: 'NFS160-27-2009', family: 'ET-LIN-TAPE', ref: 'ET-LIN-TAPE-NANO160-01',
      name: 'LEDFlex - Nano Flex Solo', description: '', source: 'P2',
    }])
  })
})

describe('helpers', () => {
  test('codeTokens splits punctuation and letter/digit boundaries', () => {
    expect(codeTokens('SL0240A3-260mA')).toEqual(['SL', '0240', 'A', '3', '260', 'mA'])
  })
  test('refShape: family head when the ref starts with it, else its own first segment', () => {
    expect(refShape('ET-LIN-FLEX-ULTIMO103D-01', 'ET-LIN-FLEX')).toEqual({ head: 'ET-LIN-FLEX', middle: 'ULTIMO103D' })
    expect(refShape('ET-CCL-D-260-1CH-01', 'ET-DRIVER')).toEqual({ head: 'ET', middle: 'CCL-D-260-1CH' })
    expect(refShape('ET-PS-45', 'ET-PS')).toEqual({ head: 'ET-PS', middle: '' })
  })
  test('nearestExemplars: same maker only, longest stem, ties all returned', () => {
    const lib = [ex('EldoLED', 'SL0240A3-260mA', 'ET-CCL-D-260-1CH-01', 'ET-DRIVER'), ex('EldoLED', 'SL0240A3-260mA', 'ET-CCR-D-260-1CH-01', 'ET-DRIVER'), ex('Other', 'SL0240A3-260mA', 'ET-X-01', 'ET-X')]
    expect(nearestExemplars('SL0240A3-350mA', 'eldoled', lib).map(e => e.ref)).toEqual(['ET-CCL-D-260-1CH-01', 'ET-CCR-D-260-1CH-01'])
    expect(nearestExemplars('ZZZ', 'EldoLED', lib)).toEqual([])
  })
})

describe('carrying a ref style to a new code', () => {
  test('a ref part that came from the code follows the code', () => {
    expect(carryMiddle('CCL-D-260-1CH', 'SL0240A3-260mA', 'SL0240A3-350mA').middle).toBe('CCL-D-350-1CH')
  })
  test('part of a changed code token is never copied (HLG48048 → HLG48024)', () => {
    expect(carryMiddle('48', 'HLG48048', 'HLG48024')).toBeNull()
  })
  test('a word from the example\'s text is kept only when the new product\'s text says it too', () => {
    const plug = carryMiddle('2Pin-LIN-Plug', '890-292', '890-282', 'WAGO - 890-292 2-pin plug for CV linear connections', '')
    expect(plug).toMatchObject({ middle: 'LIN', partial: true })   // "2Pin" and "Plug" both came from its text
    const said = carryMiddle('2Pin-LIN-Plug', '890-292', '890-282', 'WAGO - 890-292 2-pin plug', '2 pin plug')
    expect(said).toMatchObject({ middle: '2Pin-LIN-Plug', partial: false })
  })

  test('styleFor: an example\'s shape, renumbered by the caller', () => {
    const lib = [ex('LEDFlex', 'NFS160-27-2009', 'ET-LIN-TAPE-NANO160-01', 'ET-LIN-TAPE', 'LEDFlex - Nano Flex Solo', '2700,24V,9.6W')]
    expect(styleFor('NFS160-27-5404', 'LEDFlex', lib)).toMatchObject({ family: 'ET-LIN-TAPE', refBase: 'ET-LIN-TAPE-NANO160', partial: false })
  })

  test('styleFor: equally near examples that disagree are flagged with the alternative', () => {
    const lib = [ex('EldoLED', 'SL0240A3-260mA', 'ET-CCL-D-260-1CH-01', 'ET-DRIVER'), ex('EldoLED', 'SL0240A3-260mA', 'ET-CCR-D-260-1CH-01', 'ET-DRIVER')]
    const s = styleFor('SL0240A3-350mA', 'EldoLED', lib)
    expect(s.partial).toBe(true)
    expect([s.refBase, ...s.alternatives].sort()).toEqual(['ET-CCL-D-350-1CH', 'ET-CCR-D-350-1CH'])
  })

  test('styleFor: a ref position that varies between siblings and nothing decides is flagged', () => {
    const lib = [
      ex('EldoLED', 'SL0240A3-260mA', 'ET-CCR-D-260-1CH-01', 'ET-DRIVER'),
      ex('EldoLED', 'DL0560S3-700mA', 'ET-CCL-D-700-2CH-01', 'ET-DRIVER'),
    ]
    expect(styleFor('SL0240A3-350mA', 'EldoLED', lib)).toMatchObject({ refBase: 'ET-CCR-D-350-1CH', partial: true })
  })

  test('no example from this maker → null', () => {
    expect(styleFor('ABC123', 'Nobody', [ex('A', 'ABC123', 'ET-X-01', 'ET-X')])).toBeNull()
  })
})
