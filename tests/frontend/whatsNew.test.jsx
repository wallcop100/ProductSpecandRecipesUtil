import { describe, test, expect, vi, afterEach } from 'vitest'
import React from 'react'
import { render, screen, cleanup } from '@testing-library/react'

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
