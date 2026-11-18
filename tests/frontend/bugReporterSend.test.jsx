import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

window.electronAPI = { db: { setPref: vi.fn().mockResolvedValue(undefined) } }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))
const api = { current: null }
vi.mock('../../src/platform/backup', () => ({ makeBackup: async () => ({ format: 'recipe-builder-backup' }), toBase64: () => 'QUJD' }))
vi.mock('../../src/platform/companion', () => ({ useCompanion: () => api.current, getCompanion: async () => api.current }))

const { default: useStore } = await import('../../src/store/useStore.js')
const { default: BugReporter } = await import('../../src/components/BugReporter.jsx')
const { noteSupplied, resetOutcomes } = await import('../../src/platform/outcomes.js')
const replay = await import('../../src/platform/replay.js')

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

describe('dev: "Include my data (replay)"', () => {
  beforeEach(() => { resetOutcomes(); replay.setReplay(true) })
  const write = note => {
    fireEvent.click(screen.getByLabelText('Bug report options')); fireEvent.click(screen.getByTestId('report-write'))
    fireEvent.change(screen.getByLabelText('Bug note'), { target: { value: note } })
  }

  test('not offered without a bridge that keeps snapshots, nor on prod', () => {
    api.current = { report: vi.fn(async () => ({ id: 'K1' })) }
    setup(); write('x')
    expect(document.querySelector('[data-tick="replay"]')).toBeNull()
  })

  test('ticked: the report says so, then the snapshot goes up beside the id the companion gave', async () => {
    api.current = { report: vi.fn(async () => ({ received: true, id: 'K7QF3M' })), snapshots: true }
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }))
    replay.keepWorkbook('5642 Product Spec.xlsx', new Uint8Array([1, 2, 3]), 'ps')
    replay.keepAnswer('./api/recipes/kinds?x=1', 'GET', { kinds: [] })
    replay.keepAnswer('./api/contributions', 'POST', { id: 9 })   // a write: never a bed's answer
    setup(); write('A02hw diff is wrong')
    const tick = document.querySelector('[data-tick="replay"]')
    expect(tick.checked).toBe(false)   // opt in
    fireEvent.click(tick)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send' })) })
    expect(api.current.report.mock.calls[0][0]).toMatchObject({ note: 'A02hw diff is wrong', snapshot: true })
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled())
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('./api/reports/snapshots/K7QF3M')
    expect(init).toMatchObject({ method: 'PUT', headers: { 'Content-Type': 'application/gzip' } })
    const snap = JSON.parse(await new Response(new Response(init.body).body.pipeThrough(new DecompressionStream('gzip'))).text())
    expect(snap).toMatchObject({ format: 'psr-report-snapshot', report: { note: 'A02hw diff is wrong' },
      ui: { screen: 'product-code-import' }, backup: { format: 'recipe-builder-backup' },
      workbooks: [{ name: '5642 Product Spec.xlsx', role: 'ps', sha256: '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81' }],
      companion: { recipes_kinds: { kinds: [] } } })
    expect(snap.companion.contributions).toBeUndefined()
    fetch.mockRestore()
  })

  test('not ticked: no snapshot', async () => {
    api.current = { report: vi.fn(async () => ({ id: 'K2' })), snapshots: true }
    const fetch = vi.spyOn(globalThis, 'fetch')
    setup(); write('plain')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send' })) })
    expect(api.current.report.mock.calls[0][0].snapshot).toBeUndefined()
    expect(fetch).not.toHaveBeenCalled()
    fetch.mockRestore()
  })
})
