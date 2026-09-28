import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'

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
const G = await import('../../src/utils/connectorGroups.js')
const { default: ConnectorsScreen } = await import('../../src/screens/ConnectorsScreen.jsx')
const { default: ConnectorBoard } = await import('../../src/components/ConnectorBoard.jsx')

let n = 0
const pos = (p, ref, extra = {}) => ({ _id: `r${n++}`, _row_num: 1, PositionTypeRef: p, ContextType: 'PositionType', ContextRef: p, ElementTypeRef: ref, Quantity: 1, ...extra })
const inside = (p, wrapper, ref, extra = {}) => ({ _id: `r${n++}`, _row_num: 1, PositionTypeRef: p, ContextType: 'ElementType', ContextRef: wrapper, ElementTypeRef: ref, Quantity: 1, ...extra })

// A01–A03: 5-pin local (site socket + SR, plug inside DL). A04: same but no SR (a near miss).
// B01–B02: remote (2-pin remote socket + plug inside).
function recipes() {
  const out = []
  for (const p of ['A01', 'A02', 'A03']) out.push(pos(p, `ET-DL-${p}`, { IsDesign: 'Y' }), pos(p, 'ET-5PIN-SOCKET'), pos(p, 'ET-5PIN-SR'), inside(p, `ET-DL-${p}`, 'ET-5PIN-PLUG'), inside(p, `ET-DL-${p}`, 'ET-PS-01'))
  out.push(pos('A04', 'ET-DL-A04', { IsDesign: 'Y' }), pos('A04', 'ET-5PIN-SOCKET'), inside('A04', 'ET-DL-A04', 'ET-5PIN-PLUG'))
  for (const p of ['B01', 'B02']) out.push(pos(p, `ET-DL-${p}`, { IsDesign: 'Y' }), inside(p, `ET-DL-${p}`, 'ET-2PIN-REMOTE-SOCKET'), inside(p, `ET-DL-${p}`, 'ET-2PIN-REMOTE-PLUG'))
  return out
}
const PTS = ['A01', 'A02', 'A03', 'A04', 'B01', 'B02'].map(r => ({ PositionTypeRef: r }))

function setup(over = {}) {
  useStore.setState({
    projectId: 1, positionTypes: PTS, recipes: recipes(), positionUI: {}, ignoredPositionFamilies: [],
    elementTypes: ['ET-5PIN-SOCKET', 'ET-5PIN-SR', 'ET-5PIN-SR-IP', 'ET-5PIN-PLUG', 'ET-2PIN-REMOTE-SOCKET', 'ET-2PIN-REMOTE-PLUG', 'ET-PS-01']
      .map(r => ({ ElementTypeRef: r, Family: r.startsWith('ET-PS') ? 'ET-PS' : 'ET-CONNECTORS' })),
    psRows: [], etCollections: [], connectorPins: {}, connectorFamilies: [],
    past: [], future: [], rsChanges: [], psChanges: [], dbChanges: [], containerETRefs: new Set(),
    activeContextType: 'PositionType', activeETRef: null,
    ...over,
  })
}

describe('connector groups (pure)', () => {
  beforeEach(() => setup())

  test('signatures read site parts and the wrapper’s, and ignore non-connectors', () => {
    const sig = G.connectorSignature(useStore.getState().recipes, 'A01')
    expect(sig).toEqual([
      { ref: 'ET-5PIN-SOCKET', section: 'position', quantity: 1 },
      { ref: 'ET-5PIN-SR', section: 'position', quantity: 1 },
      { ref: 'ET-5PIN-PLUG', section: 'internal', quantity: 1 },
    ])
  })

  test('positions with the same connectors form a group, biggest first', () => {
    const groups = G.findGroups(G.signatures(PTS, useStore.getState().recipes))
    expect(groups.map(g => g.positions)).toEqual([['A01', 'A02', 'A03'], ['B01', 'B02'], ['A04']])
  })

  test('near misses and diffs', () => {
    const s = useStore.getState()
    const sigs = G.signatures(PTS, s.recipes)
    const want = sigs.get('A01')
    const miss = G.nearMisses(want, sigs)
    expect(miss.map(m => m.posRef)).toEqual(['A04'])
    expect(miss[0].diff.add.map(p => p.ref)).toEqual(['ET-5PIN-SR'])
  })

  test('membership: pins win, a pinned position leaves other filters, two filters clash', () => {
    const cs = [
      { CollectionId: 'x', ApplicableTags: ['Local'], ExcludedTags: [] },
      { CollectionId: 'y', ApplicableTags: ['Local'], ExcludedTags: [] },
      { CollectionId: 'z', ApplicableTags: [], ExcludedTags: [] },
    ]
    const m = G.membership(['A01', 'A02'], cs, { z: ['B01'], x: ['A02'] }, () => ['Local'])
    expect(m.get('A02')).toEqual({ templates: ['x'], pinnedTo: 'x', clash: false })
    // z has pins and no filter: it adds nobody by filter. x and y both match A01.
    expect(m.get('A01').templates).toEqual(['x', 'y'])
    expect(m.get('A01').clash).toBe(true)
  })
})

