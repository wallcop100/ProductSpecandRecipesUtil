import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

window.electronAPI = { db: { setPref: vi.fn().mockResolvedValue(undefined) } }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))

const { default: useStore } = await import('../../src/store/useStore.js')
const { default: ReviewModal } = await import('../../src/components/ReviewModal.jsx')

const pos = (posRef, ref) => ({
  _id: `${posRef}-${ref}`, PositionTypeRef: posRef, ContextType: 'PositionType',
  ContextRef: posRef, ElementTypeRef: ref, Quantity: 1,
})

function setup() {
  useStore.setState({
    projectId: 1, positionTypes: [{ PositionTypeRef: 'A1' }, { PositionTypeRef: 'A2' }, { PositionTypeRef: 'A3' }],
    recipes: [pos('A1', 'ET-X'), pos('A2', 'ET-X'), pos('A3', 'ET-Y')],
    containerETRefs: new Set(), psRows: [], elementTypes: [], positionUI: {},
    formCaptures: { version: 1, byPosition: { A1: [{ elementTypeRef: 'ET-X' }], A2: [{ elementTypeRef: 'ET-X' }], A3: [{ elementTypeRef: 'ET-Z' }] } },
  })
  return render(<ReviewModal show onHide={vi.fn()} initialRefs={['A1', 'A2', 'A3']} />)
}

describe('ReviewModal footer', () => {
  test('Next is the primary action; Close is not in the bottom-right corner', () => {
    setup()
    const footer = document.querySelector('.modal-footer')
    const buttons = [...footer.querySelectorAll('button')]
    expect(buttons[0].textContent).toBe('Close')
    expect(buttons.at(-1).textContent).not.toBe('Close')
    expect(screen.getByTestId('review-counter')).toHaveTextContent('1 of 3')
  })

  test('Next and ← / → step through', () => {
    setup()
    fireEvent.click(screen.getByText('Next ›'))
    expect(screen.getByTestId('review-counter')).toHaveTextContent('2 of 3')
    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    expect(screen.getByTestId('review-counter')).toHaveTextContent('1 of 3')
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByTestId('review-counter')).toHaveTextContent('2 of 3')
  })

  test('Next unreconciled skips positions the Form is satisfied on', () => {
    setup()
    fireEvent.click(screen.getByText(/Next unreconciled/))
    expect(screen.getByTestId('review-counter')).toHaveTextContent('3 of 3')
  })
})
