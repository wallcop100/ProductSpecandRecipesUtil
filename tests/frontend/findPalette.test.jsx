import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import fs from 'node:fs'

window.electronAPI = { db: { setPref: vi.fn().mockResolvedValue(undefined) } }
vi.mock('../../src/utils/backend.js', () => ({ importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(), registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn() }))
const api = { current: null }
vi.mock('../../src/platform/companion', () => ({ useCompanion: () => api.current, getCompanion: async () => api.current }))
const { default: useStore } = await import('../../src/store/useStore.js')
const { default: FindPalette } = await import('../../src/components/FindPalette.jsx')
const { ACTIONS } = await import('../../src/help/actions.js')
const { UI_REQUESTS } = await import('../../src/help/uiRequests.js')
const { contextFor } = await import('../../src/help/run.js')

function setup(view = 'builder') {
  useStore.setState({
    projectNumber: '5642', specIntent: null, uiRequest: null, pendingScreen: null,
    elementTypes: [{ ElementTypeRef: 'ET-PS-MINI-TINI' }, { ElementTypeRef: 'ET-PS-01' }, { ElementTypeRef: 'ET-PS-02' }, { ElementTypeRef: 'ET-PS-03' }],
    positionTypes: [{ PositionTypeRef: 'C01r' }], psRows: [], recipes: [], psChanges: [], rsChanges: [], dbChanges: [],
  })
  return render(<FindPalette screen={view} />)
}

describe('Find (Ctrl+K)', () => {
  beforeEach(() => { api.current = { shareOutcomes: vi.fn(async () => ({ stored: 1 })) } })

  test('the user’s question goes straight to the rename, already filled in', async () => {
    setup()
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true })) })
    fireEvent.change(screen.getByLabelText('Find'), { target: { value: 'add -01 onto ET-PS-MINI-TINI' } })
    expect(screen.getAllByRole('option')[0].textContent).toMatch(/Rename ET-PS-MINI-TINI/)
    await act(async () => { fireEvent.keyDown(screen.getByLabelText('Find'), { key: 'Enter' }) })
    const s = useStore.getState()
    expect(s.specIntent).toMatchObject({ ref: 'ET-PS-MINI-TINI', open: 'rename', suggest: 'ET-PS-MINI-TINI-01' })
    expect(s.pendingScreen).toBe('product-spec')
    expect(api.current.shareOutcomes).toHaveBeenCalledWith('5642', [expect.objectContaining({ kind: 'search', outcome: 'accepted', final: 'et.rename' })])
  })

  test('a search closed with nothing picked is noted, so missing words show up', () => {
    setup()
    act(() => { useStore.getState().requestFind() })
    fireEvent.change(screen.getByLabelText('Find'), { target: { value: 'zzqx frobnicate' } })
    expect(screen.getByText(/Nothing matches/)).toBeTruthy()
    fireEvent.keyDown(screen.getByLabelText('Find'), { key: 'Escape' })
    expect(api.current.shareOutcomes).toHaveBeenCalledWith('5642', [expect.objectContaining({ kind: 'search', key: 'zzqx frobnicate', outcome: 'dismissed', supplied: 'no results' })])
  })

  test('every window an action asks for is one the builder opens', () => {
    const asked = new Set()
    const real = useStore.getState()
    const ctx = { ...contextFor(), ui: k => asked.add(k), go: () => {}, spec: () => {}, openPosition: () => {}, host: () => {}, tutorial: () => {}, saveNow: () => {},
      s: new Proxy({}, { get: (_, k) => (typeof real[k] === 'function' ? () => null : real[k]) }) }
    const confirm = window.confirm; window.confirm = () => false
    for (const a of ACTIONS) a.run({ ...ctx, ref: 'ET-X', pos: 'C01r' })
    window.confirm = confirm
    for (const k of asked) expect(UI_REQUESTS, k).toContain(k)
    const builder = fs.readFileSync('src/screens/BuilderScreen.jsx', 'utf8')
    for (const k of UI_REQUESTS) expect(builder, `BuilderScreen handles ${k}`).toMatch(new RegExp(`\\b${k}: \\(\\) =>`))
  })

  test('every store action an action calls exists', () => {
    const called = new Set()
    const real0 = useStore.getState()
    const s = new Proxy({}, { get: (_, k) => { if (typeof real0[k] !== 'function' && k in real0) return real0[k]; called.add(k); return () => null } })
    const confirm = window.confirm; window.confirm = () => true
    for (const a of ACTIONS) a.run({ ...contextFor(), s, ui: () => {}, go: () => {}, spec: () => {}, openPosition: () => {}, host: () => {}, tutorial: () => {}, saveNow: () => {}, ref: 'ET-X', pos: 'C01r' })
    window.confirm = confirm
    const real = useStore.getState()
    for (const k of called) expect(typeof real[k], k).toBe('function')
  })
})

describe('Find: an ElementType', () => {
  beforeEach(() => { api.current = null })
  const pick = view => {
    setup(view)
    useStore.setState({ recipes: [{ _id: 'r1', PositionTypeRef: 'C01r', ContextType: 'PositionType', ContextRef: 'C01r', ElementTypeRef: 'ET-PS-01', Quantity: 1 }],
      positionList: { ...useStore.getState().positionList, query: null } })
    act(() => { useStore.getState().requestFind() })
    fireEvent.change(screen.getByLabelText('Find'), { target: { value: 'ET-PS-01' } })
    const opt = screen.getAllByRole('option').find(o => /ET-PS-01/.test(o.textContent) && !/Show positions/.test(o.textContent))
    act(() => { fireEvent.click(opt) })
    return useStore.getState()
  }
  test('in Recipes it filters the list to the positions holding it', () => {
    const s = pick()
    expect(s.positionList.query?.rule.conditions[0]).toMatchObject({ column: 'Recipe.ElementType', value: 'ET-PS-01' })
  })
  test('in Product Spec it still opens its row', () => {
    const s = pick('product-spec')
    expect(s.positionList.query).toBeNull()
    expect(s.specIntent).toMatchObject({ ref: 'ET-PS-01' })
  })
})
