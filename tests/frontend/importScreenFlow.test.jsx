import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'

/** Separate user acts are separate events: let the event loop turn between them. */
const tick = () => act(() => new Promise(r => setTimeout(r, 0)))

const readSheet = vi.fn()
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: (...a) => readSheet(...a),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(),
  fileMeta: vi.fn().mockResolvedValue({ name: 'form.xlsx' }),
}))
window.electronAPI = {
  openXlsxDialog: vi.fn().mockResolvedValue('tok-1'),
  db: { setPref: vi.fn().mockResolvedValue(undefined), getPref: vi.fn().mockResolvedValue(null) },
}
const { default: useStore } = await import('../../src/store/useStore.js')
const { default: ProductCodeImportScreen } = await import('../../src/screens/ProductCodeImportScreen.jsx')

const sheet = headers => ({
  sheets: ['PositionTypeSpec'], sheet: 'PositionTypeSpec', headers,
  rows: [{ PositionTypeRef: 'A1', ProductCode: 'QC50', ManufacturerName: 'iGuzzini' }],
})

async function pick(headers) {
  readSheet.mockResolvedValue(sheet(headers))
  useStore.setState({ projectId: 1, positionTypes: [{ PositionTypeRef: 'A1' }], psRows: [], elementTypes: [], recipes: [] })
  render(<ProductCodeImportScreen onBack={vi.fn()} onReviewPositions={vi.fn()} />)
  fireEvent.click(await screen.findByText('Choose spreadsheet…'))
}

describe('the column step is skipped when the columns are obvious', () => {
  test('code, PositionType and manufacturer all found → straight to the table', async () => {
    await pick(['PositionTypeRef', 'ProductCode', 'ManufacturerName'])
    expect(await screen.findByTestId('form-table')).toBeInTheDocument()
    expect(screen.queryByText('Which columns matter?')).toBeNull()
    fireEvent.click(screen.getByText('← Columns'))                 // and back is one click
    expect(await screen.findByText('Which columns matter?')).toBeInTheDocument()
  })

  test('a column missing → the step is shown', async () => {
    await pick(['PositionTypeRef', 'ProductCode'])
    expect(await screen.findByText('Which columns matter?')).toBeInTheDocument()
  })
})

const HEAD = ['PositionTypeRef', 'ManufacturerName', 'ProductCode', 'ProductName']
const ROWS = [
  { PositionTypeRef: 'A1', ManufacturerName: 'iGuzzini', ProductCode: 'QC50', ProductName: 'Spot' },
  { PositionTypeRef: 'A1', ManufacturerName: 'iGuzzini', ProductCode: 'QC51 louvre', ProductName: 'Spot 2' },
]
async function toTable() {
  readSheet.mockResolvedValue({ sheets: ['S'], sheet: 'S', headers: HEAD, rows: ROWS })
  useStore.setState({ projectId: 1, positionTypes: [{ PositionTypeRef: 'A1' }], psRows: [], elementTypes: [], recipes: [], importDraft: null })
  render(<ProductCodeImportScreen onBack={vi.fn()} onReviewPositions={vi.fn()} />)
  fireEvent.click(await screen.findByText('Choose spreadsheet…'))
  return screen.findByTestId('form-table')
}
const toolbarButton = re => within(screen.getByTestId('table-toolbar')).getByRole('button', { name: re })

