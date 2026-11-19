import { test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import FlagPill from '../../src/components/FlagPill'

test('HAH2FA: an outline pill is on without being filled', () => {
  render(<><FlagPill label="Design" value="Y" onChange={() => {}} /><FlagPill label="Contract" value="Y" onChange={() => {}} activeVariant="outline-primary" /></>)
  expect(screen.getByLabelText('Design').className).toMatch(/bg-primary/)
  const c = screen.getByLabelText('Contract')
  expect(c.className).toMatch(/bg-transparent/)
  expect(c.className).toMatch(/text-primary/)
  expect(c.getAttribute('aria-checked')).toBe('true')
})
