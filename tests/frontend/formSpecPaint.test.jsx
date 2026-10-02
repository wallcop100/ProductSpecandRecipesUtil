import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react'

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
window.confirm = vi.fn(() => true)
// Offcanvas asks for the viewport size.
window.matchMedia ||= () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} })

const { default: useStore } = await import('../../src/store/useStore.js')
const { default: FormSpecPane } = await import('../../src/components/FormSpecPane.jsx')
const { positionPaintStatus } = await import('../../src/utils/formPositions.js')

const HEAD = ['PositionTypeRef', 'ManufacturerName', 'ProductCode']
const ROWS = [
  { PositionTypeRef: 'C01', ManufacturerName: 'iGuzzini', ProductCode: 'QC50' },
  { PositionTypeRef: 'C02', ManufacturerName: 'iGuzzini', ProductCode: 'QC51' },
  { PositionTypeRef: 'C03', ManufacturerName: 'iGuzzini', ProductCode: 'QC52' },
]
// The compact painter shows the cell text; the codes here are unique per position.
const CODE = { QC50: 'C01', QC51: 'C02', QC52: 'C03' }
// Rows the spec settles are folded: open the fold, then read the rows.
const openDone = () => { const b = screen.queryByTestId('compact-done'); if (b && /show/.test(b.textContent)) fireEvent.click(within(b).getByText('show')) }
const tableRefs = () => (openDone(), screen.getAllByTestId('compact-row')).map(r => CODE[r.textContent.match(/QC5\d/)?.[0]])

beforeEach(() => {
  for (const k of Object.keys(prefs)) delete prefs[k]
  readSheet.mockReset().mockResolvedValue({ sheets: ['S'], sheet: 'S', headers: HEAD, rows: ROWS })
  window.electronAPI.openXlsxDialog.mockClear()
  useStore.setState({
    projectId: 1, importDraft: null, formCaptures: null, containerETRefs: new Set(),
    recipes: [{ _id: 'r1', PositionTypeRef: 'C01', ContextType: 'PositionType', ContextRef: 'C01', ElementTypeRef: 'ET-PS-OLD', Quantity: 1 }],
    positionTypes: ['C01', 'C02', 'C03'].map(r => ({ PositionTypeRef: r })),
    elementTypes: ['ET-PS-01', 'ET-PS-03', 'ET-PS-OLD'].map(r => ({ ElementTypeRef: r })),
    psRows: [
      { ElementTypeRef: 'ET-PS-01', Manufacturer: 'iGuzzini', ProductCode: 'QC50' },
      { ElementTypeRef: 'ET-PS-03', Manufacturer: 'iGuzzini', ProductCode: 'QC52' },
    ],
  })
})

describe('D4Z9CX: paint one position from the builder', () => {
  test('load the Form once, paint just this position, add it; the next position needs no file', async () => {
    const view = render(<FormSpecPane posRef="C01" />)
    fireEvent.click(screen.getByTestId('paint-position'))
    fireEvent.click(await screen.findByText('Choose spreadsheet…'))
    await screen.findByTestId('compact-painter')
    // QC50 is in the spec: the row is folded away as settled.
    await waitFor(() => expect(screen.getByTestId('compact-done')).toHaveTextContent('1 row: code already in the Product Spec'))
    expect(screen.queryByTestId('compact-row')).toBeNull()
    await waitFor(() => expect(tableRefs()).toEqual(['C01']))          // only this position's rows
    expect(screen.queryByTestId('form-table')).toBeNull()               // condensed, not the full table
    expect(screen.getByTestId('add-and-build')).toHaveTextContent("Save C01's Form products")
    await act(async () => { fireEvent.click(screen.getByTestId('add-and-build')) })

    await waitFor(() => expect(screen.queryByTestId('compact-painter')).toBeNull())   // closed again
    const caps = useStore.getState().formCaptures
    expect(Object.keys(caps.byPosition)).toEqual(['C01'])               // C02, C03 untouched
    expect(caps.byPosition.C01[0].elementTypeRef).toBe('ET-PS-01')
    expect(screen.getByTestId('paint-status')).toHaveTextContent('added')
    // The pane now shows the Form product as missing from the recipe, to add.
    expect(screen.getByText(/ET-PS-01/)).toBeInTheDocument()

    // Next position: its rows straight away, from the same session.
    view.unmount()
    render(<FormSpecPane posRef="C03" />)
    expect(screen.getByTestId('paint-status')).toHaveTextContent('ready to add')   // QC52 is in the spec: confirmed already
    // Its rows are loaded but not saved to C03: the painter opens on them by itself (GCEKBN).
    await screen.findByTestId('compact-painter')
    await waitFor(() => expect(tableRefs()).toEqual(['C03']))
    expect(window.electronAPI.openXlsxDialog).toHaveBeenCalledTimes(1)
  })

  test('a product the Form no longer gives shows as to remove, with Remove', async () => {
    useStore.setState({ formCaptures: { version: 1, byPosition: { C01: [{ elementTypeRef: 'ET-PS-OLD', code: 'OLD1', manufacturer: 'iGuzzini' }] } } })
    render(<FormSpecPane posRef="C01" />)
    fireEvent.click(screen.getByTestId('paint-position'))
    fireEvent.click(await screen.findByText('Choose spreadsheet…'))
    await waitFor(() => expect(tableRefs()).toEqual(['C01']))
    await act(async () => { fireEvent.click(screen.getByTestId('add-and-build')) })
    await screen.findByText('No longer in the Form')
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    const r1 = useStore.getState().recipes.find(r => r._id === 'r1')
    expect(!r1 || r1.IsDeleted === 'Y').toBe(true)
  })

  test('positionPaintStatus follows the resolved ref', () => {
    const draft = { rows: [{ positionType: 'C01', rawText: 'QC50', confirmed: true }], map: { pt: 'PositionTypeRef' },
      resolutions: [{ formRef: 'C01', target: 'C01r' }], stagedRefs: ['C01'] }
    const helpers = { buildRefMap: (res) => new Map(res.map(r => [r.formRef.toUpperCase(), r.target])), targetFor: (m, f) => m.get(f.toUpperCase()) || null }
    expect(positionPaintStatus(draft, 'C01r', helpers).state).toBe('added')
    expect(positionPaintStatus(draft, 'C01', helpers).state).toBe('absent')
    expect(positionPaintStatus(null, 'C01r').state).toBe('noForm')
  })
})