describe('the Form, as a table', () => {
  test("the Form's rows in its order, its columns in its order, then status / ET / confirm", async () => {
    const table = await toTable()
    const heads = within(table).getAllByRole('columnheader').map(h => h.textContent).filter(Boolean)
    expect(heads.slice(0, 3)).toEqual(['PositionTypeRef', 'ManufacturerName', 'ProductCode'])
    expect(heads).toContain('Status'); expect(heads).toContain('ElementType')
    const cells = within(table).getAllByRole('row').slice(1).map(r => r.textContent)
    expect(cells[0]).toMatch(/QC50/); expect(cells[1]).toMatch(/QC51/)
  })

  test('clicking a word cycles it code → note → discard, for that row', async () => {
    const table = await toTable()
    const word = within(table).getByTitle(/“louvre”/)
    expect(word.dataset.role).toBe('note')
    fireEvent.click(word)
    expect(within(table).getByTitle(/“louvre”/).dataset.role).toBe('discard')
  })

  test('confirm by ticking; Ctrl+Z un-ticks, Ctrl+Shift+Z re-ticks; the filter follows', async () => {
    await toTable()
    expect(toolbarButton(/Unconfirmed 2/)).toBeInTheDocument()
    fireEvent.click(screen.getAllByLabelText(/^Confirm row/)[0])
    expect(toolbarButton(/Unconfirmed 1/)).toBeInTheDocument()
    await tick()
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(toolbarButton(/Unconfirmed 2/)).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })
    expect(toolbarButton(/Unconfirmed 1/)).toBeInTheDocument()
    fireEvent.click(toolbarButton(/Unconfirmed 1/))
    expect(within(screen.getByTestId('form-table')).getAllByRole('row')).toHaveLength(2)   // header + 1
  })

  test('▸ opens the full painter under the row', async () => {
    const table = await toTable()
    fireEvent.click(within(table).getAllByLabelText('Open painter')[1])
    expect(await screen.findByText(/Confirm & next/)).toBeInTheDocument()
  })

  test('"needs ET" confirms the row and opens the ElementTypes window at the New tab', async () => {
    const table = await toTable()
    const word = within(table).getByTitle(/“QC50”/)
    if (word.dataset.role !== 'code') fireEvent.click(within(table).getByTitle(/“QC50”/))
    fireEvent.click(within(table).getAllByText('needs ET')[0])
    expect(await screen.findByText(/^New \(/)).toBeInTheDocument()
  })

  test('an Accessories code is an extra; clicking it makes it the main product', async () => {
    readSheet.mockResolvedValue({ sheets: ['S'], sheet: 'S', headers: [...HEAD, 'Accessories'],
      rows: [{ PositionTypeRef: 'A1', ManufacturerName: 'LEDFlex', ProductCode: 'UN22SVDW', Accessories: 'UN223DFP' }] })
    useStore.setState({ projectId: 1, positionTypes: [{ PositionTypeRef: 'A1' }], psRows: [], elementTypes: [], recipes: [], importDraft: null })
    render(<ProductCodeImportScreen onBack={vi.fn()} onReviewPositions={vi.fn()} />)
    fireEvent.click(await screen.findByText('Choose spreadsheet…'))
    const table = await screen.findByTestId('form-table')
    // make both words codes: note → discard → code
    for (const w of ['UN22SVDW', 'UN223DFP']) {
      while (within(table).getByTitle(new RegExp(`“${w}”`)).dataset.role !== 'code') fireEvent.click(within(table).getByTitle(new RegExp(`“${w}”`)))
    }
    expect(within(table).getByLabelText('UN22SVDW main')).toBeInTheDocument()
    fireEvent.click(within(table).getByLabelText('UN223DFP extra — make main'))
    expect(within(table).getByLabelText('UN223DFP main')).toBeInTheDocument()
    expect(within(table).getByLabelText('UN22SVDW extra — make main')).toBeInTheDocument()
  })

  test('clean refs match silently; one that does not is flagged on its row and fixed in a window', async () => {
    readSheet.mockResolvedValue({ sheets: ['S'], sheet: 'S', headers: HEAD, rows: [
      { PositionTypeRef: 'A1', ManufacturerName: 'M', ProductCode: 'X1' },
      { PositionTypeRef: 'Z9', ManufacturerName: 'M', ProductCode: 'X2' },
    ] })
    useStore.setState({ projectId: 1, positionTypes: [{ PositionTypeRef: 'A1' }, { PositionTypeRef: 'Z9r' }], psRows: [], elementTypes: [], recipes: [], importDraft: null })
    render(<ProductCodeImportScreen onBack={vi.fn()} onReviewPositions={vi.fn()} />)
    fireEvent.click(await screen.findByText('Choose spreadsheet…'))
    const table = await screen.findByTestId('form-table')
    expect(screen.getByLabelText('Form refs')).toHaveTextContent('1 ref needs a PositionType')
    fireEvent.click(within(table).getByText('no match'))
    expect(await screen.findByText(/Resolve the Form's PositionTypes/)).toBeInTheDocument()
  })

  test('paint one row, then Confirm obvious takes the one-code rows and leaves the two-code row', async () => {
    readSheet.mockResolvedValue({ sheets: ['S'], sheet: 'S', headers: HEAD, rows: [
      { PositionTypeRef: 'A1', ManufacturerName: 'M', ProductCode: 'QC5010 black' },
      { PositionTypeRef: 'A1', ManufacturerName: 'M', ProductCode: 'QC5011 louvre' },
      { PositionTypeRef: 'A1', ManufacturerName: 'M', ProductCode: 'QC5012 QC5013' },
    ] })
    useStore.setState({ projectId: 1, positionTypes: [{ PositionTypeRef: 'A1' }], psRows: [], elementTypes: [], recipes: [], importDraft: null })
    render(<ProductCodeImportScreen onBack={vi.fn()} onReviewPositions={vi.fn()} />)
    fireEvent.click(await screen.findByText('Choose spreadsheet…'))
    const table = await screen.findByTestId('form-table')
    const cycleTo = (w, role) => { while (within(table).getByTitle(new RegExp(`“${w}”`)).dataset.role !== role) fireEvent.click(within(table).getByTitle(new RegExp(`“${w}”`))) }
    cycleTo('QC5010', 'code')
    fireEvent.click(screen.getAllByLabelText(/^Confirm row/)[0])     // taught
    await tick()
    fireEvent.click(toolbarButton(/Confirm 1 obvious row/))
    expect(toolbarButton(/Unconfirmed 1/)).toBeInTheDocument()       // only QC52 QC53 is left
    await tick()
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(toolbarButton(/Unconfirmed 2/)).toBeInTheDocument()       // one undo takes them all back
  })

  test('keyboard: ↓ moves, Space confirms, Enter opens the painter, Esc closes it', async () => {
    await toTable()
    fireEvent.keyDown(window, { key: 'ArrowDown' })
    fireEvent.keyDown(window, { key: ' ' })
    expect(toolbarButton(/Unconfirmed 1/)).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Enter' })
    expect(await screen.findByText(/Confirm & next|Confirmed — next/)).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByText(/Confirm & next|Confirmed — next/)).toBeNull()
  })

  test('one place for ElementTypes: the panel button opens the New tab, the code is highlighted', async () => {
    const table = await toTable()
    const cycleTo = (w, role) => { while (within(table).getByTitle(new RegExp(`“${w}”`)).dataset.role !== role) fireEvent.click(within(table).getByTitle(new RegExp(`“${w}”`))) }
    cycleTo('QC50', 'code')
    fireEvent.click(within(table).getAllByText('needs ET')[0])
    const row = await screen.findByText((_, el) => el?.dataset?.code === 'QC50' && el.tagName === 'TR')
    expect(row.style.background).not.toBe('')
    // no per-code Create buttons left in the panel
    expect(screen.queryByText(/^Create /)).toBeNull()
  })

  test('Add to Product Spec, then straight on to building those positions', async () => {
    readSheet.mockResolvedValue({ sheets: ['S'], sheet: 'S', headers: HEAD, rows: [
      { PositionTypeRef: 'A1', ManufacturerName: 'iGuzzini', ProductCode: 'QC5010' },
    ] })
    const onReviewPositions = vi.fn()
    useStore.setState({
      projectId: 1, positionTypes: [{ PositionTypeRef: 'A1' }], elementTypes: [{ ElementTypeRef: 'ET-PS-01' }], recipes: [], importDraft: null,
      psRows: [{ ElementTypeRef: 'ET-PS-01', Manufacturer: 'iGuzzini', ProductCode: 'QC5010' }],
    })
    window.electronAPI.db.setFormCaptures = vi.fn().mockResolvedValue(undefined)
    render(<ProductCodeImportScreen onBack={vi.fn()} onReviewPositions={onReviewPositions} />)
    fireEvent.click(await screen.findByText('Choose spreadsheet…'))
    await screen.findByTestId('form-table')
    fireEvent.click(screen.getAllByLabelText(/^Confirm row/)[0])
    fireEvent.click(await screen.findByRole('button', { name: /Add 1 to Product Spec/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Build recipes for this position/ }))
    expect(onReviewPositions).toHaveBeenCalledWith(['A1'])
  })
})

