import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'

window.electronAPI = { db: { setPref: vi.fn().mockResolvedValue(undefined) } }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))
const { default: useStore } = await import('../../src/store/useStore.js')
const { default: ETSpecEditor } = await import('../../src/components/ETSpecEditor.jsx')
const { default: CollectionEditor } = await import('../../src/components/CollectionEditor.jsx')

describe('Product Spec: change family or ref', () => {
  test('picking a family keeps the ref; "Renumber into it" takes its next ref; Apply moves and renames', () => {
    useStore.setState({
      projectId: 1, dbChanges: [], psChanges: [], rsChanges: [], past: [], future: [],
      elementTypes: [
        { ElementTypeRef: 'ET-LIN-INGREDIENTS-05', Family: 'ET-LIN-INGREDIENTS' },
        { ElementTypeRef: 'ET-PS-MOUNTING-FRAME-01', Family: 'ET-PS-MOUNTING-FRAME' },
      ],
      psRows: [{ ElementTypeRef: 'ET-LIN-INGREDIENTS-05', Manufacturer: 'Spanlite', ProductCode: 'TBC' }],
      recipes: [{ _id: 'r1', PositionTypeRef: 'A1', ContextType: 'PositionType', ContextRef: 'A1', ElementTypeRef: 'ET-LIN-INGREDIENTS-05' }],
    })
    const onRenamed = vi.fn()
    render(<ETSpecEditor selectedRef="ET-LIN-INGREDIENTS-05" onRenamed={onRenamed} />)
    fireEvent.click(screen.getByTestId('family-ref-open'))
    fireEvent.change(screen.getByLabelText('Family'), { target: { value: 'ET-PS-MOUNTING-FRAME' } })
    expect(screen.getByLabelText('Ref')).toHaveValue('ET-LIN-INGREDIENTS-05')        // not forced (5WZXN9)
    fireEvent.click(screen.getByTestId('use-family-ref'))
    expect(screen.getByLabelText('Ref')).toHaveValue('ET-PS-MOUNTING-FRAME-02')
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    const s = useStore.getState()
    expect(s.elementTypes.find(e => e.ElementTypeRef === 'ET-PS-MOUNTING-FRAME-02').Family).toBe('ET-PS-MOUNTING-FRAME')
    expect(s.psRows[0].ElementTypeRef).toBe('ET-PS-MOUNTING-FRAME-02')
    expect(s.recipes[0].ElementTypeRef).toBe('ET-PS-MOUNTING-FRAME-02')
    expect(onRenamed).toHaveBeenCalledWith('ET-PS-MOUNTING-FRAME-02')
  })
})

describe('Product Spec: family only, and fork', () => {
  const base = () => useStore.setState({
    projectId: 1, dbChanges: [], psChanges: [], rsChanges: [], past: [], future: [],
    elementTypes: [
      { ElementTypeRef: 'ET-2PIN-ORLUNA', Family: 'ET-CONNECTORS', Description: '2-pin' },
      { ElementTypeRef: 'ET-PS-MOUNTING-FRAME-01', Family: 'ET-PS-MOUNTING-FRAME' },
    ],
    psRows: [{ ElementTypeRef: 'ET-2PIN-ORLUNA', Manufacturer: 'Orluna', ProductCode: 'OR-2P' }],
    recipes: [],
  })

  test('changing only the family leaves the ref alone', () => {
    base()
    render(<ETSpecEditor selectedRef="ET-2PIN-ORLUNA" onRenamed={vi.fn()} />)
    fireEvent.click(screen.getByTestId('family-ref-open'))
    fireEvent.change(screen.getByLabelText('Family'), { target: { value: 'ET-PS-MOUNTING-FRAME' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    const et = useStore.getState().elementTypes.find(e => e.ElementTypeRef === 'ET-2PIN-ORLUNA')
    expect(et.Family).toBe('ET-PS-MOUNTING-FRAME')
  })

  test('Fork makes a new ElementType with a copy of the spec, and selects it', () => {
    base()
    const onRenamed = vi.fn()
    render(<ETSpecEditor selectedRef="ET-2PIN-ORLUNA" onRenamed={onRenamed} />)
    fireEvent.click(screen.getByTestId('fork-et'))
    const newRef = onRenamed.mock.calls[0][0]
    expect(newRef).not.toBe('ET-2PIN-ORLUNA')
    const s = useStore.getState()
    expect(s.elementTypes.find(e => e.ElementTypeRef === newRef)).toMatchObject({ Family: 'ET-CONNECTORS' })
    expect(s.psRows.find(p => p.ElementTypeRef === newRef)).toMatchObject({ Manufacturer: 'Orluna', ProductCode: 'OR-2P' })
  })
})

describe('Connector template tags', () => {
  test('the project\'s own tags are offered as values for a Tags condition', () => {
    useStore.setState({ tagPalette: ['Exterior'], positionUI: { A1: { tags: ['Wall-Washer'] } }, elementTypes: [] })
    render(<CollectionEditor show onHide={vi.fn()} collection={null} />)
    fireEvent.click(screen.getByRole('button', { name: /Add condition/ }))
    const value = within(screen.getByTestId('template-rule')).getByLabelText('Value')
    const options = [...document.getElementById(value.getAttribute('list')).querySelectorAll('option')].map(o => o.value)
    expect(options).toEqual(expect.arrayContaining(['Wall-Washer', 'Exterior']))
  })
})

describe('Positions held by a template respect its tags', () => {
  test('a pinned position with an excluded tag is left out, and unpinned on save', async () => {
    const unpinPositions = vi.fn(async () => {})
    useStore.setState({
      tagPalette: [], elementTypes: [],
      positionUI: { A1: { tags: ['Exterior'] }, A2: { tags: [] } },
      connectorPins: { 5: ['A1', 'A2'] }, connectorExcludes: {},
      unpinPositions, updateCollection: vi.fn(async () => {}),
    })
    const coll = { CollectionId: 5, Name: 'T', ApplicableTags: '', ExcludedTags: '["Exterior"]', Ingredients: '[]' }
    render(<CollectionEditor show onHide={vi.fn()} collection={coll} />)
    const held = screen.getByTestId('editor-positions')
    expect(within(held).getByTestId('left-out-by-rule')).toHaveTextContent('A1')
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(unpinPositions).toHaveBeenCalledWith(5, ['A1']))
  })
})
