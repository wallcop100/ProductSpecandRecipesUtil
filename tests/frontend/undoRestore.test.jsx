import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

const db = { setPref: vi.fn().mockResolvedValue(undefined), upsertLocalET: vi.fn().mockResolvedValue(undefined), deleteLocalET: vi.fn().mockResolvedValue(undefined), clearPendingChanges: vi.fn().mockResolvedValue(undefined) }
window.electronAPI = { db }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))
const { default: useStore } = await import('../../src/store/useStore.js')
const { SaveShortcut } = await import('../../src/components/SaveStatus.jsx')

beforeEach(() => {
  vi.clearAllMocks()
  useStore.setState({
    projectId: 1, past: [], future: [], psChanges: [], rsChanges: [], dbChanges: [], recipes: [],
    elementTypes: [], localElementTypes: [], toastMsg: null,
    psRows: [{ ElementTypeRef: 'ET-A', Manufacturer: 'Wago', ProductCode: '1' }],
  })
})
const s = () => useStore.getState()

describe('WJ8TEG: undo / redo of a new ElementType', () => {
  test('redo brings back the ElementType and its Product Spec row', () => {
    s()._pushHistory()
    s().createElementType({ ref: 'ET-NEW', family: 'ET-DRIVERS' })
    s().addPSRow('ET-NEW', {}, { recordHistory: false })
    s().undo()
    expect(s().elementTypes.some(e => e.ElementTypeRef === 'ET-NEW')).toBe(false)
    expect(s().localElementTypes).toHaveLength(0)
    expect(db.deleteLocalET).toHaveBeenCalled()
    s().redo()
    expect(s().elementTypes.some(e => e.ElementTypeRef === 'ET-NEW')).toBe(true)
    expect(s().psRows.some(r => r.ElementTypeRef === 'ET-NEW')).toBe(true)
    expect(s().localElementTypes.some(e => e.ElementTypeRef === 'ET-NEW')).toBe(true)
    expect(db.upsertLocalET).toHaveBeenLastCalledWith(1, expect.objectContaining({ ref: 'ET-NEW' }))
  })

  test('a field committed unchanged does not wipe redo', () => {
    s().updatePSRow('ET-A', { ProductCode: '2' })
    s().undo()
    expect(s().future).toHaveLength(1)
    s().updatePSRow('ET-A', { ProductCode: '1' })    // blur with nothing changed
    expect(s().future).toHaveLength(1)
    s().redo()
    expect(s().psRows[0].ProductCode).toBe('2')
  })
})

describe('GS9LXJ: unexported changes come back by themselves', () => {
  test('the restore is said in a toast, and Discard clears the changes', async () => {
    useStore.setState({ psChanges: [{ elementTypeRef: 'ET-A', updates: { ProductCode: '2' } }] })
    render(<SaveShortcut />)
    act(() => s().toast('1 unexported change restored from your last session.'))
    expect((await screen.findByTestId('save-toast')).textContent).toMatch(/1 unexported change restored/)
    await s().discardPendingChanges()
    expect(s().psChanges).toEqual([])
    expect(db.clearPendingChanges).toHaveBeenCalledWith(1)
  })
})
