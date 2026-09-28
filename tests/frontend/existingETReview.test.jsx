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

describe('Move to family', () => {
  function setupMove() {
    useStore.setState({
      projectId: 1, dbChanges: [], psChanges: [], rsChanges: [], past: [], future: [],
      elementTypes: [
        { ElementTypeRef: 'ET-PS', Family: null, IsCollection: 'Y' },
        { ElementTypeRef: 'ET-PS-01', Name: 'DGA - DL-100', Family: 'ET-PS' },
        { ElementTypeRef: 'ET-PS-02', Name: 'DGA - DL-100-FR', Family: 'ET-PS' },
        { ElementTypeRef: 'ET-PS-03', Name: 'DGA - LV-1', Family: 'ET-PS' },
      ],
      psRows: [{ ElementTypeRef: 'ET-PS-02', Manufacturer: 'DGA', ProductCode: 'DL-100-FR' }],
      recipes: [
        { _id: 'r1', PositionTypeRef: 'A1', ContextType: 'PositionType', ContextRef: 'A1', ElementTypeRef: 'ET-PS-01', IsDesign: 'Y' },
        { _id: 'r2', PositionTypeRef: 'A1', ContextType: 'PositionType', ContextRef: 'A1', ElementTypeRef: 'ET-PS-02' },
      ],
    })
    return render(<ExistingETReviewModal show onHide={vi.fn()} />)
  }

  test('ticked ElementTypes move, renumbered, through spec and recipes; the family is created', () => {
    setupMove()
    fireEvent.click(screen.getByLabelText('Select ET-PS-02'))
    fireEvent.change(screen.getByLabelText('Move to family'), { target: { value: 'ET-PS-MOUNTING-FRAME' } })
    expect(screen.getByTestId('move-bar')).toHaveTextContent('ET-PS-02 → ET-PS-MOUNTING-FRAME-01')
    expect(screen.getByTestId('move-bar')).toHaveTextContent('Creates family ET-PS-MOUNTING-FRAME, ET-PS-MOUNTING')
    fireEvent.click(screen.getByRole('button', { name: 'Move' }))

    const s = useStore.getState()
    const refs = s.elementTypes.map(e => e.ElementTypeRef)
    expect(refs).toContain('ET-PS-MOUNTING-FRAME-01')
    expect(refs).not.toContain('ET-PS-02')
    expect(s.elementTypes.find(e => e.ElementTypeRef === 'ET-PS-MOUNTING-FRAME')).toMatchObject({ IsCollection: 'Y', Family: 'ET-PS-MOUNTING' })
    expect(s.elementTypes.find(e => e.ElementTypeRef === 'ET-PS-MOUNTING-FRAME-01').Family).toBe('ET-PS-MOUNTING-FRAME')
    expect(s.psRows[0].ElementTypeRef).toBe('ET-PS-MOUNTING-FRAME-01')
    expect(s.recipes.find(r => r._id === 'r2').ElementTypeRef).toBe('ET-PS-MOUNTING-FRAME-01')
    expect(screen.getByTestId('move-done')).toHaveTextContent('ET-PS-02 → ET-PS-MOUNTING-FRAME-01')
  })

  test('without renumbering only the family changes', () => {
    setupMove()
    fireEvent.click(screen.getByLabelText('Select ET-PS-03'))
    fireEvent.change(screen.getByLabelText('Move to family'), { target: { value: 'ET-PS-ACCESSORIES' } })
    fireEvent.click(screen.getByLabelText('Renumber refs into it'))
    fireEvent.click(screen.getByRole('button', { name: 'Move' }))
    const et = useStore.getState().elementTypes.find(e => e.ElementTypeRef === 'ET-PS-03')
    expect(et.Family).toBe('ET-PS-ACCESSORIES')
  })
})
