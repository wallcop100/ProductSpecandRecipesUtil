import React from 'react'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { colorsForType } from '../utils/entityStyle'
import { C } from '../styles/tokens'

/** The Form spec pane's small marks (design A): pills, gutter, where, card. */
export const mono = { fontFamily: 'monospace' }
export const GRAPHITE = C.graphite   // left stripe: no ElementType yet
export const btn = { fontSize: 10, padding: '0 6px', lineHeight: '18px' }
export const card = stripe => ({ border: `1px solid ${C.border}`, borderLeft: `3px solid ${stripe || C.border}`, borderRadius: 4, padding: '5px 8px', margin: '4px 0', background: C.surface })

const pill = { ...mono, fontSize: 10, borderRadius: 4, padding: '0 5px', lineHeight: '16px', color: C.ink, whiteSpace: 'nowrap', cursor: 'pointer' }

/** ElementType pill: orange, opens the Product Spec. `preview`: not created yet (dashed). */
export function EtPill({ etRef, preview = false, style }) {
  if (preview) {
    return <span title="Preview, not created yet" data-testid="et-preview"
      style={{ ...pill, cursor: 'default', background: 'transparent', outline: `1px dashed ${colorsForType('ElementType').accent}`, outlineOffset: -1, color: C.muted, ...style }}>{etRef}</span>
  }
  const open = e => { e.stopPropagation(); useStore.getState().openSpec(etRef) }
  return <span role="link" tabIndex={0} title="Open in the Product Spec" data-testid="form-et-ref" onClick={open}
    onKeyDown={e => { if (e.key === 'Enter') open(e) }}
    style={{ ...pill, background: colorsForType('ElementType').fill, ...style }}>{etRef}</span>
}

/** Position pill: blue, goes to that position. */
export function PosPill({ posRef }) {
  const go = e => { e.stopPropagation(); useStore.getState().setActivePosition(posRef) }
  return <span role="link" tabIndex={0} title={`Go to ${posRef}`} onClick={go} onKeyDown={e => { if (e.key === 'Enter') go(e) }}
    style={{ ...pill, background: colorsForType('PositionType').fill }}>{posRef}</span>
}

/** + new, ~ changed, − gone; blank keeps the column. */
export function Gutter({ mark, tip }) {
  return <span title={tip || undefined} data-testid={mark ? 'gutter' : undefined} data-mark={mark || undefined}
    style={{ ...mono, width: 10, flexShrink: 0, color: C.muted, fontWeight: 600, textAlign: 'center' }}>{mark || ''}</span>
}

/** Where a product sits: inside the wrapper, at the position, or both. */
export function Where({ foundIn, container }) {
  const inside = foundIn === 'internal' || (foundIn !== 'position' && foundIn)
  const at = foundIn === 'position' || (foundIn && foundIn !== 'internal')
  return (
    <span className="d-inline-flex align-items-center gap-1 text-muted" style={{ ...mono, fontSize: 10, flexShrink: 0 }}>
      {inside && container && <span title={`Inside ${container}`}>{container}</span>}
      {at && <MaterialIcon name="tab_unselected" size={12} title="At position" />}
    </span>
  )
}
