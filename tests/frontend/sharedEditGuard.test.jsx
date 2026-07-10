import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'
import useStore from '../../src/store/useStore'
import IngredientCard from '../../src/components/IngredientCard'

/**
 * A wrapper's internals belong to the assembly, not to the position you are looking at.
 * ET-PROF-01 inside ET-LIN-01 is shared by C01r and C03r; deleting it from C01r removes
 * it from C03r too. The app computed this (wrapperUsedBy) and said nothing at the point
 * of danger.
 */
const pos = (posRef, ref, id) => ({
  _id: id, PositionTypeRef: posRef, ContextType: 'PositionType', ContextRef: posRef,
  ElementTypeRef: ref, Quantity: 1,
})
const inside = (posRef, container, ref, id) => ({
  _id: id, PositionTypeRef: posRef, ContextType: 'ElementType', ContextRef: container,
  ElementTypeRef: ref, Quantity: 1,
})

const SHARED = [
  pos('C01r', 'ET-LIN-01', 'p1'),
  pos('C03r', 'ET-LIN-01', 'p2'),          // ← shared
  inside('C01r', 'ET-LIN-01', 'ET-PROF-01', 'i1'),
]
const SOLO = [
  pos('C01r', 'ET-LIN-01', 'p1'),
  inside('C01r', 'ET-LIN-01', 'ET-PROF-01', 'i1'),
]

const removeRecipeRow = vi.fn()

function seed(recipes) {
  useStore.setState({
    recipes,
    removeRecipeRow,
    psRows: [], elementTypes: [], containerETRefs: new Set(['et-lin-01']),
    containerReasons: {}, selectedRowIds: [],
  })
}

const renderRow = (row, onReplace = vi.fn()) => render(
  <DndContext>
    <IngredientCard row={row} posRef="C01r" sectionKey="lin_internal" onReplace={onReplace} />
  </DndContext>
)

beforeEach(() => removeRecipeRow.mockClear())

describe('deleting from inside a shared wrapper', () => {
  test('names the other positions rather than silently changing them', () => {
    seed(SHARED)
    renderRow(SHARED[2])
    fireEvent.click(screen.getByTitle(/Mark IsDeleted/))

    expect(screen.getByText(/Delete from a shared assembly/)).toBeTruthy()
    expect(screen.getByText(/C03r/)).toBeTruthy()
    expect(removeRecipeRow).not.toHaveBeenCalled()   // nothing happened yet
  })

  test('"Delete from all" is deliberate, and only then does it happen', () => {
    seed(SHARED)
    renderRow(SHARED[2])
    fireEvent.click(screen.getByTitle(/Mark IsDeleted/))
    fireEvent.click(screen.getByText('Delete from all'))
    expect(removeRecipeRow).toHaveBeenCalledWith('C01r', 'i1')
  })

  test('the escape hatch is offered: fork the assembly for this position', () => {
    seed(SHARED)
    renderRow(SHARED[2])
    fireEvent.click(screen.getByTitle(/Mark IsDeleted/))
    expect(screen.getByText(/Fork for C01r/)).toBeTruthy()
  })

  test('Cancel does nothing at all', () => {
    seed(SHARED)
    renderRow(SHARED[2])
    fireEvent.click(screen.getByTitle(/Mark IsDeleted/))
    fireEvent.click(screen.getByText('Cancel'))
    expect(removeRecipeRow).not.toHaveBeenCalled()
    expect(screen.queryByText(/Delete from a shared assembly/)).toBeNull()
  })
})

describe('the guard stays out of the way when nothing is shared', () => {
  test('a wrapper used by ONE position deletes straight away', () => {
    seed(SOLO)
    renderRow(SOLO[1])
    fireEvent.click(screen.getByTitle('Mark IsDeleted'))
    expect(removeRecipeRow).toHaveBeenCalledWith('C01r', 'i1')
    expect(screen.queryByText(/shared assembly/)).toBeNull()
  })

  test('a position-level row is nobody else’s business', () => {
    seed(SHARED)
    render(
      <DndContext>
        <IngredientCard row={SHARED[0]} posRef="C01r" sectionKey="position" onReplace={vi.fn()} />
      </DndContext>
    )
    fireEvent.click(screen.getByTitle('Mark IsDeleted'))
    expect(removeRecipeRow).toHaveBeenCalledWith('C01r', 'p1')
  })
})
