import { describe, test, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import InfoTip from '../../src/components/InfoTip.jsx'

describe('InfoTip', () => {
  test('the explanation is off the page until you ask for it', async () => {
    render(<p>Label <InfoTip label="Why">Because reasons.</InfoTip></p>)
    expect(screen.queryByText('Because reasons.')).toBeNull()
    fireEvent.mouseOver(screen.getByLabelText('Why'))
    expect(await screen.findByText('Because reasons.')).toBeInTheDocument()
  })

  test('reachable by keyboard', async () => {
    render(<InfoTip label="Why">Because reasons.</InfoTip>)
    const tip = screen.getByLabelText('Why')
    expect(tip).toHaveAttribute('tabindex', '0')
    fireEvent.focus(tip)
    expect(await screen.findByText('Because reasons.')).toBeInTheDocument()
  })
})
