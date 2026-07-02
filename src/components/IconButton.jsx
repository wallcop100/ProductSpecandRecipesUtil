import React from 'react'
import { Button } from 'react-bootstrap'
import MaterialIcon from './MaterialIcon'

/**
 * IconButton — the canonical icon-only button.
 *
 * MaterialIcon is aria-hidden, so an icon-only control has no accessible name
 * on its own; this always sets both `title` (hover tooltip) and `aria-label`
 * (screen readers) from `title`, and keeps sizing/spacing consistent app-wide.
 *
 * Props:
 *   icon: string            — Material Icons ligature (use ACTION_ICONS)
 *   title: string           — hover tooltip + accessible name (required)
 *   label: string           — override the accessible name if it differs from title
 *   size: number            — icon px (default 16)
 *   variant: string         — react-bootstrap variant ('link' = borderless, default)
 *   bsSize: 'sm'|'lg'       — react-bootstrap Button size
 *   badge: node             — small count/badge rendered after the icon
 *   iconStyle: object       — style passed to the icon (e.g. colour)
 *   ...rest                 — onClick, disabled, className, style, etc.
 */
export default function IconButton({
  icon,
  title,
  label,
  size = 16,
  variant = 'link',
  bsSize,
  badge = null,
  iconStyle,
  className = '',
  style,
  ...rest
}) {
  const linkReset = variant === 'link'
    ? { textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4, lineHeight: 1 }
    : { display: 'inline-flex', alignItems: 'center', gap: 4 }

  return (
    <Button
      variant={variant}
      size={bsSize}
      title={title}
      aria-label={label || title}
      className={className}
      style={{ ...linkReset, ...style }}
      {...rest}
    >
      <MaterialIcon name={icon} size={size} style={iconStyle} />
      {badge != null && badge !== '' && (
        <span style={{ fontSize: 11, fontWeight: 600 }}>{badge}</span>
      )}
    </Button>
  )
}
