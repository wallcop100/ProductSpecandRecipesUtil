import { describe, test, expect } from 'vitest'
import { proposeElementTypes, rankFamilies, familyIndex, nextRef, refamily, seedName } from '../../src/utils/etSeed.js'

const ETS = [
  { ElementTypeRef: 'ET-PS-01', Name: 'Orluna - Pinhole downlight', Family: 'ET-PS' },
  { ElementTypeRef: 'ET-PS-07', Name: 'Orluna - Surface spot', Family: 'ET-PS' },
  { ElementTypeRef: 'ET-LIN-TP-01', Name: 'LEDFlex - FPSN0809BG2000', Family: 'ET-LIN-TP' },
  { ElementTypeRef: 'ET-DRIVER-01', Name: 'EldoLED - SL0240A3', Family: 'ET-DRIVER' },
]
const PS = [
  { ElementTypeRef: 'ET-PS-01', Manufacturer: 'Orluna', ProductCode: 'PIN-100' },
  { ElementTypeRef: 'ET-LIN-TP-01', Manufacturer: 'LEDFlex', ProductCode: 'FPSN0809BG2000' },
  { ElementTypeRef: 'ET-DRIVER-01', Manufacturer: 'EldoLED', ProductCode: 'SL0240A3' },
]
const entry = (text, maker, extra = {}) => ({ text, manufacturers: [maker], positionTypes: [], variants: [{ note: '' }], rowRefs: [], ...extra })

describe('family, not maker, names a new ElementType', () => {
  test('a maker\'s new product lands in that maker\'s family, numbered after the last one', () => {
    const [p] = proposeElementTypes([entry('PIN-200', 'Orluna')], { elementTypes: ETS, psRows: PS })
    expect(p).toMatchObject({ family: 'ET-PS', ref: 'ET-PS-08', name: 'Orluna - PIN-200', action: 'create', include: true })
    expect(p.why).toContain('maker')
  })

  test('a similar code from the same maker is the strongest signal', () => {
    const [p] = proposeElementTypes([entry('FPSN0809BG3000', 'LEDFlex')], { elementTypes: ETS, psRows: PS })
    expect(p.family).toBe('ET-LIN-TP')
    expect(p.why).toContain('code')
  })

  test('words in the Form pick the family when the maker is new', () => {
    const [p] = proposeElementTypes([entry('X-1', 'Newco')], {
      elementTypes: ETS, psRows: PS, contextFor: () => 'Recessed pinhole downlight',
    })
    expect(p.family).toBe('ET-PS')
    expect(p.description).toBe('Recessed pinhole downlight')
  })

  test('refs never collide within a batch', () => {
    const ps = proposeElementTypes([entry('PIN-200', 'Orluna'), entry('PIN-300', 'Orluna')], { elementTypes: ETS, psRows: PS })
    expect(ps.map(p => p.ref)).toEqual(['ET-PS-08', 'ET-PS-09'])
  })

  test('a code already in the project is proposed as a reuse, not a new ElementType', () => {
    const [p] = proposeElementTypes([entry('PIN-100', 'Orluna', { reuse: [{ ref: 'ET-PS-01', kind: 'same' }] })], { elementTypes: ETS, psRows: PS })
    expect(p).toMatchObject({ action: 'reuse', reuseRef: 'ET-PS-01' })
  })

  test('no signal at all → no family and no ref, never a made-up one', () => {
    const [p] = proposeElementTypes([entry('ZZZ', 'Nobody')], { elementTypes: ETS, psRows: PS })
    expect(p.family).toBe('')
    expect(p.ref).toBe('')
  })

  test('refamily moves a group and renumbers it', () => {
    const ps = proposeElementTypes([entry('PIN-200', 'Orluna'), entry('PIN-300', 'Orluna')], { elementTypes: ETS, psRows: PS })
    const moved = refamily(ps, [0, 1], 'ET-DRIVER', ETS)
    expect(moved.map(p => p.ref)).toEqual(['ET-DRIVER-02', 'ET-DRIVER-03'])
    expect(moved[0].why).toEqual(['you'])
  })

  test('helpers', () => {
    expect(nextRef('ET-PS', ['ET-PS-01', 'ET-PS-9', 'ET-PSX-50'])).toBe('ET-PS-10')
    expect(seedName('', 'ABC')).toBe('ABC')
    expect(familyIndex(ETS, ['ET-EMPTY']).has('ET-EMPTY')).toBe(true)
    expect(rankFamilies({ code: '', manufacturer: '', text: '' }, { families: familyIndex(ETS), makerFamilies: new Map(), products: [] })).toEqual([])
  })
})
