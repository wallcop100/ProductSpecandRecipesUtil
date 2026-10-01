import React from 'react'
import useStore from '../store/useStore'
import IconButton from './IconButton'

/**
 * "Shared with" on every row, not only wrappers (5GLMMQ). Sits beside the Recipe actions
 * menu; the icon lights up while it is on.
 */
export default function SharedToggle() {
  const on = useStore(s => s.showSharedEverywhere)
  const toggle = useStore(s => s.toggleSharedEverywhere)
  return (
    <IconButton bsSize="sm" variant="outline-secondary" icon="category_search" onClick={toggle}
      iconStyle={{ color: on ? '#0d6efd' : '#adb5bd' }}
      aria-pressed={on} data-testid="shared-toggle" aria-label="Show shared with on every row"
      title={on ? 'Showing which other positions use each row (click to hide)' : 'Show which other positions use each row, everywhere (not only wrappers)'} />
  )
}
