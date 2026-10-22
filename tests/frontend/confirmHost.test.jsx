import React from 'react'
import { render, screen, fireEvent, act } from '@testing-library/react'
import ConfirmHost, { askConfirm } from '../../src/components/ConfirmHost'

// Reports #32/#33: the app asks in its own dialog, not the browser's.
test('askConfirm opens the app dialog and answers with the button pressed', async () => {
  window.confirm = vi.fn(() => true)
  render(<ConfirmHost />)
  let yes, no
  act(() => { yes = askConfirm('Discard all 3 unexported changes?', { ok: 'Discard', danger: true }) })
  expect(await screen.findByText('Discard all 3 unexported changes?')).toBeInTheDocument()
  fireEvent.click(screen.getByText('Discard'))
  expect(await yes).toBe(true)
  act(() => { no = askConfirm('Delete?') })
  fireEvent.click(await screen.findByText('Cancel'))
  expect(await no).toBe(false)
  expect(window.confirm).not.toHaveBeenCalled()
})
