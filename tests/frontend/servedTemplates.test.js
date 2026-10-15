import { describe, test, expect, vi } from 'vitest'
window.electronAPI = { db: { setPref: vi.fn().mockResolvedValue(undefined) } }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))
const { default: useStore } = await import('../../src/store/useStore.js')

describe('global templates served beside a companion', () => {
  test('join the list read-only under their own ids, and hide the built-in they replace', () => {
    const builtIn = { id: 'LIN+Tape+Profile', name: 'Linear Tape + Profile', scope: 'global', ingredients: [] }
    const mine = { id: 'p1', name: 'Mine', scope: 'project', project_id: 3, ingredients: [] }
    useStore.setState({ templates: [builtIn, mine], library: { templates: [
      { id: 'LIN+Tape+Profile-r', name: 'Linear tape in profile', applicable_tags: ['LIN'], ingredients: [{ slotKey: 'DESIGN_ELEMENT' }], replaces: 'LIN+Tape+Profile', version: 2 }] } })
    useStore.getState().applyServedTemplates()
    useStore.getState().applyServedTemplates()          // after a project load: still once
    const t = useStore.getState().templates
    expect(t.map(x => x.id)).toEqual(['p1', 'served:LIN+Tape+Profile-r'])
    expect(t[1]).toMatchObject({ scope: 'global', _served: true, project_id: null })
  })
  test('nothing served: nothing changes', () => {
    useStore.setState({ templates: [{ id: 'a', scope: 'global' }], library: { patterns: [] } })
    useStore.getState().applyServedTemplates()
    expect(useStore.getState().templates.map(x => x.id)).toEqual(['a'])
  })
})
