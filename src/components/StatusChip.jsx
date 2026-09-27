import React from 'react'
import { OverlayTrigger, Popover } from 'react-bootstrap'
import MaterialIcon from './MaterialIcon'

/**
 * StatusChip — the one way a status is shown: an icon, a short word, a colour by TONE, and
 * the detail behind a hover / tap. Code pills, the Form progress chip, the save indicator
 * and the coverage badge all use it, so "amber" means the same thing everywhere.
 */
export const TONES = {
  ok:      { bg: '#d1e7dd', fg: '#0f5132' },   // done, in spec, saved
  warn:    { bg: '#fff3cd', fg: '#856404' },   // needs a look, a variant, work left
  error:   { bg: '#f8d7da', fg: '#842029' },   // wrong, not saved
  info:    { bg: '#cfe2ff', fg: '#084298' },   // worth knowing (repeated, in progress)
  neutral: { bg: '#f1f3f5', fg: '#495057' },   // new, nothing to say
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
