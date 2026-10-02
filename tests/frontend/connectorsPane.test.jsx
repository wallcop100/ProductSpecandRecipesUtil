import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react'

let nextId = 1
window.electronAPI = { db: {
  setPref: vi.fn().mockResolvedValue(undefined),
  getPref: vi.fn().mockResolvedValue(null),
  upsertCollection: vi.fn(async (_p, c) => ({ ...c, CollectionId: c.CollectionId || `c${nextId++}` })),
  deleteCollection: vi.fn().mockResolvedValue(undefined),
} }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))

const { default: useStore } = await import('../../src/store/useStore.js')
const { default: ConnectorsPane } = await import('../../src/components/ConnectorsPane.jsx')

let n = 0
const pos = (p, ref, extra = {}) => ({ _id: `r${n++}`, _row_num: 1, PositionTypeRef: p, ContextType: 'PositionType', ContextRef: p, ElementTypeRef: ref, Quantity: 1, ...extra })
const inside = (p, wrapper, ref) => ({ _id: `r${n++}`, _row_num: 1, PositionTypeRef: p, ContextType: 'ElementType', ContextRef: wrapper, ElementTypeRef: ref, Quantity: 1 })
function recipes() {
  const out = []
  for (const p of ['A01', 'A02', 'A03']) out.push(pos(p, `ET-DL-${p}`, { IsDesign: 'Y' }), pos(p, 'ET-5PIN-SOCKET'), pos(p, 'ET-5PIN-SR'), inside(p, `ET-DL-${p}`, 'ET-5PIN-PLUG'))
  out.push(pos('A04', 'ET-DL-A04', { IsDesign: 'Y' }), pos('A04', 'ET-5PIN-SOCKET'), inside('A04', 'ET-DL-A04', 'ET-5PIN-PLUG'))
  out.push(pos('A01', 'ET-5PIN-SR-IP'))
  return out
}
const T1 = { CollectionId: 't1', Name: '5-pin local', Ingredients: JSON.stringify([
  { ElementTypeRef: 'ET-5PIN-SOCKET', section: 'position', quantity: 1 },
  { ElementTypeRef: 'ET-5PIN-SR', section: 'position', quantity: 1 },
  { ElementTypeRef: 'ET-5PIN-PLUG', section: 'dl_internal', quantity: 1 },
]), Tags: '[]' }
const T2 = { CollectionId: 't2', Name: 'Remote', Ingredients: JSON.stringify([{ ElementTypeRef: 'ET-2PIN-REMOTE-SOCKET', section: 'position', quantity: 1 }]), Tags: '[]' }

function setup(over = {}) {
  useStore.setState({
    projectId: 1, positionTypes: ['A01', 'A02', 'A03', 'A04'].map(r => ({ PositionTypeRef: r })), recipes: recipes(), positionUI: {}, ignoredPositionFamilies: [],
    elementTypes: ['ET-5PIN-SOCKET', 'ET-5PIN-SR', 'ET-5PIN-SR-IP', 'ET-5PIN-PLUG', 'ET-2PIN-REMOTE-SOCKET'].map(r => ({ ElementTypeRef: r, Family: 'ET-CONNECTORS' })),
    psRows: [], etCollections: [T1, T2], connectorPins: { t1: ['A01', 'A02', 'A03', 'A04'], t2: [] }, connectorExcludes: {}, connectorFamilies: [],
    past: [], future: [], rsChanges: [], psChanges: [], dbChanges: [], containerETRefs: new Set(),
    activeContextType: 'PositionType', activeETRef: null,
    ...over,
  })
}

