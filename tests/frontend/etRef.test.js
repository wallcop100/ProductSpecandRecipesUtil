import { describe, test, expect } from 'vitest'
import { parseETRef, familyOf } from '../../src/utils/etRef.js'

describe('parseETRef', () => {
  test('parses category, family, and variant from a full ref', () => {
    expect(parseETRef('ET-LIN-PROFILE-ACME-01')).toEqual({
      category: 'LIN', family: 'PROFILE-ACME', variant: '01',
    })
  })

  test('uses category as family when there is no middle segment', () => {
    expect(parseETRef('ET-DL-02')).toEqual({ category: 'DL', family: 'DL', variant: '02' })
  })

  test('handles refs with no variant suffix', () => {
    expect(parseETRef('ET-TAPE-WARM')).toEqual({ category: 'TAPE', family: 'WARM', variant: null })
  })

  test('handles a bare category', () => {
    expect(parseETRef('ET-CLIP')).toEqual({ category: 'CLIP', family: 'CLIP', variant: null })
  })

  test('tolerates missing ET- prefix', () => {
    expect(parseETRef('SOCK-5P-01')).toEqual({ category: 'SOCK', family: '5P', variant: '01' })
  })

  test('returns nulls for empty/invalid input', () => {
    expect(parseETRef('')).toEqual({ category: null, family: null, variant: null })
    expect(parseETRef(null)).toEqual({ category: null, family: null, variant: null })
  })
})

describe('familyOf', () => {
  test('prefers an explicit DB Family field', () => {
    expect(familyOf('ET-LIN-PROFILE-ACME-01', { Family: 'Acme Profiles' })).toBe('Acme Profiles')
  })

  test('falls back to the parsed family', () => {
    expect(familyOf('ET-LIN-PROFILE-ACME-01', { Family: null })).toBe('PROFILE-ACME')
    expect(familyOf('ET-DL-02')).toBe('DL')
  })
})
