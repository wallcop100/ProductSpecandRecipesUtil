import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import useStore from '../../src/store/useStore'
import ValidationFixModal from '../../src/components/ValidationFixModal'

/**
 * The fix step is also where you say "this position carries no recipe" — flagging it
 * (or its whole family, behind a confirm) drops it out of scope on the spot.
 */
const recipeIssue = { rule: 'MISSING_ISDESIGN', ref: 'C01r', severity: 'error', message: 'needs a design item', fixKind: 'recipe' }
const specIssue = { rule: 'MISSING_PRODUCT_CODE', ref: 'ET-DL-01', severity: 'warning', message: 'no code', fixKind: 'spec' }

beforeEach(() => {
  useStore.setState({
    validationResults: [],
    positionTypes: [{ PositionTypeRef: 'C01r', ParentRef: 'FAM-DL' }],
    projectId: null,
  })
})

describe('ValidationFixModal — no-recipe-needed escape hatch', () => {
  test('a recipe issue offers to ignore the position and its family', () => {
    useStore.setState({ validationResults: [recipeIssue] })
    render(<ValidationFixModal show onHide={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Ignore C01r' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ignore family FAM-DL' })).toBeTruthy()
  })

  test('a spec issue (an ET, not a position) offers neither', () => {
    useStore.setState({ validationResults: [specIssue] })
    render(<ValidationFixModal show onHide={vi.fn()} onOpenProductSpec={vi.fn()} />)
    expect(screen.queryByText(/^Ignore /)).toBeNull()
  })

  test('a position with no family offers only the position flag', () => {
    useStore.setState({
      validationResults: [recipeIssue],
      positionTypes: [{ PositionTypeRef: 'C01r' }],   // no ParentRef → no family
    })
    render(<ValidationFixModal show onHide={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Ignore C01r' })).toBeTruthy()
    expect(screen.queryByText(/Ignore family/)).toBeNull()
  })

  test('Ignore position flags it and re-validates', async () => {
    const toggle = vi.fn(); const reval = vi.fn()
    useStore.setState({ validationResults: [recipeIssue], toggleIgnorePosition: toggle, runValidation: reval })
    render(<ValidationFixModal show onHide={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ignore C01r' }))
    expect(toggle).toHaveBeenCalledWith('C01r')
    await waitFor(() => expect(reval).toHaveBeenCalled())
  })

  test('Ignore family asks first — nothing happens until confirmed', async () => {
    const toggle = vi.fn(); const reval = vi.fn()
    useStore.setState({ validationResults: [recipeIssue], toggleIgnorePositionFamily: toggle, runValidation: reval })
    render(<ValidationFixModal show onHide={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ignore family FAM-DL' }))
    // the family flag hides many, so it confirms first
    expect(toggle).not.toHaveBeenCalled()
    expect(screen.getByText(/Ignore the whole/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ignore family' }))
    expect(toggle).toHaveBeenCalledWith('FAM-DL')
    await waitFor(() => expect(reval).toHaveBeenCalled())
  })
})
