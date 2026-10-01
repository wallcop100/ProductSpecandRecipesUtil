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
const tableRefs = () => within(screen.getByTestId('form-table')).getAllByRole('row').slice(1).map(r => r.textContent.match(/C0\d/)?.[0]).filter(Boolean)

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
    await screen.findByTestId('form-table')
    await waitFor(() => expect(tableRefs()).toEqual(['C01']))          // only this position's rows
    expect(screen.queryByTestId('form-position-list')).toBeNull()       // no position list
    expect(screen.getByTestId('add-and-build')).toHaveTextContent('Add to Product Spec')
    fireEvent.click(screen.getAllByLabelText(/^Confirm row/)[0])
    await act(async () => { fireEvent.click(screen.getByTestId('add-and-build')) })

    await waitFor(() => expect(screen.queryByTestId('embedded-import')).toBeNull())   // closed again
    const caps = useStore.getState().formCaptures
    expect(Object.keys(caps.byPosition)).toEqual(['C01'])               // C02, C03 untouched
    expect(caps.byPosition.C01[0].elementTypeRef).toBe('ET-PS-01')
    expect(screen.getByTestId('paint-status')).toHaveTextContent('added')
    // The pane now shows the Form product as missing from the recipe, to add.
    expect(screen.getByText(/ET-PS-01/)).toBeInTheDocument()

    // Next position: its rows straight away, from the same session.
    view.unmount()
    render(<FormSpecPane posRef="C03" />)
    expect(screen.getByTestId('paint-status')).toHaveTextContent('1 row to confirm')
    fireEvent.click(screen.getByTestId('paint-position'))
    await screen.findByTestId('form-table')
    await waitFor(() => expect(tableRefs()).toEqual(['C03']))
    expect(window.electronAPI.openXlsxDialog).toHaveBeenCalledTimes(1)
  })

  test('a product the Form no longer gives shows as to remove, with Remove', async () => {
    useStore.setState({ formCaptures: { version: 1, byPosition: { C01: [{ elementTypeRef: 'ET-PS-OLD', code: 'OLD1', manufacturer: 'iGuzzini' }] } } })
    render(<FormSpecPane posRef="C01" />)
    fireEvent.click(screen.getByTestId('paint-position'))
    fireEvent.click(await screen.findByText('Choose spreadsheet…'))
    await waitFor(() => expect(tableRefs()).toEqual(['C01']))
    fireEvent.click(screen.getAllByLabelText(/^Confirm row/)[0])
    await act(async () => { fireEvent.click(screen.getByTestId('add-and-build')) })
    await screen.findByText('No longer in the Form')
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    const r1 = useStore.getState().recipes.find(r => r._id === 'r1')
    expect(!r1 || r1.IsDeleted === 'Y').toBe(true)
  })

  test('positionPaintStatus follows the resolved ref', () => {
    const draft = { rows: [{ positionType: 'C01', confirmed: true }], map: { pt: 'PositionTypeRef' },
      resolutions: [{ formRef: 'C01', target: 'C01r' }], stagedRefs: ['C01'] }
    const helpers = { buildRefMap: (res) => new Map(res.map(r => [r.formRef.toUpperCase(), r.target])), targetFor: (m, f) => m.get(f.toUpperCase()) || null }
    expect(positionPaintStatus(draft, 'C01r', helpers).state).toBe('added')
    expect(positionPaintStatus(draft, 'C01', helpers).state).toBe('absent')
    expect(positionPaintStatus(null, 'C01r').state).toBe('noForm')
  })
})