describe('TBC rows', () => {
  test('a TBC row gets its own ElementType and a placeholder Product Spec row', async () => {
    readSheet.mockResolvedValue({ sheets: ['S'], sheet: 'S', headers: [...HEAD, 'PageType'], rows: [
      { PositionTypeRef: 'J3a', ManufacturerName: 'Flos', ProductCode: 'Awaiting custom code', ProductName: 'Custom pendant', PageType: 'Point' },
      { PositionTypeRef: 'F1', ManufacturerName: '', ProductCode: 'n/a', ProductName: 'Feed', PageType: 'Point' },
    ] })
    useStore.setState({ projectId: 1, positionTypes: [{ PositionTypeRef: 'J3a' }, { PositionTypeRef: 'F1' }], psRows: [], elementTypes: [], recipes: [], importDraft: null })
    render(<ProductCodeImportScreen onBack={vi.fn()} onReviewPositions={vi.fn()} />)
    fireEvent.click(await screen.findByText('Choose spreadsheet…'))
    const table = await screen.findByTestId('form-table')
    expect(within(table).getByLabelText(/^TBC:/)).toBeInTheDocument()
    expect(within(table).getByLabelText(/^nothing to add:/)).toBeInTheDocument()

    fireEvent.click(within(table).getAllByText('needs ET')[0])
    await screen.findByText(/^New \(/)
    expect(screen.getAllByText(/TBC \(J3a\)/).length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /^Apply 1$/ }))
    await tick()
    const s = useStore.getState()
    const et = s.elementTypes.find(e => /TBC/.test(e.Name || ''))
    expect(et.ElementTypeRef).toBe('ET-PS-01')                                  // TBC is never in the ref
    const ps = s.psRows.find(r => r.ElementTypeRef === et.ElementTypeRef)
    expect(ps).toMatchObject({ ProductCode: 'TBC', IsTBC: 'Y', Manufacturer: 'Flos' })
  })
})

