import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'

window.electronAPI = { db: {
  setPref: vi.fn().mockResolvedValue(undefined), getPref: vi.fn().mockResolvedValue(null),
  upsertCollection: vi.fn(async (_p, c) => ({ ...c, CollectionId: c.CollectionId || 'c1' })),
} }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))
const { default: useStore } = await import('../../src/store/useStore.js')
const { default: NewETModal } = await import('../../src/components/NewETModal.jsx')
const { default: CellDetailPanel } = await import('../../src/components/CellDetailPanel.jsx')
const { DEFAULT_CONNECTOR_FAMILIES } = await import('../../src/utils/connectorGroups.js')

let n = 0
const pos = (p, ref, extra = {}) => ({ _id: `r${n++}`, _row_num: 1, PositionTypeRef: p, ContextType: 'PositionType', ContextRef: p, ElementTypeRef: ref, Quantity: 1, ...extra })
const inside = (p, w, ref) => ({ _id: `r${n++}`, _row_num: 1, PositionTypeRef: p, ContextType: 'ElementType', ContextRef: w, ElementTypeRef: ref, Quantity: 1 })
const base = over => useStore.setState({
  projectId: 1, dbChanges: [], psChanges: [], rsChanges: [], past: [], future: [], psRows: [], positionUI: {},
  activeContextType: 'PositionType', activeETRef: null, recipeError: null, connectorFamilies: ['ET-CONNECTORS'],
  elementTypes: [{ ElementTypeRef: 'ET-PHOS-2PIN', Family: 'ET-CONNECTORS' }, { ElementTypeRef: 'ET-DL-05' }, { ElementTypeRef: 'ET-PS-09', Family: 'ET-PS' }],
  containerETRefs: new Set(['et-dl-05', 'ET-DL-05']),
  positionTypes: [{ PositionTypeRef: 'A05' }, { PositionTypeRef: 'A05E' }, { PositionTypeRef: 'A07w' }],
  ...over,
})
const TEMPLATE = { CollectionId: 'c1', Name: 'Phos', Ingredients: [
  { ElementTypeRef: 'ET-PHOS-2PIN', section: 'position', quantity: 1 },
  { ElementTypeRef: 'ET-PHOS-2PIN', section: 'dl_internal', quantity: 1 },
] }

describe('M9KG9A: connector families', () => {
  test('ET-CONNECTORS is ticked until the project chooses', () => {
    expect(DEFAULT_CONNECTOR_FAMILIES).toEqual(['ET-CONNECTORS'])
  })
})

describe('GX9RLV: a new family from the New ElementType window', () => {
  test('typing a family the project does not have creates its row too', async () => {
    base()
    render(<NewETModal show onHide={vi.fn()} onCreated={vi.fn()} />)
    fireEvent.change(screen.getByPlaceholderText('e.g. ET-TAPE-004'), { target: { value: 'ET-GLAND-01' } })
    fireEvent.change(screen.getByPlaceholderText('e.g. TAPE, PROFILE, CLIP…'), { target: { value: 'ET-GLAND' } })
    expect(screen.getByTestId('new-family')).toHaveTextContent('New family ET-GLAND')
    fireEvent.change(screen.getByLabelText('Parent family'), { target: { value: 'ET-CONNECTORS' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Create Element Type' })) })
    const ets = useStore.getState().elementTypes
    expect(ets.find(e => e.ElementTypeRef === 'ET-GLAND')).toMatchObject({ IsCollection: 'Y', Family: 'ET-CONNECTORS' })
    expect(ets.find(e => e.ElementTypeRef === 'ET-GLAND-01')).toMatchObject({ Family: 'ET-GLAND' })
  })
})

describe('FWEJ93 / CLMJX9: the connector cell, slot by slot', () => {
  test('the same ref in the wrong layer is "found on site", not present; Move puts it right', () => {
    // A05E: shared wrapper ET-DL-05 (internals under A05); ET-PHOS-2PIN only on site, twice wanted.
    base({ etCollections: [TEMPLATE], recipes: [
      pos('A05', 'ET-DL-05', { IsDesign: 'Y' }), inside('A05', 'ET-DL-05', 'ET-PS-09'),
      pos('A05E', 'ET-DL-05', { IsDesign: 'Y' }), pos('A05E', 'ET-PHOS-2PIN'),
    ] })
    render(<CellDetailPanel posRef="A05E" collectionId="c1" onClose={vi.fn()} onSwap={vi.fn()} />)
    expect(screen.getByText('1/2 ingredients present')).toBeInTheDocument()
    // The site one is present; the wrapper one is missing (the site copy is claimed by its own slot).
    const add = screen.getAllByRole('button', { name: /\+ Add/ })
    expect(add).toHaveLength(1)
    fireEvent.click(add[0])
    expect(screen.getByText('2/2 ingredients present')).toBeInTheDocument()
    // Remove takes it out of one place only.
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])
    expect(useStore.getState().recipes.filter(r => r.ElementTypeRef === 'ET-PHOS-2PIN' && r.IsDeleted !== 'Y')).toHaveLength(1)
  })

  test('a part for inside the wrapper cannot be added where there is no wrapper', () => {
    base({ etCollections: [TEMPLATE], recipes: [pos('A07w', 'ET-PS-09', { IsDesign: 'Y' })] })
    render(<CellDetailPanel posRef="A07w" collectionId="c1" onClose={vi.fn()} onSwap={vi.fn()} />)
    const adds = screen.getAllByRole('button', { name: /\+ Add/ })
    expect(adds[1]).toBeDisabled()
    expect(adds[1].title).toMatch(/no design element/)
    expect(screen.getByText('no wrapper on this position')).toBeInTheDocument()
  })

  test('a refused add on another position does not follow you (Y7QVN4)', () => {
    base({ recipes: [pos('A07w', 'ET-PS-09', { IsDesign: 'Y' }), pos('A05', 'ET-DL-05', { IsDesign: 'Y' })], activePositionRef: 'A07w' })
    useStore.getState().addRecipeRow('A07w', 'dl_internal', { elementTypeRef: 'ET-PHOS-2PIN' }, { asPosition: true })
    expect(useStore.getState().recipeError).toMatch(/A07w/)
    useStore.getState().setActivePosition('A05')
    expect(useStore.getState().recipeError).toBeNull()
  })
})
