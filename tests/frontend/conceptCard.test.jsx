import { describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import useStore from '../../src/store/useStore'
import ConceptCard, { ConceptHint, CONCEPTS } from '../../src/components/ConceptCard'

/**
 * The four ideas the tool cannot be used without. A tooltip vanishes; a card does not.
 * They are taught with the USER'S data — ExtRef with their own redirects, "shared" with
 * their own wrappers — because a concept illustrated by someone else's project is a
 * concept you have to translate before you can use it.
 */
const pos = (posRef, ref) => ({
  PositionTypeRef: posRef, ContextType: 'PositionType', ContextRef: posRef, ElementTypeRef: ref,
})

beforeEach(() => {
  useStore.setState({
    positionTypes: [
      { PositionTypeRef: 'C01r', ExtRef: 'C01' },
      { PositionTypeRef: 'C03r', ExtRef: 'C03' },
      { PositionTypeRef: 'D07' },
    ],
    recipes: [pos('C01r', 'ET-LIN-01'), pos('C03r', 'ET-LIN-01'), pos('D07', 'ET-DL-03')],
    containerETRefs: new Set(['et-lin-01', 'et-dl-03']),
  })
})

describe('taught with the user’s own data', () => {
  test('ExtRef shows this project’s redirects, not an invented one', () => {
    const { baseElement } = render(<ConceptCard concept={CONCEPTS.EXTREF} show onHide={vi.fn()} />)
    expect(screen.getByText(/In this project/)).toBeTruthy()
    // The redirect line is split across spans; C03 appears only in the live example.
    expect(baseElement.textContent).toMatch(/C03.*recipe lives on.*C03r/)
  })

  test('a project with no redirects says so, rather than showing an empty box', () => {
    useStore.setState({ positionTypes: [{ PositionTypeRef: 'D07' }] })
    render(<ConceptCard concept={CONCEPTS.EXTREF} show onHide={vi.fn()} />)
    expect(screen.getByText(/every Form ref means itself/)).toBeTruthy()
  })

  test('the wrapper card names the wrappers actually shared here', () => {
    render(<ConceptCard concept={CONCEPTS.WRAPPER} show onHide={vi.fn()} />)
    expect(screen.getByText(/Shared in this project/)).toBeTruthy()
    // The prose names ET-LIN-01 too; the example row adds the positions using it.
    expect(screen.getByText(/C01r, C03r/)).toBeTruthy()
    // ET-DL-03 is used by one position, so it is not shared and must not be listed.
    expect(screen.queryByText(/ET-DL-03/)).toBeNull()
  })

  test('no shared wrapper, no shared list', () => {
    useStore.setState({ recipes: [pos('D07', 'ET-DL-03')] })
    render(<ConceptCard concept={CONCEPTS.WRAPPER} show onHide={vi.fn()} />)
    expect(screen.queryByText(/Shared in this project/)).toBeNull()
  })
})

describe('the four concepts', () => {
  test('read-only explains why there is no Save button', () => {
    render(<ConceptCard concept={CONCEPTS.READONLY} show onHide={vi.fn()} />)
    expect(screen.getByText(/Nothing here is ever saved/)).toBeTruthy()
    expect(screen.getByText(/Stop looking for one/)).toBeTruthy()
  })

  test('intention vs fact says the gap is the work', () => {
    render(<ConceptCard concept={CONCEPTS.INTENT} show onHide={vi.fn()} />)
    expect(screen.getByText(/The gap is your work/)).toBeTruthy()
    expect(screen.getByText(/derived detail/)).toBeTruthy()
  })

  test('an unknown concept renders nothing rather than an empty modal', () => {
    const { container } = render(<ConceptCard concept="nope" show onHide={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('ConceptHint — the ? that opens it', () => {
  test('the card is closed until asked for, and opens on click', () => {
    render(<ConceptHint concept={CONCEPTS.WRAPPER} />)
    expect(screen.queryByText(/A wrapper is an assembly/)).toBeNull()
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText(/assemblies are shared/)).toBeTruthy()
  })

  test('it does not trigger whatever it sits inside', () => {
    const onParent = vi.fn()
    render(<div onClick={onParent}><ConceptHint concept={CONCEPTS.WRAPPER} /></div>)
    fireEvent.click(screen.getByRole('button'))
    expect(onParent).not.toHaveBeenCalled()
  })
})
