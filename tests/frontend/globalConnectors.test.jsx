import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
const G = await import('../../src/data/globalConnectors.js')
const { default: ConnectorsPane } = await import('../../src/components/ConnectorsPane.jsx')
const { WagoLibrary, WagoUpgradeBanner, wagoNameOf } = await import('../../src/components/GlobalConnectors.jsx')
const { templateParts } = await import('../../src/utils/connectorGroups.js')

const PT = (ref, ctl, loc) => ({ PositionTypeRef: ref, ControlTypeRef: ctl, DriverLocation: loc })
function setup(over = {}) {
  useStore.setState({
    projectId: 1, recipes: [], positionUI: {}, ignoredPositionFamilies: [],
    positionTypes: [PT('A01', 'DALI', 'Local to fitting'), PT('A02', 'DALI', 'Remote'), PT('A03', 'SWITCH', 'Local to fitting'), PT('A04', 'DMX', 'Remote')],
    elementTypes: [], localElementTypes: [], psRows: [], etCollections: [], connectorPins: {}, connectorExcludes: {}, connectorFamilies: [],
    past: [], future: [], rsChanges: [], psChanges: [], dbChanges: [], containerETRefs: new Set(),
    ...over,
  })
}

describe('the shipped global templates JSON (n8n rewrites it)', () => {
  test('it parses, is shaped, and ships no superseded code', () => {
    const json = JSON.parse(readFileSync(resolve(process.cwd(), 'src/data/globalTemplates.json'), 'utf8'))
    const c = json.connectors
    expect(c.source.pageId).toBeTruthy()
    expect(c.source.syncedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Array.isArray(c.templates) && Array.isArray(c.combos) && typeof c.superseded === 'object').toBe(true)
    const keys = new Set(c.templates.map(t => t.key))
    expect(keys.size).toBe(c.templates.length)
    // the keys the suggestion rules and combos name must still be there
    for (const s of G.SUGGESTIONS) for (const k of s.keys) expect(keys.has(k) || c.combos.some(x => x.key === k)).toBe(true)
    for (const t of c.templates) {
      expect(t.name && t.pins && t.site.length && t.driver.length).toBeTruthy()
      for (const p of [...t.site, ...t.driver]) {
        expect(['socket', 'plug', 'sr']).toContain(p.role)
        expect(p.code && p.label).toBeTruthy()
        expect(c.superseded[p.code]).toBeUndefined()
      }
    }
    for (const x of c.combos) for (const k of x.of) expect(keys.has(k)).toBe(true)
    // one ElementType per part, and no two parts of one entry share a ref
    for (const e of G.globalConnectors()) expect(new Set(e.parts.map(G.suggestRef)).size).toBe(e.parts.length)
  })
})

describe('suggestions from control and driver location', () => {
  test('DALI local: 2+3 pin first, 5-pin second; DALI remote: 2-pin; switched: 3-pin; DMX: none', () => {
    const keys = rec => G.suggestConnectors(rec).map(s => s.key)
    expect(keys(PT('x', 'DALI', 'Local to fitting'))).toEqual(['dali-2+3', '5pin-dali-perm'])
    expect(keys(PT('x', 'DALI', 'Integral'))).toEqual(['dali-2+3', '5pin-dali-perm'])
    expect(keys(PT('x', 'DALI', 'Remote'))).toEqual(['2pin-dali'])
    expect(keys(PT('x', 'SWITCH', 'Local to fitting'))).toEqual(['3pin-len'])
    expect(keys(PT('x', 'DMX', 'Local to fitting'))).toEqual([])
    expect(keys(PT('x', '', ''))).toEqual([])
  })
})

