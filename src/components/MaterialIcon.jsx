import React from 'react'
import { OverlayTrigger, Tooltip } from 'react-bootstrap'

/**
 * MaterialIcon — thin wrapper around the bundled Material Icons font.
 *
 * Props:
 *   name: string — the ligature (e.g. 'grain', 'select_all')
 *   size: number — px font-size (default 18)
 *   className, style, title — passed through
 */
/**
 * Material SYMBOLS the bundled Material Icons font lacks: drawn from their SVG path
 * (Material Symbols Outlined, weight 400, Apache-2.0). Without this the ligature falls
 * apart into two icons ("category" + "search").
 */
const SYMBOLS = {
  category_search: 'M80-145v-304h304v304H80Zm60-60h184v-184H140v184Zm81-361 220-354 220 354H221Zm108-60h224L441-807 329-626ZM870-51 769-152q-22 15-48.11 23.5T666-120q-74 0-124-50t-50-124q0-74 50-124t124-50q74 0 124 50t50 124q0 28-7.52 52.5T811-196L913-94l-43 43ZM747-213.08q33-33.09 33-81Q780-342 746.92-375q-33.09-33-81-33Q618-408 585-374.92q-33 33.09-33 81Q552-246 585.08-213q33.09 33 81 33Q714-180 747-213.08ZM324-389Zm117-237Z',
}

export default function MaterialIcon({ name, size = 18, className = '', style, title }) {
  // A `title` shows as a styled tooltip, not the browser's plain-text one (report #32).
  const tip = el => title
    ? <OverlayTrigger placement="top" overlay={<Tooltip style={{ fontSize: 11 }}>{title}</Tooltip>}>{el}</OverlayTrigger>
    : el
  if (SYMBOLS[name]) {
    return tip(
      <svg width={size} height={size} viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"
        className={className || undefined} style={{ verticalAlign: 'middle', flexShrink: 0, ...style }}>
        <path d={SYMBOLS[name]} />
      </svg>
    )
  }
  return tip(
    <i
      className={`material-icons${className ? ' ' + className : ''}`}
      style={{ fontSize: size, lineHeight: 1, verticalAlign: 'middle', ...style }}
      aria-hidden="true"
    >
      {name}
    </i>
  )
}
