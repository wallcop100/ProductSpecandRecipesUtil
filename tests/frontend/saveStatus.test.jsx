import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const flush = vi.fn().mockResolvedValue(undefined)
window.electronAPI = { db: {
  setPref: vi.fn().mockResolvedValue(undefined),
  setPendingChanges: vi.fn().mockResolvedValue(undefined),
  flush,
} }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))

const { default: useStore } = await import('../../src/store/useStore.js')
const { SaveIndicator, SaveShortcut } = await import('../../src/components/SaveStatus.jsx')

describe('save status', () => {
  test('the cloud says saved, and that the workbooks still wait for export', () => {
    useStore.setState({ projectId: 1, psChanges: [], rsChanges: [{}, {}], dbChanges: [] })
    useStore.setState({ saveStatus: 'saved', savedAt: Date.now() })   // after the autosave the change fired
    render(<SaveIndicator />)
    const el = screen.getByTestId('save-indicator')
    expect(el).toHaveTextContent('Saved')
    expect(el.title).toMatch(/2 changes not yet exported/)
  })

  test('Ctrl+S saves now and says what it did', async () => {
    useStore.setState({ projectId: 1, saveStatus: 'saving', psChanges: [{}], rsChanges: [], dbChanges: [] })
    render(<SaveShortcut />)
    await act(async () => { fireEvent.keyDown(window, { key: 's', ctrlKey: true }) })
    expect(flush).toHaveBeenCalled()
    expect(useStore.getState().saveStatus).toBe('saved')
    expect(await screen.findByTestId('save-toast')).toHaveTextContent(/Saved in this browser. 1 change still to export/)
  })
})
