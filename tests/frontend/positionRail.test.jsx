import { describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'

window.electronAPI = { db: { setPref: vi.fn().mockResolvedValue(undefined) } }
Element.prototype.scrollIntoView = vi.fn()
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

function setup(over = {}) {
  localStorage.clear()
  useStore.setState({
    projectId: 42,
    positionTypes: [
      { PositionTypeRef: 'A10', Name: 'Ten' }, { PositionTypeRef: 'A2', Name: 'Two' }, { PositionTypeRef: 'B1', Name: 'Bee' },
    ],
    recipes: [pos('A2', 'ET-PS-01', { IsDesign: 'Y' })],
    positionUI: { A10: { tags: [] }, A2: { tags: [] }, B1: { tags: [] } },
    positionList: { text: '', tags: [], formOnly: false, emptyOnly: false, showIgnored: false, showTags: false, sort: 'ref', collapsed: [] },
    validationResults: [], activePositionRef: 'A2', ignoredPositionFamilies: [], tagDrift: {},
    containerETRefs: new Set(), formCaptures: null,
    psRows: [], elementTypes: [], rsChanges: [], past: [], future: [],
    selectedRowIds: [], rowClipboard: null,
    activeContextType: 'PositionType', activeETRef: null, recipeError: null, dbWriteEnabled: false,
    ...over,
  })
  return render(<DndContext><ProjectTreeView showDeleted={false} onAddRow={() => {}} onNewET={() => {}} onReplace={() => {}} /></DndContext>)
}

describe('PositionRail in the recipe view', () => {
  beforeEach(() => vi.clearAllMocks())

  test('the list sits beside the open recipe, selected row highlighted, natural order', () => {
    setup()
    const rail = screen.getByTestId('position-rail')
    expect(document.querySelector('[data-debug-id="PositionRecipeEditor"]')).toBeTruthy()
    const refs = [...rail.querySelectorAll('[data-testid^="rail-"]')].map(n => n.textContent)
    expect(refs).toEqual(['A2', 'A10', 'B1'])
    expect(screen.getByTestId('rail-A2').dataset.active).toBe('true')
    expect(screen.getByTestId('rail-A10').title).toMatch(/Ten · No recipe yet/)
  })

  test('clicking a row and ↓ move to another position', () => {
    setup()
    fireEvent.click(screen.getByTestId('rail-B1'))
    expect(useStore.getState().activePositionRef).toBe('B1')
    act(() => useStore.getState().setActivePosition('A2'))
    fireEvent.keyDown(screen.getByTestId('position-rail'), { key: 'ArrowDown' })
    expect(useStore.getState().activePositionRef).toBe('A10')
  })

  test('the filter narrows the rail and the overview alike', () => {
    setup()
    fireEvent.change(screen.getByLabelText('Filter positions'), { target: { value: 'b' } })
    expect(screen.queryByTestId('rail-A10')).toBeNull()
    expect(screen.getByTestId('rail-B1')).toBeTruthy()
    act(() => useStore.getState().setActivePosition(null))
    expect(screen.queryByText('A10')).toBeNull()
  })

  test('the rail collapses to a strip and remembers it', () => {
    setup()
    fireEvent.click(screen.getByTitle('Hide PositionTypes'))
    expect(screen.queryByTestId('rail-A10')).toBeNull()
    expect(JSON.parse(localStorage.getItem('positionRail')).collapsed).toBe(true)
    fireEvent.click(screen.getByTitle('Show PositionTypes'))
    expect(screen.getByTestId('rail-A10')).toBeTruthy()
  })
})

describe('F8T5XM: grey, not red, for an empty position the Form never mentions', () => {
  test('with a Form loaded: in the Form and empty is red; not in it is grey', () => {
    setup({ importDraft: null, formCaptures: { byPosition: { A10: [{ elementTypeRef: 'ET-PS-02', code: 'X1' }] } } })
    expect(screen.getAllByLabelText('No recipe yet')).toHaveLength(1)                  // A10
    expect(screen.getAllByLabelText('No recipe — the Form asks for nothing here')).toHaveLength(1)    // B1
  })
  test('without a Form, empty is red as before', () => {
    setup({ importDraft: null })
    expect(screen.getAllByLabelText('No recipe yet')).toHaveLength(2)
  })
})

describe('YCU5SZ: a code that needs an ElementType is orange', () => {
  test('a position with a recipe and a pending Form code is orange, not green', () => {
    setup({ importDraft: null, formCaptures: { byPosition: {}, pendingByPosition: { A2: [{ code: 'NEW-1' }] } } })
    expect(screen.getAllByLabelText('The Form asks for something it lacks, or a code needs an ElementType')).toHaveLength(1)
  })
})
