import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'

window.electronAPI = { db: { setPref: vi.fn().mockResolvedValue(undefined) } }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))
const { default: useStore } = await import('../../src/store/useStore.js')
const { default: IngredientCard } = await import('../../src/components/IngredientCard.jsx')

const row = (p, ctxType, ctxRef, ref, id) => ({ _id: id, PositionTypeRef: p, ContextType: ctxType, ContextRef: ctxRef, ElementTypeRef: ref, Quantity: 1 })
beforeEach(() => {
  useStore.setState({
    projectId: 1, showSharedEverywhere: false, screenView: {}, containerETRefs: new Set(['ET-DL-01']), psRows: [],
    elementTypes: ['ET-DL-01', 'ET-PS-01', 'ET-5PIN-SOCKET'].map(r => ({ ElementTypeRef: r })),
    recipes: [
      row('A01', 'PositionType', 'A01', 'ET-DL-01', 'a'), row('A01', 'ElementType', 'ET-DL-01', 'ET-PS-01', 'b'),
      row('A01', 'PositionType', 'A01', 'ET-5PIN-SOCKET', 'c'), row('A02', 'PositionType', 'A02', 'ET-5PIN-SOCKET', 'd'),
      row('A03', 'PositionType', 'A03', 'ET-DL-02', 'e'), row('A03', 'ElementType', 'ET-DL-02', 'ET-PS-01', 'f'),
    ],
  })
})

describe('5GLMMQ: "shared with" everywhere', () => {
  test('off: a plain row shows no list; on: it names the other positions', () => {
    const r = useStore.getState().recipes.find(x => x._id === 'c')
    const { rerender } = render(<IngredientCard row={r} posRef="A01" sectionKey="position" />)
    expect(screen.queryByTestId('shared-with')).toBeNull()
    act(() => useStore.getState().toggleSharedEverywhere())
    rerender(<IngredientCard row={r} posRef="A01" sectionKey="position" />)
    expect(screen.getByTestId('shared-with')).toHaveTextContent('shared with A02')
  })

  test('on: a row inside a wrapper shows it too', () => {
    useStore.setState({ showSharedEverywhere: true })
    const r = useStore.getState().recipes.find(x => x._id === 'b')
    render(<IngredientCard row={r} posRef="A01" sectionKey="dl_internal" />)
    expect(screen.getByTestId('shared-with')).toHaveTextContent('shared with A03')
  })
})

describe('UY8CQ5: maker and code edited in place', () => {
  test('click edits both; Enter saves to the Product Spec; Esc cancels; the pencil still opens the spec', () => {
    useStore.setState({ psRows: [{ ElementTypeRef: 'ET-5PIN-SOCKET', Manufacturer: 'Wago', ProductCode: '770-115' }], past: [], future: [], psChanges: [] })
    const r = useStore.getState().recipes.find(x => x._id === 'c')
    const open = vi.fn()
    render(<IngredientCard row={r} posRef="A01" sectionKey="position" onOpenProductSpec={open} />)
    fireEvent.click(screen.getByText('Wago – 770-115'))
    fireEvent.change(screen.getByLabelText('Product code'), { target: { value: '770-116' } })
    fireEvent.keyDown(screen.getByLabelText('Product code'), { key: 'Enter' })
    expect(useStore.getState().psRows[0].ProductCode).toBe('770-116')
    fireEvent.click(screen.getByText('Wago – 770-116'))
    fireEvent.change(screen.getByLabelText('Manufacturer'), { target: { value: 'Other' } })
    fireEvent.keyDown(screen.getByLabelText('Manufacturer'), { key: 'Escape' })
    expect(useStore.getState().psRows[0].Manufacturer).toBe('Wago')
    fireEvent.click(screen.getByLabelText('Open in Product Spec'))
    expect(open).toHaveBeenCalledWith('ET-5PIN-SOCKET')
  })
})

test('GHVUMD: a wrapper content item edits in place too', () => {
  useStore.setState({ showSharedEverywhere: false, psRows: [{ ElementTypeRef: 'ET-PS-01', Manufacturer: 'Orluna', ProductCode: 'ZH-1' }], past: [], future: [], psChanges: [],
    containerETRefs: new Set(['et-dl-01']) })
  const r = useStore.getState().recipes.find(x => x._id === 'a')
  render(<IngredientCard row={r} posRef="A01" sectionKey="position" />)
  fireEvent.click(screen.getByText('Orluna – ZH-1'))
  fireEvent.change(screen.getByLabelText('Product code'), { target: { value: 'ZH-2' } })
  fireEvent.keyDown(screen.getByLabelText('Product code'), { key: 'Enter' })
  expect(useStore.getState().psRows[0].ProductCode).toBe('ZH-2')
})

test('8D9XNH: a wrapper item’s name that only repeats maker – code is not shown twice', () => {
  useStore.setState({ containerETRefs: new Set(['et-dl-01']), psRows: [{ ElementTypeRef: 'ET-PS-01', Manufacturer: 'LEDFlex', ProductCode: 'NF240272009' }],
    elementTypes: [{ ElementTypeRef: 'ET-DL-01' }, { ElementTypeRef: 'ET-PS-01', Name: 'LEDFlex - NF240272009' }] })
  const r = useStore.getState().recipes.find(x => x._id === 'a')
  render(<IngredientCard row={r} posRef="A01" sectionKey="position" />)
  expect(screen.getByTestId('contents-item').textContent).not.toMatch(/— LEDFlex/)
})

