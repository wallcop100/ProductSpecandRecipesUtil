import React, { useState, useRef } from 'react'
import { Overlay, Popover } from 'react-bootstrap'
import useStore from '../store/useStore'
import TagBadge from './TagBadge'

/**
 * TagColorControl — a tag chip that IS its own colour control.
 *
 * Colour is a per-tag property (store.tagColors), independent of the palette, so ANY
 * tag can be coloured — one produced by a rule, one added by hand — not only palette
 * tags. The chip shows its current colour, so it doubles as a live preview.
 *
 * Twelve presets for speed, plus a native picker for anything else.
 */
const SWATCHES = [
  '#0d6efd', '#6610f2', '#6f42c1', '#d63384', '#dc3545', '#fd7e14',
  '#f59e0b', '#198754', '#20c997', '#0dcaf0', '#6c757d', '#343a40',
]

export default function TagColorControl({ tag }) {
  const setTagColor = useStore(s => s.setTagColor)
  const current = useStore(s => s.tagColors?.[tag])
  const [show, setShow] = useState(false)
  const ref = useRef(null)

  return (
    <>
      <span ref={ref} className="d-inline-flex">
        <TagBadge tag={tag} onClick={() => setShow(v => !v)} title="Click to set this tag’s colour" />
      </span>
      <Overlay target={ref.current} show={show} placement="bottom" rootClose onHide={() => setShow(false)}>
        <Popover>
          <Popover.Body className="p-2">
            <div className="text-muted mb-1" style={{ fontSize: 11 }}>
              Colour for <strong>{tag}</strong>
            </div>
            <div className="d-flex flex-wrap gap-1" style={{ maxWidth: 168 }}>
              {SWATCHES.map(c => (
                <button key={c} type="button" title={c}
                  onClick={() => { setTagColor(tag, c); setShow(false) }}
                  style={{
                    width: 22, height: 22, borderRadius: 4, background: c,
                    border: current === c ? '2px solid #000' : '1px solid #ccc', cursor: 'pointer',
                  }} />
              ))}
            </div>
            <div className="d-flex align-items-center gap-2 mt-2">
              <label className="d-inline-flex align-items-center gap-1" style={{ fontSize: 11, cursor: 'pointer' }}>
                <input type="color" value={current || '#6c757d'}
                  onChange={e => setTagColor(tag, e.target.value)}
                  style={{ width: 24, height: 24, padding: 0, border: '1px solid #ccc', borderRadius: 4, cursor: 'pointer' }} />
                Custom
              </label>
              <button className="btn btn-link btn-sm p-0 ms-auto" style={{ fontSize: 11 }}
                onClick={() => { setTagColor(tag, null); setShow(false) }}>
                Clear
              </button>
            </div>
          </Popover.Body>
        </Popover>
      </Overlay>
    </>
  )
}
