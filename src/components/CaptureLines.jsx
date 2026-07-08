import React, { useState } from 'react'
import { Form } from 'react-bootstrap'
import MaterialIcon from './MaterialIcon'

/**
 * CaptureLines — codes promoted out of the field.
 *
 * Sits directly under the paint surface, inside the same card: as you paint a code
 * it wooshes onto its own line, carrying the note that attached to it. The field
 * above and these lines are one thing — you never have to reconcile a separate
 * "this field yields" panel with what you just painted.
 *
 * A note is a single free-text string: click it and type. Drag a note by its grip
 * onto another code's line to move it there (it appends). Deleting a word is just
 * editing the text — no bins, no per-word pills.
 *
 * Props:
 *   captures        — from deriveCaptures(row)
 *   discarded       — token texts thrown away
 *   onEditNote(code, text|null)     — null resets to the words derived from the field
 *   onMoveNote(fromCode, toCode)
 */

const KEYFRAMES = `
@keyframes pc-promote {
  from { opacity: 0; transform: translateY(-10px) scale(0.97); }
  to   { opacity: 1; transform: none; }
}
.pc-line { animation: pc-promote 220ms cubic-bezier(.2,.8,.2,1); }
.pc-line.pc-drop-target { background: #e7f1ff; outline: 2px dashed #0d6efd; }
.pc-note:hover { background: #f1f3f5; }
`

export default function CaptureLines({ captures, discarded = [], onEditNote, onMoveNote }) {
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState('')
  const [dragCode, setDragCode] = useState(null)
  const [overCode, setOverCode] = useState(null)

  function beginEdit(c) { setEditing(c.code); setDraft(c.note) }
  function commit() {
    if (editing == null) return
    onEditNote(editing, draft.trim())   // '' is a deliberate empty note; ↺ resets
    setEditing(null)
  }

  if (captures.length === 0) {
    return (
      <>
        <style>{KEYFRAMES}</style>
        <div className="text-muted fst-italic py-2" style={{ fontSize: 12 }}>
          Nothing painted as a code yet — nothing will be captured, and nothing is lost.
        </div>
        {discarded.length > 0 && <Discarded discarded={discarded} />}
      </>
    )
  }

  return (
    <>
      <style>{KEYFRAMES}</style>
      {captures.map(c => (
        <div
          key={c.code}
          className={`pc-line d-flex align-items-center gap-2 py-1 px-1 rounded${overCode === c.code ? ' pc-drop-target' : ''}`}
          onDragOver={e => { if (dragCode && dragCode !== c.code) { e.preventDefault(); setOverCode(c.code) } }}
          onDragLeave={() => setOverCode(o => (o === c.code ? null : o))}
          onDrop={e => {
            e.preventDefault()
            if (dragCode && dragCode !== c.code) onMoveNote(dragCode, c.code)
            setDragCode(null); setOverCode(null)
          }}
        >
          <MaterialIcon name="subdirectory_arrow_right" size={14} style={{ color: '#adb5bd', flexShrink: 0 }} />
          <span style={{
            fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, fontWeight: 700,
            color: '#0f5132', background: '#d1e7dd', borderRadius: 3, padding: '1px 6px', flexShrink: 0,
          }}>
            {c.code}
          </span>

          {editing === c.code ? (
            <Form.Control
              size="sm" autoFocus value={draft}
              onChange={e => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commit() }
                if (e.key === 'Escape') { e.stopPropagation(); setEditing(null) }
              }}
              placeholder="Note for this code…"
              style={{ fontSize: 11, maxWidth: 420 }}
            />
          ) : (
            <>
              {c.note && (
                <span
                  draggable
                  onDragStart={() => setDragCode(c.code)}
                  onDragEnd={() => { setDragCode(null); setOverCode(null) }}
                  title="Drag onto another code to move this note"
                  style={{ cursor: 'grab', color: '#ced4da', flexShrink: 0 }}
                >
                  <MaterialIcon name="drag_indicator" size={14} />
                </span>
              )}
              <span
                className="pc-note rounded px-1"
                onClick={() => beginEdit(c)}
                title="Click to edit this note"
                style={{ cursor: 'text', fontSize: 11, color: c.note ? '#495057' : '#adb5bd', flex: 1, minWidth: 0 }}
              >
                {c.note || 'add a note…'}
              </span>
              {c.noteEdited && (
                <span onClick={() => onEditNote(c.code, null)} title="Reset to the words from the field"
                  style={{ cursor: 'pointer', color: '#adb5bd', flexShrink: 0 }}>
                  <MaterialIcon name="undo" size={13} />
                </span>
              )}
            </>
          )}
        </div>
      ))}
      {discarded.length > 0 && <Discarded discarded={discarded} />}
    </>
  )
}

function Discarded({ discarded }) {
  return (
    <div className="d-flex align-items-center gap-2 pt-1 mt-1 border-top" style={{ fontSize: 11 }}>
      <span className="text-muted" style={{ flexShrink: 0 }}>discarded</span>
      <span style={{ fontFamily: 'monospace', color: '#c7ccd1', textDecoration: 'line-through' }}>
        {[...new Set(discarded)].join(' ')}
      </span>
    </div>
  )
}
