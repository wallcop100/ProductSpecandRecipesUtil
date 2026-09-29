import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'

const prefs = {}
window.electronAPI = { db: {
  setPref: vi.fn(async (_p, k, v) => { prefs[k] = v }),
  getPref: vi.fn(async (_p, k) => prefs[k] ?? null),
} }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))

const { default: useStore } = await import('../../src/store/useStore.js')
const { default: ReviewModal } = await import('../../src/components/ReviewModal.jsx')
const { recordMatches, filterMatches, legacyFilters } = await import('../../src/utils/reviewFields.js')
const { wildcardMatch } = await import('../../src/utils/tagRules.js')

const refs = () => within(screen.getByTestId('review-results')).queryAllByTestId('result-ref').map(e => e.textContent)
const pos = (posRef, ref) => ({
  _id: `${posRef}-${ref}`, PositionTypeRef: posRef, ContextType: 'PositionType',
  ContextRef: posRef, ElementTypeRef: ref, Quantity: 1,
})

describe('wildcards', () => {
  test('* ? , and !', () => {
    expect(wildcardMatch('ET-DL-*', 'et-dl-04')).toBe(true)
    expect(wildcardMatch('C0?r', 'C01r')).toBe(true)
    expect(wildcardMatch('C0?r', 'C011r')).toBe(false)
    expect(wildcardMatch('A*, B*', 'b2')).toBe(true)
    expect(wildcardMatch('!*TBC*', 'ET-PS-TBC-1')).toBe(false)
    expect(wildcardMatch('a.b', 'axb')).toBe(false)
  })

  test('lists: any item for positive ops, none for negative', () => {
    const rec = { Contains: ['ET-DL-01', 'ET-PS-02'] }
    expect(recordMatches({ field: 'Contains', op: 'matches', value: 'ET-DL-*' }, rec)).toBe(true)
    expect(recordMatches({ field: 'Contains', op: 'matches', value: '!ET-DL-*' }, rec)).toBe(false)
    expect(recordMatches({ field: 'Contains', op: 'notEquals', value: 'ET-PS-02' }, rec)).toBe(false)
    expect(recordMatches({ field: 'Contains', op: 'isEmpty' }, { Contains: [] })).toBe(true)
    expect(filterMatches({ match: 'any', conditions: [
      { field: 'Ref', op: 'equals', value: 'nope' }, { field: 'Contains', op: 'contains', value: 'ps' },
    ] }, { Ref: 'A1', ...rec })).toBe(true)
    expect(legacyFilters({ match: 'all', conditions: [{ field: 'Family', op: 'equals', value: 'LC' }] }).family).toBe('LC')
  })
})

describe('Review recipes filters', () => {
  beforeEach(() => { for (const k of Object.keys(prefs)) delete prefs[k]; vi.clearAllMocks() })

  function setup() {
    useStore.setState({
      projectId: 7,
      positionTypes: [{ PositionTypeRef: 'C01r', Name: 'One' }, { PositionTypeRef: 'C02r', Name: 'Two' }, { PositionTypeRef: 'D10', Name: 'Ten' }],
      recipes: [pos('C01r', 'ET-DL-01'), pos('C02r', 'ET-PS-02'), pos('D10', 'ET-DL-03')],
      containerETRefs: new Set(), psRows: [], elementTypes: [], positionUI: {}, formCaptures: null,
    })
    return render(<ReviewModal show onHide={vi.fn()} />)
  }

  test('filter boxes: free text and wildcards narrow the list; a row starts the review there', async () => {
    setup()
    expect(refs()).toHaveLength(3)
    expect(screen.getByTestId('review-results').tagName).toBe('UL')   // a list, not a table
    fireEvent.change(screen.getByLabelText('Filter Contains ET'), { target: { value: 'ET-DL-*' } })
    expect(refs()).toEqual(['C01r', 'D10'])
    fireEvent.change(screen.getByLabelText('Filter Ref'), { target: { value: 'd1' } })   // part of a value
    expect(refs()).toEqual(['D10'])
    fireEvent.click(within(screen.getByTestId('review-results')).getByText('D10'))
    expect(screen.getByTestId('review-counter')).toHaveTextContent('1 of 1')
    expect(screen.getByText('Contains ET: ET-DL-*')).toBeInTheDocument()
  })

  test('another column can be added as a filter box, from a menu split by source', () => {
    setup()
    fireEvent.click(screen.getByText('+ Filter on another column'))
    const headers = [...document.querySelectorAll('.dropdown-header')].map(h => h.textContent)
    expect(headers).toEqual(['DesignDB', 'Product Spec', 'Recipes'])   // Tags already has a box
    fireEvent.click(screen.getByText('Recipe rows', { selector: '.dropdown-item' }))
    fireEvent.change(screen.getByLabelText('Filter Recipe rows'), { target: { value: '!0' } })
    expect(refs()).toHaveLength(3)
  })

  test('a field can be shown on each row and the list sorts', () => {
    setup()
    fireEvent.click(screen.getByTitle('Show on each row'))
    fireEvent.click(screen.getByText('Contains ET', { selector: '.dropdown-item' }))
    expect(screen.getByTestId('review-results')).toHaveTextContent('Contains ET: ET-DL-01')
    fireEvent.click(screen.getByLabelText('Reverse the order'))
    expect(refs()[0]).toBe('D10')
  })

  test('filter sets save per project and load back', async () => {
    setup()
    fireEvent.change(screen.getByLabelText('Filter Ref'), { target: { value: 'C0?r' } })
    vi.spyOn(window, 'prompt').mockReturnValue('C singles')
    fireEvent.click(screen.getByText('Save…'))
    expect(window.electronAPI.db.setPref).toHaveBeenCalledWith(7, 'review_filter_sets', expect.stringContaining('C singles'))

    fireEvent.click(screen.getByText('Clear'))
    expect(refs()).toHaveLength(3)
    fireEvent.change(screen.getByLabelText('Saved filter sets'), { target: { value: 'C singles' } })
    expect(refs()).toHaveLength(2)
    expect(screen.getByLabelText('Filter Ref')).toHaveValue('C0?r')
  })

  test('the last filter comes back next time', async () => {
    prefs.review_last = JSON.stringify({ unit: 'position', filter: { match: 'all', conditions: [{ field: 'Ref', op: 'matches', value: 'D*' }] } })
    setup()
    await waitFor(() => expect(refs()).toHaveLength(1))
  })
})