describe('ZEM43Y / 859SCF: nothing to add is nothing to do', () => {
  test('an n/a row comes in confirmed; a position with only n/a rows offers no Add', async () => {
    readSheet.mockResolvedValue({ sheets: ['S'], sheet: 'S', headers: HEAD, rows: [
      ...ROWS, { PositionTypeRef: 'F01', ManufacturerName: '', ProductCode: 'n/a' },
    ] })
    useStore.setState({ positionTypes: ['C01', 'C02', 'C03', 'F01'].map(r => ({ PositionTypeRef: r })) })
    render(<FormSpecPane posRef="F01" />)
    fireEvent.click(screen.getByTestId('paint-position'))
    fireEvent.click(await screen.findByText('Choose spreadsheet…'))
    expect(await screen.findByTestId('compact-nothing')).toHaveTextContent('Nothing to add')
    expect(screen.queryByTestId('add-and-build')).toBeNull()
    await waitFor(() => expect(useStore.getState().importDraft?.rows?.find(r => r.positionType === 'F01')?.confirmed).toBe(true), { timeout: 3000 })
    expect(positionPaintStatus(useStore.getState().importDraft, 'F01').state).toBe('nothing')
  })
})

describe('9GLX5N: with a Product Spec, start straight away', () => {
  const MESSY = [
    { PositionTypeRef: 'C01', ManufacturerName: 'iGuzzini', ProductCode: 'QC50 with honeycomb LOUVRE-HC60 and EM pack 3h' },
    { PositionTypeRef: 'C02', ManufacturerName: 'iGuzzini', ProductCode: 'QC51 c/w snoot SN-22 in black RAL9005' },
    { PositionTypeRef: 'C03', ManufacturerName: 'iGuzzini', ProductCode: 'QC52 + driver DR-700 (remote) 24V' },
  ]
  const open = async () => {
    const { default: ProductCodeImportScreen } = await import('../../src/screens/ProductCodeImportScreen.jsx')
    readSheet.mockResolvedValue({ sheets: ['S'], sheet: 'S', headers: HEAD, rows: MESSY })
    render(<ProductCodeImportScreen onBack={vi.fn()} onReviewPositions={vi.fn()} />)
    fireEvent.click(await screen.findByText('Choose spreadsheet…'))
    await screen.findByTestId('form-table')
  }

  test('no "teach your dialect" when the spec has codes', async () => {
    await open()
    expect(screen.queryByText('Teach the tool your dialect')).toBeNull()
  })

  test('a project starting from nothing still gets it', async () => {
    useStore.setState({ psRows: [] })
    await open()
    expect(await screen.findByText('Teach the tool your dialect')).toBeInTheDocument()
  })

  test('the builder pane leads with painting in place; the full Import is a small link', () => {
    render(<FormSpecPane posRef="C01" />)
    expect(screen.getByTestId('paint-position')).toBeInTheDocument()
    expect(screen.queryByText('No Form template yet')).toBeNull()
    expect(screen.getByText(/or go through the whole Form in Import/)).toBeInTheDocument()
  })
})

describe('GCEKBN: on reopening, a position’s unsaved Form rows show', () => {
  test('the painter opens by itself on them; no "the Form says nothing"', async () => {
    const draft = {
      version: 1, step: 'review', source: { name: 'form.xlsx', sheet: 'S' },
      map: { pt: '', code: 'ProductCode', mfr: 'ManufacturerName', exclude: '', acc: '', context: [] },
      rules: {}, assignments: {}, resolutions: [], refOverrides: {}, dirStats: { forward: 0, backward: 0 }, stagedRefs: [], keptSeparate: [],
      rows: [{ id: 0, rawText: 'QC51', positionType: 'C02', manufacturer: 'iGuzzini', context: {}, overrides: {}, noteOverride: {}, confirmed: false }],
    }
    useStore.setState({ importDraft: draft, formCaptures: { version: 1, byPosition: { C01: [{ elementTypeRef: 'ET-PS-01', code: 'QC50' }] } } })
    render(<FormSpecPane posRef="C02" />)
    expect(await screen.findByTestId('compact-painter')).toBeInTheDocument()
    expect(screen.queryByText(/The Form says nothing about C02/)).toBeNull()
    expect(screen.getAllByTestId('compact-row')[0]).toHaveTextContent('QC51')
  })
})
