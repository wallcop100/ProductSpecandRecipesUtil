import { describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'

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
  // Only OUR key. Clearing all of localStorage also clears rb-tutorial-seen, which re-arms
  // the pane's auto-opening tutorial card — a second dialog in every getByRole('dialog').
  window.localStorage.removeItem('rb-form-columns')
  useStore.setState({
    projectId: 42, recipes: recipes(), containerETRefs: new Set(['et-lin-01']),
    formCaptures: captures, psRows: [], elementTypes: [], rsChanges: [], past: [], future: [],
    // psRows can be overridden per-test to exercise the shopping-list lookup
    activeContextType: 'PositionType', activeETRef: null, recipeError: null, dbWriteEnabled: false,
    ...over,
  })
  return render(<FormSpecPane posRef="C01r" />)
}

const openMenu = () => fireEvent.click(screen.getByTitle('Form template options'))

describe('FormSpecPane renders the Form beside the recipe', () => {
  beforeEach(() => { vi.clearAllMocks() })

  test('design A: no rail, no column picker, no X/Y count', () => {
    setup()
    expect(screen.queryByLabelText('What the Form itself says about this position')).toBeNull()
    expect(screen.queryByText(/present$/)).toBeNull()
    openMenu()
    expect(screen.queryByText('Show columns…')).toBeNull()
    expect(screen.queryByText('Paint from the Form')).toBeNull()
  })

  test('names the source workbook', () => {
    setup()
    expect(screen.getByText(/5642 - Form V3\.6\.xlsx/)).toBeInTheDocument()
  })

  test('a Form product INSIDE the wrapper reads as present, not misplaced', () => {
    setup()
    expect(screen.getByText('FPS2020BG2000')).toBeInTheDocument()
    expect(screen.getByTitle('Inside ET-LIN-01')).toBeInTheDocument()
    expect(screen.queryByText(/misplaced/i)).toBeNull()
  })

  test('an absent Form product is missing and offers one-click adds', () => {
    setup()
    expect(within(screen.getByTestId('missing-card')).getByText('LL240272024')).toBeInTheDocument()
    expect(screen.getByLabelText('Add ET-TAPE-01 at position level')).toBeInTheDocument()
    expect(screen.getByLabelText('Add ET-TAPE-01 inside ET-LIN-01')).toBeInTheDocument()
  })

  /**
   * The divergence line was the most useful sentence the popover knew, and you could only
   * reach it by hovering the exact ref you already suspected. It is now marked on the row.
   */
  test('3C3VTE: a disagreement is told on the row\'s status icon, with no second warning sign', async () => {
    // C03r's recipe holds ET-TAPE-01; the Form only asks for it on C01r.
    setup({ recipes: [...recipes(), pos('C03r', 'ET-TAPE-01')] })
    // The tip is a styled tooltip (report 32), shown on hover, not a native title.
    for (const i of document.querySelectorAll('i.material-icons')) fireEvent.mouseOver(i)
    expect((await screen.findAllByText(/the Form and the recipe disagree/i)).length).toBeGreaterThan(0)
    expect(screen.queryByLabelText(/the Form and the recipe disagree/i)).not.toBeInTheDocument()
  })

  test('an ET they agree about carries no warning', () => {
    setup({ recipes: [...recipes(), pos('C01r', 'ET-TAPE-01')] })
    expect(screen.queryByTitle(/the Form and the recipe disagree/i)).not.toBeInTheDocument()
  })

  test('recipe rows absent from the Form are derived detail, never errors', () => {
    setup()
    // Folded behind "show N": the socket and the wrapper itself.
    expect(screen.queryByText('ET-2PIN-SOCK')).toBeNull()
    fireEvent.click(screen.getByText('show 2'))
    expect(within(screen.getByTestId('not-from-form')).getByText('ET-2PIN-SOCK')).toBeInTheDocument()
    expect(screen.queryByTestId('missing-card') && screen.getAllByTestId('missing-card').some(c => c.textContent.includes('ET-2PIN-SOCK'))).toBe(false)
  })

  test('one click adds at position level — no preview', () => {
    setup()
    const before = useStore.getState().recipes.length
    fireEvent.click(screen.getByLabelText('Add ET-TAPE-01 at position level'))
    expect(useStore.getState().recipes).toHaveLength(before + 1)
    const added = useStore.getState().recipes.find(r => r.ElementTypeRef === 'ET-TAPE-01')
    expect(added.ContextType).toBe('PositionType')
    expect(added.PositionTypeRef).toBe('C01r')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  test('one click adds inside the wrapper', () => {
    setup()
    fireEvent.click(screen.getByLabelText('Add ET-TAPE-01 inside ET-LIN-01'))
    const added = useStore.getState().recipes.find(r => r.ElementTypeRef === 'ET-TAPE-01')
    expect(added.ContextType).toBe('ElementType')
    expect(added.ContextRef).toBe('ET-LIN-01')
  })

  test('the add is confirmed inline, with Undo', () => {
    setup()
    const before = useStore.getState().recipes.length
    fireEvent.click(screen.getByLabelText('Add ET-TAPE-01 at position level'))
    const bar = screen.getByTestId('form-added')
    expect(bar).toHaveTextContent('Added ET-TAPE-01')
    fireEvent.click(within(bar).getByText('Undo'))
    expect(useStore.getState().recipes).toHaveLength(before)
  })

  test('a position with no wrapper offers only the position button', () => {
    setup({ recipes: [pos('C01r', 'ET-LAMP', { IsDesign: 'Y' })], containerETRefs: new Set() })
    expect(screen.getAllByLabelText(/at position level/)).toHaveLength(2)
    expect(screen.queryByLabelText(/inside/)).toBeNull()
  })

  test('Add all adds every missing product as one undo step', () => {
    setup({ recipes: [pos('C01r', 'ET-LAMP', { IsDesign: 'Y' })], containerETRefs: new Set() })
    const before = useStore.getState().recipes.length
    fireEvent.click(screen.getByText(/Add all 2/))
    expect(useStore.getState().recipes).toHaveLength(before + 2)
    fireEvent.click(within(screen.getByTestId('form-added')).getByText('Undo'))
    expect(useStore.getState().recipes).toHaveLength(before)
  })

  test('Add all puts a product where it usually sits in other recipes', () => {
    // ET-TAPE-01 sits inside a wrapper on another position, so it goes inside here too.
    setup({ recipes: [...recipes(), inside('C09r', 'ET-LIN-09', 'ET-TAPE-01')] })
    expect(screen.getByLabelText('Add ET-TAPE-01 inside ET-LIN-01').className).toMatch(/btn-primary/)
    fireEvent.click(screen.getByLabelText('Add ET-TAPE-01 inside ET-LIN-01'))
    const added = useStore.getState().recipes.find(r => r.ElementTypeRef === 'ET-TAPE-01' && r.PositionTypeRef === 'C01r')
    expect(added.ContextRef).toBe('ET-LIN-01')
  })

  test('Form adds go to this position even if a wrapper recipe was open elsewhere', () => {
    setup({ activeContextType: 'ElementType', activeETRef: 'ET-DL-99' })
    fireEvent.click(screen.getByLabelText('Add ET-TAPE-01 at position level'))
    const added = useStore.getState().recipes.filter(r => r.ElementTypeRef === 'ET-TAPE-01')
    expect(added).toHaveLength(1)
    expect(added[0].PositionTypeRef).toBe('C01r')
    expect(added[0].ContextType).toBe('PositionType')
  })

  test('a position whose design element is not a wrapper is not offered one', () => {
    setup({ recipes: [pos('C01r', 'ET-LAMP', { IsDesign: 'Y' })], containerETRefs: new Set() })
    expect(screen.queryByTestId('no-wrapper')).toBeNull()                 // nothing to offer
  })

  test('a blank position offers a wrapper; the kind that fits the Form is filled', () => {
    setup({ recipes: [], containerETRefs: new Set(), elementTypes: [{ ElementTypeRef: 'ET-LIN-04' }] })
    // [+ DL] [+ LIN]: the kind that fits the Form (tape + profile → linear) is filled.
    const lin = within(screen.getByTestId('no-wrapper')).getByText('+ LIN')
    expect(lin.className).toMatch(/btn-primary/)
    fireEvent.click(lin)
    const st = useStore.getState()
    const row = st.recipes.find(r => r.PositionTypeRef === 'C01r')
    expect(row.ElementTypeRef).toBe('ET-LIN-05')
    expect(row.IsDesign).toBe('Y')
    expect(st.containerETRefs.has('et-lin-05')).toBe(true)
    expect(st.elementTypes.find(e => e.ElementTypeRef === 'ET-LIN-05').Family).toBe('ET-LIN')
    expect(st.psRows.find(r => r.ElementTypeRef === 'ET-LIN-05')).toMatchObject({ Manufacturer: 'Ideaworks', ProductCode: 'N/A' })
    // ...and the Form products can now go inside it.
    expect(screen.getByLabelText('Add ET-TAPE-01 inside ET-LIN-05')).toBeInTheDocument()
  })

  test('adding a wrapper is one undo step', () => {
    setup({ recipes: [], containerETRefs: new Set() })
    fireEvent.click(within(screen.getByTestId('no-wrapper')).getByText('+ DL'))
    expect(useStore.getState().recipes).toHaveLength(1)
    useStore.getState().undo()
    expect(useStore.getState().recipes).toHaveLength(0)
    expect(useStore.getState().psRows.some(r => r.ElementTypeRef === 'ET-DL-01')).toBe(false)
  })

  test('a code that left the Form is flagged, never deleted for you', () => {
    setup({ formCaptures: { ...captures, byPosition: { C01r: [] }, orphansByPosition: { C01r: ['ET-PROF-01'] } } })
    const row = screen.getByTestId('gone-row')
    expect(within(row).getByTestId('gutter')).toHaveTextContent('−')
    expect(within(row).getByText('Remove')).toBeInTheDocument()
    expect(useStore.getState().recipes.find(r => r.ElementTypeRef === 'ET-PROF-01')).toBeTruthy()
  })

  test('the pane says so when the Form is silent about this position', () => {
    setup({ formCaptures: { ...captures, byPosition: {}, contextByPosition: {} } })
    expect(screen.getByText(/The Form says nothing about C01r/)).toBeInTheDocument()
  })

  test('no Form attached: one clear prompt, not a blank panel', () => {
    setup({ formCaptures: null })
    expect(screen.getByText('No Form template yet')).toBeInTheDocument()
    expect(screen.getByText(/Import the whole Form template/)).toBeInTheDocument()
    expect(screen.getByTestId('paint-position').textContent).toMatch(/Load the Form and paint this position/)
  })

  test('the prompt starts stage ① by asking App to change screen', () => {
    setup({ formCaptures: null })
    fireEvent.click(screen.getByText(/Import the whole Form template/))
    expect(useStore.getState().pendingScreen).toBe('product-code-import')
  })

  test('embedded (Review modal) is not the place to start a workflow', () => {
    useStore.setState({ formCaptures: null, recipes: recipes(), containerETRefs: new Set(), psRows: [] })
    const { container } = render(<FormSpecPane posRef="C01r" embedded />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('manufacturer + product code are one identity', () => {
  test('the manufacturer is on the code, on hover (the entry header shows it too)', () => {
    setup()
    expect(screen.getByTitle('Flexalighting')).toHaveTextContent('FPS2020BG2000')
    expect(screen.getByTitle('Nichia')).toHaveTextContent('LL240272024')
  })

  test('a maker+code already in the spec is offered as a shopping-list add', () => {
    // The spec already names ET-TAPE-99 for Nichia / LL240272024.
    setup({ psRows: [{ ElementTypeRef: 'ET-TAPE-99', Manufacturer: 'Nichia', ProductCode: 'LL240272024' }] })
    expect(screen.queryByText('in the spec')).toBeNull()                       // VCYTLE: no badge
    // the spec's ET, not the captured one, as an orange pill on a missing card
    expect(within(screen.getByTestId('missing-card')).getByText('ET-TAPE-99')).toBeInTheDocument()
  })

  test('adding it adds the SPEC\'s ElementType, not the stale captured one', () => {
    setup({ psRows: [{ ElementTypeRef: 'ET-TAPE-99', Manufacturer: 'Nichia', ProductCode: 'LL240272024' }] })
    fireEvent.click(screen.getByLabelText('Add ET-TAPE-99 at position level'))
    expect(useStore.getState().recipes.some(r => r.ElementTypeRef === 'ET-TAPE-99')).toBe(true)
    expect(useStore.getState().recipes.some(r => r.ElementTypeRef === 'ET-TAPE-01')).toBe(false)
  })

  test('the same code under a DIFFERENT maker is not treated as the same product', () => {
    // The spec has this code, but from Phos. Our Form product is Nichia's.
    setup({ psRows: [
      { ElementTypeRef: 'ET-OTHER', Manufacturer: 'Phos', ProductCode: 'LL240272024' },
      { ElementTypeRef: 'ET-DECOY', Manufacturer: 'Acme', ProductCode: 'LL240272024' },
    ] })
    expect(within(screen.getByTestId('missing-card')).getByText('ET-TAPE-01')).toBeInTheDocument()
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
    openMenu()
    fireEvent.click(screen.getByText('Re-import'))
    expect(useStore.getState().pendingScreen).toBe('product-code-import')
  })

  test('Detach confirms, then clears the captures', async () => {
    setup()
    openMenu()
    fireEvent.click(screen.getByText('Detach'))
    expect(window.confirm).toHaveBeenCalled()
    await waitFor(() => expect(useStore.getState().formCaptures).toBeNull())
  })

  // Detach and Re-import moved into the ⋮ menu; that menu must exist in EVERY state the
  // pane can be in, or the Form becomes unremovable from the position you happen to be on.
  test('the menu is reachable even when the Form is silent about this position', () => {
    setup({ formCaptures: { ...captures, byPosition: {}, contextByPosition: {} } })
    expect(screen.getByText(/The Form says nothing about C01r/)).toBeInTheDocument()
    openMenu()
    expect(screen.getByText('Detach')).toBeInTheDocument()
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
    const box = screen.getByTestId('divergence')
    expect(within(box).getByText('ET-LIN-01')).toBeInTheDocument()
    expect(within(box).getByText('C03r')).toBeInTheDocument()   // a position pill
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

describe('design A drops Next / Back', () => {
  test('no Next unreconciled, no Back, no All present', () => {
    setup({ positionHistory: ['C09r'] })
    expect(screen.queryByText(/Next unreconciled/)).toBeNull()
    expect(screen.queryByText(/Back to/)).toBeNull()
    expect(screen.queryByTestId('form-all-present')).toBeNull()
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
    const c = screen.getByTestId('pending-card')
    expect(within(c).getByText('in the recipe, no Form code')).toBeInTheDocument()
    expect(within(c).getByText('ET-LS-01')).toBeInTheDocument()
    expect(within(c).getByRole('button', { name: 'Use' })).toBeInTheDocument()
  })

  test("clicking \"That's it\" links it, and stamps the identity so it survives a re-import", async () => {
    setup({
      recipes: withLS(), containerETRefs: new Set(), formCaptures: pendingCaps,
      psRows: [{ _id: 'p1', ElementTypeRef: 'ET-LS-01', Manufacturer: '', ProductCode: '' }],
    })
    fireEvent.click(screen.getByRole('button', { name: 'Use' }))

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
    expect(screen.getByTestId('pending-card')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Use' })).toBeNull()
  })

  test('there is always a manual way out', () => {
    setup({ recipes: withLS(), containerETRefs: new Set(), formCaptures: pendingCaps })
    expect(within(screen.getByTestId('pending-card')).getByRole('button', { name: /Existing/ })).toBeInTheDocument()
  })
})
