import { describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'

// Augment jsdom's window — never replace it, or React has no DOM to render into.
window.electronAPI = { db: { setPref: vi.fn().mockResolvedValue(undefined) } }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))

const { default: useStore } = await import('../../src/store/useStore.js')
const { default: ProjectTreeView } = await import('../../src/components/ProjectTreeView.jsx')

const pos = (posRef, ref, extra = {}) => ({
  _id: `${posRef}-p-${ref}`, PositionTypeRef: posRef, ContextType: 'PositionType',
  ContextRef: posRef, ElementTypeRef: ref, Quantity: 1, ...extra,
})

/**
 * Selecting a position hands the whole surface to FocusedPositionEditor via an
 * EARLY RETURN. Any hook added below that return is called conditionally: React
 * then sees fewer hooks than the previous render, throws, and the subtree
 * unmounts — a blank main surface exactly when you click a position.
 *
 * That is what happened when the "Form incomplete" filter was added. This test
 * toggles the selection, because a single render with a position already active
 * would call fewer hooks and pass.
 */
describe('selecting a position does not blank the surface', () => {
  const setup = (over = {}) => {
    useStore.setState({
      projectId: 42,
      positionTypes: [{ PositionTypeRef: 'C01r', Name: 'Linear' }, { PositionTypeRef: 'C03r', Name: 'Linear 2' }],
      recipes: [pos('C01r', 'ET-LIN-01', { IsDesign: 'Y' })],
      positionUI: { C01r: { tags: [] }, C03r: { tags: [] } },
      validationResults: [],
      activePositionRef: null,
      ignoredPositionFamilies: [],
      tagDrift: {},
      containerETRefs: new Set(),
      formCaptures: null,
      psRows: [], elementTypes: [], rsChanges: [], past: [], future: [],
      selectedRowIds: [], rowClipboard: null,
      activeContextType: 'PositionType', activeETRef: null, recipeError: null, dbWriteEnabled: false,
      ...over,
    })
    return render(
      <DndContext>
        <ProjectTreeView showDeleted={false} onAddRow={() => {}} onNewET={() => {}} onReplace={() => {}} />
      </DndContext>
    )
  }

  beforeEach(() => vi.clearAllMocks())

  test('the overview lists positions, then the focused editor replaces it', () => {
    setup()
    expect(screen.getByText('C01r')).toBeInTheDocument()

    act(() => useStore.getState().setActivePosition('C01r'))

    // The editor mounted — the hook count did not change across the two renders.
    expect(document.querySelector('[data-debug-id="PositionRecipeEditor"]')).toBeTruthy()
  })

  test('it survives the same toggle with a Form template attached', () => {
    // The Form hooks (formCaptures, containerETRefs, formWorklist) are the ones
    // that were misplaced below the early return.
    setup({
      formCaptures: {
        version: 1,
        source: { name: 'Form.xlsx' },
        byPosition: { C01r: [{ elementTypeRef: 'ET-NOPE', code: 'X', manufacturer: 'M' }] },
        orphansByPosition: {},
      },
    })
    expect(screen.getByText(/Form incomplete/)).toBeInTheDocument()

    act(() => useStore.getState().setActivePosition('C01r'))
    expect(document.querySelector('[data-debug-id="PositionRecipeEditor"]')).toBeTruthy()

    act(() => useStore.getState().setActivePosition(null))
    expect(screen.getByText(/Form incomplete/)).toBeInTheDocument()
  })

  test('going back to the overview restores it', () => {
    setup()
    act(() => useStore.getState().setActivePosition('C01r'))
    act(() => useStore.getState().setActivePosition(null))
    expect(screen.getByText('C03r')).toBeInTheDocument()
  })
})
