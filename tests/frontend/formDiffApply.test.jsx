import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'

window.electronAPI = { db: new Proxy({}, { get: () => vi.fn().mockResolvedValue(null) }) }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))
const { default: useStore } = await import('../../src/store/useStore.js')
const { default: FormSpecPane } = await import('../../src/components/FormSpecPane.jsx')

const pos = (p, ref) => ({ _id: `${p}-${ref}`, _row_num: 1, PositionTypeRef: p, ContextType: 'PositionType', ContextRef: p, ElementTypeRef: ref, Quantity: 1 })
const row = (id, pt, rawText) => ({ id, positionType: pt, manufacturer: 'Orluna', rawText, overrides: {}, confirmed: true })
const base = rows => ({ name: 'Form rev A.xlsx', at: Date.UTC(2026, 9, 12), rows: rows.map(r => ({ formRef: r.positionType, manufacturer: r.manufacturer, rawText: r.rawText })) })

function setup(newRows, oldRows) {
  useStore.setState({
    projectId: 1, past: [], future: [], psChanges: [], dbChanges: [], rsChanges: [], containerETRefs: new Set(),
    elementTypes: [{ ElementTypeRef: 'ET-PS-01', Family: 'ET-PS' }], localElementTypes: [],
    psRows: [{ ElementTypeRef: 'ET-PS-01', Manufacturer: 'Orluna', ProductCode: 'ZH-OLD-1' }],
    recipes: [pos('A1', 'ET-PS-01'), pos('A2', 'ET-PS-01')],
    importDraft: { rows: newRows, map: {}, compareBase: base(oldRows) },
    formCaptures: { version: 1, byPosition: { A1: [{ elementTypeRef: 'ET-PS-01', code: 'ZH-OLD-1', manufacturer: 'Orluna' }] } },
  })
}
// Embedded: the pane without its painter, which has its own tests.
const pane = (posRef = 'A1') => render(<FormSpecPane posRef={posRef} embedded />)
const known2 = {
  elementTypes: [{ ElementTypeRef: 'ET-PS-01', Family: 'ET-PS' }, { ElementTypeRef: 'ET-PS-02', Family: 'ET-PS' }],
  psRows: [{ ElementTypeRef: 'ET-PS-01', Manufacturer: 'Orluna', ProductCode: 'ZH-OLD-1' }, { ElementTypeRef: 'ET-PS-02', Manufacturer: 'Orluna', ProductCode: 'ZH-NEW-2' }],
  positionTypes: [{ PositionTypeRef: 'A1' }, { PositionTypeRef: 'A2' }],
  formCaptures: { version: 1, byPosition: { A1: [{ elementTypeRef: 'ET-PS-02', code: 'ZH-NEW-2', manufacturer: 'Orluna' }] } },
}
const liveA1 = () => useStore.getState().recipes.filter(r => r.PositionTypeRef === 'A1' && (r.IsDeleted || 'N') !== 'Y').map(r => r.ElementTypeRef).sort()

describe('in-line Form diff actions (design A: ~ groups)', () => {
  beforeEach(() => vi.clearAllMocks())

  test('shared and the other keeps it: + Add moves only A1 to a copy with the new code; one Undo takes it back', () => {
    setup([row(0, 'A1', 'ZH-NEW-9'), row(1, 'A2', 'ZH-OLD-1')], [row(0, 'A1', 'ZH-OLD-1'), row(1, 'A2', 'ZH-OLD-1')])
    pane()
    const g = screen.getByTestId('diff-group')
    expect(g.dataset.kind).toBe('respec')
    expect(within(g).getAllByTestId('gutter')[0]).toHaveTextContent('~')
    // The new ElementType is a dashed preview: the next free ref, not created yet.
    expect(within(g).getByTestId('et-preview')).toHaveTextContent('ET-PS-02')
    expect(screen.queryByTestId('diff-update')).toBeNull()
    expect(screen.getByTestId('diff-fork').className).toMatch(/btn-primary/)
    fireEvent.click(screen.getByTestId('diff-fork'))
    const s = useStore.getState()
    const a1 = s.recipes.find(r => r.PositionTypeRef === 'A1' && (r.IsDeleted || 'N') !== 'Y')
    const a2 = s.recipes.find(r => r.PositionTypeRef === 'A2')
    expect(a2.ElementTypeRef).toBe('ET-PS-01')
    expect(a1.ElementTypeRef).toBe('ET-PS-02')   // the preview was the truth
    expect(s.psRows.find(r => r.ElementTypeRef === a1.ElementTypeRef).ProductCode).toBe('ZH-NEW-9')
    expect(s.psRows.find(r => r.ElementTypeRef === 'ET-PS-01').ProductCode).toBe('ZH-OLD-1')
    expect(s.past).toHaveLength(1)
    s.undo()
    expect(useStore.getState().recipes.find(r => r.PositionTypeRef === 'A1').ElementTypeRef).toBe('ET-PS-01')
  })

  test('every user changes and the old code is gone: Update is the primary', () => {
    setup([row(0, 'A1', 'ZH-NEW-9'), row(1, 'A2', 'ZH-NEW-9')], [row(0, 'A1', 'ZH-OLD-1'), row(1, 'A2', 'ZH-OLD-1')])
    pane()
    expect(screen.getByTestId('diff-update').className).toMatch(/btn-primary/)
    expect(screen.getByTestId('diff-fork').className).toMatch(/outline/)
    expect(screen.getAllByTitle('Changed since 12 Oct').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByTestId('diff-update'))
    expect(useStore.getState().psRows.find(r => r.ElementTypeRef === 'ET-PS-01').ProductCode).toBe('ZH-NEW-9')
  })

  test('a swapped-in product: Replace is the primary, not + Position; the old line is struck underneath', () => {
    setup([row(0, 'A1', 'ZH-NEW-2')], [row(0, 'A1', 'ZH-OLD-1')])
    useStore.setState(known2)
    pane()
    const g = screen.getByTestId('diff-group')
    expect(g.dataset.kind).toBe('swap')
    expect(within(g).getByText('ZH-OLD-1').style.textDecoration).toBe('line-through')
    expect(screen.queryByTestId('missing-card')).toBeNull()
    expect(screen.getByTestId('diff-swap').className).toMatch(/btn-primary/)
    fireEvent.click(screen.getByTestId('diff-swap'))
    expect(liveA1()).toEqual(['ET-PS-02'])
  })

  test('+ Add keeps the old one; once both are there the old line has Remove', () => {
    setup([row(0, 'A1', 'ZH-NEW-2')], [row(0, 'A1', 'ZH-OLD-1')])
    useStore.setState(known2)
    pane()
    fireEvent.click(screen.getByTestId('diff-add'))
    expect(liveA1()).toEqual(['ET-PS-01', 'ET-PS-02'])
    fireEvent.click(within(screen.getByTestId('diff-group')).getByTestId('diff-remove'))
    expect(liveA1()).toEqual(['ET-PS-02'])
  })

  test('TEE8EV: the Review window offers the same Replace', () => {
    setup([row(0, 'A1', 'ZH-NEW-2')], [row(0, 'A1', 'ZH-OLD-1')])
    useStore.setState(known2)
    pane()
    expect(screen.getByTestId('diff-swap')).toHaveTextContent('Replace ET-PS-01')
  })

  test('2EF42C: identical changes from identical rows show once', () => {
    setup([row(0, 'A1', 'ZH-NEW-2'), row(1, 'A1', 'ZH-NEW-2')], [row(0, 'A1', 'ZH-OLD-1'), row(1, 'A1', 'ZH-OLD-1')])
    useStore.setState(known2)
    pane()
    expect(screen.getAllByTestId('diff-group')).toHaveLength(1)
  })

  test('the compare pill shows the date, the file on hover, and × stops comparing', () => {
    setup([row(0, 'A1', 'ZH-NEW-2')], [row(0, 'A1', 'ZH-OLD-1')])
    useStore.setState(known2)
    pane()
    const pill = screen.getByTestId('compare-pill')
    expect(pill).toHaveTextContent('12 Oct')
    expect(pill.title).toBe('Form rev A.xlsx')
    act(() => fireEvent.click(screen.getByTestId('compare-clear')))
    expect(useStore.getState().importDraft.compareBase).toBeFalsy()
  })
})

