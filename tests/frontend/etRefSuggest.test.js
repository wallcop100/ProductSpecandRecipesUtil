import { describe, test, expect } from 'vitest'
import {
  inferConvention, reuseCandidates, suggestRef,
  similarity, sharedStem, tokenOverlap,
} from '../../src/utils/etRefSuggest.js'

// A slice of the real LIGHTING.DesignDB ElementTypes — attribute-encoded refs,
// with the product code living verbatim in the Name (that is how the real sheet is).
const ETS = [
  { ElementTypeRef: 'ET-CCR-D-250-1CH-01', Name: 'EldoLED SOLODrive 360/A at 250', Description: '30W, 55V, 1 output' },
  { ElementTypeRef: 'ET-CCR-D-250-2CH-01', Name: 'EldoLED DUALDrive 560/A at 250', Description: '50W, 2 output' },
  { ElementTypeRef: 'ET-CCR-D-300-1CH-01', Name: 'EldoLED SOLODrive 360/A at 300', Description: '' },
  { ElementTypeRef: 'ET-LIN-CAP-01', Name: 'LEDFlex - FPS1715ECG', Description: '' },
  { ElementTypeRef: 'ET-LIN-CAP-02', Name: 'LEDFlex - FPSN0809ECG', Description: '' },
  { ElementTypeRef: 'ET-LIN-CLIP-01', Name: 'LEDFlex - FPSN0809MC', Description: '' },
  { ElementTypeRef: 'ET-LIN-DIFF-01', Name: 'LEDFlex - FPS2020PCOPD2000', Description: '' },
  { ElementTypeRef: 'ET-EM-01', Name: 'Phos Emergency Pack', Description: '' },
  { ElementTypeRef: 'ET-CABLE', Name: 'Cable', Description: '' },   // no counter — a collection, not minted
]
// Product Spec rows carry the ProductCode keyed by ref.
const PS = [
  { ElementTypeRef: 'ET-LIN-CAP-02', ProductCode: 'FPSN0809ECG', Manufacturer: 'LEDFlex' },
  { ElementTypeRef: 'ET-CCR-D-250-1CH-01', ProductCode: 'SOLO-250-1CH', Manufacturer: 'EldoLED' },
]

describe('helpers', () => {
  test('sharedStem counts the common leading run', () => {
    expect(sharedStem('UN16TVC2715G2', 'UN16TVC2715')).toBe(11)
    expect(sharedStem('ABC', 'XYZ')).toBe(0)
  })
  test('similarity is a Levenshtein ratio', () => {
    expect(similarity('FPSN0809ECG', 'FPSN0809ECG')).toBe(1)
    expect(similarity('', 'x')).toBe(0)
    expect(similarity('UN16TVC2715G2', 'UN16TVC2715')).toBeGreaterThan(0.8)
  })
  test('tokenOverlap is case/punctuation insensitive', () => {
    expect(tokenOverlap(['ELDOLED', '250'], 'EldoLED SOLODrive at 250')).toBe(1)
  })
})

describe('inferConvention — learned from the real refs', () => {
  const conv = inferConvention(ETS)

  test('learns the ET- prefix and 2-digit counter', () => {
    expect(conv.prefix).toBe('ET')
    expect(conv.counterWidth).toBe(2)
  })

  test('learns stems (ref minus counter); collections without a counter are excluded', () => {
    expect(conv.stems.has('ET-CCR-D-250-1CH')).toBe(true)
    expect(conv.stems.has('ET-LIN-CAP')).toBe(true)
    expect(conv.stems.get('ET-LIN-CAP').refs).toEqual(['ET-LIN-CAP-01', 'ET-LIN-CAP-02'])
    expect(conv.stems.has('ET-CABLE')).toBe(false)   // no -NN, so not a stem
  })
})

describe('reuseCandidates', () => {
  test('a code that appears verbatim in an ET name is a strong "same" match', () => {
    const [top] = reuseCandidates('FPSN0809ECG', 'End Cap', { psRows: PS, elementTypes: ETS })
    expect(top.ref).toBe('ET-LIN-CAP-02')
    expect(top.kind).toBe('same')
    expect(top.score).toBeGreaterThan(0.85)
  })

  test('an exact ProductCode match wins outright', () => {
    const [top] = reuseCandidates('FPSN0809ECG', '', { psRows: PS, elementTypes: ETS })
    expect(top.ref).toBe('ET-LIN-CAP-02')
    expect(top.score).toBe(1)
  })

  test('a stem-sharing but different code is a "variant"', () => {
    // shares the SOLO-250 stem with the product code, but not identical
    const [top] = reuseCandidates('SOLO-250-2CH', '', { psRows: PS, elementTypes: ETS })
    expect(top.ref).toBe('ET-CCR-D-250-1CH-01')
    expect(top.kind).toBe('variant')
  })

  test('a genuinely novel code yields nothing to reuse', () => {
    expect(reuseCandidates('ZZ-NOVEL-9999', 'weird', { psRows: PS, elementTypes: ETS })).toEqual([])
  })

  test('deleted ETs are never offered', () => {
    const withDeleted = [...ETS, { ElementTypeRef: 'ET-LIN-CAP-99', Name: 'FPSN0809ECG', IsDeleted: 'Y' }]
    const refs = reuseCandidates('FPSN0809ECG', '', { psRows: PS, elementTypes: withDeleted }).map(c => c.ref)
    expect(refs).not.toContain('ET-LIN-CAP-99')
  })
})

