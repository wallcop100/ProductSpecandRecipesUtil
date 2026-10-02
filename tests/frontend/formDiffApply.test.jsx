import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

window.electronAPI = { db: new Proxy({}, { get: () => vi.fn().mockResolvedValue(null) }) }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))
const { default: useStore } = await import('../../src/store/useStore.js')
const { default: FormDiffBlock } = await import('../../src/components/FormDiffBlock.jsx')

const pos = (p, ref) => ({ _id: `${p}-${ref}`, _row_num: 1, PositionTypeRef: p, ContextType: 'PositionType', ContextRef: p, ElementTypeRef: ref, Quantity: 1 })
const row = (id, pt, rawText) => ({ id, positionType: pt, manufacturer: 'Orluna', rawText, overrides: {}, confirmed: true })
const base = rows => ({ name: 'Form rev A.xlsx', rows: rows.map(r => ({ formRef: r.positionType, manufacturer: r.manufacturer, rawText: r.rawText })) })

function setup(newRows, oldRows) {
  useStore.setState({
    projectId: 1, past: [], future: [], psChanges: [], dbChanges: [], rsChanges: [], containerETRefs: new Set(),
    elementTypes: [{ ElementTypeRef: 'ET-PS-01', Family: 'ET-PS' }], localElementTypes: [],
    psRows: [{ ElementTypeRef: 'ET-PS-01', Manufacturer: 'Orluna', ProductCode: 'ZH-OLD-1' }],
    recipes: [pos('A1', 'ET-PS-01'), pos('A2', 'ET-PS-01')],
    importDraft: { rows: newRows, map: {}, compareBase: base(oldRows) },
  })
}

describe('in-line Form diff actions', () => {
  beforeEach(() => vi.clearAllMocks())

  test('shared and the other keeps it: Fork moves only A1 to a copy with the new code; one Undo takes it back', () => {
    setup([row(0, 'A1', 'ZH-NEW-9'), row(1, 'A2', 'ZH-OLD-1')], [row(0, 'A1', 'ZH-OLD-1'), row(1, 'A2', 'ZH-OLD-1')])
    render(<FormDiffBlock posRef="A1" />)
    expect(screen.getByTestId('form-diff-line')).toHaveTextContent('A2 keeps ET-PS-01')
    expect(screen.queryByTestId('diff-update')).toBeNull()
    fireEvent.click(screen.getByTestId('diff-fork'))
    const s = useStore.getState()
    const a1 = s.recipes.find(r => r.PositionTypeRef === 'A1' && (r.IsDeleted || 'N') !== 'Y')
    const a2 = s.recipes.find(r => r.PositionTypeRef === 'A2')
    expect(a2.ElementTypeRef).toBe('ET-PS-01')
    expect(a1.ElementTypeRef).not.toBe('ET-PS-01')
    expect(s.psRows.find(r => r.ElementTypeRef === a1.ElementTypeRef).ProductCode).toBe('ZH-NEW-9')
    expect(s.psRows.find(r => r.ElementTypeRef === 'ET-PS-01').ProductCode).toBe('ZH-OLD-1')
    expect(s.past).toHaveLength(1)
    s.undo()
    expect(useStore.getState().recipes.find(r => r.PositionTypeRef === 'A1').ElementTypeRef).toBe('ET-PS-01')
  })

  test('every user changes and the old code is gone: Update in place', () => {
    setup([row(0, 'A1', 'ZH-NEW-9'), row(1, 'A2', 'ZH-NEW-9')], [row(0, 'A1', 'ZH-OLD-1'), row(1, 'A2', 'ZH-OLD-1')])
    render(<FormDiffBlock posRef="A1" />)
    fireEvent.click(screen.getByTestId('diff-update'))
    expect(useStore.getState().psRows.find(r => r.ElementTypeRef === 'ET-PS-01').ProductCode).toBe('ZH-NEW-9')
  })
})
