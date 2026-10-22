import { describe, test, expect, beforeEach } from 'vitest'
import useStore from '../../src/store/useStore'

describe('Back from a focused position (report 41)', () => {
  beforeEach(() => useStore.setState({ activePositionRef: null, positionHistory: [], returnScreen: null, pendingScreen: null }))

  test('returns to the screen it was opened from, after the positions between', () => {
    const s = () => useStore.getState()
    s().openPositionFrom('product-spec', 'A01')
    s().setActivePosition('A02')
    s().goBackFromPosition()
    expect(s().activePositionRef).toBe('A01')
    s().goBackFromPosition()
    expect(s().pendingScreen).toBe('product-spec')
    expect(s().returnScreen).toBeNull()
  })

  test('with no history it returns to the list', () => {
    useStore.setState({ activePositionRef: 'A01' })
    useStore.getState().goBackFromPosition()
    expect(useStore.getState().activePositionRef).toBeNull()
  })
})
