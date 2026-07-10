import { describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import useStore from '../../src/store/useStore'
import ProductSpecScreen from '../../src/screens/ProductSpecScreen'

/**
 * The two UX enhancements: the header status counts are also filters, and the
 * "Fill Missing" step-through is inline ("Fill next") rather than a separate modal.
 */
const pos = (posRef, ref) => ({
  PositionTypeRef: posRef, ContextType: 'PositionType', ContextRef: posRef, ElementTypeRef: ref,
})

beforeEach(() => {
  useStore.setState({
    // ET-A and ET-B are used in a recipe but incomplete (missing product code); ET-C is
    // complete and unused. So there are two rows to fill.
    psRows: [
      { _id: 'a', ElementTypeRef: 'ET-A', Manufacturer: 'Acme', ProductCode: '' },
      { _id: 'b', ElementTypeRef: 'ET-B', Manufacturer: '', ProductCode: '' },
      { _id: 'c', ElementTypeRef: 'ET-C', Manufacturer: 'Acme', ProductCode: 'C-1' },
    ],
    recipes: [pos('P1', 'ET-A'), pos('P1', 'ET-B')],
    elementTypes: [
      { ElementTypeRef: 'ET-A' }, { ElementTypeRef: 'ET-B' }, { ElementTypeRef: 'ET-C' },
    ],
    psChanges: [],
    containerETRefs: new Set(),
    dbCollectionRefs: [],
    positionTypes: [], positionUI: {}, ignoredPositionFamilies: [],
    updatePSRow: vi.fn(), addPSRow: vi.fn(), deletePSRow: vi.fn(),
  })
})

const render1 = () => render(<ProductSpecScreen onBack={() => {}} />)

describe('Fill next — the step-through is inline', () => {
  test('the button shows the count of incomplete recipe-used ETs', () => {
    render1()
    expect(screen.getByText(/Fill next \(2\)/)).toBeTruthy()
  })

  test('clicking it selects the first incomplete ET in the editor', () => {
    render1()
    fireEvent.click(screen.getByText(/Fill next/))
    // the right-hand editor now shows ET-A (first incomplete, sorted)
    const editor = document.querySelector('[data-debug-id="ProductSpecScreen"]')
    expect(within(editor).getAllByText('ET-A').length).toBeGreaterThan(0)
    // and its Product Code is flagged as needed
    expect(screen.getByText('needed')).toBeTruthy()
  })

  test('clicking again advances to the next incomplete ET', () => {
    render1()
    fireEvent.click(screen.getByText(/Fill next/))
    fireEvent.click(screen.getByText(/Fill next/))
    expect(within(document.querySelector('[data-debug-id="ProductSpecScreen"]')).getAllByText('ET-B').length).toBeGreaterThan(0)
  })
})

describe('the header status counts are filters', () => {
  test('a partial count renders as a pressable filter, off by default', () => {
    render1()
    // ET-A and ET-B are partial (row present, no code)
    const pill = screen.getByRole('button', { name: 'Partial / TBC' })
    expect(pill.getAttribute('aria-pressed')).toBe('false')
  })

  test('clicking it toggles the filter on, and again off', () => {
    render1()
    const pill = screen.getByRole('button', { name: 'Partial / TBC' })
    fireEvent.click(pill)
    expect(screen.getByRole('button', { name: 'Partial / TBC' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Partial / TBC' }))
    expect(screen.getByRole('button', { name: 'Partial / TBC' }).getAttribute('aria-pressed')).toBe('false')
  })

  test('the header filter and the left-panel chip share one state', () => {
    render1()
    fireEvent.click(screen.getByRole('button', { name: 'Partial / TBC' }))
    // the left panel's own "Partial/TBC" chip is now active too (btn-primary)
    const chip = screen.getByRole('button', { name: 'Partial/TBC' })
    expect(chip.className).toContain('btn-primary')
  })
})

describe('the old wizard is gone', () => {
  test('there is no "Fill Missing" modal trigger any more', () => {
    render1()
    expect(screen.queryByText('Fill Missing')).toBeNull()
  })
})
