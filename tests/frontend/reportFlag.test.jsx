import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

window.electronAPI = { db: { setPref: vi.fn().mockResolvedValue(undefined) } }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))
const api = { current: null }
vi.mock('../../src/platform/companion', () => ({ useCompanion: () => api.current, getCompanion: async () => api.current }))

const { default: useStore } = await import('../../src/store/useStore.js')
const { default: BugReporter } = await import('../../src/components/BugReporter.jsx')
const { noteSupplied, resetOutcomes } = await import('../../src/platform/outcomes.js')

function setup() {
  localStorage.clear()
  useStore.setState({
    bugMode: false, bugReports: [], projectLabel: '5452 Test', projectNumber: '5452', activePositionRef: null,
    positionTypes: [], elementTypes: [], recipes: [], psRows: [], dbChanges: [], psChanges: [], rsChanges: [],
    formCaptures: null, teaching: null,
  })
  return render(<><BugReporter screen="product-code-import" /><div data-code="ZZ-1"><button>ZZ-1 row</button></div></>)
}

describe('the ⚑ (served beside a companion with reports)', () => {
  beforeEach(() => { resetOutcomes(); api.current = null })

  test('no companion: no flag', () => {
    setup()
    expect(screen.queryByTestId('report-flag')).toBeNull()
  })

  test('sends a report with the project and the learned values in view', async () => {
    api.current = { report: vi.fn(async () => ({ received: true, id: 1 })) }
    noteSupplied({ kind: 'family', key: 'ACME|ZZ-1', tier: 'library', source: '5642', value: 'ET-DL', code: 'ZZ-1' })
    setup()
    fireEvent.click(screen.getByTestId('bug-toggle'))
    act(() => { screen.getByText('ZZ-1 row').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })) })
    fireEvent.change(screen.getByLabelText('Bug note'), { target: { value: 'wrong family' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send' })) })
    const [sent] = api.current.report.mock.calls[0]
    expect(sent).toMatchObject({ note: 'wrong family', project: '5452', dom: { code: 'ZZ-1' } })
    expect(sent.learned).toEqual([{ kind: 'family', key: 'ACME|ZZ-1', value: 'ET-DL', tier: 'library', source: '5642' }])
    expect(useStore.getState().bugReports).toHaveLength(0)
    expect(screen.getByRole('status').textContent).toMatch(/Sent/)
  })

  test('the flag opens a note; a report that cannot go is kept here', async () => {
    api.current = { report: vi.fn(async () => null) }
    setup()
    fireEvent.click(screen.getByTestId('report-flag'))
    expect(screen.getByText('Report a problem', { selector: 'div' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Bug note'), { target: { value: 'it froze' } })
    await act(async () => { fireEvent.click(screen.getByTestId('report-send')) })
    expect(useStore.getState().bugReports.map(r => r.note)).toEqual(['it froze'])
    expect(screen.getByRole('status').textContent).toMatch(/Kept/)
  })
})
