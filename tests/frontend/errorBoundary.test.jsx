import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorBoundary from '../../src/components/ErrorBoundary'

const Boom = () => { throw new Error('kaboom in render') }

describe('ErrorBoundary — a blank page is never the answer', () => {
  let spy
  beforeEach(() => { spy = vi.spyOn(console, 'error').mockImplementation(() => {}) })
  afterEach(() => spy.mockRestore())

  test('a thrown render error shows the message, not nothing', () => {
    render(<ErrorBoundary><Boom /></ErrorBoundary>)
    expect(screen.getByText(/Something broke on this screen/)).toBeTruthy()
    expect(screen.getByText(/kaboom in render/)).toBeTruthy()
  })

  test('it says the workbooks were not touched — they are read-only', () => {
    render(<ErrorBoundary><Boom /></ErrorBoundary>)
    expect(screen.getByText(/read-only and nothing was written/)).toBeTruthy()
  })

  test('the details are copyable and the screen is reloadable', () => {
    render(<ErrorBoundary><Boom /></ErrorBoundary>)
    expect(screen.getByText('Copy details')).toBeTruthy()
    expect(screen.getByText('Reload')).toBeTruthy()
  })

  test('children render untouched when nothing throws', () => {
    render(<ErrorBoundary><div>all good</div></ErrorBoundary>)
    expect(screen.getByText('all good')).toBeTruthy()
    expect(screen.queryByText(/Something broke/)).toBeNull()
  })
})
