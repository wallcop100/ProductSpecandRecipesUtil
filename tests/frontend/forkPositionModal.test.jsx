import { describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

window.electronAPI = { db: { setPref: vi.fn().mockResolvedValue(undefined) } }
window.confirm = vi.fn(() => true)
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))

const { default: useStore } = await import('../../src/store/useStore.js')
const { default: ForkPositionModal } = await import('../../src/components/ForkPositionModal.jsx')

const recipes = () => [
  { _id: 's-wrap', PositionTypeRef: 'C01r', ContextType: 'PositionType', ContextRef: 'C01r',
    ElementTypeRef: 'ET-LIN-01', IsDesign: 'Y', _row_num: 2 },
  { _id: 's-drv', PositionTypeRef: 'C01r', ContextType: 'ElementType', ContextRef: 'ET-LIN-01',
    ElementTypeRef: 'ET-CCL-DRIVER-01', IsContractItem: 'Y', _row_num: 3 },
  // an existing recipe on C05 → non-empty target
  { _id: 'c05', PositionTypeRef: 'C05', ContextType: 'PositionType', ContextRef: 'C05',
    ElementTypeRef: 'ET-OTHER', IsDesign: 'Y', _row_num: 9 },
]

function setup() {
  useStore.setState({
    recipes: recipes(),
    positionTypes: [{ PositionTypeRef: 'C01r' }, { PositionTypeRef: 'C10r' }, { PositionTypeRef: 'C05' }],
    positions: [], psRows: [], elementTypes: [{ ElementTypeRef: 'ET-LIN-01' }],
    containerETRefs: new Set(['et-lin-01']), past: [], future: [],
    activeContextType: 'PositionType', activeETRef: null,
  })
  return render(<ForkPositionModal show sourceRef="C01r" onHide={() => {}} />)
}

describe('ForkPositionModal', () => {
  beforeEach(() => vi.clearAllMocks())

  test('lists targets with their empty / N-rows state, source not a target', () => {
    setup()
    expect(screen.getByLabelText(/C10r/)).toBeInTheDocument()
    expect(screen.getByLabelText(/C05/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^C01r/)).not.toBeInTheDocument()   // source has no target checkbox
    expect(screen.getByText('empty')).toBeInTheDocument()        // C10r
    expect(screen.getByText('1 rows')).toBeInTheDocument()       // C05 has a recipe
  })

  test('the trim checklist shows position-level and internal rows', () => {
    setup()
    expect(screen.getAllByText('ET-LIN-01').length).toBeGreaterThan(0)  // wrapper row (+ preview)
    expect(screen.getByText('ET-CCL-DRIVER-01')).toBeInTheDocument()
    expect(screen.getByText('Position level')).toBeInTheDocument()
  })

  test('forking an empty target builds an independent recipe on it', () => {
    setup()
    fireEvent.click(screen.getByLabelText(/C10r/))
    fireEvent.click(screen.getByText(/Fork into/))
    const c10 = useStore.getState().recipes.filter(
      r => (r.PositionTypeRef || r.positionTypeRef) === 'C10r' && (r.IsDeleted || r.isDeleted) !== 'Y')
    expect(c10.length).toBe(2)
    expect(c10.find(r => r.IsDesign === 'Y').ElementTypeRef).not.toBe('ET-LIN-01')  // own wrapper
    expect(window.confirm).not.toHaveBeenCalled()   // empty target, no overwrite prompt
  })

  test('a non-empty target warns before overwriting', () => {
    setup()
    fireEvent.click(screen.getByLabelText(/C05/))
    fireEvent.click(screen.getByText(/Fork into/))
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('C05 (1 row)'))
  })

  test('unticking the driver drops it from the fork', () => {
    setup()
    fireEvent.click(screen.getByLabelText(/C10r/))
    fireEvent.click(screen.getByLabelText(/ET-CCL-DRIVER-01/))   // untick the driver
    fireEvent.click(screen.getByText(/Fork into/))
    const c10 = useStore.getState().recipes.filter(
      r => (r.PositionTypeRef || r.positionTypeRef) === 'C10r' && (r.IsDeleted || r.isDeleted) !== 'Y')
    expect(c10.some(r => r.ElementTypeRef === 'ET-CCL-DRIVER-01')).toBe(false)
  })
})
