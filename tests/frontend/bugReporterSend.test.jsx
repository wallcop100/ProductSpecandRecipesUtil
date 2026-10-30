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

describe('the bug reporter sends, beside a companion with reports', () => {
  beforeEach(() => { resetOutcomes(); api.current = null })

  test('no companion: a note is saved here, never sent', () => {
    setup()
    fireEvent.click(screen.getByLabelText('Bug report options')); fireEvent.click(screen.getByTestId('report-write'))
    fireEvent.change(screen.getByLabelText('Bug note'), { target: { value: 'kept' } })
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Save as Feature Request' }))
    expect(useStore.getState().bugReports).toMatchObject([{ note: 'kept', kind: 'feature' }])
    fireEvent.click(screen.getByLabelText('Bug report options'))
    expect(screen.queryByTestId('report-send-kept')).toBeNull()
  })

  test('sends a report with the project and the learned values in view', async () => {
    api.current = { report: vi.fn(async () => ({ received: true, id: 1 })), opened: vi.fn() }
    sessionStorage.clear()
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
    expect(api.current.opened).toHaveBeenCalledTimes(1)   // usage: once per tab
  })

  test('"Write a report…" opens a note; a feature request is sent as one; what cannot go is kept, then sent from the ▾', async () => {
    api.current = { report: vi.fn(async () => null) }
    setup()
    fireEvent.click(screen.getByLabelText('Bug report options')); fireEvent.click(screen.getByTestId('report-write'))
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull()
    fireEvent.change(screen.getByLabelText('Bug note'), { target: { value: 'it froze' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send as Feature Request' })) })
    expect(api.current.report.mock.calls[0][0]).toMatchObject({ note: 'it froze', kind: 'feature' })
    expect(useStore.getState().bugReports.map(r => r.note)).toEqual(['it froze'])
    expect(screen.getByRole('status').textContent).toMatch(/Kept/)
    api.current.report.mockResolvedValue({ received: true, id: 2 })
    fireEvent.click(screen.getByLabelText('Bug report options'))
    await act(async () => { fireEvent.click(screen.getByTestId('report-send-kept')) })
    expect(useStore.getState().bugReports).toHaveLength(0)
    expect(screen.getByRole('status').textContent).toMatch(/1 sent/)
  })
})
