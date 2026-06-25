import React from 'react'
import { Badge } from 'react-bootstrap'

const GROUP_COLORS = {
  FittingType: { bg: '#cfe2ff', text: '#084298' },
  Driver:      { bg: '#d1e7dd', text: '#0a3622' },
  Wiring:      { bg: '#e2d9f3', text: '#432874' },
  Special:     { bg: '#ffe5d0', text: '#7c3c04' },
}

const DEFAULT_COLOR = { bg: '#e9ecef', text: '#495057' }

/**
 * TagBadge — colored badge for a tag, with color determined by its group.
 *
 * Props:
 *   tag: string
 *   group: 'FittingType' | 'Driver' | 'Wiring' | 'Special'
 */
export default function TagBadge({ tag, group }) {
  const color = GROUP_COLORS[group] || DEFAULT_COLOR
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 7px',
        borderRadius: 12,
        fontSize: 10,
        fontWeight: 600,
        background: color.bg,
        color: color.text,
        whiteSpace: 'nowrap',
      }}
    >
      {tag}
    </span>
  )
}
