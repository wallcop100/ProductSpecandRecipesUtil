import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

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
    projectId: 1, showSharedEverywhere: false, containerETRefs: new Set(['ET-DL-01']), psRows: [],
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