test('XVZAV8: a row whose old code had no ElementType shows ~ with the old code struck, not a bare +', () => {
  setup([row(0, 'A1', 'ZH-OLD-1')], [row(0, 'A1', 'ZH-GONE-7')])
  pane()
  const line = screen.getByTestId('form-line')
  expect(within(line).getByTestId('gutter')).toHaveTextContent('~')
  expect(screen.getByText('ZH-GONE-7').style.textDecoration).toBe('line-through')
  expect(screen.queryByTestId('gone-code')).toBeNull()
})

test('XVZAV8: an old code with no ElementType that simply left the Form is a − line', () => {
  setup([row(0, 'A1', 'ZH-OLD-1'), row(1, 'A1', 'ZH-NEW-9')], [row(0, 'A1', 'ZH-OLD-1'), row(1, 'A1', 'ZH-GONE-7')])
  pane()
  expect(screen.getByTestId('gone-code')).toHaveTextContent('ZH-GONE-7')
})

test('QFRHFW: a missing product of a family the recipe already holds offers Replace, as one Undo', () => {
  setup([row(0, 'A1', 'ZH-NEW-2')], [row(0, 'A1', 'ZH-NEW-2')])
  useStore.setState(known2)
  pane()
  expect(screen.getByTestId('missing-replace')).toHaveTextContent('Replace ET-PS-01')
  fireEvent.click(screen.getByTestId('missing-replace'))
  expect(liveA1()).toEqual(['ET-PS-02'])
  useStore.getState().undo()
  expect(liveA1()).toEqual(['ET-PS-01'])
})

test('XVZAV8 (A02hw): the recipe holds a kit, not the ET the diff swapped to; the line still shows ~ with the old code and ET struck', () => {
  setup([row(0, 'A1', 'ZH-NEW-2 + ACC-1')], [row(0, 'A1', 'ZH-OLD-1')])
  useStore.setState({
    elementTypes: ['ET-PS-01', 'ET-PS-02', 'ET-PS-17'].map(r => ({ ElementTypeRef: r, Family: 'ET-PS' })),
    psRows: [{ ElementTypeRef: 'ET-PS-01', Manufacturer: 'Orluna', ProductCode: 'ZH-OLD-1' }, { ElementTypeRef: 'ET-PS-02', Manufacturer: 'Orluna', ProductCode: 'ZH-NEW-2' },
      { ElementTypeRef: 'ET-PS-17', Manufacturer: 'Orluna', ProductCode: 'ZH-NEW-2 + ACC-1' }],
    recipes: [pos('A1', 'ET-PS-17')],
    formCaptures: { version: 1, byPosition: { A1: [{ elementTypeRef: 'ET-PS-17', code: 'ZH-NEW-2 + ACC-1', manufacturer: 'Orluna' }] } },
  })
  pane()
  expect(within(screen.getByTestId('form-line')).getByTestId('gutter')).toHaveTextContent('~')
  const o = screen.getByTestId('old-code')
  expect(o).toHaveTextContent('ZH-OLD-1')
  expect(o).toHaveTextContent('ET-PS-01')
  expect(within(o).queryByTestId('diff-remove')).toBeNull()   // ET-PS-01 is not in the recipe
})
