import { describe, test, expect, vi, beforeEach } from 'vitest'

window.electronAPI = { db: { setPref: vi.fn().mockResolvedValue(undefined) } }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))
const { default: useStore, withFinish } = await import('../../src/store/useStore.js')

describe('NQLUFQ: finish in brackets', () => {
  test('withFinish appends once', () => {
    expect(withFinish('Downlight trim', 'RAL 9010')).toBe('Downlight trim (RAL 9010)')
    expect(withFinish('Downlight trim (RAL 9010)', 'RAL 9010')).toBe('Downlight trim (RAL 9010)')
    expect(withFinish('', 'Black')).toBe('(Black)')
  })

  beforeEach(() => useStore.setState({
    projectId: 1, past: [], future: [], psChanges: [], dbChanges: [], recipes: [],
    psRows: [{ ElementTypeRef: 'ET-DL-01', ComponentDescription: 'Downlight trim' }],
    elementTypes: [{ ElementTypeRef: 'ET-DL-01', Description: 'Downlight' }],
  }))

  test('applyFinish writes both descriptions in one Undo step', () => {
    useStore.getState().applyFinish('ET-DL-01', ' RAL 9010 ')
    const s = useStore.getState()
    expect(s.psRows[0].ComponentDescription).toBe('Downlight trim (RAL 9010)')
    expect(s.elementTypes[0].Description).toBe('Downlight (RAL 9010)')
    s.undo()
    expect(useStore.getState().psRows[0].ComponentDescription).toBe('Downlight trim')
    expect(useStore.getState().elementTypes[0].Description).toBe('Downlight')
  })
})
