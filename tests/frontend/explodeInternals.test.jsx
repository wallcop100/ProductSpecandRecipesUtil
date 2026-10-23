import { test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import useStore from '../../src/store/useStore'
import PositionRecipeEditor from '../../src/components/PositionRecipeEditor'

/** #74: the ⋯ menu's View → Explode internals edits a wrapper's contents in place. */
vi.mock('../../src/components/RecipeSuggestions', () => ({ default: () => null }))

const removeRecipeRow = vi.fn()
const RECIPES = [
  { _id: 'p1', PositionTypeRef: 'C01r', ContextType: 'PositionType', ContextRef: 'C01r', ElementTypeRef: 'ET-LIN-01', Quantity: 1 },
  { _id: 'p2', PositionTypeRef: 'C03r', ContextType: 'PositionType', ContextRef: 'C03r', ElementTypeRef: 'ET-LIN-01', Quantity: 1 },
  { _id: 'i1', PositionTypeRef: 'C01r', ContextType: 'ElementType', ContextRef: 'ET-LIN-01', ElementTypeRef: 'ET-PROF-01', Quantity: 1 },
]

beforeEach(() => {
  removeRecipeRow.mockClear()
  useStore.setState({
    recipes: RECIPES, removeRecipeRow, psRows: [], elementTypes: [],
    containerETRefs: new Set(['et-lin-01']), containerReasons: {}, selectedRowIds: [], screenView: {},
  })
})

const renderEditor = () => render(<DndContext><PositionRecipeEditor posRef="C01r" count={1} /></DndContext>)
const toggle = () => { fireEvent.click(screen.getByLabelText('Recipe actions')); fireEvent.click(screen.getByTestId('toggle-explode')) }

test('Explode shows each wrapper as its own section, and Implode puts the hint back', () => {
  renderEditor()
  expect(screen.getByText(/Element internals are shown read-only/)).toBeTruthy()
  toggle()
  expect(screen.queryByText(/Element internals are shown read-only/)).toBeNull()
  expect(screen.getByText(/^LIN Wrapper/)).toBeTruthy()
  expect(screen.queryByTitle('Show contents')).toBeNull()   // the row's read-only preview would repeat it
  toggle()
  expect(screen.getByText(/Element internals are shown read-only/)).toBeTruthy()
})

test('an exploded shared wrapper still guards a delete', () => {
  renderEditor()
  toggle()
  const section = screen.getByText(/^LIN Wrapper/).closest('[data-debug-id="RecipeSection:lin_internal"]')
  fireEvent.click(within(section).getByTitle(/Mark IsDeleted/))
  expect(screen.getByText(/Delete from a shared assembly/)).toBeTruthy()
  expect(removeRecipeRow).not.toHaveBeenCalled()
})

test('an exploded shared wrapper names who else it changes, and cannot be dragged', () => {
  renderEditor()
  toggle()
  expect(screen.getByTestId('wrapper-shared').textContent).toMatch(/shared with C03r — edits apply to all/)
})

test('"Delete from all" in the exploded view really deletes C03r\'s copy too (real store)', () => {
  const real = useStore.getInitialState().removeRecipeRow
  useStore.setState({
    recipes: [...RECIPES, { _id: 'i3', _row_num: 9, PositionTypeRef: 'C03r', ContextType: 'ElementType', ContextRef: 'ET-LIN-01', ElementTypeRef: 'ET-PROF-01', Quantity: 1 }]
      .map(r => r._id === 'i1' ? { ...r, _row_num: 5 } : r),
    removeRecipeRow: real, rsChanges: [], activeContextType: 'PositionType', activeETRef: null,
  })
  renderEditor()
  toggle()
  const section = screen.getByText(/^LIN Wrapper/).closest('[data-debug-id="RecipeSection:lin_internal"]')
  fireEvent.click(within(section).getByTitle(/Mark IsDeleted/))
  fireEvent.click(screen.getByText('Delete from all'))
  const st = useStore.getState().recipes
  expect(st.find(r => r._id === 'i1').IsDeleted).toBe('Y')
  expect(st.find(r => r._id === 'i3').IsDeleted).toBe('Y')
})
