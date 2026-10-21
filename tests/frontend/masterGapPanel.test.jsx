import { describe, test, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import useStore from '../../src/store/useStore'
import MasterGapPanel from '../../src/components/MasterGapPanel'

/**
 * Two bugs this panel had:
 *  1. Queuing a gap into the ElementTypes patch did not move the count — a queued ref is
 *     not an open gap, but the panel kept flagging it.
 *  2. The house-style family (ET-PS for ET-PS-01) was never suggested at the per-row
 *     level, only in the bulk button, so a ref with no sibling read as "no family".
 */
const pos = (posRef, ref) => ({
  PositionTypeRef: posRef, ContextType: 'PositionType', ContextRef: posRef, ElementTypeRef: ref,
})
const dbEt = (ref, family, n) => ({ ElementTypeRef: ref, Family: family, _row_num: n })

function seed(over = {}) {
  useStore.setState({
    // ET-PS-01: recipe-used, no sibling → the house style (ET-PS) should adopt it.
    // ET-CCR-D-250-1CH-01: recipe-used, has a 3-segment sibling → confident guess.
    recipes: [pos('P1', 'ET-PS-01'), pos('P1', 'ET-CCR-D-250-1CH-01')],
    psRows: [],
    elementTypes: [dbEt('ET-CCR-D-300-1CH-EM-01', 'ET-REMOTE-DRIVERS', 5)],
    dbCollectionRefs: ['ET-REMOTE-DRIVERS'],
    containerETRefs: new Set(),
    positionTypes: [], positionUI: {}, ignoredPositionFamilies: [],
    dbChanges: [],
    ...over,
  })
}

const gapsNow = () => useStore.getState().alignmentGaps()

beforeEach(() => seed())

describe('the house-style family is suggested per row', () => {
  test('a ref with no sibling still gets a family, from the guide', () => {
    render(<MasterGapPanel gaps={gapsNow()} />)
    // both gaps have a family: the sibling-guessed one and the house-style one
    expect(screen.getByText('all have a family')).toBeTruthy()
    // the guide offers to create ET-PS
    expect(screen.getByText(/house-style famil/)).toBeTruthy()
  })

  test('the per-row review shows the house-style family, not "no family"', () => {
    render(<MasterGapPanel gaps={gapsNow()} />)
    expect(screen.getByText('house style')).toBeTruthy()   // ET-PS-01's label
    expect(screen.getByText('confident')).toBeTruthy()     // the CCR driver's label
  })
})

describe('queued is not an open gap', () => {
  test('a queued ref drops out of the open count', () => {
    // one of the two is already in the ElementTypes patch
    seed({ dbChanges: [{ elementTypeRef: 'ET-CCR-D-250-1CH-01', _isNew: true, updates: {} }] })
    render(<MasterGapPanel gaps={gapsNow()} />)
    expect(screen.getByText(/1 ElementType missing from the DesignDB master/)).toBeTruthy()
    expect(screen.getByText(/1 already queued/)).toBeTruthy()
  })

  test('when everything is queued the panel collapses to "queued for the patch"', () => {
    seed({ dbChanges: [
      { elementTypeRef: 'ET-PS-01', _isNew: true, updates: {} },
      { elementTypeRef: 'ET-CCR-D-250-1CH-01', _isNew: true, updates: {} },
    ] })
    render(<MasterGapPanel gaps={gapsNow()} />)
    expect(screen.getByText(/queued for the ElementTypes patch/)).toBeTruthy()
    expect(screen.queryByText(/missing from the DesignDB master/)).toBeNull()
  })
})

describe('the primary action queues the open rows with their families', () => {
  test('clicking Add queues both, and they then read as queued', () => {
    render(<MasterGapPanel gaps={gapsNow()} />)
    fireEvent.click(screen.getByText(/Add 2 to the ElementTypes patch/))
    const queued = new Set(useStore.getState().dbChanges.map(c => c.elementTypeRef))
    expect(queued.has('ET-PS-01')).toBe(true)
    expect(queued.has('ET-CCR-D-250-1CH-01')).toBe(true)
    // ET-PS-01 was filed under the created house-style family
    const psRow = useStore.getState().dbChanges.find(c => c.elementTypeRef === 'ET-PS-01')
    expect(psRow.updates.Family).toBe('ET-PS')
  })
})

describe('the family review is required, and only the family', () => {
  test('a ref nothing resembles must be given a family (or none on purpose) before it can be added', () => {
    seed({ recipes: [pos('P1', 'ZZ-UNKNOWN-01')] })
    render(<MasterGapPanel gaps={gapsNow()} />)
    const add = screen.getByText(/Add 1 to the ElementTypes patch/).closest('button')
    expect(add.disabled).toBe(true)
    expect(screen.getByText('1 still need a family')).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '-' } })
    expect(add.disabled).toBe(false)
    fireEvent.click(add)
    expect(useStore.getState().dbChanges.map(c => c.elementTypeRef)).toContain('ZZ-UNKNOWN-01')
  })

  test('autoQueueDbRows queues the confident ones and leaves the rest for review', () => {
    useStore.getState().autoQueueDbRows()
    const q = useStore.getState().dbChanges.map(c => c.elementTypeRef)
    expect(q).toContain('ET-CCR-D-250-1CH-01')
    expect(q).not.toContain('ET-PS-01')
  })
})
