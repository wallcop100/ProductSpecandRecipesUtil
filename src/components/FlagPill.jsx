import React from 'react'
import { Badge } from 'react-bootstrap'

/**
 * FlagPill — a small toggle pill for flag values ('Y' | null).
 *
 * Props:
 *   label: string
 *   value: 'Y' | null
 *   onChange?: (newValue: 'Y'|null) => void
 *   readOnly?: bool
 */
export default function FlagPill({ label, value, onChange, readOnly = false, activeVariant = 'success' }) {
  const isActive = value === 'Y'

  function handleClick() {
    if (readOnly || !onChange) return
    onChange(isActive ? null : 'Y')
  }

  return (
    <Badge
      bg={isActive ? activeVariant : 'light'}
      text={isActive ? 'white' : 'muted'}
      onClick={handleClick}
      style={{
        cursor: readOnly ? 'default' : 'pointer',
        border: isActive ? 'none' : '1px solid #dee2e6',
        userSelect: 'none',
        fontSize: 10,
        padding: '3px 7px',
        fontWeight: isActive ? 600 : 400,
        transition: 'background 0.15s',
      }}
      title={readOnly ? `${label}: ${value ?? 'null'}` : `Click to toggle ${label}`}
    >
      {label}
    </Badge>
  )
}