describe('a saved import just carries on', () => {
  test('no resume question; Re-import and Learned this project live in the ⋯ menu', async () => {
    useStore.setState({
      projectId: 1, positionTypes: [{ PositionTypeRef: 'A1' }], psRows: [], elementTypes: [], recipes: [],
      importDraft: {
        version: 1, source: { name: 'form.xlsx', sheet: 'S' }, step: 'review',
        map: { pt: 'PositionTypeRef', code: 'ProductCode', mfr: 'ManufacturerName', exclude: '', acc: '', context: [] },
        rules: {}, assignments: {}, resolutions: [], refOverrides: {}, keptSeparate: [],
        rows: [{ id: 0, rawText: 'QC50', positionType: 'A1', manufacturer: 'iGuzzini', context: {}, overrides: {}, confirmed: true }],
      },
    })
    render(<ProductCodeImportScreen onBack={vi.fn()} onReviewPositions={vi.fn()} />)
    expect(await screen.findByTestId('form-table')).toBeInTheDocument()
    expect(screen.queryByText(/Resume your import/)).toBeNull()
    expect(screen.queryByTestId('learned-panel')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    expect(await screen.findByText(/Re-import from a spreadsheet/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Learned this project'))
    expect(await screen.findByTestId('learned-panel')).toBeInTheDocument()
  })
})
