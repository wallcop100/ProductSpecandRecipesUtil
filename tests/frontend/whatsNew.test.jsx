import { describe, test, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

const api = { current: null }
vi.mock('../../src/platform/companion', () => ({ useCompanion: () => api.current, getCompanion: async () => api.current }))

const { default: WhatsNew } = await import('../../src/components/WhatsNew.jsx')

const release = {
  version: '2026.9', date: '2026-10-23', tagline: 't',
  highlights: [
    { icon: 'brush', title: 'For everyone', blurb: 'b' },
    { icon: 'auto_awesome', title: 'Companion only', blurb: 'b', companion: true },
  ],
}

afterEach(() => { cleanup(); api.current = null })

describe('WhatsNew', () => {
  test('without the companion (GitHub Pages): blue, companion highlights hidden', () => {
    render(<WhatsNew release={release} />)
    expect(screen.getByText('For everyone')).toBeTruthy()
    expect(screen.queryByText('Companion only')).toBeNull()
    expect(document.querySelector('.companion-card')).toBeNull()
  })

  test('with the companion: purple card, companion highlights shown', () => {
    api.current = {}
    render(<WhatsNew release={release} />)
    expect(screen.getByText('Companion only')).toBeTruthy()
    expect(document.querySelector('[data-debug-id="WhatsNew"]').classList.contains('companion-card')).toBe(true)
  })
})

describe('WhatsNewTeaser (356KWQ)', () => {
  test('rolls the headlines, purple with the companion, and goes quiet once opened', async () => {
    const { WhatsNewTeaser, markSeen } = await import('../../src/components/WhatsNew.jsx')
    localStorage.removeItem('psr.whatsNewSeen')
    api.current = {}
    const onOpen = vi.fn()
    render(<WhatsNewTeaser release={release} onOpen={onOpen} />)
    const t = screen.getByTestId('whats-new-teaser')
    expect(t.textContent).toContain('2 new things in 2026.9')
    expect(t.classList.contains('companion-card')).toBe(true)
    fireEvent.click(t)
    expect(onOpen).toHaveBeenCalled()
    cleanup()
    markSeen('2026.9')
    render(<WhatsNewTeaser release={release} onOpen={onOpen} />)
    expect(screen.queryByTestId('whats-new-teaser')).toBeNull()
  })
})

test('the teaser stops on its until date', async () => {
  const { WhatsNewTeaser } = await import('../../src/components/WhatsNew.jsx')
  localStorage.removeItem('psr.whatsNewSeen')
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(new Date('2026-12-31T23:00:00Z'))
    render(<WhatsNewTeaser release={{ ...release, until: '2027-01-01' }} />)
    expect(screen.getByTestId('whats-new-teaser')).toBeTruthy()
    cleanup()
    vi.setSystemTime(new Date('2027-01-01T00:00:00Z'))
    render(<WhatsNewTeaser release={{ ...release, until: '2027-01-01' }} />)
    expect(screen.queryByTestId('whats-new-teaser')).toBeNull()
  } finally { vi.useRealTimers() }
})
