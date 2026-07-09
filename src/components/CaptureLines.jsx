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
 * A note is DRAGGED AS TOKENS but EDITED AS A BLOCK. Dragging a whole note is too
 * coarse — half a note usually belongs to the other code — so each word is its own
 * drag handle and can be dropped on any line. Editing, by contrast, is prose: one
 * click puts the whole note in a single field. Deleting a word there is just
 * editing text, and it teaches the tool to discard that word (see codeLearning).
 *
 * Props:
 *   captures        — from deriveCaptures(row)
 *   discarded       — token texts thrown away
 *   onEditNote(code, text|null)     — null resets to the words derived from the field
 *   onMoveNote(fromCode, toCode)               — move the whole note
 *   onMoveNoteWord(fromCode, toCode, word)     — move one word between lines
 */

const KEYFRAMES = `
@keyframes pc-promote {
  from { opacity: 0; transform: translateY(-10px) scale(0.97); }
  to   { opacity: 1; transform: none; }
}
.pc-line { animation: pc-promote 220ms cubic-bezier(.2,.8,.2,1); }
.pc-line.pc-drop-target { background: #e7f1ff; outline: 2px dashed #0d6efd; }
.pc-note:hover { background: #f1f3f5; }
.pc-word { cursor: grab; border-radius: 3px; padding: 0 2px; }
.pc-word:hover { background: #e7f1ff; outline: 1px solid #b6d4fe; }
.pc-word.pc-dragging { opacity: .4; }
`

const wordsOf = note => String(note || '').split(/\s+/).filter(Boolean)

export default function CaptureLines({ captures, discarded = [], onEditNote, onMoveNote, onMoveNoteWord }) {
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState('')
  const [drag, setDrag] = useState(null)      // { code, word } — word null = whole note
  const [overCode, setOverCode] = useState(null)

  function beginEdit(c) { setEditing(c.code); setDraft(c.note) }
  function commit() {
    if (editing == null) return
    onEditNote(editing, draft.trim())   // '' is a deliberate empty note; ↺ resets
    setEditing(null)
  }

  function drop(toCode) {
    if (!drag || drag.code === toCode) return
    if (drag.word) onMoveNoteWord(drag.code, toCode, drag.word)
    else onMoveNote(drag.code, toCode)
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
          onDragOver={e => { if (drag && drag.code !== c.code) { e.preventDefault(); setOverCode(c.code) } }}
          onDragLeave={() => setOverCode(o => (o === c.code ? null : o))}
          onDrop={e => {
            e.preventDefault()
            drop(c.code)
            setDrag(null); setOverCode(null)
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
                  onDragStart={() => setDrag({ code: c.code, word: null })}
                  onDragEnd={() => { setDrag(null); setOverCode(null) }}
                  title="Drag onto another code to move the whole note"
                  style={{ cursor: 'grab', color: '#ced4da', flexShrink: 0 }}
                >
                  <MaterialIcon name="drag_indicator" size={14} />
                </span>
              )}
              {/* Tokens drag; the block edits. Each word is its own handle, so half a
                  note can go to the code it actually belongs to. */}
              <span className="pc-note rounded px-1"
                style={{ fontSize: 11, color: c.note ? '#495057' : '#adb5bd', flex: 1, minWidth: 0 }}>
                {c.note
                  ? wordsOf(c.note).map((w, wi) => (
                      <span key={`${w}-${wi}`}
                        draggable
                        className={`pc-word${drag?.code === c.code && drag?.word === w ? ' pc-dragging' : ''}`}
                        onDragStart={e => { e.stopPropagation(); setDrag({ code: c.code, word: w }) }}
                        onDragEnd={() => { setDrag(null); setOverCode(null) }}
                        onClick={() => beginEdit(c)}
                        title="Drag this word onto another code · click to edit the whole note">
                        {w}{wi < wordsOf(c.note).length - 1 ? ' ' : ''}
                      </span>
                    ))
                  : <span onClick={() => beginEdit(c)} style={{ cursor: 'text' }}>add a note…</span>}
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
