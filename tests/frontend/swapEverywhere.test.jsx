import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import useStore from '../../src/store/useStore'
import SwapEverywhereModal from '../../src/components/SwapEverywhereModal'

const pos = (posRef, ref, id, extra = {}) => ({
  _id: id, PositionTypeRef: posRef, ContextType: 'PositionType', ContextRef: posRef,
  ElementTypeRef: ref, Quantity: 2, ...extra,
})
const inside = (posRef, container, ref, id) => ({
  _id: id, PositionTypeRef: posRef, ContextType: 'ElementType', ContextRef: container,
  ElementTypeRef: ref, Quantity: 1,
})

const recipes = [
  pos('C01r', 'ET-LIN-01', 'w1'),
  pos('C03r', 'ET-LIN-01', 'w2'),                    // shared wrapper
  inside('C01r', 'ET-LIN-01', 'ET-TAPE-01', 'i1'),
  inside('C03r', 'ET-LIN-01', 'ET-TAPE-01', 'i2'),   // same sheet row, projected
  pos('D07', 'ET-TAPE-01', 'p3', { IsDesign: 'Y' }),
]

beforeEach(() => {
  useStore.setState({
    recipes: recipes.map(r => ({ ...r })),
    elementTypes: [{ ElementTypeRef: 'ET-TAPE-01' }, { ElementTypeRef: 'ET-TAPE-09' }],
    psRows: [], containerETRefs: new Set(['et-lin-01']),
    rsChanges: [], psChanges: [], dbChanges: [], past: [], localElementTypes: [],
    activeContextType: 'PositionType', activeETRef: null,
  })
})

const pick = to => fireEvent.change(screen.getByPlaceholderText('Pick the replacement…'), { target: { value: to } })

describe('the preview tells the truth before anything is written', () => {
  test('it names the rows and the positions, sharers included', () => {
    render(<SwapEverywhereModal show fromRef="ET-TAPE-01" onHide={vi.fn()} />)
    pick('ET-TAPE-09')
    expect(screen.getByText(/2 rows · 3 positions/)).toBeTruthy()
  })

  test('a shared assembly is called out, not buried', () => {
    render(<SwapEverywhereModal show fromRef="ET-TAPE-01" onHide={vi.fn()} />)
    pick('ET-TAPE-09')
    expect(screen.getByText(/is a shared assembly/)).toBeTruthy()
    expect(screen.getAllByText(/also changes C03r/).length).toBeGreaterThan(0)
  })

  test('nothing has happened yet', () => {
    render(<SwapEverywhereModal show fromRef="ET-TAPE-01" onHide={vi.fn()} />)
    pick('ET-TAPE-09')
    expect(useStore.getState().recipes.filter(r => r.ElementTypeRef === 'ET-TAPE-09')).toHaveLength(0)
  })

  test('swapping a ref for itself offers nothing to do', () => {
    render(<SwapEverywhereModal show fromRef="ET-TAPE-01" onHide={vi.fn()} />)
    pick('ET-TAPE-01')
    expect(screen.getByText(/Nothing to swap/)).toBeTruthy()
  })
})

describe('applying it', () => {
  test('every live row is rewritten, and the shared assembly only once', () => {
    const onHide = vi.fn()
    render(<SwapEverywhereModal show fromRef="ET-TAPE-01" onHide={onHide} />)
    pick('ET-TAPE-09')
    fireEvent.click(screen.getByText(/Swap 2 rows/))

    const rows = useStore.getState().recipes
    expect(rows.find(r => r._id === 'i1').ElementTypeRef).toBe('ET-TAPE-09')
    expect(rows.find(r => r._id === 'p3').ElementTypeRef).toBe('ET-TAPE-09')
    expect(onHide).toHaveBeenCalled()
  })

  test('keepFields preserves quantity and the design flag', () => {
    render(<SwapEverywhereModal show fromRef="ET-TAPE-01" onHide={vi.fn()} />)
    pick('ET-TAPE-09')
    fireEvent.click(screen.getByText(/Swap 2 rows/))
    const p3 = useStore.getState().recipes.find(r => r._id === 'p3')
    expect(p3.Quantity).toBe(2)
    expect(p3.IsDesign).toBe('Y')
  })

  test('turning keepFields off resets the row', () => {
    render(<SwapEverywhereModal show fromRef="ET-TAPE-01" onHide={vi.fn()} />)
    pick('ET-TAPE-09')
    fireEvent.click(screen.getByLabelText(/Keep quantity and flags/))
    fireEvent.click(screen.getByText(/Swap 2 rows/))
    const p3 = useStore.getState().recipes.find(r => r._id === 'p3')
    expect(p3.Quantity).toBe(1)
    expect(p3.IsDesign).toBeNull()
  })

  test('one undo step for the whole swap', () => {
    const before = useStore.getState().past.length
    render(<SwapEverywhereModal show fromRef="ET-TAPE-01" onHide={vi.fn()} />)
    pick('ET-TAPE-09')
    fireEvent.click(screen.getByText(/Swap 2 rows/))
    expect(useStore.getState().past.length).toBe(before + 1)
  })

  test('the destination gets a Product Spec row, like any other add', () => {
    render(<SwapEverywhereModal show fromRef="ET-TAPE-01" onHide={vi.fn()} />)
    pick('ET-TAPE-09')
    fireEvent.click(screen.getByText(/Swap 2 rows/))
    expect(useStore.getState().psRows.some(r => r.ElementTypeRef === 'ET-TAPE-09')).toBe(true)
  })
})

describe('scoped to one position', () => {
  test('the default is this position, and it still warns about the sharers', () => {
    render(<SwapEverywhereModal show fromRef="ET-TAPE-01" posRef="C01r" onHide={vi.fn()} />)
    pick('ET-TAPE-09')
    expect(screen.getByText(/1 row · 2 positions/)).toBeTruthy()
    expect(screen.getAllByText(/also changes C03r/).length).toBeGreaterThan(0)
  })

  test('widening the scope reaches D07 as well', () => {
    render(<SwapEverywhereModal show fromRef="ET-TAPE-01" posRef="C01r" onHide={vi.fn()} />)
    pick('ET-TAPE-09')
    fireEvent.click(screen.getByLabelText('everywhere it appears'))
    expect(screen.getByText(/2 rows · 3 positions/)).toBeTruthy()
  })
})
