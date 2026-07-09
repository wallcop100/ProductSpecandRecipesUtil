import { describe, test, expect } from 'vitest'
import { resolveFormRef, resolveFormRefs, buildRefMap, targetFor, VIA } from '../../src/utils/ptResolve.js'

/**
 * Shapes taken from the real DesignDB: C01 and C01r both exist, C01r declares
 * ExtRef="C01", and only C01r carries a recipe. A02m stands alone.
 */
const PTS = [
  { PositionTypeRef: 'C01', ExtRef: null, ParentRef: 'LINEAR-HL-ARCHITECTURAL-PARENTS' },
  { PositionTypeRef: 'C01r', ExtRef: 'C01', ParentRef: 'LINEAR-HL-ARCHITECTURAL' },
  { PositionTypeRef: 'D07', ExtRef: null, ParentRef: 'LINEAR-JOINERY-PARENTS' },
  { PositionTypeRef: 'D07r', ExtRef: 'D07', ParentRef: 'LINEAR-JOINERY' },
  { PositionTypeRef: 'A02m', ExtRef: null, ParentRef: 'DOWNLIGHT' },
]

describe('resolveFormRef', () => {
  test('an ExtRef claimant wins over the identically-named PositionType', () => {
    const r = resolveFormRef('C01', PTS)
    expect(r.target).toBe('C01r')      // NOT C01, which has no recipe
    expect(r.via).toBe(VIA.EXT_REF)
  })

  test('a ref nothing claims resolves to itself', () => {
    expect(resolveFormRef('A02m', PTS)).toMatchObject({ target: 'A02m', via: VIA.DIRECT })
  })

  test('a ref absent from the DB resolves to nothing, never to a guess', () => {
    expect(resolveFormRef('MIRROR', PTS)).toMatchObject({ target: null, via: VIA.MISSING })
  })

  test('matching ignores case and surrounding whitespace', () => {
    expect(resolveFormRef('  c01 ', PTS).target).toBe('C01r')
  })

  test('a blank ref is missing, not a match on the blank ExtRefs', () => {
    expect(resolveFormRef('', PTS).via).toBe(VIA.MISSING)
    expect(resolveFormRef(null, PTS).target).toBeNull()
  })

  test('no naming convention is assumed: the r-suffix alone never redirects', () => {
    // D07r exists but declares no ExtRef here, so D07 stays D07.
    const noExt = [{ PositionTypeRef: 'D07' }, { PositionTypeRef: 'D07r' }]
    expect(resolveFormRef('D07', noExt)).toMatchObject({ target: 'D07', via: VIA.DIRECT })
  })

  test('the redirect target need not look like the form ref at all', () => {
    const odd = [{ PositionTypeRef: 'ET-WHATEVER-1234', ExtRef: 'C01' }]
    expect(resolveFormRef('C01', odd).target).toBe('ET-WHATEVER-1234')
  })

  test('two claimants of one ExtRef are reported, not silently picked', () => {
    const dup = [{ PositionTypeRef: 'C01r', ExtRef: 'C01' }, { PositionTypeRef: 'C01x', ExtRef: 'C01' }]
    const r = resolveFormRef('C01', dup)
    expect(r.target).toBe('C01r')
    expect(r.ambiguous).toEqual(['C01x'])
  })

  test('reads lowercase field names too (store-normalised rows)', () => {
    expect(resolveFormRef('C01', [{ positionTypeRef: 'C01r', extRef: 'C01' }]).target).toBe('C01r')
  })
})

describe('resolveFormRefs', () => {
  test('deduplicates, counts rows, and preserves first-seen order', () => {
    const out = resolveFormRefs(['C01', 'A02m', 'C01', 'MIRROR', 'c01'], PTS)
    expect(out.map(r => r.formRef)).toEqual(['C01', 'A02m', 'MIRROR'])
    expect(out[0].rows).toBe(3)        // C01, C01, c01
    expect(out[0].target).toBe('C01r')
    expect(out[2].via).toBe(VIA.MISSING)
  })

  test('blank refs are dropped entirely', () => {
    expect(resolveFormRefs(['', null, '  '], PTS)).toEqual([])
  })
})

describe('buildRefMap', () => {
  const res = resolveFormRefs(['C01', 'A02m', 'MIRROR'], PTS)

  test('uses the resolved target when the user overrides nothing', () => {
    const map = buildRefMap(res)
    expect(targetFor(map, 'C01')).toBe('C01r')
    expect(targetFor(map, 'A02m')).toBe('A02m')
  })

  test('an unresolved ref is absent, so nothing is prefilled for it', () => {
    expect(targetFor(buildRefMap(res), 'MIRROR')).toBeNull()
  })

  test('an override redirects, and empty string means skip', () => {
    const map = buildRefMap(res, { C01: 'C01', MIRROR: 'A02m', A02m: '' })
    expect(targetFor(map, 'C01')).toBe('C01')     // user overrode the ExtRef redirect
    expect(targetFor(map, 'MIRROR')).toBe('A02m') // user mapped a missing ref by hand
    expect(targetFor(map, 'A02m')).toBeNull()     // explicitly skipped
  })

  test('lookup is case- and whitespace-insensitive', () => {
    expect(targetFor(buildRefMap(res), ' c01 ')).toBe('C01r')
  })
})