describe('quiet row: selection checkbox and shared icon', () => {
  const plain = () => useStore.getState().recipes.find(x => x._id === 'c')
  beforeEach(() => useStore.setState({ selectedRowIds: [], selectMode: false }))

  test('the checkbox is hidden at rest, shown while Shift is held, gone on blur', () => {
    render(<IngredientCard row={plain()} posRef="A01" sectionKey="position" />)
    expect(screen.queryByLabelText('Select for copy')).toBeNull()
    fireEvent.keyDown(window, { key: 'Shift' })
    expect(screen.getByLabelText('Select for copy')).toBeInTheDocument()
    fireEvent.blur(window)
    expect(screen.queryByLabelText('Select for copy')).toBeNull()
  })

  test('Shift-click on the card selects it', () => {
    render(<IngredientCard row={plain()} posRef="A01" sectionKey="position" />)
    fireEvent.click(screen.getByText('ET-5PIN-SOCKET'), { shiftKey: true })
    expect(useStore.getState().selectedRowIds).toEqual(['c'])
  })

  test('Shift-clicking the select checkbox toggles it once and mousedown does not start a text range', () => {
    render(<IngredientCard row={plain()} posRef="A01" sectionKey="position" />)
    act(() => useStore.setState({ selectMode: true }))
    const box = screen.getByLabelText('Select for copy')
    expect(fireEvent.mouseDown(box, { shiftKey: true })).toBe(false)   // default prevented
    fireEvent.click(box, { shiftKey: true })
    expect(useStore.getState().selectedRowIds).toEqual(['c'])
    fireEvent.click(box, { shiftKey: true })
    expect(useStore.getState().selectedRowIds).toEqual([])
  })

  test('"Select multiple" keeps checkboxes shown until the selection is cleared', () => {
    render(<IngredientCard row={plain()} posRef="A01" sectionKey="position" />)
    fireEvent.click(screen.getByLabelText('Row actions'))
    fireEvent.click(screen.getByText('Select multiple'))
    expect(useStore.getState().selectedRowIds).toEqual(['c'])
    fireEvent.click(screen.getByLabelText('Select for copy'))   // unticking the last keeps the mode
    expect(screen.getByLabelText('Select for copy')).toBeInTheDocument()
    act(() => useStore.getState().clearRowSelection())
    expect(screen.queryByLabelText('Select for copy')).toBeNull()
  })

  test('the quiet group icon shows the same "shared with" pill on hover', async () => {
    render(<IngredientCard row={plain()} posRef="A01" sectionKey="position" />)
    expect(screen.queryByTestId('shared-with')).toBeNull()
    fireEvent.mouseOver(screen.getByTestId('shared-icon'))
    expect(await screen.findByTestId('shared-with')).toHaveTextContent('shared with A02')
  })
})

test('W47AXP: wrapper contents start open, a closed one stays closed across remounts; the toolbar collapses them all', () => {
  useStore.setState({ containerETRefs: new Set(['et-dl-01']) })
  const r = useStore.getState().recipes.find(x => x._id === 'a')
  const { unmount } = render(<IngredientCard row={r} posRef="A01" sectionKey="position" />)
  expect(screen.getByTestId('contents-item')).toBeInTheDocument()
  fireEvent.click(screen.getByTitle('Hide contents'))
  unmount()
  render(<IngredientCard row={r} posRef="A01" sectionKey="position" />)
  expect(screen.queryByTestId('contents-item')).toBeNull()
  act(() => useStore.getState().setScreenView('recipes', { wrappers: {} }))
  expect(screen.getByTestId('contents-item')).toBeInTheDocument()
  act(() => useStore.getState().setScreenView('recipes', { wrappers: { all: false } }))
  expect(screen.queryByTestId('contents-item')).toBeNull()
})

test('#45: Integer toggles off again, and leaves Design/Contract alone', () => {
  useStore.setState({ recipes: [{ ...row('A01', 'PositionType', 'A01', 'ET-5PIN-SOCKET', 'c'), IsInteger: 'Y', IsContractItem: 'Y' }], past: [], future: [], rsChanges: [] })
  const get = () => useStore.getState().recipes.find(x => x._id === 'c')
  const { rerender } = render(<IngredientCard row={get()} posRef="A01" sectionKey="position" />)
  fireEvent.click(screen.getByText('Integer'))
  expect(get().IsInteger).toBeNull()
  expect(get().IsContractItem).toBe('Y')
  rerender(<IngredientCard row={get()} posRef="A01" sectionKey="position" />)
  fireEvent.click(screen.getByText('Integer'))
  expect(get().IsInteger).toBe('Y')
})

test('#46: discarding flushes the browser DB before the reload', async () => {
  const flush = vi.fn().mockResolvedValue(undefined)
  window.electronAPI.db.flush = flush
  useStore.setState({ rsChanges: [{ _id: 'c' }] })
  await useStore.getState().discardPendingChanges()
  expect(flush).toHaveBeenCalled()
  expect(useStore.getState().rsChanges).toEqual([])
  delete window.electronAPI.db.flush
})
