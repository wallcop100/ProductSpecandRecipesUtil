import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'

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

  test('a product the Form swapped in shows the same Swap where it is missing, not + Position', async () => {
    const { default: FormSpecPane } = await import('../../src/components/FormSpecPane.jsx')
    setup([row(0, 'A1', 'ZH-NEW-2')], [row(0, 'A1', 'ZH-OLD-1')])
    useStore.setState({
      elementTypes: [{ ElementTypeRef: 'ET-PS-01', Family: 'ET-PS' }, { ElementTypeRef: 'ET-PS-02', Family: 'ET-PS' }],
      psRows: [{ ElementTypeRef: 'ET-PS-01', Manufacturer: 'Orluna', ProductCode: 'ZH-OLD-1' }, { ElementTypeRef: 'ET-PS-02', Manufacturer: 'Orluna', ProductCode: 'ZH-NEW-2' }],
      positionTypes: [{ PositionTypeRef: 'A1' }, { PositionTypeRef: 'A2' }],
      formCaptures: { version: 1, byPosition: { A1: [{ elementTypeRef: 'ET-PS-02', code: 'ZH-NEW-2', manufacturer: 'Orluna' }] } },
    })
    render(<FormSpecPane posRef="A1" />)
    const at = screen.getByTestId('missing-swap')
    expect(at).toHaveTextContent('Swap in A1')
    expect(screen.getByTestId('missing-swap-from')).toHaveValue('ET-PS-01')
    expect(screen.queryByRole('button', { name: 'Add ET-PS-02 at position level' })).toBeNull()
    fireEvent.click(within(at).getByRole('button', { name: /Swap in A1/ }))
    const live = useStore.getState().recipes.filter(r => r.PositionTypeRef === 'A1' && (r.IsDeleted || 'N') !== 'Y').map(r => r.ElementTypeRef)
    expect(live).toEqual(['ET-PS-02'])
  })

  test('the swap can replace any ElementType the position holds, or the ⋯ menu just adds it', async () => {
    const { default: FormSpecPane } = await import('../../src/components/FormSpecPane.jsx')
    setup([row(0, 'A1', 'ZH-NEW-2')], [row(0, 'A1', 'ZH-OLD-1')])
    useStore.setState({
      recipes: [pos('A1', 'ET-PS-01'), pos('A1', 'ET-PS-03'), pos('A2', 'ET-PS-01')],
      elementTypes: ['ET-PS-01', 'ET-PS-02', 'ET-PS-03'].map(r => ({ ElementTypeRef: r, Family: 'ET-PS' })),
      psRows: [{ ElementTypeRef: 'ET-PS-01', Manufacturer: 'Orluna', ProductCode: 'ZH-OLD-1' }, { ElementTypeRef: 'ET-PS-02', Manufacturer: 'Orluna', ProductCode: 'ZH-NEW-2' }],
      positionTypes: [{ PositionTypeRef: 'A1' }, { PositionTypeRef: 'A2' }],
      formCaptures: { version: 1, byPosition: { A1: [{ elementTypeRef: 'ET-PS-02', code: 'ZH-NEW-2', manufacturer: 'Orluna' }] } },
    })
    const liveA1 = () => useStore.getState().recipes.filter(r => r.PositionTypeRef === 'A1' && (r.IsDeleted || 'N') !== 'Y').map(r => r.ElementTypeRef).sort()
    render(<FormSpecPane posRef="A1" />)
    const from = screen.getByTestId('missing-swap-from')
    expect(from).toHaveValue('ET-PS-01')
    fireEvent.change(from, { target: { value: 'ET-PS-03' } })
    fireEvent.click(within(screen.getByTestId('missing-swap')).getByRole('button', { name: /Swap in A1/ }))
    expect(liveA1()).toEqual(['ET-PS-01', 'ET-PS-02'])
    act(() => useStore.getState().undo())
    expect(liveA1()).toEqual(['ET-PS-01', 'ET-PS-03'])
    fireEvent.click(within(screen.getByTestId('missing-swap-more')).getByRole('button'))
    fireEvent.click(await screen.findByText('+ Add at position level'))
    expect(liveA1()).toEqual(['ET-PS-01', 'ET-PS-02', 'ET-PS-03'])
  })

  test('QATFST: the diff can be hidden, and stays hidden', () => {
    localStorage.removeItem('formDiffShown')
    setup([row(0, 'A1', 'ZH-NEW-9'), row(1, 'A2', 'ZH-OLD-1')], [row(0, 'A1', 'ZH-OLD-1'), row(1, 'A2', 'ZH-OLD-1')])
    const view = render(<FormDiffBlock posRef="A1" />)
    fireEvent.click(screen.getByTestId('diff-toggle'))
    expect(screen.queryByTestId('form-diff-line')).toBeNull()
    expect(screen.getByTestId('diff-hidden')).toHaveTextContent('1 change hidden')
    view.unmount()
    render(<FormDiffBlock posRef="A1" />)
    expect(screen.queryByTestId('form-diff-line')).toBeNull()
    fireEvent.click(screen.getByTestId('diff-toggle'))
    expect(screen.getByTestId('form-diff-line')).toBeInTheDocument()
  })
})
