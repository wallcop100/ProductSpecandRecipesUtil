import React from 'react'
import { Badge } from 'react-bootstrap'

/**
 * ProjectIdPill — the canonical green pill for a Project ID.
 * Use wherever a Project ID is shown. Optionally appends a config name.
 *
 * Props: number (string), configName (string, optional), size ('sm'|'md')
 */
export default function ProjectIdPill({ number, configName, size = 'md', className = '', title }) {
  if (!number && !configName) return null
  const fontSize = size === 'sm' ? 10 : 12
  return (
    <span className={`d-inline-flex align-items-center gap-1 ${className}`} title={title}>
      <Badge bg="success" pill style={{ fontSize, fontWeight: 600 }}>
        {number || '—'}
      </Badge>
      {configName && (
        <span className="text-muted" style={{ fontSize }}>{configName}</span>
      )}
    </span>
  )
}
