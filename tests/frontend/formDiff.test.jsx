import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor, act } from '@testing-library/react'
import { matchForms, wordDiff } from '../../src/utils/formDiff.js'

const readSheet = vi.fn()
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: (...a) => readSheet(...a),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(),
  fileMeta: vi.fn(async p => ({ name: p === 'tok-old' ? 'Form rev A.xlsx' : 'Form rev B.xlsx' })),
}))
window.electronAPI = {
  openXlsxDialog: vi.fn(),
  db: { setPref: vi.fn().mockResolvedValue(undefined), getPref: vi.fn().mockResolvedValue(null) },
}
const { default: useStore } = await import('../../src/store/useStore.js')
const { default: ProductCodeImportScreen } = await import('../../src/screens/ProductCodeImportScreen.jsx')

const row = (formRef, rawText, manufacturer = 'iGuzzini') => ({ formRef, rawText, manufacturer })

describe('matchForms', () => {
  test('unchanged, changed, new and removed, matched within a Form ref', () => {
    const old = [row('A1', 'QC5010 c/w driver'), row('A4', 'QC7000'), row('A5', 'QC8000')]
    const now = [row('A1', 'QC5010  c/w driver'), row('A3', 'QC6000'), row('A4', 'QC7001')]
    const m = matchForms(old, now)
    expect(m.rows.map(r => r.state)).toEqual(['unchanged', 'new', 'changed'])
    expect(m.rows[2].prev.rawText).toBe('QC7000')
    expect(m.removed.map(r => r.formRef)).toEqual(['A5'])
    expect(m.counts).toEqual({ unchanged: 1, changed: 1, new: 1, removed: 1 })
  })

  test('several rows under one ref pair by similarity, whatever their order', () => {
    const old = [row('B1', 'LED strip 24V 5m'), row('B1', 'Profile ALU-20 opal')]
    const now = [row('B1', 'Profile ALU-20 clear'), row('B1', 'LED strip 24V 5m')]
    const m = matchForms(old, now)
    expect(m.rows.map(r => r.state)).toEqual(['changed', 'unchanged'])
    expect(m.rows[0].prev.rawText).toBe('Profile ALU-20 opal')
    expect(m.removed).toEqual([])
  })

  test('a new maker on the same text is a change', () => {
    const m = matchForms([row('A1', 'X100', 'Acme')], [row('A1', 'X100', 'Other')])
    expect(m.rows[0].state).toBe('changed')
  })

  test('word diff', () => {
    expect(wordDiff('QC7000 opal', 'QC7001 opal')).toEqual([
      { text: 'QC7000', kind: 'removed' }, { text: 'QC7001', kind: 'added' }, { text: 'opal', kind: 'same' },
    ])
  })
})

// ── The import screen, compared with an older Form ──────────────────────────────────────
const HEAD = ['PositionTypeRef', 'ManufacturerName', 'ProductCode']
const REV_A = [
  { PositionTypeRef: 'A1', ManufacturerName: 'iGuzzini', ProductCode: 'QC5010 c/w driver' },
  { PositionTypeRef: 'A4', ManufacturerName: 'iGuzzini', ProductCode: 'QC7000' },
  { PositionTypeRef: 'A5', ManufacturerName: 'iGuzzini', ProductCode: 'QC8000' },
]
const REV_B = [
  { PositionTypeRef: 'A1', ManufacturerName: 'iGuzzini', ProductCode: 'QC5010 c/w driver' },
  { PositionTypeRef: 'A3', ManufacturerName: 'iGuzzini', ProductCode: 'QC6000' },
  { PositionTypeRef: 'A4', ManufacturerName: 'iGuzzini', ProductCode: 'QC7001' },
]
const sheetFor = p => ({ sheets: ['S'], sheet: 'S', headers: HEAD, rows: p === 'tok-old' ? REV_A : REV_B })

function setup(over = {}) {
  readSheet.mockImplementation(async p => sheetFor(p))
  useStore.setState({
    projectId: 1, importDraft: null, recipes: [], formCaptures: null,
    positionTypes: ['A1', 'A3', 'A4', 'A5'].map(r => ({ PositionTypeRef: r })),
    elementTypes: ['ET-PS-01', 'ET-PS-04', 'ET-PS-05'].map(r => ({ ElementTypeRef: r })),
    psRows: [
      { ElementTypeRef: 'ET-PS-01', Manufacturer: 'iGuzzini', ProductCode: 'QC5010' },
      { ElementTypeRef: 'ET-PS-04', Manufacturer: 'iGuzzini', ProductCode: 'QC7000' },
      { ElementTypeRef: 'ET-PS-05', Manufacturer: 'iGuzzini', ProductCode: 'QC8000' },
    ],
    ...over,
  })
}
const states = () => Object.fromEntries(screen.getAllByTestId('row-change').map(td => [td.closest('tr').textContent.match(/A\d/)[0], td.dataset.state]))

