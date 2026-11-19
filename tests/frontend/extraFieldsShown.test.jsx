import { test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

window.electronAPI = { db: { setPref: vi.fn().mockResolvedValue(undefined) } }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))
const { default: useStore } = await import('../../src/store/useStore.js')
const { default: IngredientCard } = await import('../../src/components/IngredientCard.jsx')

// Rows as read from the workbook: the sheet's own column names.
const row = (id, extra) => ({ _id: id, PositionTypeRef: 'A01', ContextType: 'ElementType', ContextRef: 'ET-DL-01', ElementTypeRef: 'ET-TAPE-01', ...extra })
beforeEach(() => {
  useStore.setState({ projectId: 1, screenView: {}, containerETRefs: new Set(['ET-DL-01']), psRows: [],
    elementTypes: [{ ElementTypeRef: 'ET-DL-01' }, { ElementTypeRef: 'ET-TAPE-01' }], recipes: [] })
})

test('a DimMult already in the workbook is shown on the ET internal recipe', () => {
  render(<IngredientCard row={row('a', { Dim_QuantityMultiplier: 1 })} posRef="A01" sectionKey="dl_internal" />)
  expect(screen.getByText('DimMult')).toBeTruthy()
})

test('a PackQuantity already in the workbook is shown too', () => {
  render(<IngredientCard row={row('b', { Quantity: 1, PackQuantity: 10 })} posRef="A01" sectionKey="dl_internal" />)
  expect(screen.getByText('PackQty')).toBeTruthy()
})

test('with none set, the extras stay tucked away', () => {
  render(<IngredientCard row={row('c', { Quantity: 1 })} posRef="A01" sectionKey="dl_internal" />)
  expect(screen.queryByText('DimMult')).toBeNull()
})
