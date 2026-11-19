import React, { useState } from 'react'
import { Button, Form } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { btn, mono } from './FormPaneParts'
import { changedWord, diffParts, formNotesToMarkdown, noteState } from '../utils/formNotes'
import { C } from '../styles/tokens'

/**
 * Form Template Notes (NAL5HU): the pieces the pane and the painter share. Canvas v10.
 * Labels are statements; the "?" belongs to the Markdown export alone.
 */

const quiet = { ...btn, borderColor: C.border, color: C.muted, background: C.surface }

/** The editor's head: what the note is on, and the Form's words for it when it has any (2EE4XL). */
export const noteHead = (what, text) => (String(text ?? '').trim() ? `${what} · “${String(text).trim()}”` : what)

/** The note editor (`.ed`): `Column · “value”`, an optional Should be, the note, Save / Cancel. */
export function NoteEditor({ head, shouldBe, shouldBePlaceholder, initial = '', notePlaceholder = 'Add a comment', requireNote = true, saveLabel = () => 'Save note', onSave, onCancel, onClear }) {
  const [note, setNote] = useState(initial)
  const [sb, setSb] = useState(shouldBe ?? '')
  const hasSb = shouldBe !== undefined
  const fixing = hasSb && sb.trim() && sb.trim() !== shouldBe
  const ok = note.trim() || fixing || (!requireNote && hasSb)
  const save = () => ok && onSave({ note: note.trim(), shouldBe: hasSb ? sb.trim() : undefined })
  return (
    <div data-testid="note-editor" className="d-grid gap-1 mt-1 p-1 rounded"
      style={{ border: `1px solid ${C.accentEdge}`, background: C.surface, boxShadow: '0 4px 12px rgba(0,0,0,.08)' }}
      onKeyDown={e => { if (e.key === 'Escape') onCancel() }}>
      <div style={{ ...mono, fontSize: 10, color: C.muted }} className="text-truncate">{head}</div>
      {hasSb && (
        <div className="d-grid align-items-center" style={{ gridTemplateColumns: 'max-content minmax(0,1fr)', gap: 6, fontSize: 11 }}>
          <span className="text-muted">Correct code</span>
          <Form.Control size="sm" value={sb} onChange={e => setSb(e.target.value)} placeholder={shouldBePlaceholder} data-testid="note-should-be"
            aria-label="Correct code" style={{ ...mono, fontSize: 11, height: 22, padding: '0 5px' }} className="note-sb" />
        </div>
      )}
      <Form.Control as="textarea" rows={2} autoFocus={!hasSb} value={note} onChange={e => setNote(e.target.value)} data-testid="note-text"
        placeholder={notePlaceholder} aria-label="Note" style={{ fontSize: 11.5, minHeight: 44, padding: '4px 6px' }} />
      <div className="d-flex gap-1 align-items-center">
        <Button size="sm" variant="primary" style={btn} disabled={!ok} onClick={save} data-testid="note-save">{saveLabel(fixing)}</Button>
        <Button size="sm" variant="light" style={quiet} onClick={onCancel} data-testid="note-cancel">Cancel</Button>
        {onClear && <Button size="sm" variant="light" className="ms-auto" style={quiet} onClick={onClear} data-testid="note-clear">Clear note</Button>}
      </div>
    </div>
  )
}

/** The note itself, under what it is on (`.nt`). */
export function NoteLine({ text, onClick }) {
  if (!text) return null
  return (
    <div data-testid="note-line" className="d-flex align-items-start gap-1 rounded" onClick={onClick} role={onClick ? 'button' : undefined}
      style={{ fontSize: 11, color: C.ink, background: C.subtle, padding: '4px 6px', marginTop: 2 }}>
      <MaterialIcon name="rate_review" size={14} style={{ color: C.accent, flexShrink: 0 }} />
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{text}</span>
    </div>
  )
}

/** `vr` + Not needed, beside Create / Existing or Position / wrapper. */
export function NotNeededButton({ on, onClick }) {
  return (
    <>
      <span style={{ width: 1, alignSelf: 'stretch', background: C.border, margin: '0 2px' }} />
      <Button size="sm" variant="light" style={on ? { ...btn, background: C.accentTint, borderColor: C.accent, color: C.accent } : quiet}
        aria-pressed={on} onClick={onClick} data-testid="not-needed">
        <MaterialIcon name="do_not_disturb_on" size={12} /> Not needed
      </Button>
    </>
  )
}

