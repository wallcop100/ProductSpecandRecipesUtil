import React, { useState, useRef } from 'react'
import { Overlay, Popover, Form } from 'react-bootstrap'
import useStore from '../store/useStore'
import TagBadge from './TagBadge'
import MaterialIcon from './MaterialIcon'

/**
 * PositionTagEditor — per-position tags, edited where the position is.
 *
 * Tagging one position used to live only in the full-screen Tag Manager. It belongs
 * next to the position. The chips show the effective tags (coloured); the ＋ opens a
 * small editor to add a free tag, toggle a rule tag off (an exception for this position
 * only), or restore one you excluded.
 *
 * A rule-derived tag removed here is not deleted — it is excluded for this position, and
 * shown dashed so you can restore it. A manual tag is simply removed.
 */
export default function PositionTagEditor({ posRef }) {
  const ui = useStore(s => s.positionUI[posRef]) || {}
  const palette = useStore(s => s.tagPalette)
  const toggle = useStore(s => s.togglePositionTag)

  const [show, setShow] = useState(false)
  const [text, setText] = useState('')
  const ref = useRef(null)

  const effective = ui.tags || []
  const ruleTags = ui.ruleTags || []
  const excluded = (ui.tagRemove || []).filter(t => ruleTags.includes(t))

  const commit = () => {
    const t = text.trim()
    if (t && !effective.includes(t)) toggle(posRef, t)
    setText('')
  }

  return (
    <span className="d-inline-flex align-items-center gap-1 flex-wrap">
      {effective.map(tag => (
        <TagBadge key={tag} tag={tag}
          title={ruleTags.includes(tag) ? 'Rule tag — open the editor to exclude here' : 'Manual tag'} />
      ))}

      <span ref={ref} className="d-inline-flex">
        <button type="button" className="btn btn-sm btn-link p-0 d-inline-flex align-items-center"
          style={{ color: '#6c757d', lineHeight: 1 }} title="Edit tags for this position"
          onClick={() => setShow(v => !v)}>
          <MaterialIcon name="add_circle" size={16} />
        </button>
      </span>

      <Overlay target={ref.current} show={show} placement="bottom-start" rootClose onHide={() => setShow(false)}>
        <Popover style={{ maxWidth: 280 }}>
          <Popover.Body className="p-2">
            <Form.Control size="sm" list={`postags-${posRef}`} value={text} placeholder="add a tag…"
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } }} autoFocus />
            <datalist id={`postags-${posRef}`}>
              {palette.filter(p => !effective.includes(p)).map(p => <option key={p} value={p} />)}
            </datalist>

            {effective.length > 0 && (
              <div className="mt-2">
                <div className="text-muted mb-1" style={{ fontSize: 10 }}>On this position — click to remove</div>
                <div className="d-flex flex-wrap gap-1">
                  {effective.map(tag => (
                    <TagBadge key={tag} tag={tag} onClick={() => toggle(posRef, tag)}
                      title={ruleTags.includes(tag) ? 'Exclude this rule tag here' : 'Remove this manual tag'} />
                  ))}
                </div>
              </div>
            )}

            {excluded.length > 0 && (
              <div className="mt-2">
                <div className="text-muted mb-1" style={{ fontSize: 10 }}>Excluded rule tags — click to restore</div>
                <div className="d-flex flex-wrap gap-1">
                  {excluded.map(tag => (
                    <span key={tag} className="badge bg-light text-dark" role="button"
                      style={{ border: '1px dashed #adb5bd', cursor: 'pointer', fontWeight: 400 }}
                      onClick={() => toggle(posRef, tag)}>
                      + {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Popover.Body>
        </Popover>
      </Overlay>
    </span>
  )
}
