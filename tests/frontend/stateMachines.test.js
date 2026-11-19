import { describe, test, expect, beforeEach, vi } from 'vitest'
import useStore, { savePendingNow } from '../../src/store/useStore'

const s = () => useStore.getState()
const row = (pos, et, id) => ({ _id: id, PositionTypeRef: pos, ContextType: 'PositionType', ContextRef: pos, ElementTypeRef: et })

describe('held at the design prompt, nothing has moved yet', () => {
  beforeEach(() => useStore.setState({
    // A01 has two position-level rows and no design item: leaving it asks which.
    recipes: [row('A01', 'ET-1', 'r1'), row('A01', 'ET-2', 'r2')],
    activePositionRef: 'A01', positionHistory: ['A00'], returnScreen: 'connectors',
    designPrompt: null, recipeError: 'refused', pendingScreen: null,
  }))

  test('Stay keeps the history, the return screen and the error', () => {
    s().goBackPosition()
    expect(s().designPrompt?.posRef).toBe('A01')
    s().cancelDesignPrompt()
    expect(s().activePositionRef).toBe('A01')
    expect(s().positionHistory).toEqual(['A00'])
    s().setActivePosition(null)
    s().cancelDesignPrompt()
    expect(s().returnScreen).toBe('connectors')
    expect(s().recipeError).toBe('refused')
  })

  test('a position opened from another screen still returns there once the design item is picked', () => {
    s().openPositionFrom('product-spec', 'A02')
    s().resolveDesignPrompt('r1')
    expect(s().activePositionRef).toBe('A02')
    expect(s().positionHistory).toEqual([])
    s().goBackFromPosition()
    expect(s().pendingScreen).toBe('product-spec')
  })
})

describe('opening a project', () => {
  test('nothing held for the last project carries over', () => {
    useStore.setState({
      designPrompt: { posRef: 'X', then: () => {} }, patchBatch: { n: 3 }, recipeError: 'x',
      syncStatus: { conflicts: [{ file: 'ps', key: 'ET-1' }] }, selectedRowIds: ['r1'], pendingPaste: {},
    })
    s().loadProject({ projectId: 2 })
    expect(s()).toMatchObject({ designPrompt: null, patchBatch: null, syncStatus: null, recipeError: null, selectedRowIds: [], pendingPaste: null })
  })
})

describe('the save indicator', () => {
  test('a change made while a save is being written is not called saved', async () => {
    let release
    window.electronAPI = { db: { setPendingChanges: () => new Promise(r => { release = r }) } }
    useStore.setState({ projectId: 1, psChanges: [{ a: 1 }], saveStatus: 'saving' })
    const saving = savePendingNow()
    useStore.setState({ psChanges: [{ a: 2 }] })   // lands mid-write
    release()
    await saving
    expect(s().saveStatus).toBe('saving')
    release = null
    const again = savePendingNow()
    release()
    await again
    expect(s().saveStatus).toBe('saved')
    delete window.electronAPI
  })
})

describe('checkFiles', () => {
  test('a check that finishes after another project opened settles nothing', async () => {
    vi.resetModules()
    let finish
    vi.doMock('../../src/utils/backend', async orig => ({ ...(await orig()), importFiles: () => new Promise(r => { finish = r }) }))
    const store = (await import('../../src/store/useStore')).default
    store.getState().loadProject({ projectId: 1, paths: { db: 'a.xlsx' }, psRows: [{ ElementTypeRef: 'ET-A' }] })
    const check = store.getState().checkFiles()
    store.getState().loadProject({ projectId: 2, paths: { db: 'b.xlsx' }, psRows: [{ ElementTypeRef: 'ET-B' }] })
    finish({ db: { element_types: [] }, ps: [{ ElementTypeRef: 'ET-A' }], rs: [] })
    expect(await check).toBeNull()
    expect(store.getState().psRows.map(r => r.ElementTypeRef)).toEqual(['ET-B'])
    expect(store.getState().syncStatus).toBeNull()
    vi.doUnmock('../../src/utils/backend')
  })
})
