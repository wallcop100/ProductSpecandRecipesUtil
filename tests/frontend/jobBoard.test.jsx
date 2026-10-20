import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import JobBoard from '../../src/components/JobBoard.jsx'

const ings = [
  { slotKey: 'DESIGN_ELEMENT', slotLabel: 'LIN Virtual Element', section: 'position', isDesign: 'Y' },
  { slotKey: 'END_CAPS', slotLabel: 'End Caps', section: 'lin_internal', quantity: 2 },
  { slotKey: 'CLIPS', slotLabel: 'Retention Clips', section: 'lin_internal', dimQtyMultiplier: 5, isInteger: 'Y' },
]

describe('JobBoard', () => {
  test('read-only: jobs in words, no inputs', () => {
    render(<JobBoard ingredients={ings} readOnly onChange={() => {}} />)
    expect(screen.getByTestId('job-END_CAPS').textContent).toMatch(/end caps.*×2/)
    expect(screen.getByTestId('job-CLIPS').textContent).toMatch(/clips.*5 per m, whole numbers/)
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(screen.queryByTestId('job-palette')).toBeNull()
  })

  test('add a job inside the wrapper, switch a chip to per m', () => {
    const onChange = vi.fn()
    render(<JobBoard ingredients={ings} onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('Add diffuser inside wrapper'))
    expect(onChange.mock.calls[0][0].at(-1)).toMatchObject({ slotKey: 'DIFFUSER', section: 'lin_internal', quantity: 1 })
    fireEvent.change(screen.getByLabelText('end caps per'), { target: { value: 'm' } })
    expect(onChange.mock.calls[1][0].find(i => i.slotKey === 'END_CAPS')).toMatchObject({ dimQtyMultiplier: 2, quantity: null })
  })
})
