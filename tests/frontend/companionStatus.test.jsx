import { test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const api = { current: null }
vi.mock('../../src/platform/companion', () => ({ useCompanion: () => api.current }))
const { default: CompanionStatus } = await import('../../src/components/CompanionStatus.jsx')

test('the cloud is purple with the companion, struck through without, and absent on Pages', () => {
  api.current = {}
  const { unmount } = render(<CompanionStatus />)
  expect(screen.getByTestId('companion-status').dataset.connected).toBe('true')
  unmount()
  api.current = null
  render(<CompanionStatus />)
  expect(screen.getByTestId('companion-status').dataset.connected).toBe('false')
  expect(screen.getByText('cloud_off')).toBeTruthy()
})

test('hidden on the GitHub Pages release', () => {
  vi.stubGlobal('location', { hostname: 'wallcop100.github.io' })
  const { container } = render(<CompanionStatus />)
  expect(container.innerHTML).toBe('')
  vi.unstubAllGlobals()
})