describe('suggestRef', () => {
  const conv = inferConvention(ETS)

  test('reuse: a strong match hands back the existing ref, minting nothing', () => {
    const s = suggestRef('FPSN0809ECG', 'End Cap', 'LEDFlex', conv, ETS, PS)
    expect(s.ref).toBe('ET-LIN-CAP-02')
    expect(s.reason).toBe('reuse')
  })

  test('variant: shares a stem -> next free counter on that stem, never a duplicate -01', () => {
    const s = suggestRef('SOLO-250-2CH', '', 'EldoLED', conv, ETS, PS)
    expect(s.reason).toBe('variant')
    expect(s.ref).toBe('ET-CCR-D-250-1CH-02')   // getNextAvailableRef bumped the counter
  })

  test('new: a novel code -> skeleton in the learned convention (prefix + -01)', () => {
    const s = suggestRef('ZZ9999', 'Nano Widget', 'Osram', conv, ETS, PS)
    expect(s.reason).toBe('new')
    expect(s.ref).toMatch(/^ET-[A-Z0-9]+-01$/)
  })
})

// ---------------------------------------------------------------------------
// A product is (manufacturer, code) — reuse must honour both
// ---------------------------------------------------------------------------
describe('reuseCandidates respects product identity', () => {
  const psRow = (ref, mfr, code) => ({ ElementTypeRef: ref, Manufacturer: mfr, ProductCode: code })
  const et = ref => ({ ElementTypeRef: ref })

  // "PLASTER IN KIT" is sold by Orluna AND Phos. Wrappers all carry Ideaworks / N/A.
  const psRows = [
    psRow('ET-PLASTERKIT-01', 'Orluna', 'PLASTER IN KIT'),
    psRow('ET-PLASTERKIT-02', 'Phos', 'PLASTER IN KIT'),
    psRow('ET-CCL-D-250-1CH-EM-01', 'Ideaworks', 'N/A'),
    psRow('ET-CVR-D-24-2CH-01', 'Ideaworks', 'N/A'),
  ]
  const elementTypes = psRows.map(r => et(r.ElementTypeRef))
  const suggest = (code, mfr, note = '') =>
    reuseCandidates(code, note, { psRows, elementTypes, manufacturer: mfr }, 3)

  test('"N/A" suggests nothing — it names no product', () => {
    // The bug: a pendant with Ideaworks/N/A was offered a DRIVER wrapper to reuse,
    // at score 1.00 "same", because both codes were "N/A".
    expect(suggest('N/A', 'Ideaworks', 'Pendant')).toEqual([])
    expect(suggest('n/a', '', 'Pendant')).toEqual([])
    expect(suggest('', 'Ideaworks')).toEqual([])
  })

  test('the right maker reuses its own ElementType', () => {
    expect(suggest('PLASTER IN KIT', 'Orluna')[0]).toMatchObject({ ref: 'ET-PLASTERKIT-01', kind: 'same' })
    expect(suggest('PLASTER IN KIT', 'Phos')[0]).toMatchObject({ ref: 'ET-PLASTERKIT-02', kind: 'same' })
  })

  test('the same code from ANOTHER maker is not offered at all', () => {
    // Not a weaker match — not a match. It is a different product.
    expect(suggest('PLASTER IN KIT', 'Acme')).toEqual([])
  })

  test('with no maker given it cannot distinguish, so it offers both', () => {
    const refs = suggest('PLASTER IN KIT', '').map(c => c.ref).sort()
    expect(refs).toEqual(['ET-PLASTERKIT-01', 'ET-PLASTERKIT-02'])
  })

  test('a wrapper\'s N/A never fuzzy-matches a real code either', () => {
    // similarity('NF240272009','N/A') must not drag a driver into the list.
    expect(suggest('NF240272009', 'Nichia').map(c => c.ref)).not.toContain('ET-CCL-D-250-1CH-EM-01')
  })

  test('suggestRef proposes a NEW ref for N/A rather than reusing a driver', () => {
    const conv = { prefix: 'ET', counterWidth: 2, stems: [] }
    const r = suggestRef('N/A', 'Pendant', 'Astro', conv, elementTypes, psRows)
    expect(r.reason).toBe('new')
    expect(r.ref).toMatch(/^ET-/)
    expect(r.ref).not.toMatch(/CCL|CVR/)
  })
})