describe('the drawer\'s Connectors tab, for one position', () => {
  test('which template, and its missing part added in one click', () => {
    setup()
    render(<ConnectorsPane posRef="A04" />)
    expect(screen.getByTestId('connector-template')).toHaveTextContent('5-pin local · pinned here')
    fireEvent.click(within(screen.getByTestId('cell-detail')).getByRole('button', { name: '+ Add' }))
    expect(useStore.getState().recipes.some(r => r.PositionTypeRef === 'A04' && r.ElementTypeRef === 'ET-5PIN-SR' && r.IsDeleted !== 'Y')).toBe(true)
  })

  test('switch to another template (pinned), or take it out of this one', async () => {
    setup()
    render(<ConnectorsPane posRef="A04" />)
    fireEvent.click(screen.getByLabelText('Connector template options'))
    await act(async () => { fireEvent.click(await screen.findByText('Remote')) })
    expect(useStore.getState().connectorPins.t2).toEqual(['A04'])
    expect(useStore.getState().connectorPins.t1).not.toContain('A04')
  })

  test('Not this template', async () => {
    setup()
    render(<ConnectorsPane posRef="A04" />)
    fireEvent.click(screen.getByLabelText('Connector template options'))
    await act(async () => { fireEvent.click(await screen.findByTestId('not-this-template')) })
    expect(useStore.getState().connectorExcludes.t1).toContain('A04')
  })

  test('changing the template asks first, naming every position it changes', async () => {
    setup()
    render(<ConnectorsPane posRef="A01" />)
    fireEvent.click(screen.getByTestId('tpl-add-part'))                        // the extra ET-5PIN-SR-IP
    expect(await screen.findByTestId('template-change-confirm')).toHaveTextContent('for 4 positions')
    expect(screen.getByTestId('template-change-confirm')).toHaveTextContent('A01, A02, A03, A04')
    fireEvent.click(screen.getByText('Cancel'))
    expect(useStore.getState().etCollections.find(c => c.CollectionId === 't1').Ingredients).toBe(T1.Ingredients)
    fireEvent.click(screen.getByTestId('tpl-add-part'))
    await act(async () => { fireEvent.click(await screen.findByTestId('template-change-ok')) })
    const ing = useStore.getState().etCollections.find(c => c.CollectionId === 't1').Ingredients
    expect(JSON.stringify(ing)).toContain('ET-5PIN-SR-IP')
  })

  test('no template: the nearest is offered and Use pins it; or make one from this position', async () => {
    setup({ connectorPins: { t1: ['A01', 'A02', 'A03'], t2: ['A02'] } })
    render(<ConnectorsPane posRef="A04" />)
    const near = screen.getAllByTestId('nearest-template')[0]
    expect(near).toHaveTextContent('5-pin local · 1 part off')
    await act(async () => { fireEvent.click(within(near).getByText('Use')) })
    expect(useStore.getState().connectorPins.t1).toContain('A04')
  })

  test('make a template from this position', async () => {
    setup({ etCollections: [], connectorPins: {} })
    render(<ConnectorsPane posRef="A04" />)
    fireEvent.change(screen.getByLabelText('Template name'), { target: { value: 'A04 kit' } })
    await act(async () => { fireEvent.click(screen.getByTestId('make-template')) })
    const made = useStore.getState().etCollections.find(c => c.Name === 'A04 kit')
    expect(made).toBeTruthy()
    expect(useStore.getState().connectorPins[made.CollectionId]).toEqual(['A04'])
  })

  test('the drawer: a Connectors tab with a dot when the open position has gaps; the banner\'s details opens it', async () => {
    const { default: BuilderScreen } = await import('../../src/screens/BuilderScreen.jsx')
    setup({ activePositionRef: 'A04', rootView: 'positions', dbCollectionRefs: [], validationResults: [], templates: [], favorites: [], selectedRowIds: [], drawerTab: 'form', drawerOpen: true })
    render(<BuilderScreen onBackToSetup={vi.fn()} onOpenProductSpec={vi.fn()} onOpenTemplateEditor={vi.fn()} onOpenCodeImport={vi.fn()} onOpenConnectors={vi.fn()} />)
    expect(screen.getByTestId('connector-gap-dot')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('connector-details'))
    expect(useStore.getState().drawerTab).toBe('connectors')
    expect(screen.getByTestId('connectors-pane')).toBeInTheDocument()
  })

  test('type by type: a new template for this position and the ones built the same way with no template yet', async () => {
    setup({ etCollections: [], connectorPins: {} })
    render(<ConnectorsPane posRef="A02" />)
    const card = screen.getByTestId('suggested-template')
    await act(async () => { fireEvent.click(within(card).getByTestId('make-template')) })
    const made = useStore.getState().etCollections[0]
    const pins = useStore.getState().connectorPins[made.CollectionId] || []
    expect(pins.length ? [...pins].sort() : 'by rule').toEqual(pins.length ? ['A02', 'A03'] : 'by rule')
  })

  test('a position built exactly like a template joins it by itself; one taken out stays out', async () => {
    const { default: ConnectorAutoJoin } = await import('../../src/components/ConnectorAutoJoin.jsx')
    setup({ connectorPins: { t1: ['A02'] }, etCollections: [T1] })
    const view = render(<ConnectorAutoJoin />)
    await waitFor(() => expect(useStore.getState().connectorPins.t1).toContain('A03'))   // joined by itself
    view.unmount()
    setup({ connectorPins: { t1: ['A02'] }, connectorExcludes: { t1: ['A03'] }, etCollections: [T1] })
    render(<ConnectorAutoJoin />)
    await new Promise(r => setTimeout(r, 50))
    const pins = useStore.getState().connectorPins.t1
    expect(pins).not.toContain('A03')      // taken out
    expect(pins).not.toContain('A01')      // has an extra part
    expect(pins).not.toContain('A04')      // lacks the SR
  })
})
