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

  test('a wildcard condition narrows the results table; a row starts the review there', async () => {
    setup()
    const table = () => screen.getByTestId('review-results')
    expect(within(table()).getAllByRole('row')).toHaveLength(4)   // header + 3
    fireEvent.click(screen.getByText('+ Add condition'))
    fireEvent.change(screen.getByLabelText('Field'), { target: { value: 'Contains' } })
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'ET-DL-*' } })
    const rows = within(table()).getAllByRole('row').slice(1).map(r => r.cells[0].textContent)
    expect(rows).toEqual(['C01r', 'D10'])
    fireEvent.click(within(table()).getByText('D10'))
    expect(screen.getByTestId('review-counter')).toHaveTextContent('2 of 2')
    expect(screen.getByText(/Contains ET matches \(\* \?\) ET-DL-\*/)).toBeInTheDocument()
  })

  test('a column can be added and the table sorts by it', () => {
    setup()
    fireEvent.click(screen.getByTitle('Columns'))
    fireEvent.click(screen.getByText('Contains ET', { selector: '.dropdown-item' }))
    const head = [...screen.getByTestId('review-results').querySelectorAll('th')].map(th => th.textContent)
    expect(head).toContain('Contains ET')
    fireEvent.click(screen.getByText('Ref ▲'))
    const first = within(screen.getByTestId('review-results')).getAllByRole('row')[1].cells[0].textContent
    expect(first).toBe('D10')
  })

  test('filter sets save per project and load back', async () => {
    setup()
    fireEvent.click(screen.getByText('+ Add condition'))
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'C0?r' } })
    vi.spyOn(window, 'prompt').mockReturnValue('C singles')
    fireEvent.click(screen.getByText('Save…'))
    expect(window.electronAPI.db.setPref).toHaveBeenCalledWith(7, 'review_filter_sets', expect.stringContaining('C singles'))

    fireEvent.click(screen.getByText('Clear'))
    expect(within(screen.getByTestId('review-results')).getAllByRole('row')).toHaveLength(4)
    fireEvent.change(screen.getByLabelText('Saved filter sets'), { target: { value: 'C singles' } })
    expect(within(screen.getByTestId('review-results')).getAllByRole('row')).toHaveLength(3)
  })

  test('the last filter comes back next time', async () => {
    prefs.review_last = JSON.stringify({ unit: 'position', filter: { match: 'all', conditions: [{ field: 'Ref', op: 'matches', value: 'D*' }] } })
    setup()
    await waitFor(() => expect(within(screen.getByTestId('review-results')).getAllByRole('row')).toHaveLength(2))
  })
})
