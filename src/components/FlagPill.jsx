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
 *   activeVariant?: a Bootstrap colour, or 'outline-<colour>' for a secondary look when on (HAH2FA)
 */
export default function FlagPill({ label, value, onChange, readOnly = false, activeVariant = 'primary' }) {
  const isActive = value === 'Y'
  const outline = activeVariant.startsWith('outline-') ? activeVariant.slice(8) : null

  function handleClick() {
    if (readOnly || !onChange) return
    onChange(isActive ? null : 'Y')
  }

  return (
    <Badge
      bg={isActive ? (outline ? 'transparent' : activeVariant) : 'light'}
      text={isActive ? (outline || 'white') : 'muted'}
      onClick={handleClick}
      {...(readOnly ? {} : {
        role: 'switch', 'aria-checked': isActive, 'aria-label': label, tabIndex: 0,
        onKeyDown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick() } },
      })}
      style={{
        cursor: readOnly ? 'default' : 'pointer',
        border: isActive ? (outline ? `1px solid var(--bs-${outline})` : 'none') : `1px solid ${C.border}`,
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
