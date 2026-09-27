import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

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
    fireEvent.click(toolbarButton(/Confirm 1 obvious row/))
    expect(toolbarButton(/Unconfirmed 1/)).toBeInTheDocument()       // only QC52 QC53 is left
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
})
