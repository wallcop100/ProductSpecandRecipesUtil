import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

window.electronAPI = { db: { setPref: vi.fn().mockResolvedValue(undefined) } }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))
const { default: useStore } = await import('../../src/store/useStore.js')
const { default: ElementTypesWindow } = await import('../../src/components/ElementTypesWindow.jsx')

describe('one ElementTypes window', () => {
  test('Existing and Unused are tabs of the same window; New only when there are proposals', () => {
    useStore.setState({ elementTypes: [{ ElementTypeRef: 'ET-PS-01', Family: 'ET-PS' }], psRows: [], recipes: [] })
    render(<ElementTypesWindow show onHide={vi.fn()} view="existing" />)
    expect(screen.getByText('Existing ElementTypes (1)')).toBeInTheDocument()
    expect(screen.queryByText(/^New \(/)).toBeNull()
    fireEvent.click(screen.getByText('Unused'))
    expect(screen.getByText(/Clean up unused ElementTypes/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Existing (1)'))
    expect(screen.getByText('Existing ElementTypes (1)')).toBeInTheDocument()
  })

  test('opened from an import, the New tab leads', () => {
    useStore.setState({ elementTypes: [], psRows: [], recipes: [] })
    render(<ElementTypesWindow show onHide={vi.fn()} view="new"
      bulk={{ proposals: [], newFamilies: [], families: [], elementTypes: [], onApply: vi.fn() }} />)
    expect(screen.getByText('New (0)')).toBeInTheDocument()
    expect(screen.getByText(/New ElementTypes for 0 codes/)).toBeInTheDocument()
  })
})
