import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

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
  test('code, PositionType and manufacturer all found → straight past it', async () => {
    await pick(['PositionTypeRef', 'ProductCode', 'ManufacturerName'])
    expect(await screen.findByText(/Resolve the Form's PositionTypes/)).toBeInTheDocument()
    expect(screen.queryByText('Which columns matter?')).toBeNull()
    fireEvent.click(screen.getByText('← Columns'))                 // and back is one click
    expect(await screen.findByText('Which columns matter?')).toBeInTheDocument()
  })

  test('a column missing → the step is shown', async () => {
    await pick(['PositionTypeRef', 'ProductCode'])
    expect(await screen.findByText('Which columns matter?')).toBeInTheDocument()
  })
})