describe('comparing two Forms in the import', () => {
  beforeEach(() => { vi.clearAllMocks(); readSheet.mockReset() })

  test('Compare with an older Form: each row shows what changed, removed rows are listed', async () => {
    setup()
    window.electronAPI.openXlsxDialog.mockResolvedValueOnce('tok-new').mockResolvedValueOnce('tok-old')
    render(<ProductCodeImportScreen onBack={vi.fn()} onReviewPositions={vi.fn()} />)
    fireEvent.click(await screen.findByText('Choose spreadsheet…'))
    await screen.findByTestId('form-table')
    expect(screen.queryByTestId('row-change')).toBeNull()             // no comparison: as today
    await act(async () => { fireEvent.click(screen.getByText(/Compare with an older Form/)) })

    expect(await screen.findByTestId('form-diff-banner')).toHaveTextContent('Compared with Form rev A.xlsx: 1 unchanged · 1 changed · 1 new · 1 removed')
    expect(states()).toEqual({ A1: 'unchanged', A3: 'new', A4: 'changed' })
    const a4 = screen.getAllByTestId('row-change').find(td => td.dataset.state === 'changed')
    expect(a4).toHaveTextContent('was QC7000 · ET-PS-04')
    expect(within(screen.getByTestId('removed-rows')).getByText('QC8000')).toBeInTheDocument()
    expect(screen.getByTestId('removed-rows')).toHaveTextContent('ET-PS-05')

    // Chips filter; the expanded changed row shows the word diff.
    fireEvent.click(screen.getByRole('button', { name: 'Changed 1' }))
    expect(states()).toEqual({ A4: 'changed' })
    fireEvent.click(screen.getByRole('button', { name: 'Open painter' }))
    expect(screen.getByTestId('row-was')).toHaveTextContent('QC7000 QC7001')

    fireEvent.click(screen.getByText('Clear comparison'))
    expect(screen.queryByTestId('form-diff-banner')).toBeNull()
    expect(screen.queryByTestId('row-change')).toBeNull()
  })

  test('Re-import compares the new Form with the one it replaces, and a reload keeps it', async () => {
    setup()
    window.electronAPI.openXlsxDialog.mockResolvedValueOnce('tok-old').mockResolvedValueOnce('tok-new')
    const view = render(<ProductCodeImportScreen onBack={vi.fn()} onReviewPositions={vi.fn()} />)
    fireEvent.click(await screen.findByText('Choose spreadsheet…'))
    await screen.findByTestId('form-table')
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    await act(async () => { fireEvent.click(await screen.findByText(/Re-import from a spreadsheet/)) })
    await waitFor(() => expect(screen.getByTestId('form-diff-banner')).toHaveTextContent('Compared with Form rev A.xlsx'))
    expect(states()).toEqual({ A1: 'unchanged', A3: 'new', A4: 'changed' })

    // The draft carries the comparison: a reload resumes with it.
    await waitFor(() => expect(useStore.getState().importDraft?.compareBase?.rows).toHaveLength(3), { timeout: 3000 })
    view.unmount()
    render(<ProductCodeImportScreen onBack={vi.fn()} onReviewPositions={vi.fn()} />)
    expect(await screen.findByTestId('form-diff-banner')).toHaveTextContent('1 removed')
  })

  test('an older sheet without a product code column is not compared', async () => {
    setup()
    window.electronAPI.openXlsxDialog.mockResolvedValueOnce('tok-new').mockResolvedValueOnce('tok-bad')
    readSheet.mockImplementation(async p => (p === 'tok-bad' ? { sheets: ['S'], sheet: 'S', headers: ['Foo'], rows: [{ Foo: 1 }] } : sheetFor(p)))
    render(<ProductCodeImportScreen onBack={vi.fn()} onReviewPositions={vi.fn()} />)
    fireEvent.click(await screen.findByText('Choose spreadsheet…'))
    await screen.findByTestId('form-table')
    await act(async () => { fireEvent.click(screen.getByText(/Compare with an older Form/)) })
    expect(await screen.findByText(/no product code column to compare with/)).toBeInTheDocument()
    expect(screen.queryByTestId('form-diff-banner')).toBeNull()
  })
})