describe('applying a global template', () => {
  test('makes the ElementTypes, Product Spec rows and one template; again makes nothing; one Undo takes the ETs back', async () => {
    setup()
    let r
    await act(async () => { r = await useStore.getState().applyGlobalConnector('5pin-dali-perm', { posRefs: ['A01'] }) })
    const s = useStore.getState()
    expect(r.created).toEqual(['ET-5PIN-SOCKET', 'ET-5PIN-PLUG', 'ET-5PIN-PLUG-SR'])
    expect(s.psRows.map(p => [p.ElementTypeRef, p.Manufacturer, p.ProductCode])).toEqual([
      ['ET-5PIN-SOCKET', 'WAGO', '770-105'], ['ET-5PIN-PLUG', 'WAGO', '770-215'], ['ET-5PIN-PLUG-SR', 'WAGO', '770-505/023-000']])
    expect(s.etCollections).toHaveLength(1)
    expect(templateParts(s.etCollections[0]).map(p => `${p.section}:${p.ref}`)).toEqual(['position:ET-5PIN-SOCKET', 'internal:ET-5PIN-PLUG', 'internal:ET-5PIN-PLUG-SR'])
    expect(s.connectorPins[s.etCollections[0].CollectionId]).toEqual(['A01'])

    await act(async () => { r = await useStore.getState().applyGlobalConnector('5pin-dali-perm') })
    expect(r.created).toEqual([])
    expect(useStore.getState().etCollections).toHaveLength(1)

    act(() => useStore.getState().undo())
    expect(useStore.getState().elementTypes).toEqual([])
    expect(useStore.getState().psRows).toEqual([])
  })

  test('the 2+3 pair is one template of all eight parts; an ET already on a code is reused', async () => {
    setup({ elementTypes: [{ ElementTypeRef: 'ET-MY-3P-SOCK' }], psRows: [{ ElementTypeRef: 'ET-MY-3P-SOCK', Manufacturer: 'Wago', ProductCode: '770-203' }] })
    let r
    await act(async () => { r = await useStore.getState().applyGlobalConnector('dali-2+3') })
    expect(r.created).not.toContain('ET-3PIN-SOCKET')
    const parts = templateParts(useStore.getState().etCollections[0])
    expect(parts).toHaveLength(8)
    expect(parts.map(p => p.ref)).toContain('ET-MY-3P-SOCK')
  })

  test('a taken ref gets a code-named one instead', () => {
    setup({ elementTypes: [{ ElementTypeRef: 'ET-5PIN-SOCKET' }], psRows: [{ ElementTypeRef: 'ET-5PIN-SOCKET', ProductCode: '770-245' }] })
    const plan = useStore.getState().planGlobalConnector('5pin-dali-perm')
    expect(plan.parts[0]).toMatchObject({ ref: 'ET-CONN-WAGO-770-105', action: 'create' })
  })
})

describe('where it shows', () => {
  test('new project: the library is open, shows fits, and Add makes the template (with its rule)', async () => {
    setup()
    render(<WagoLibrary />)
    expect(screen.getAllByTestId('wago-entry')).toHaveLength(5)
    expect(screen.getAllByTestId('wago-entry')[0]).toHaveTextContent('Wago 2-pin DALI + 3-pin LEN')
    expect(screen.getAllByTestId('wago-entry')[0]).toHaveTextContent('fits 1')
    await act(async () => { fireEvent.click(screen.getAllByTestId('wago-add')[0]) })
    await waitFor(() => expect(screen.getAllByTestId('wago-in-project')).toHaveLength(1))
    const c = useStore.getState().etCollections[0]
    expect(c.Rule.conditions.map(x => x.column)).toContain('ControlTypeRef')
  })

  test('drawer: a position with no template is offered the suggestion; Use pins it; "or 5-pin" switches', async () => {
    setup()
    render(<ConnectorsPane posRef="A01" />)
    expect(screen.getByTestId('wago-suggestion')).toHaveTextContent('Suggested: Wago 2-pin DALI + 3-pin LEN')
    expect(screen.getByTestId('wago-suggestion')).toHaveTextContent('DALI · local driver')
    fireEvent.click(screen.getByTestId('wago-alt'))
    expect(screen.getByTestId('wago-suggestion')).toHaveTextContent('Suggested: Wago 5-pin DALI + perm')
    await act(async () => { fireEvent.click(screen.getByTestId('wago-use')) })
    const s = useStore.getState()
    expect(s.etCollections[0].Name).toBe('Wago 5-pin DALI + perm')
    expect(s.connectorPins[s.etCollections[0].CollectionId]).toEqual(['A01'])
  })

  test('existing project: a template whose parts are Wago codes is named; superseded codes are offered an upgrade', async () => {
    setup({ psRows: [
      { ElementTypeRef: 'ET-3PIN-SOCKET', ProductCode: '770-243' }, { ElementTypeRef: 'ET-3PIN-SR', ProductCode: '770-503' },
      { ElementTypeRef: 'ET-3PIN-PLUG', ProductCode: '770-253' }, { ElementTypeRef: 'ET-3PIN-PLUG-SR', ProductCode: '770-503/023-000' },
    ] })
    const c = { Name: 'Switched', Ingredients: JSON.stringify([
      { ElementTypeRef: 'ET-3PIN-SOCKET', section: 'position' }, { ElementTypeRef: 'ET-3PIN-SR', section: 'position' },
      { ElementTypeRef: 'ET-3PIN-PLUG', section: 'dl_internal' }, { ElementTypeRef: 'ET-3PIN-PLUG-SR', section: 'dl_internal' }]) }
    expect(wagoNameOf(c, useStore.getState().psRows)).toBe('Wago 3-pin LEN')
    render(<WagoUpgradeBanner />)
    expect(screen.getByTestId('wago-upgrade')).toHaveTextContent('2 ElementTypes use superseded Wago parts')
    fireEvent.click(screen.getByTestId('wago-upgrade-all'))
    const ps = useStore.getState().psRows
    expect(ps.find(r => r.ElementTypeRef === 'ET-3PIN-SOCKET').ProductCode).toBe('770-203')
    expect(ps.find(r => r.ElementTypeRef === 'ET-3PIN-PLUG').ProductCode).toBe('770-213')
    expect(screen.queryByTestId('wago-upgrade')).toBeNull()
  })
})
