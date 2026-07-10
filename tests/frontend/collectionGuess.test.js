import { describe, test, expect } from 'vitest'
import {
  guessCollection, guessCollections, missingFamilies, sharedSegments, STYLE_GUIDE,
} from '../../src/utils/collectionGuess.js'

/**
 * The parent is NOT a prefix of the ref. In the real DesignDB `ET-CCR-D-300-1CH-01` sits
 * under `ET-REMOTE-DRIVERS` and `LC9` under `ET-CABLE`, so the only honest source is what
 * the workbook already does: adopt the nearest sibling's parent, and say how near.
 */
const et = (ref, family) => ({ ElementTypeRef: ref, Family: family })

// A slice of the real DesignDB.
const catalogue = [
  et('ET-CCR-D-300-1CH-EM-01', 'ET-REMOTE-DRIVERS'),
  et('ET-CCR-D-350-1CH-01', 'ET-REMOTE-DRIVERS'),
  et('ET-CCL-D-250-1CH-01', 'ET-LOCAL-DRIVERS'),
  et('ET-LIN-CAP-01', 'ET-LIN-COMPONENTS'),
  et('ET-LIN-TAPE-01', 'ET-LIN-COMPONENTS'),
  et('ET-EM-02', 'ET-DRIVER-INGREDIENTS'),
  et('ET-2Pin-Plug', null),              // no parent — teaches nothing
]
const collections = ['ET-REMOTE-DRIVERS', 'ET-LOCAL-DRIVERS', 'ET-LIN-COMPONENTS', 'ET-DRIVER-INGREDIENTS']

describe('sharedSegments', () => {
  test('counts leading hyphen-segments in common', () => {
    expect(sharedSegments('ET-CCR-D-250-1CH-01', 'ET-CCR-D-300-1CH-EM-01')).toBe(3)
    expect(sharedSegments('ET-LIN-01', 'ET-LIN-CAP-01')).toBe(2)
    expect(sharedSegments('ET-PS-01', 'ET-DL-01')).toBe(1)   // only "ET"
  })

  test('case does not matter', () => {
    expect(sharedSegments('et-lin-01', 'ET-LIN-CAP-01')).toBe(2)
  })
})

describe('the nearest sibling names the family', () => {
  test('a three-segment match is confident and right', () => {
    const g = guessCollection('ET-CCR-D-250-1CH-01', catalogue, collections)
    expect(g.parent).toBe('ET-REMOTE-DRIVERS')
    expect(g.segments).toBe(3)
    expect(g.confident).toBe(true)
    expect(g.via).toBe('ET-CCR-D-300-1CH-EM-01')   // it says WHY
  })

  /**
   * ET-LIN-01 is an assembled wrapper; ET-LIN-CAP-01 is a component of one. Two shared
   * segments is prefix noise, and adopting ET-LIN-COMPONENTS would be wrong. The guess
   * is still offered — but never as a fact, and never applied on its own.
   */
  test('a two-segment match is a suggestion, not a fact', () => {
    const g = guessCollection('ET-LIN-01', catalogue, collections)
    expect(g.parent).toBe('ET-LIN-COMPONENTS')
    expect(g.segments).toBe(2)
    expect(g.confident).toBe(false)
  })

  test('sharing only "ET" is no guess at all', () => {
    expect(guessCollection('ET-PS-01', catalogue, collections)).toBeNull()
    expect(guessCollection('ET-CASE-01', catalogue, collections)).toBeNull()
  })

  test('a sibling with no parent teaches nothing', () => {
    expect(guessCollection('ET-2Pin-Socket', catalogue, collections)).toBeNull()
  })

  test('the deepest sibling wins', () => {
    // ET-CCL shares 2 with ET-CCR-*; ET-CCR-D shares 3. Take the driver it resembles.
    expect(guessCollection('ET-CCR-D-999-1CH-01', catalogue, collections).parent).toBe('ET-REMOTE-DRIVERS')
  })

  test('a ref that IS a catalogue entry does not adopt itself', () => {
    expect(guessCollection('ET-LIN-CAP-01', catalogue, collections).via).not.toBe('ET-LIN-CAP-01')
  })
})

