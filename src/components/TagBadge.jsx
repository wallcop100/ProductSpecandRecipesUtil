import React from 'react'
import { Badge } from 'react-bootstrap'
import useStore from '../store/useStore'

/** Readable text colour (black/white) for a given hex background. */
function textOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return '#fff'
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#111' : '#fff'
}

/**
 * TagBadge — the canonical tag chip. Tags are free-form; an optional per-config
 * colour (from the Tag Manager palette) overrides the default secondary style.
 *
 * Props:
 *   tag: string
 *   onClick / title: optional passthroughs
 *   (legacy `group` prop is accepted and ignored)
 */
export default function TagBadge({ tag, onClick, title, className = '', style }) {
  const color = useStore(s => s.tagColors?.[tag])
  const colorStyle = color ? { backgroundColor: color, color: textOn(color) } : null
  return (
    <Badge
      // A custom colour needs NO bg-* class: react-bootstrap defaults bg to 'primary',
      // and bootstrap's .bg-primary sets background-color with !important, which an
      // inline style cannot override. Empty bg = no class = our colour wins.
      bg={color ? '' : 'secondary'}
      onClick={onClick}
      title={title}
      className={className}
      style={{ fontWeight: 500, ...(onClick ? { cursor: 'pointer' } : null), ...colorStyle, ...style }}
    >
      {tag}
    </Badge>
  )
}
