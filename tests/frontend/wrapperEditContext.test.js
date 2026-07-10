import { describe, test, expect } from 'vitest'
import { wrapperEditContext, wrapperUsedBy } from '../../src/utils/collectionStatus.js'

/**
 * parseRs projects one shared internal sheet row onto EVERY position that uses the
 * wrapper. The ET editor renders one position's copy, and Fork repoints THAT
 * position. It used to pick whichever row came first, so standing on C03r and
 * clicking Fork silently repointed C01r — damaging the position you were not
 * looking at.
 */
const pos = (posRef, ref, extra = {}) => ({
  PositionTypeRef: posRef, ContextType: 'PositionType', ContextRef: posRef, ElementTypeRef: ref, ...extra,
})
const inside = (posRef, container, ref, extra = {}) => ({
  PositionTypeRef: posRef, ContextType: 'ElementType', ContextRef: container, ElementTypeRef: ref, ...extra,
})

// C01r appears first in the sheet; C03r shares the wrapper.
const recipes = [
  pos('C01r', 'ET-LIN-01'),
  pos('C03r', 'ET-LIN-01'),
  inside('C01r', 'ET-LIN-01', 'ET-PROF-01'),
  inside('C03r', 'ET-LIN-01', 'ET-PROF-01'),
]

describe('wrapperEditContext — Fork must repoint the position you are standing on', () => {
  test('the active position wins, even when another one comes first', () => {
    expect(wrapperEditContext(recipes, 'ET-LIN-01', 'C03r')).toBe('C03r')
  })

  test('the first position still works when it IS the active one', () => {
    expect(wrapperEditContext(recipes, 'ET-LIN-01', 'C01r')).toBe('C01r')
  })

  test('no active position falls back to a position with internals to render', () => {
    expect(wrapperEditContext(recipes, 'ET-LIN-01', null)).toBe('C01r')
  })

  test('an active position that does not use the wrapper is ignored', () => {
    // You are on D07 and opened ET-LIN-01 from the element tree. D07 has no claim.
    expect(wrapperEditContext(recipes, 'ET-LIN-01', 'D07')).toBe('C01r')
  })

  test('deleted rows do not make a position a user of the wrapper', () => {
    const rows = [pos('C01r', 'ET-LIN-01'), pos('C03r', 'ET-LIN-01', { IsDeleted: 'Y' })]
    expect(wrapperUsedBy(rows, 'ET-LIN-01')).toEqual(['C01r'])
    expect(wrapperEditContext(rows, 'ET-LIN-01', 'C03r')).toBe('C01r')
  })

  test('a wrapper with users but no internals still resolves a context', () => {
    const rows = [pos('C01r', 'ET-DL-03')]
    expect(wrapperEditContext(rows, 'ET-DL-03', 'C01r')).toBe('C01r')
    expect(wrapperEditContext(rows, 'ET-DL-03', null)).toBe('C01r')
  })

  test('an unknown wrapper resolves to nothing rather than guessing', () => {
    expect(wrapperEditContext(recipes, 'ET-NOPE', null)).toBeNull()
  })
})
