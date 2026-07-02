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
 *   stack: boolean — when true, sublabel sits smaller and above the label
 *   title, className, style — passed through to the outer wrapper
 */
export default function EntityPill({
  type = 'ElementType',
  label,
  sublabel,
  stack = false,
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
        flexDirection: stack ? 'column' : 'row',
        alignItems: stack ? 'flex-start' : 'center',
        gap: stack ? 2 : 4,
        userSelect: 'none',
        ...style,
      }}
    >
      {sublabel != null && (
        <span style={{ ...pillBase, fontSize: stack ? 10 : 11, padding: stack ? '1px 6px' : '2px 8px', color: '#555' }}>
          {sublabel}
        </span>
      )}
      {label != null && (
        <span style={pillBase}>{label}</span>
      )}
    </span>
  )
}
