import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react'
import { groupPositions, positionStatus, mergeCaptures, restrictCaptures } from '../../src/utils/formPositions.js'

const readSheet = vi.fn()
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: (...a) => readSheet(...a),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(),
  fileMeta: vi.fn().mockResolvedValue({ name: 'form.xlsx' }),
}))
const prefs = {}
window.electronAPI = {
  openXlsxDialog: vi.fn().mockResolvedValue('tok-1'),
  db: { setPref: vi.fn(async (_p, k, v) => { prefs[k] = v }), getPref: vi.fn(async (_p, k) => prefs[k] ?? null) },
}
const { default: useStore } = await import('../../src/store/useStore.js')
const { default: ProductCodeImportScreen } = await import('../../src/screens/ProductCodeImportScreen.jsx')

describe('formPositions', () => {
  const rows = [
    { id: 0, positionType: 'C01', confirmed: true }, { id: 1, positionType: 'C02', confirmed: false },
    { id: 2, positionType: 'C01', confirmed: true }, { id: 3, positionType: 'C03', confirmed: true },
  ]
  test('rows group by Form ref in Form order; status is to do / ready / done', () => {
    const g = groupPositions(rows)
    expect(g.map(x => [x.formRef, x.rows.length])).toEqual([['C01', 2], ['C02', 1], ['C03', 1]])
    const needsEt = r => r.id === 3
    expect(g.map(x => positionStatus(x, { needsEt, stagedRefs: new Set(['C01']) }))).toEqual(['done', 'todo', 'todo'])
    expect(positionStatus(g[0], {})).toBe('ready')
  })

  test('merging a selection keeps every other position', () => {
    const prev = { byPosition: { C01: [{ code: 'A' }], C02: [{ code: 'B' }] }, pendingByPosition: { C02: [{ code: 'X' }] },
      contextByPosition: { C01: { n: 1 } }, orphansByPosition: {}, unrouted: [{ formRef: 'Z9' }], excludedFormRefs: ['Q'] }
    const next = { byPosition: { C02: [{ code: 'B2' }] }, pendingByPosition: {}, contextByPosition: {}, orphansByPosition: { C02: ['ET-OLD'] }, unrouted: [], excludedFormRefs: [] }
    const m = mergeCaptures(prev, next, ['C02'], ['C02'])
    expect(m.byPosition).toEqual({ C01: [{ code: 'A' }], C02: [{ code: 'B2' }] })
    expect(m.pendingByPosition).toEqual({})
    expect(m.orphansByPosition).toEqual({ C02: ['ET-OLD'] })
    expect(m.unrouted).toEqual([{ formRef: 'Z9' }])
    expect(restrictCaptures(prev, ['C02']).byPosition).toEqual({ C02: [{ code: 'B' }] })
  })
})

const HEAD = ['PositionTypeRef', 'ManufacturerName', 'ProductCode']
const ROWS = [
  { PositionTypeRef: 'C01', ManufacturerName: 'iGuzzini', ProductCode: 'QC50' },
  { PositionTypeRef: 'C02', ManufacturerName: 'iGuzzini', ProductCode: 'QC51' },
  { PositionTypeRef: 'C03', ManufacturerName: 'iGuzzini', ProductCode: 'QC52' },
]
const tableRefs = () => within(screen.getByTestId('form-table')).getAllByRole('row').slice(1).map(r => r.textContent.match(/C0\d/)?.[0])
const list = () => screen.getByTestId('form-position-list')

