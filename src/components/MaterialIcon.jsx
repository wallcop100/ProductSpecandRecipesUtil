import React from 'react'

/**
 * MaterialIcon — thin wrapper around the bundled Material Icons font.
 *
 * Props:
 *   name: string — the ligature (e.g. 'grain', 'select_all')
 *   size: number — px font-size (default 18)
 *   className, style, title — passed through
 */
export default function MaterialIcon({ name, size = 18, className = '', style, title }) {
  return (
    <i
      className={`material-icons${className ? ' ' + className : ''}`}
      style={{ fontSize: size, lineHeight: 1, verticalAlign: 'middle', ...style }}
      title={title}
      aria-hidden="true"
    >
      {name}
    </i>
  )
}