describe('a collection that is a prefix of the ref states the family outright', () => {
  test('ET-LIN-TAPE-09 belongs to ET-LIN-TAPE, no sibling needed', () => {
    const g = guessCollection('ET-LIN-TAPE-09', [], ['ET-LIN-TAPE'])
    expect(g).toMatchObject({ parent: 'ET-LIN-TAPE', byPrefix: true, confident: true })
  })

  /**
   * The bug this test exists for: a shallow prefix collection used to short-circuit a
   * better sibling. ET-LIN-CAP-09 belongs with ET-LIN-CAP-01 (3 segments) under
   * ET-LIN-COMPONENTS, not under the shallower ET-LIN family (2).
   */
  test('a deeper sibling beats a shallower prefix collection', () => {
    const g = guessCollection('ET-LIN-CAP-09', catalogue, [...collections, 'ET-LIN'])
    expect(g.parent).toBe('ET-LIN-COMPONENTS')
    expect(g.segments).toBe(3)
  })

  test('on a tie, the real collection beats the sibling', () => {
    const g = guessCollection('ET-LIN-09', catalogue, [...collections, 'ET-LIN'])
    expect(g.parent).toBe('ET-LIN')
    expect(g.byPrefix).toBe(true)
  })

  test('a collection never adopts itself', () => {
    expect(guessCollection('ET-LIN', [], ['ET-LIN'])).toBeNull()
  })
})

describe('guessCollections', () => {
  test('unresolved refs come back with a null guess, not missing', () => {
    const out = guessCollections(['ET-CCR-D-250-1CH-01', 'ET-CASE-01'], catalogue, collections)
    expect(out).toHaveLength(2)
    expect(out[1]).toEqual({ ref: 'ET-CASE-01', guess: null })
  })
})

describe('missingFamilies — what the house style would add', () => {
  const refs = ['ET-DL-01', 'ET-DL-02', 'ET-PS-01', 'ET-LIN-01', 'ET-CASE-01']

  test('offers only families that would actually adopt something', () => {
    const fams = missingFamilies(refs, [], [])
    const byRef = Object.fromEntries(fams.map(f => [f.ref, f.adopts]))
    expect(byRef['ET-DL']).toEqual(['ET-DL-01', 'ET-DL-02'])
    expect(byRef['ET-PS']).toEqual(['ET-PS-01'])
    expect(byRef['ET-LIN']).toEqual(['ET-LIN-01'])
    // Nothing in refs is a lighting control, so it is not offered.
    expect(byRef['ET-LIGHTINGCONTROL']).toBeUndefined()
  })

  test('ET-CASE-01 is homeless, and the style guide does not pretend otherwise', () => {
    const adopted = missingFamilies(refs, [], []).flatMap(f => f.adopts)
    expect(adopted).not.toContain('ET-CASE-01')
  })

  test('a family the workbook already has is never offered', () => {
    expect(missingFamilies(['ET-DL-01'], [], ['ET-DL'])).toEqual([])
    expect(missingFamilies(['ET-DL-01'], [et('ET-DL', null)], [])).toEqual([])
  })

  test('the deeper family claims its members', () => {
    const fams = missingFamilies(['ET-LIN-TAPE-09'], [], [])
    const byRef = Object.fromEntries(fams.map(f => [f.ref, f.adopts]))
    expect(byRef['ET-LIN-TAPE']).toEqual(['ET-LIN-TAPE-09'])
    expect(byRef['ET-LIN']).toBeUndefined()   // not ET-LIN, which is shallower
  })

  test('families come parent-first, so the patch can create them in order', () => {
    const fams = missingFamilies(['ET-PS-MOUNTING-FRAME-01', 'ET-PS-01'], [], [])
    const refs2 = fams.map(f => f.ref)
    expect(refs2.indexOf('ET-PS-MOUNTING')).toBeLessThan(refs2.indexOf('ET-PS-MOUNTING-FRAME'))
  })
})

describe('the style guide as supplied', () => {
  /** It lists ET-LIN twice — "Assembled Linear LED Family" and "Linear Family". */
  test('every ref means exactly one thing', () => {
    const refs = STYLE_GUIDE.map(f => f.ref)
    expect(new Set(refs).size).toBe(refs.length)
  })

  test('every declared parent exists in the guide', () => {
    const refs = new Set(STYLE_GUIDE.map(f => f.ref))
    for (const f of STYLE_GUIDE) if (f.parent) expect(refs.has(f.parent)).toBe(true)
  })
})