/** The struck old part and the new part of a corrected Form code. */
export function CodeDiff({ from, to }) {
  const [pre, del, ins, post] = diffParts(from, to)
  return (
    <span data-testid="code-diff" style={mono}>{pre}
      {del && <del style={{ color: C.danger }}>{del}</del>}
      {ins && <ins style={{ textDecoration: 'none', background: C.successTint, color: C.ink, borderRadius: 2, padding: '0 1px' }}>{ins}</ins>}
      {post}
    </span>
  )
}

const SETTLED = {
  notNeeded: { icon: 'do_not_disturb_on', tip: 'Marked as not needed' },
  wrongCode: { icon: 'do_not_disturb_on', tip: 'Marked as a wrong code' },
  missing: { icon: 'playlist_add', tip: 'Marked as missing from the Form' },
  wholeEntry: { icon: 'do_not_disturb_on', tip: 'Marked as whole entry wrong' },
}
export const settledIcon = kind => SETTLED[kind]

/** The amber "Form changed here since your note" (`.stale`): keep the note, or clear it. */
export function StaleBox({ n, keepLabel, onKeep, onClear }) {
  const [then, now] = changedWord(n.then, n.now)   // one changed word on a long Form line: just that word
  return (
    <div data-testid="note-stale" className="d-grid rounded" style={{ background: C.attnTint, color: C.attnInk, padding: '5px 7px', fontSize: 11, gap: 5, marginTop: 4 }}>
      <div><MaterialIcon name="difference" size={14} /> Form changed here since your note: <s style={{ color: C.danger }}>{then}</s> → {now}</div>
      <div className="d-flex gap-1">
        <Button size="sm" variant="light" style={{ ...btn, background: C.surface, borderColor: C.attnInk, color: C.attnInk }} onClick={onKeep} data-testid="note-keep">{keepLabel}</Button>
        <Button size="sm" variant="light" style={quiet} onClick={onClear} data-testid="note-stale-clear">Clear note</Button>
      </div>
    </div>
  )
}

/**
 * A settled line (not needed, missing from the Form): its mark, the code, its note, and the
 * amber question when a newer Form changed it. Click to read, edit or undo.
 */
export function SettledLine({ n, label }) {
  const [editing, setEditing] = useState(false)
  const { saveFormNote, removeFormNote } = useStore.getState()
  const s = SETTLED[n.kind]
  return (
    <div data-testid="settled-line" data-kind={n.kind} data-code={n.code || n.et}>
      <div className="d-flex align-items-center border-bottom" role="button" onClick={() => setEditing(v => !v)}
        style={{ gap: 6, minHeight: 22, padding: '3px 0', fontSize: 11 }}>
        <span style={{ ...mono, width: 10, flexShrink: 0, color: C.muted, fontWeight: 600, textAlign: 'center' }}>{n.state === 'stale' ? '~' : ''}</span>
        <MaterialIcon name={s.icon} size={14} title={s.tip} style={{ color: C.success, flexShrink: 0 }} />
        <span className="text-truncate" style={{ ...mono, fontWeight: n.kind === 'missing' ? 600 : 400, color: n.kind === 'missing' ? C.ink : C.muted }}>{label}</span>
      </div>
      {editing ? (
        <NoteEditor head={n.kind === 'missing' ? `${n.et} · in the recipe` : noteHead(n.code, n.desc)} initial={n.note}
          saveLabel={() => 'Save note'} onCancel={() => setEditing(false)}
          onSave={({ note }) => { saveFormNote({ ...n, note }); setEditing(false) }}
          onClear={() => removeFormNote(n.key)} />
      ) : <NoteLine text={n.note} onClick={() => setEditing(true)} />}
      {n.state === 'stale' && (
        <StaleBox n={n} keepLabel={n.kind === 'wholeEntry' ? 'Still set aside' : 'Still not needed'}
          onKeep={() => saveFormNote({ ...n, formText: n.kind === 'wholeEntry' ? n.now : `${n.code} ${n.now}` })}
          onClear={() => removeFormNote(n.key)} />
      )}
    </div>
  )
}

/** The notes as Markdown for whoever owns the Form, with the ones the Form has since fixed. */
export function formNotesMarkdown(state = useStore.getState()) {
  const { formNotes, importDraft, formCaptures, projectNumber, positionTypes } = state
  const rated = (formNotes || []).map(n => ({ n, st: noteState(n, importDraft, formCaptures).state }))
  const positionNames = Object.fromEntries((positionTypes || []).map(p => [p.PositionTypeRef, p.Name || p.PositionTypeName || '']).filter(([, v]) => v))
  return formNotesToMarkdown(rated.filter(x => x.st !== 'gone').map(x => x.n), {
    project: projectNumber || '', sourceName: formCaptures?.source?.name || '', importedAt: formCaptures?.importedAt || null,
    positionNames, gone: rated.filter(x => x.st === 'gone').map(x => x.n),
  })
}
