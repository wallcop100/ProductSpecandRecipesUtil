import React from 'react'
import { Badge } from 'react-bootstrap'
import { C } from '../styles/tokens'

/**
 * FlagPill — a small toggle pill for flag values ('Y' | null).
 *
 * Props:
 *   label: string
 *   value: 'Y' | null
 *   onChange?: (newValue: 'Y'|null) => void
 *   readOnly?: bool
 */
export default function FlagPill({ label, value, onChange, readOnly = false, activeVariant = 'primary' }) {
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
        border: isActive ? 'none' : `1px solid ${C.border}`,
        userSelect: 'none',
        fontSize: 10,
        padding: '3px 7px',
        fontWeight: isActive ? 600 : 400,
      }}
      title={readOnly ? `${label}: ${value ?? 'null'}` : `Click to toggle ${label}`}
    >
      {label}
    </Badge>
  )
}
