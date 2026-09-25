import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

window.electronAPI = { db: { setPref: vi.fn().mockResolvedValue(undefined) } }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))
const { default: useStore } = await import('../../src/store/useStore.js')
const { default: ExistingETReviewModal } = await import('../../src/components/ExistingETReviewModal.jsx')

function setup() {
  useStore.setState({
    projectId: 1, dbChanges: [], past: [], future: [],
    elementTypes: [
      { ElementTypeRef: 'ET-PS-01', Name: 'Spot', Description: 'Old', Family: 'ET-PS' },
      { ElementTypeRef: 'ET-TAPE-01', Name: 'Tape', Description: '', Family: null },
    ],
    psRows: [{ ElementTypeRef: 'ET-TAPE-01', Manufacturer: 'LEDFlex', ProductCode: 'NFS240272009' }],
    recipes: [{ _id: 'r1', PositionTypeRef: 'A1', ContextType: 'PositionType', ElementTypeRef: 'ET-TAPE-01' }],
  })
  return render(<ExistingETReviewModal show onHide={vi.fn()} />)
}

describe('Review existing ElementTypes', () => {
  test('every ElementType is listed by family, the unfiled ones first', () => {
    setup()
    const groups = screen.getAllByTestId(/existing-family-/)
    expect(groups[0]).toHaveAttribute('data-testid', 'existing-family-none')
    expect(within(groups[0]).getByText('ET-TAPE-01')).toBeInTheDocument()
    expect(screen.getByText(/LEDFlex · NFS240272009 · 1 position/)).toBeInTheDocument()
  })

  test('nothing is written until Save; Save writes only what changed', () => {
    setup()
    fireEvent.change(screen.getByLabelText('Family of ET-TAPE-01'), { target: { value: 'ET-LIN-TAPE' } })
    fireEvent.change(screen.getByLabelText('Description of ET-PS-01'), { target: { value: 'Recessed spot' } })
    expect(useStore.getState().elementTypes[1].Family).toBeNull()
    fireEvent.click(screen.getByText('Save 2 changes'))
    const ets = useStore.getState().elementTypes
    expect(ets.find(e => e.ElementTypeRef === 'ET-TAPE-01').Family).toBe('ET-LIN-TAPE')
    expect(ets.find(e => e.ElementTypeRef === 'ET-PS-01')).toMatchObject({ Description: 'Recessed spot', Name: 'Spot' })
  })

  test('the filter narrows by maker or code too', () => {
    setup()
    fireEvent.change(screen.getByLabelText('Filter ElementTypes'), { target: { value: 'nfs24' } })
    expect(screen.queryByText('ET-PS-01')).toBeNull()
    expect(screen.getByText('ET-TAPE-01')).toBeInTheDocument()
  })
})
