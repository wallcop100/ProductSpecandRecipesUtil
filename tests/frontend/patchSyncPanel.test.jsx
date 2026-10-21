import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

window.electronAPI = { db: { setPref: vi.fn().mockResolvedValue(undefined) } }
vi.mock('../../src/utils/backend.js', () => ({ importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(), registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn() }))
const { default: useStore } = await import('../../src/store/useStore.js')
const { default: PatchSyncPanel } = await import('../../src/components/PatchSyncPanel.jsx')

const e = (ref, batch = 1) => ({ elementTypeRef: ref, updates: { ProductCode: 'X' }, before: { ProductCode: 'O' }, batch, exported: { ProductCode: 'X' } })

describe('the sync panel', () => {
  beforeEach(() => useStore.setState({ patchBatch: null, syncStatus: null, psChanges: [], rsChanges: [], dbChanges: [] }))

  test('nothing exported, nothing to say', () => {
    const { container } = render(<PatchSyncPanel />)
    expect(container.textContent).toBe('')
  })

  test('per workbook, in the order to run them; warns when a later patch is in without the DesignDB', () => {
    useStore.setState({ patchBatch: { n: 2, at: Date.now() - 1000, counts: { db: 2, ps: 1, rs: 0 } }, dbChanges: [e('ET-A', 2), e('ET-B', 2)], psChanges: [] })
    render(<PatchSyncPanel />)
    expect(screen.getByText(/Export 2/)).toBeTruthy()
    expect(screen.getByTestId('sync-db').textContent).toMatch(/1\. DesignDB.*2 waiting/)
    expect(screen.getByTestId('sync-ps').textContent).toMatch(/2\. Product Spec.*in/)
    expect(screen.getByText(/The DesignDB patch isn't in yet/)).toBeTruthy()
  })

  test('Dismiss drops the banner and keeps the changes queued as unexported', () => {
    useStore.setState({ patchBatch: { n: 1, at: Date.now() - 1000, counts: { db: 1, ps: 0, rs: 0 } }, dbChanges: [e('ET-A', 1)] })
    const { container } = render(<PatchSyncPanel />)
    expect(container.textContent).not.toMatch(/OneDrive/)
    fireEvent.click(screen.getByTestId('sync-dismiss'))
    expect(container.textContent).toBe('')
    const [c] = useStore.getState().dbChanges
    expect(c.elementTypeRef).toBe('ET-A'); expect(c.batch).toBeUndefined(); expect(c.exported).toBeUndefined()
  })

  test('conflicts are settled here', () => {
    const resolve = vi.spyOn(useStore.getState(), 'resolveConflict').mockImplementation(() => {})
    useStore.setState({ syncStatus: { at: Date.now(), counts: {}, conflicts: [{ file: 'ps', key: 'ET-A', ref: 'ET-A', fields: [{ field: 'ProductCode', mine: 'X', file: 'H' }] }] } })
    render(<PatchSyncPanel />)
    expect(screen.getByTestId('sync-conflicts').textContent).toMatch(/ProductCode: mine X, workbook H/)
    fireEvent.click(screen.getByText("Take the workbook's"))
    expect(resolve).toHaveBeenCalledWith('ps', 'ET-A', 'file')
  })

  test('all in: says so once', () => {
    useStore.setState({ syncStatus: { at: Date.now(), counts: { ps: { applied: 3, pending: 0, conflicts: 0 }, rs: { applied: 0, pending: 0, conflicts: 0 }, db: { applied: 2, pending: 0, conflicts: 0 } }, conflicts: [] } })
    render(<PatchSyncPanel />)
    expect(screen.getByText(/All in: the workbooks hold every exported change \(5\)/)).toBeTruthy()
    fireEvent.click(screen.getByText('OK'))
    expect(screen.queryByTestId('patch-sync')).toBeNull()
  })
})
