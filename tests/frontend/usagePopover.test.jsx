import { describe, test, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import useStore from '../../src/store/useStore'
import UsagePopover from '../../src/components/UsagePopover'

/**
 * The popover fades out. react-bootstrap's Overlay therefore renders its children
 * ONE MORE TIME after `show` flips to false — and the usage object, computed only
 * while open, is null by then. Reading `usage.differs` on that final render threw,
 * unmounted the whole tree, and left a white page. Hovering an ElementType ref and
 * moving the mouse away was all it took.
 */
const seed = {
  recipes: [
    { PositionTypeRef: 'C01r', ContextType: 'PositionType', ContextRef: 'C01r', ElementTypeRef: 'ET-LIN-01' },
  ],
  psRows: [{ ElementTypeRef: 'ET-LIN-01', Manufacturer: 'Ideaworks', ProductCode: 'N/A' }],
  elementTypes: [],
  containerETRefs: new Set(['et-lin-01']),
  formCaptures: null,
}

describe('UsagePopover survives being closed', () => {
  beforeEach(() => useStore.setState(seed))

  test('hovering then leaving does not throw', () => {
    render(<UsagePopover etRef="ET-LIN-01"><code>ET-LIN-01</code></UsagePopover>)
    const trigger = screen.getByText('ET-LIN-01')

    fireEvent.mouseEnter(trigger)
    expect(screen.getByText('The recipe has')).toBeTruthy()

    // The render that used to blow up.
    expect(() => fireEvent.mouseLeave(trigger)).not.toThrow()
    expect(screen.getAllByText('ET-LIN-01').length).toBeGreaterThan(0)
  })

  test('opening again recomputes rather than reusing the stale value', () => {
    render(<UsagePopover etRef="ET-LIN-01"><code>ET-LIN-01</code></UsagePopover>)
    const trigger = screen.getByText('ET-LIN-01')

    fireEvent.mouseEnter(trigger)
    fireEvent.mouseLeave(trigger)

    // The recipe moves on while the popover is shut.
    useStore.setState({ recipes: [...seed.recipes, { PositionTypeRef: 'C03r', ContextType: 'PositionType', ContextRef: 'C03r', ElementTypeRef: 'ET-LIN-01' }] })
    fireEvent.mouseEnter(trigger)

    expect(screen.getByText('C01r, C03r')).toBeTruthy()
  })

  test('with no ref it is a passthrough', () => {
    render(<UsagePopover etRef=""><code>plain</code></UsagePopover>)
    expect(screen.getByText('plain')).toBeTruthy()
  })
})
