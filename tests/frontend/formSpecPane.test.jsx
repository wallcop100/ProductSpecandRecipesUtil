import { describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

// Augment jsdom's window — never replace it, or React has no DOM to render into.
window.electronAPI = { db: { setPref: vi.fn().mockResolvedValue(undefined) } }
window.confirm = vi.fn(() => true)
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
      { elementTypeRef: 'ET-PROF-01', code: 'FPS2020BG2000', manufacturer: 'Flexalighting', note: 'Profile 2020', formRef: 'C01' },
      { elementTypeRef: 'ET-TAPE-01', code: 'LL240272024', manufacturer: 'Nichia', note: 'Tape', formRef: 'C01' },
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
    // psRows can be overridden per-test to exercise the shopping-list lookup
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
    expect(screen.getAllByTitle(/Tick to add/)).toHaveLength(1)
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
    fireEvent.click(screen.getByTitle(/Tick to add/))
    expect(screen.getByText('Add 1 to:')).toBeInTheDocument()
    // The Form carries no slot, so both destinations are offered and neither is assumed.
    expect(screen.getByLabelText(/Position level/)).not.toBeDisabled()
    expect(screen.getByLabelText(/inside ET-LIN-01/)).not.toBeDisabled()
    expect(screen.getByLabelText(/Position level/)).toBeChecked()   // the safe default
  })

  test('nothing is written until the preview is confirmed', () => {
    setup()
    const before = useStore.getState().recipes.length
    fireEvent.click(screen.getByTitle(/Tick to add/))
    fireEvent.click(screen.getByText(/Preview 1 change/))
    expect(useStore.getState().recipes).toHaveLength(before)          // still untouched

    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByText(/Apply 1 change/))
    expect(useStore.getState().recipes).toHaveLength(before + 1)
  })

  test('confirming adds the row at the chosen destination', () => {
    setup()
    fireEvent.click(screen.getByTitle(/Tick to add/))
    fireEvent.click(screen.getByLabelText(/inside/))
    fireEvent.click(screen.getByText(/Preview 1 change/))
    fireEvent.click(within(screen.getByRole('dialog')).getByText(/Apply 1 change/))

    const added = useStore.getState().recipes.find(r => r.ElementTypeRef === 'ET-TAPE-01')
    expect(added.ContextType).toBe('ElementType')
    expect(added.ContextRef).toBe('ET-LIN-01')       // landed inside the wrapper
  })

  test('a position with no wrapper cannot pick the internal destination', () => {
    setup({ recipes: [pos('C01r', 'ET-LAMP', { IsDesign: 'Y' })], containerETRefs: new Set() })
    fireEvent.click(screen.getAllByTitle(/Tick to add/)[0])
    expect(screen.getByLabelText(/no wrapper on this position/)).toBeDisabled()
  })

  /**
   * A matched row says where it was FOUND. A missing row used to say nothing about
   * where it would GO, so the destination was discovered only after ticking — or, on a
   * position with no wrapper, after the store refused the row.
   */
  test('a missing row states its destination before you tick it', () => {
    setup()
    expect(screen.getByText(/will be added at position level/)).toBeInTheDocument()
  })

  test('a position with no wrapper says so up front, not in a greyed-out radio', () => {
    setup({ recipes: [pos('C01r', 'ET-LAMP', { IsDesign: 'Y' })], containerETRefs: new Set() })
    expect(screen.getByText(/has no wrapper, so everything lands at/)).toBeInTheDocument()
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

  test('no Form attached: one clear prompt, not a blank panel', () => {
    setup({ formCaptures: null })
    expect(screen.getByText('No Form template yet')).toBeInTheDocument()
    expect(screen.getByText(/Import the Form template/)).toBeInTheDocument()
    expect(screen.getByText(/Identify codes/)).toBeInTheDocument()   // the 1-2-3
  })

  test('the prompt starts stage ① by asking App to change screen', () => {
    setup({ formCaptures: null })
    fireEvent.click(screen.getByText(/Import the Form template/))
    expect(useStore.getState().pendingScreen).toBe('product-code-import')
  })

  test('embedded (Review modal) is not the place to start a workflow', () => {
    useStore.setState({ formCaptures: null, recipes: recipes(), containerETRefs: new Set(), psRows: [] })
    const { container } = render(<FormSpecPane posRef="C01r" embedded />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('manufacturer + product code are one identity', () => {
  test('the manufacturer is always shown beside the code', () => {
    setup()
    expect(screen.getByText('FPS2020BG2000')).toBeInTheDocument()
    expect(screen.getByText('Flexalighting')).toBeInTheDocument()
    expect(screen.getByText('LL240272024')).toBeInTheDocument()
    expect(screen.getByText('Nichia')).toBeInTheDocument()
  })

  test('a product with no manufacturer says so rather than showing nothing', () => {
    setup({
      formCaptures: { ...captures, byPosition: { C01r: [{ elementTypeRef: 'ET-X', code: 'ABC', formRef: 'C01' }] } },
    })
    expect(screen.getByText('no manufacturer')).toBeInTheDocument()
  })

  test('a maker+code already in the spec is offered as a shopping-list add', () => {
    // The spec already names ET-TAPE-99 for Nichia / LL240272024.
    setup({ psRows: [{ ElementTypeRef: 'ET-TAPE-99', Manufacturer: 'Nichia', ProductCode: 'LL240272024' }] })
    expect(screen.getByText('in the spec')).toBeInTheDocument()
    expect(screen.getByText('already an ElementType — tick to add it')).toBeInTheDocument()
    expect(screen.getByText('ET-TAPE-99')).toBeInTheDocument()   // the spec's ET, not the captured one
  })

  test('ticking it adds the SPEC\'s ElementType, not the stale captured one', () => {
    setup({ psRows: [{ ElementTypeRef: 'ET-TAPE-99', Manufacturer: 'Nichia', ProductCode: 'LL240272024' }] })
    fireEvent.click(screen.getByTitle(/Tick to add/))
    fireEvent.click(screen.getByText(/Preview 1 change/))
    fireEvent.click(within(screen.getByRole('dialog')).getByText(/Apply 1 change/))
    expect(useStore.getState().recipes.some(r => r.ElementTypeRef === 'ET-TAPE-99')).toBe(true)
    expect(useStore.getState().recipes.some(r => r.ElementTypeRef === 'ET-TAPE-01')).toBe(false)
  })

  test('the same code under a DIFFERENT maker is not treated as the same product', () => {
    // The spec has this code, but from Phos. Our Form product is Nichia's.
    setup({ psRows: [
      { ElementTypeRef: 'ET-OTHER', Manufacturer: 'Phos', ProductCode: 'LL240272024' },
      { ElementTypeRef: 'ET-DECOY', Manufacturer: 'Acme', ProductCode: 'LL240272024' },
    ] })
    expect(screen.queryByText('in the spec')).toBeNull()
    expect(screen.getByText('missing from the recipe')).toBeInTheDocument()
    expect(screen.queryByText('ET-OTHER')).toBeNull()
  })
})

describe('the attached-Form strip', () => {
  test('names the workbook and when it was imported', () => {
    setup({ formCaptures: { ...captures, importedAt: new Date(Date.now() - 2 * 3600e3).toISOString() } })
    expect(screen.getByText(/5642 - Form V3\.6\.xlsx/)).toBeInTheDocument()
    expect(screen.getByText(/2h ago/)).toBeInTheDocument()
  })

  test('Re-import asks App to change screen — the pane is too nested to navigate itself', () => {
    setup()
    fireEvent.click(screen.getByText('Re-import'))
    expect(useStore.getState().pendingScreen).toBe('product-code-import')
  })

  test('Detach confirms, then clears the captures', () => {
    setup()
    fireEvent.click(screen.getByText('Detach'))
    expect(window.confirm).toHaveBeenCalled()
    expect(useStore.getState().formCaptures).toBeNull()
  })

  test('the strip is reachable even when the Form is silent about this position', () => {
    setup({ formCaptures: { ...captures, byPosition: {}, contextByPosition: {} } })
    expect(screen.getByText('Detach')).toBeInTheDocument()
    expect(screen.getByText(/The Form says nothing about C01r/)).toBeInTheDocument()
  })
})

describe('the fork decision is durable and actionable', () => {
  const shared = () => [
    pos('C01r', 'ET-LIN-01', { IsDesign: 'Y' }),
    pos('C03r', 'ET-LIN-01', { IsDesign: 'Y' }),
    inside('C01r', 'ET-LIN-01', 'ET-PROF-01'),
  ]
  const withDivergence = {
    ...captures,
    divergence: [{
      wrapper: 'ET-LIN-01', consistent: false,
      sharers: ['C01r', 'C03r'], changedPositions: ['C01r'], unchangedPositions: ['C03r'],
    }],
  }

  test('an inconsistent shared wrapper is surfaced on the position, with a Fork', () => {
    setup({ recipes: shared(), formCaptures: withDivergence })
    expect(screen.getByText(/is\s+shared by C01r, C03r/)).toBeInTheDocument()
    expect(screen.getByText(/Fork it for C01r/)).toBeInTheDocument()
  })

  test('"Keep shared" settles the question without forking', () => {
    setup({ recipes: shared(), formCaptures: withDivergence })
    fireEvent.click(screen.getByText('Keep shared'))
    expect(useStore.getState().formCaptures.divergence).toEqual([])
  })

  test('a CONSISTENT wrapper raises no fork question', () => {
    const caps = { ...captures, divergence: [{ wrapper: 'ET-LIN-01', consistent: true, sharers: ['C01r'] }] }
    setup({ recipes: shared(), formCaptures: caps })
    expect(screen.queryByText(/Fork it/)).toBeNull()
  })

  test('divergence about a wrapper this position does not use is not shown', () => {
    const caps = { ...captures, divergence: [{ wrapper: 'ET-DL-99', consistent: false, sharers: ['X'], changedPositions: ['X'], unchangedPositions: ['Y'] }] }
    setup({ recipes: shared(), formCaptures: caps })
    expect(screen.queryByText(/Fork it/)).toBeNull()
  })
})

describe('Next unreconciled', () => {
  // C01r is complete; C03r still misses the profile.
  const recipes2 = () => [
    pos('C01r', 'ET-LIN-01', { IsDesign: 'Y' }), inside('C01r', 'ET-LIN-01', 'ET-PROF-01'),
    pos('C01r', 'ET-TAPE-01'),
    pos('C03r', 'ET-LAMP', { IsDesign: 'Y' }),
  ]
  const caps = {
    ...captures,
    byPosition: {
      C01r: [{ elementTypeRef: 'ET-PROF-01', code: 'A', manufacturer: 'M' }, { elementTypeRef: 'ET-TAPE-01', code: 'B', manufacturer: 'M' }],
      C03r: [{ elementTypeRef: 'ET-PROF-01', code: 'A', manufacturer: 'M' }],
    },
  }

  test('jumps to the next position the Form is not satisfied on', () => {
    setup({ recipes: recipes2(), formCaptures: caps })
    fireEvent.click(screen.getByText(/Next unreconciled/))
    expect(useStore.getState().activePositionRef).toBe('C03r')
  })

  test('hidden when everything is reconciled', () => {
    const done = { ...captures, byPosition: { C01r: [{ elementTypeRef: 'ET-PROF-01', code: 'A' }] } }
    setup({ recipes: recipes2(), formCaptures: done })
    expect(screen.queryByText(/Next unreconciled/)).toBeNull()
  })

  test('hidden in embedded mode — ReviewModal owns its own prev/next', () => {
    useStore.setState({
      projectId: 42, recipes: recipes2(), containerETRefs: new Set(['et-lin-01']),
      formCaptures: caps, psRows: [], elementTypes: [], rsChanges: [], past: [], future: [],
      activeContextType: 'PositionType', activeETRef: null, recipeError: null, dbWriteEnabled: false,
    })
    render(<FormSpecPane posRef="C01r" embedded />)
    expect(screen.queryByText(/Next unreconciled/)).toBeNull()
  })
})

/**
 * The pane could state a problem and its own answer side by side without noticing:
 * a red "1 product with no ElementType" (Light Sheet Custom / Applelec) next to a grey
 * "Not specified by the Form" (ET-LS-01). Same product. The only button was "Create",
 * which would mint a duplicate of something already in the recipe.
 */
describe('a pending Form product can be merged into an ElementType you already have', () => {
  const pendingCaps = {
    ...captures,
    byPosition: { C01r: [] },
    pendingByPosition: {
      C01r: [{ code: 'Light Sheet Custom', manufacturer: 'Applelec', note: 'backlit', formRef: 'C01' }],
    },
  }
  // ET-LS-01 is in the recipe and the Form cannot account for it — it IS the pending product
  const withLS = () => [pos('C01r', 'ET-LS-01')]

  beforeEach(() => { vi.clearAllMocks() })

  test('the unaccounted-for recipe row is offered as the answer', () => {
    setup({ recipes: withLS(), containerETRefs: new Set(), formCaptures: pendingCaps })
    expect(screen.getByText('1 product with no ElementType')).toBeInTheDocument()
    expect(screen.getByText('already in this recipe, not accounted for by the Form')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /That's it/ })).toBeInTheDocument()
  })

  test("clicking \"That's it\" links it, and stamps the identity so it survives a re-import", async () => {
    setup({
      recipes: withLS(), containerETRefs: new Set(), formCaptures: pendingCaps,
      psRows: [{ _id: 'p1', ElementTypeRef: 'ET-LS-01', Manufacturer: '', ProductCode: '' }],
    })
    fireEvent.click(screen.getByRole('button', { name: /That's it/ }))

    await vi.waitFor(() => {
      const fc = useStore.getState().formCaptures
      expect(fc.pendingByPosition.C01r).toBeUndefined()            // blocker cleared
      expect(fc.byPosition.C01r[0].elementTypeRef).toBe('ET-LS-01')
    })
    // the empty spec row was stamped, so findProductET resolves it for ever
    const ps = useStore.getState().psRows.find(r => r.ElementTypeRef === 'ET-LS-01')
    expect(ps.ProductCode).toBe('Light Sheet Custom')
    expect(ps.Manufacturer).toBe('Applelec')
  })

  test('a wrapper is never offered — merging the Form product onto the assembly is a category error', () => {
    // the only extra is the wrapper itself
    setup({
      recipes: [pos('C01r', 'ET-LIN-01', { IsDesign: 'Y' })],
      containerETRefs: new Set(['et-lin-01']),
      formCaptures: pendingCaps,
    })
    expect(screen.getByText('1 product with no ElementType')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /That's it/ })).toBeNull()
  })

  test('there is always a manual way out', () => {
    setup({ recipes: withLS(), containerETRefs: new Set(), formCaptures: pendingCaps })
    expect(screen.getByRole('button', { name: /Pick existing/ })).toBeInTheDocument()
  })
})
