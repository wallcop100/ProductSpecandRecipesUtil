import React from 'react'
import MaterialIcon from './MaterialIcon'
import { ICONS } from '../utils/entityStyle'

/**
 * ContentsBadge — the `category` icon plus a warning badge carrying the count,
 * for entities that contain other items.
 *
 * Props:
 *   count: number — number of contained items
 *   onClick?: () => void — makes the badge interactive (e.g. toggle contents)
 *   title: string (default 'Contents')
 */
export default function ContentsBadge({ count, onClick, title = 'Contents' }) {
  return (
    <span
      onClick={onClick}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
      }}
    >
      <MaterialIcon name={ICONS.contents} size={20} className="text-secondary" />
      <span className="badge bg-warning text-dark" style={{ fontSize: 10 }}>{count}</span>
    </span>
  )
}
