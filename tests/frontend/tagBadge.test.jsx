import { describe, test, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import useStore from '../../src/store/useStore'
import TagBadge from '../../src/components/TagBadge'

/**
 * The colour bug: react-bootstrap's Badge defaults bg to 'primary', so a badge with no
 * explicit bg rendered `.bg-primary` — blue — and bootstrap's background utility uses
 * `!important`, which an inline style cannot override. So every coloured tag came out
 * blue regardless of the swatch chosen.
 */
beforeEach(() => useStore.setState({ tagColors: {} }))

describe('TagBadge applies the chosen colour', () => {
  test('a coloured tag carries the colour inline and NO bg-primary class', () => {
    useStore.setState({ tagColors: { Local: '#198754' } })   // green
    render(<TagBadge tag="Local" />)
    const el = screen.getByText('Local')
    expect(el.style.backgroundColor).toBe('rgb(25, 135, 84)')
    expect(el.className).not.toContain('bg-primary')
    expect(el.className).not.toContain('bg-secondary')
  })

  test('different tags get different colours, not all the default', () => {
    useStore.setState({ tagColors: { A: '#dc3545', B: '#0d6efd' } })
    render(<div><TagBadge tag="A" /><TagBadge tag="B" /></div>)
    expect(screen.getByText('A').style.backgroundColor).toBe('rgb(220, 53, 69)')
    expect(screen.getByText('B').style.backgroundColor).toBe('rgb(13, 110, 253)')
  })

  test('an uncoloured tag stays the neutral secondary, not blue', () => {
    render(<TagBadge tag="Plain" />)
    const el = screen.getByText('Plain')
    expect(el.className).toContain('bg-secondary')
    expect(el.className).not.toContain('bg-primary')
  })

  test('text flips to dark on a light background for contrast', () => {
    useStore.setState({ tagColors: { Pale: '#f59e0b' } })   // light amber
    render(<TagBadge tag="Pale" />)
    expect(screen.getByText('Pale').style.color).toBe('rgb(17, 17, 17)')
  })
})
