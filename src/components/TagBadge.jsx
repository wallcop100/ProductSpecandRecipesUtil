import React from 'react'
import { Badge } from 'react-bootstrap'

/**
 * TagBadge — the canonical tag chip. All tags render as a plain Bootstrap
 * `secondary` badge (tags are free-form now, no per-group colours).
 *
 * Props:
 *   tag: string
 *   onClick / title: optional passthroughs
 *   (legacy `group` prop is accepted and ignored)
 */
export default function TagBadge({ tag, onClick, title, className = '', style }) {
  return (
    <Badge
      bg="secondary"
      onClick={onClick}
      title={title}
      className={className}
      style={{ fontWeight: 500, ...(onClick ? { cursor: 'pointer' } : null), ...style }}
    >
      {tag}
    </Badge>
  )
}
