import React from 'react'
import { colorsForType } from '../utils/entityStyle'

/**
 * EntityPill — two side-by-side pills for an entity reference.
 *
 * When `sublabel` (family/parent ref) is provided:
 *   [FAMILY-REF]  [ET-REF]
 * Otherwise just the single ref pill.
 *
 * No borders, no bold, black text; fill background from type colour.
 *
 * Props:
 *   type: 'ElementType' | 'PositionType'  (default ElementType)
 *   label: string — the ET / position ref (right pill)
 *   sublabel: string — optional family / parent ref (left pill)
 *   title, className, style — passed through to the outer wrapper
 */
export default function EntityPill({
  type = 'ElementType',
  label,
  sublabel,
  title,
  className = '',
  style,
}) {
  const { fill } = colorsForType(type)

  const pillBase = {
    display: 'inline-block',
    background: fill,
    color: '#1a1a1a',
    borderRadius: 4,
    padding: '2px 8px',
    fontSize: 12,
    fontWeight: 400,
    lineHeight: 1.4,
    wordBreak: 'break-all',
  }

  return (
    <span
      className={className}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        userSelect: 'none',
        ...style,
      }}
    >
      {sublabel != null && (
        <span style={{ ...pillBase, fontSize: 11, color: '#555' }}>
          {sublabel}
        </span>
      )}
      {label != null && (
        <span style={pillBase}>{label}</span>
      )}
    </span>
  )
}