describe('import By position', () => {
  beforeEach(() => {
    for (const k of Object.keys(prefs)) delete prefs[k]
    prefs.import_mode = 'position'
    readSheet.mockResolvedValue({ sheets: ['S'], sheet: 'S', headers: HEAD, rows: ROWS })
    useStore.setState({
      projectId: 1, importDraft: null, formCaptures: { version: 1, byPosition: { X99: [{ elementTypeRef: 'ET-PS-09', code: 'OLD' }] } }, recipes: [],
      positionTypes: ['C01', 'C02', 'C03', 'X99'].map(r => ({ PositionTypeRef: r })),
      elementTypes: ['ET-PS-01', 'ET-PS-03', 'ET-PS-09'].map(r => ({ ElementTypeRef: r })),
      psRows: [
        { ElementTypeRef: 'ET-PS-01', Manufacturer: 'iGuzzini', ProductCode: 'QC50' },
        { ElementTypeRef: 'ET-PS-03', Manufacturer: 'iGuzzini', ProductCode: 'QC52' },
      ],
    })
  })

  test('one position end to end, then the next; other positions untouched', async () => {
    const onReviewPositions = vi.fn()
    const view = render(<ProductCodeImportScreen onBack={vi.fn()} onReviewPositions={onReviewPositions} />)
    fireEvent.click(await screen.findByText('Choose spreadsheet…'))
    await screen.findByTestId('form-table')
    await waitFor(() => expect(tableRefs()).toEqual(['C01']))               // first position selected
    // QC50 is in the Product Spec: nothing to confirm, nothing to assign.
    expect(screen.getByTestId('sel-step-1')).toHaveTextContent('Rows confirmed')
    expect(screen.getByTestId('sel-step-2')).toHaveTextContent('ElementTypes chosen')
    await act(async () => { fireEvent.click(screen.getByTestId('add-and-build')) })

    expect(onReviewPositions).toHaveBeenCalledWith(['C01'], { fromImport: true })
    const caps = useStore.getState().formCaptures
    expect(Object.keys(caps.byPosition).sort()).toEqual(['C01', 'X99'])      // X99 kept, C02/C03 not touched
    expect(caps.byPosition.C01[0].elementTypeRef).toBe('ET-PS-01')
    expect(useStore.getState().importDraft.stagedRefs).toEqual(['C01'])

    // Back from the builder: the draft resumes, C01 is done, C02 is next.
    view.unmount()
    render(<ProductCodeImportScreen onBack={vi.fn()} onReviewPositions={onReviewPositions} />)
    await screen.findByTestId('form-table')
    await waitFor(() => expect(tableRefs()).toEqual(['C02']))
    expect(within(list()).getByRole('option', { name: /C01/ })).toHaveAttribute('data-status', 'done')

    // C02's code is unknown: step 2 blocks until it has an ElementType.
    fireEvent.click(screen.getAllByLabelText(/^Confirm row/)[0])
    expect(screen.getByTestId('sel-step-2')).toHaveTextContent('Give 1 code an ElementType')
    expect(screen.getByTestId('add-and-build')).toBeDisabled()

    // Ctrl-click adds C03 to the selection; both rows show.
    fireEvent.click(within(list()).getByRole('option', { name: /C03/ }), { ctrlKey: true })
    expect(tableRefs()).toEqual(['C02', 'C03'])
    // C03 alone goes through; C01's captures stay.
    fireEvent.click(within(list()).getByRole('option', { name: /C03/ }))
    await act(async () => { fireEvent.click(screen.getByTestId('add-and-build')) })
    expect(onReviewPositions).toHaveBeenLastCalledWith(['C03'], { fromImport: true })
    expect(Object.keys(useStore.getState().formCaptures.byPosition).sort()).toEqual(['C01', 'C03', 'X99'])
  })

  test('the toggle switches back to the whole Form, and is remembered', async () => {
    render(<ProductCodeImportScreen onBack={vi.fn()} onReviewPositions={vi.fn()} />)
    fireEvent.click(await screen.findByText('Choose spreadsheet…'))
    await screen.findByTestId('form-position-list')
    fireEvent.click(within(screen.getByTestId('import-mode')).getByText('Whole Form'))
    expect(screen.queryByTestId('form-position-list')).toBeNull()
    expect(tableRefs()).toEqual(['C01', 'C02', 'C03'])
    expect(screen.getByTestId('stage-block')).toBeVisible()
    expect(prefs.import_mode).toBe('form')
  })
})
