import React from 'react'
import { OverlayTrigger, Popover } from 'react-bootstrap'
import MaterialIcon from './MaterialIcon'
import { C } from '../styles/tokens'

/**
 * StatusChip — the one way a status is shown: an icon, a short word, a colour by TONE, and
 * the detail behind a hover / tap. Code pills, the Form progress chip, the save indicator
 * and the coverage badge all use it, so "amber" means the same thing everywhere.
 */
export const TONES = {
  ok:      { bg: C.subtle,     fg: C.ink },        // done, in spec, saved
  warn:    { bg: C.attnTint,   fg: C.attnInk },    // needs a look, a variant, work left
  error:   { bg: C.dangerTint, fg: C.dangerInk },  // wrong, not saved
  info:    { bg: C.accentTint, fg: C.accentInk },  // worth knowing (repeated, in progress)
  neutral: { bg: C.subtle,     fg: C.muted },      // new, nothing to say
}

export default function StatusChip({ tone = 'neutral', icon, label, tip, children, size = 'sm', style, ...rest }) {
  const t = TONES[tone] || TONES.neutral
  const chip = (
    <span className="d-inline-flex align-items-center gap-1 rounded"
      style={{ background: t.bg, color: t.fg, fontSize: size === 'xs' ? 10 : 11,
        padding: size === 'xs' ? '0 4px' : '1px 6px', flexShrink: 0, cursor: tip ? 'help' : 'default', ...style }}
      tabIndex={tip ? 0 : undefined} aria-label={typeof tip === 'string' && typeof label === 'string' ? `${label}: ${tip}` : undefined} {...rest}>
      {icon && <MaterialIcon name={icon} size={size === 'xs' ? 11 : 13} />}
      {label}
      {children}
    </span>
  )
  if (!tip) return chip
  return (
    <OverlayTrigger placement="auto" trigger={['hover', 'focus']} overlay={
      <Popover style={{ maxWidth: 320 }}><Popover.Body style={{ fontSize: 12 }}>{tip}</Popover.Body></Popover>
    }>{chip}</OverlayTrigger>
  )
}