describe('store: make, apply to group, fork and split', () => {
  beforeEach(() => setup())

  test('a group becomes a template pinned to its positions', async () => {
    const parts = G.connectorSignature(useStore.getState().recipes, 'A01')
    const saved = await useStore.getState().makeTemplateFromGroup('5-pin local', parts, ['A01', 'A02', 'A03'])
    expect(useStore.getState().connectorPins[saved.CollectionId]).toEqual(['A01', 'A02', 'A03'])
    expect(window.electronAPI.db.setPref).toHaveBeenCalledWith(1, 'connector_pins', expect.stringContaining('A01'))
  })

  test('changing the template and applying swaps the part on every position, in one Undo', async () => {
    const parts = G.connectorSignature(useStore.getState().recipes, 'A01')
    const saved = await useStore.getState().makeTemplateFromGroup('5-pin', parts, ['A01', 'A02', 'A03', 'A04'])
    // Swap the SR for its IP version in the template.
    const next = parts.map(p => (p.ref === 'ET-5PIN-SR' ? { ...p, ref: 'ET-5PIN-SR-IP' } : p))
    await useStore.getState().updateCollection(saved.CollectionId, { Ingredients: G.partsToIngredients(next) })
    const pastBefore = useStore.getState().past.length
    const plan = useStore.getState().applyTemplateToPositions(saved.CollectionId, ['A01', 'A02', 'A03', 'A04'])
    expect(plan).toHaveLength(4)
    for (const p of ['A01', 'A02', 'A03', 'A04']) {
      expect(G.connectorSignature(useStore.getState().recipes, p).map(x => x.ref)).toEqual(['ET-5PIN-SOCKET', 'ET-5PIN-SR-IP', 'ET-5PIN-PLUG'])
    }
    expect(useStore.getState().past.length).toBe(pastBefore + 1)
    useStore.getState().undo()
    expect(G.connectorSignature(useStore.getState().recipes, 'A04').map(x => x.ref)).toEqual(['ET-5PIN-SOCKET', 'ET-5PIN-PLUG'])
  })

  test('split moves the chosen positions to a fork of the template', async () => {
    const parts = G.connectorSignature(useStore.getState().recipes, 'A01')
    const saved = await useStore.getState().makeTemplateFromGroup('5-pin', parts, ['A01', 'A02', 'A03'])
    const fork = await useStore.getState().forkTemplate(saved.CollectionId, { name: '5-pin corridor', positions: ['A03'] })
    const pins = useStore.getState().connectorPins
    expect(pins[saved.CollectionId]).toEqual(['A01', 'A02'])
    expect(pins[fork.CollectionId]).toEqual(['A03'])
    expect(G.templateParts(useStore.getState().etCollections.find(c => c.CollectionId === fork.CollectionId))).toEqual(parts)
  })
})

describe('Connectors screen', () => {
  beforeEach(() => setup())

  test('groups found become templates; the group panel makes a near miss match', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('5-pin local')
    render(<ConnectorsScreen onBack={() => {}} />)
    const found = screen.getAllByTestId('found-group')
    expect(found).toHaveLength(3)
    expect(found[0]).toHaveTextContent('3 positions')
    await act(async () => { fireEvent.click(within(found[0]).getByText('Make template')) })
    const panel = await screen.findByTestId('template-group-panel')
    expect(within(panel).getByText('Positions (3)')).toBeInTheDocument()
    const misses = within(panel).getByTestId('near-misses')
    expect(misses).toHaveTextContent('A04')
    await act(async () => { fireEvent.click(within(misses).getByText('Bring into line')) })
    expect(screen.getByTestId('apply-preview')).toHaveTextContent('+ ET-5PIN-SR')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Apply' })) })
    expect(G.connectorSignature(useStore.getState().recipes, 'A04').map(p => p.ref)).toContain('ET-5PIN-SR')
  })
})

describe('ConnectorBoard', () => {
  test('parts go into lanes from the palette, with quantities', () => {
    setup()
    let parts = []
    const onChange = p => { parts = p; rerender(<ConnectorBoard parts={parts} onChange={onChange} />) }
    const { rerender } = render(<ConnectorBoard parts={parts} onChange={onChange} />)
    expect(screen.getByTestId('connector-palette')).toHaveTextContent('ET-5PIN-SOCKET')
    expect(screen.getByTestId('connector-palette')).not.toHaveTextContent('ET-PS-01')
    fireEvent.click(screen.getByLabelText('Add ET-5PIN-SOCKET to Site'))
    fireEvent.click(screen.getByLabelText('Add ET-5PIN-PLUG inside wrapper'))
    fireEvent.click(screen.getByLabelText('More ET-5PIN-PLUG'))
    expect(parts).toEqual([
      { ref: 'ET-5PIN-SOCKET', section: 'position', quantity: 1 },
      { ref: 'ET-5PIN-PLUG', section: 'internal', quantity: 2 },
    ])
    expect(within(screen.getByTestId('lane-internal')).getByText('ET-5PIN-PLUG')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Remove ET-5PIN-SOCKET'))
    expect(parts.map(p => p.ref)).toEqual(['ET-5PIN-PLUG'])
  })
})
