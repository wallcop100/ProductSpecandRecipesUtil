import { describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import useStore from '../../src/store/useStore'
import ChangeSummaryModal from '../../src/components/ChangeSummaryModal'

/**
 * The complaint that drove the redesign: "I scroll and scroll to get to the patch, and
 * the detail isn't even good to review." So the patch is its own tab (one click), and a
 * change shows field-level before → after.
 */
const baseState = {
  psChanges: [
    { elementTypeRef: 'ET-C', updates: { Manufacturer: 'XAL' }, before: { Manufacturer: 'Acme' } },
  ],
  rsChanges: [],
  dbChanges: [],
  // no alignment gaps, so no "Resolve" tab
  recipes: [], psRows: [], elementTypes: [], containerETRefs: new Set(),
  dbCollectionRefs: [], positionTypes: [], positionUI: {}, ignoredPositionFamilies: [],
}

beforeEach(() => {
  useStore.setState(baseState)
  // jsdom has no clipboard by default
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue() } })
})

describe('the change review is tabbed, and the patch is one click away', () => {
  test('it opens on Changes, with the patch reachable via a tab, not a scroll', () => {
    render(<ChangeSummaryModal show onHide={() => {}} />)
    expect(screen.getByText('Changes')).toBeTruthy()
    expect(screen.getByText('Patches')).toBeTruthy()
  })

  test('a change shows field-level before → after', () => {
    render(<ChangeSummaryModal show onHide={() => {}} />)
    expect(screen.getByText('ET-C')).toBeTruthy()
    expect(screen.getByText('Acme')).toBeTruthy()   // struck through, the old value
    expect(screen.getByText('XAL')).toBeTruthy()    // the new value
  })

  test('the Patches tab is one click and shows a copyable script per file', () => {
    render(<ChangeSummaryModal show onHide={() => {}} />)
    fireEvent.click(screen.getByText('Patches'))
    expect(screen.getByText('Product Spec')).toBeTruthy()
    expect(screen.getByText(/paste into ProductSpec.xlsx/)).toBeTruthy()
    // a real Copy button, not buried below a wall of warnings
    expect(screen.getAllByText('Copy').length).toBeGreaterThan(0)
  })

  test('Preview shows the generated script, and it never does a live column search', () => {
    render(<ChangeSummaryModal show onHide={() => {}} />)
    fireEvent.click(screen.getByText('Patches'))
    fireEvent.click(screen.getAllByText('Preview')[0])
    const pre = document.querySelector('pre')
    expect(pre.textContent).toContain('function main(workbook')
    expect(pre.textContent).not.toContain('getEntireColumn')   // the freeze guard
  })

  test('copying a patch writes the script to the clipboard', () => {
    render(<ChangeSummaryModal show onHide={() => {}} />)
    fireEvent.click(screen.getByText('Patches'))
    fireEvent.click(screen.getAllByText('Copy')[0])
    expect(navigator.clipboard.writeText).toHaveBeenCalled()
    expect(navigator.clipboard.writeText.mock.calls[0][0]).toContain('function main')
  })
})

describe('the Resolve tab appears only when there is drift', () => {
  test('no gaps, no Resolve tab', () => {
    render(<ChangeSummaryModal show onHide={() => {}} />)
    expect(screen.queryByText('Resolve first')).toBeNull()
  })

  test('a master gap surfaces the Resolve tab with a count', () => {
    useStore.setState({
      ...baseState,
      recipes: [{ PositionTypeRef: 'C01r', ContextType: 'PositionType', ContextRef: 'C01r', ElementTypeRef: 'ET-DL-01' }],
    })
    render(<ChangeSummaryModal show onHide={() => {}} />)
    const tab = screen.getByText('Resolve first')
    expect(tab).toBeTruthy()
    fireEvent.click(tab)
    expect(screen.getByText(/missing from the DesignDB master/)).toBeTruthy()
  })
})

describe('nothing pending', () => {
  test('says so plainly', () => {
    useStore.setState({ ...baseState, psChanges: [] })
    render(<ChangeSummaryModal show onHide={() => {}} />)
    expect(screen.getByText('No pending changes.')).toBeTruthy()
  })
})
