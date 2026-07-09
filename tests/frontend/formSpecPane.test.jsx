import { describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

// Augment jsdom's window — never replace it, or React has no DOM to render into.
window.electronAPI = { db: { setPref: vi.fn().mockResolvedValue(undefined) } }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))

const { default: useStore } = await import('../../src/store/useStore.js')
const { default: FormSpecPane } = await import('../../src/components/FormSpecPane.jsx')

const pos = (posRef, ref, extra = {}) => ({
  _id: `${posRef}-p-${ref}`, PositionTypeRef: posRef, ContextType: 'PositionType',
  ContextRef: posRef, ElementTypeRef: ref, Quantity: 1, ...extra,
})
const inside = (posRef, container, ref) => ({
  _id: `${posRef}-${container}-${ref}`, PositionTypeRef: posRef, ContextType: 'ElementType',
  ContextRef: container, ElementTypeRef: ref, RecipeIndex: 1, Quantity: 1,
})

const captures = {
  version: 1,
  source: { name: '5642 - Form V3.6.xlsx', sheet: 'PositionTypeSpec' },
  byPosition: {
    C01r: [
      { elementTypeRef: 'ET-PROF-01', code: 'FPS2020BG2000', note: 'Profile 2020', formRef: 'C01' },
      { elementTypeRef: 'ET-TAPE-01', code: 'LL240272024', note: 'Tape', formRef: 'C01' },
    ],
  },
  contextByPosition: { C01r: { ProductName: 'Linear LED', Finish: 'Black anodised' } },
  orphansByPosition: {},
}

/** C01r's design element is the wrapper ET-LIN-01; the profile lives inside it. */
const recipes = () => [
  pos('C01r', 'ET-LIN-01', { IsDesign: 'Y' }),
  inside('C01r', 'ET-LIN-01', 'ET-PROF-01'),
  pos('C01r', 'ET-2PIN-SOCK'),
]

function setup(over = {}) {
  useStore.setState({
    projectId: 42, recipes: recipes(), containerETRefs: new Set(['et-lin-01']),
    formCaptures: captures, psRows: [], elementTypes: [], rsChanges: [], past: [], future: [],
    activeContextType: 'PositionType', activeETRef: null, recipeError: null, dbWriteEnabled: false,
    ...over,
  })
  return render(<FormSpecPane posRef="C01r" />)
}

describe('FormSpecPane renders the Form beside the recipe', () => {
  beforeEach(() => { vi.clearAllMocks() })

  test('shows the import wizard\'s context columns, to keep you grounded', () => {
    setup()
    expect(screen.getByText('ProductName:')).toBeInTheDocument()
    expect(screen.getByText('Linear LED')).toBeInTheDocument()
    expect(screen.getByText('Black anodised')).toBeInTheDocument()
  })

  test('names the source workbook', () => {
    setup()
    expect(screen.getByText(/5642 - Form V3\.6\.xlsx/)).toBeInTheDocument()
  })

  test('a Form product INSIDE the wrapper reads as present, not misplaced', () => {
    setup()
    expect(screen.getByText('FPS2020BG2000')).toBeInTheDocument()
    expect(screen.getByText('inside ET-LIN-01')).toBeInTheDocument()
    expect(screen.queryByText(/misplaced/i)).toBeNull()
  })

  test('an absent Form product is missing and offers a tick', () => {
    setup()
    expect(screen.getByText('LL240272024')).toBeInTheDocument()
    expect(screen.getByText('missing from the recipe')).toBeInTheDocument()
    expect(screen.getAllByTitle('Tick to add')).toHaveLength(1)
  })

  test('coverage counts what the Form specified', () => {
    setup()
    expect(screen.getByText('1/2 present')).toBeInTheDocument()
  })

  test('recipe rows absent from the Form are derived detail, never errors', () => {
    setup()
    expect(screen.getByText('Not specified by the Form')).toBeInTheDocument()
    expect(screen.getByText('ET-2PIN-SOCK')).toBeInTheDocument()
    expect(screen.getByText('connector')).toBeInTheDocument()
    expect(screen.getByText('the wrapper')).toBeInTheDocument()   // ET-LIN-01 itself
  })

  test('ticking offers a destination, and the position\'s wrapper is one of them', () => {
    setup()
    fireEvent.click(screen.getByTitle('Tick to add'))
    expect(screen.getByText('Add 1 to:')).toBeInTheDocument()
    // The Form carries no slot, so both destinations are offered and neither is assumed.
    expect(screen.getByLabelText(/Position level/)).not.toBeDisabled()
    expect(screen.getByLabelText(/inside ET-LIN-01/)).not.toBeDisabled()
    expect(screen.getByLabelText(/Position level/)).toBeChecked()   // the safe default
  })

  test('nothing is written until the preview is confirmed', () => {
    setup()
    const before = useStore.getState().recipes.length
    fireEvent.click(screen.getByTitle('Tick to add'))
    fireEvent.click(screen.getByText(/Preview 1 change/))
    expect(useStore.getState().recipes).toHaveLength(before)          // still untouched

    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByText(/Apply 1 change/))
    expect(useStore.getState().recipes).toHaveLength(before + 1)
  })

  test('confirming adds the row at the chosen destination', () => {
    setup()
    fireEvent.click(screen.getByTitle('Tick to add'))
    fireEvent.click(screen.getByLabelText(/inside/))
    fireEvent.click(screen.getByText(/Preview 1 change/))
    fireEvent.click(within(screen.getByRole('dialog')).getByText(/Apply 1 change/))

    const added = useStore.getState().recipes.find(r => r.ElementTypeRef === 'ET-TAPE-01')
    expect(added.ContextType).toBe('ElementType')
    expect(added.ContextRef).toBe('ET-LIN-01')       // landed inside the wrapper
  })

  test('a position with no wrapper cannot pick the internal destination', () => {
    setup({ recipes: [pos('C01r', 'ET-LAMP', { IsDesign: 'Y' })], containerETRefs: new Set() })
    fireEvent.click(screen.getAllByTitle('Tick to add')[0])
    expect(screen.getByLabelText(/no wrapper on this position/)).toBeDisabled()
  })

  test('a code that left the Form is flagged, never deleted for you', () => {
    setup({ formCaptures: { ...captures, byPosition: { C01r: [] }, orphansByPosition: { C01r: ['ET-PROF-01'] } } })
    expect(screen.getByText('No longer in the Form')).toBeInTheDocument()
    expect(screen.getByText('Remove')).toBeInTheDocument()
    expect(useStore.getState().recipes.find(r => r.ElementTypeRef === 'ET-PROF-01')).toBeTruthy()
  })

  test('the pane says so when the Form is silent about this position', () => {
    setup({ formCaptures: { ...captures, byPosition: {}, contextByPosition: {} } })
    expect(screen.getByText(/The Form says nothing about C01r/)).toBeInTheDocument()
  })

  test('no Form attached: the pane renders nothing at all', () => {
    const { container } = setup({ formCaptures: null })
    expect(container).toBeEmptyDOMElement()
  })
})
