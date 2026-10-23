import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, ButtonGroup, Dropdown, Form } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { buildReport, describeElement, domContext, reportsToMarkdown } from '../utils/bugReports'
import { download } from '../platform/fs'
import { useCompanion } from '../platform/companion'
import { learnedInView } from '../platform/outcomes'
import { C } from '../styles/tokens'
import { askConfirm } from './ConfirmHost'

/**
 * BugReporter — the alpha's bug-report mode. The bug at the bottom centre turns it on; then a
 * right-click anywhere opens a note at the pointer and saves it with what was on screen
 * (bugReports.js). Shift + right-click keeps the browser's own menu. The ▾ beside the bug
 * copies or saves every report as Markdown; the export window has the same, per report.
 *
 * One reporter for bugs and feature requests. "Write a report…" in the ▾ opens a note without
 * aiming at anything. Served beside a companion with `reports`, a note is SENT (Send / Send as
 * Feature Request) instead of saved, and one that cannot go is kept here; the ▾ then also sends
 * whatever is kept. Without a companion it is saved here and copied or saved as Markdown.
 */
export default function BugReporter({ screen }) {
  const bugMode = useStore(s => s.bugMode)
  const setBugMode = useStore(s => s.setBugMode)
  const reports = useStore(s => s.bugReports)
  const addBugReport = useStore(s => s.addBugReport)
  const clearBugReports = useStore(s => s.clearBugReports)
  const [draft, setDraft] = useState(null)   // { x, y, target, note, capture, preview }
  const [copied, setCopied] = useState(false)
  const [sent, setSent] = useState(null)      // 'sent' | 'kept' | 'n sent' — a moment's word beside the bug
  const companion = useCompanion()
  const canSend = !!companion?.report
  const bugRef = useRef(null)
  const trail = useRef([])
  const lastClicked = useRef(null)   // what "this" probably is when the note is opened from the ▾
  const noteRef = useRef(null)
  const screenRef = useRef(screen)
  screenRef.current = screen

  // The last clicks, so a report says how you got there.
  useEffect(() => {
    const onClick = e => {
      if (e.target?.closest?.('[data-bug-reporter]')) return
      lastClicked.current = e.target
      const label = describeElement(e.target?.closest?.('button,a,[role=button],input,select,td,th,label') || e.target)
      if (!label) return
      trail.current = [...trail.current.slice(-9), { at: new Date().toISOString(), screen: screenRef.current, label }]
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [])

  useEffect(() => {
    if (!bugMode) return
    const onMenu = e => {
      if (e.shiftKey || e.target?.closest?.('[data-bug-reporter]')) return
      e.preventDefault()
      e.stopPropagation()
      const d = domContext(e.target)
      // An open window keeps focus inside itself: the note lives in the top one.
      const host = [...document.querySelectorAll('.modal.show')].at(-1) || document.body
      setDraft({
        host, x: e.clientX, y: e.clientY, target: e.target, note: '', capture: true,
        preview: [screenRef.current, d.dialogs.at(-1), d.areas[0], d.element].filter(Boolean).join(' · '),
      })
    }
    document.addEventListener('contextmenu', onMenu, true)
    return () => document.removeEventListener('contextmenu', onMenu, true)
  }, [bugMode])

  useEffect(() => { if (draft) setTimeout(() => noteRef.current?.focus(), 0) }, [!!draft])
  // Find (Ctrl+K) → "report a bug" opens the note.
  const bugNoteRequest = useStore(s => s.bugNoteRequest)
  useEffect(() => { if (bugNoteRequest) openNote() }, [bugNoteRequest])   // eslint-disable-line react-hooks/exhaustive-deps

  function build(kind) {
    return buildReport({
      note: draft.note, kind, target: draft.target, via: draft.via, companion: !!companion, state: useStore.getState(), screen: screenRef.current,
      trail: trail.current, capture: draft.capture, taken: useStore.getState().bugReports.map(r => r.id),
    })
  }

  function save(kind = 'bug') {
    if (!draft?.note.trim()) return
    addBugReport(build(kind))
    setDraft(null)
  }

  const say = word => { setSent(word); setTimeout(() => setSent(null), 2500) }
  const deliver = r => {
    const learned = r.dom ? learnedInView([r.dom.code, ...(r.dom.refs || []), r.app?.elementType]) : []
    return companion.report({ ...r, project: useStore.getState().projectNumber || null, ...(learned.length ? { learned } : {}) })
  }

  /** Send now; if it can't go, keep it here like any other report. */
  async function send(kind = 'bug') {
    if (!draft?.note.trim() || !canSend) return
    const r = build(kind)
    setDraft(null)
    const ok = await deliver(r)
    if (!ok) addBugReport(r)
    say(ok ? 'sent' : 'kept')
  }

  /** The reports kept here (written before, or that could not go): send them, keeping what fails. */
  async function sendKept() {
    let n = 0
    const all = useStore.getState().bugReports
    for (const r of all) {
      if (await deliver(r)) { useStore.getState().deleteBugReport(r.id); n++ }
    }
    say(n === all.length ? `${n} sent` : `${n} of ${all.length} sent, the rest kept`)
  }

  /** A note under the bug, or under the element it was asked from (a suggestion's ⋯ menu). */
  function openNote() {
    const target = useStore.getState().bugNoteTarget?.isConnected ? useStore.getState().bugNoteTarget : null
    const last = !target && lastClicked.current?.isConnected ? lastClicked.current : null
    const b = (target || bugRef.current)?.getBoundingClientRect()
    const d = target || last ? domContext(target || last) : null
    setDraft({
      host: document.body, x: b ? (target ? b.left : b.left - 140) : 80, y: b ? b.bottom + 6 : 40, target: target || last,
      via: last ? 'last-click' : undefined, note: '', capture: true,
      preview: d ? [screenRef.current, d.areas[0], last ? `last clicked ${d.element}` : d.element].filter(Boolean).join(' · ') : screenRef.current || '',
    })
  }

  async function copyAll() {
    try { await navigator.clipboard.writeText(reportsToMarkdown(reports)); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* no clipboard */ }
  }

  const W = 320
  const left = draft ? Math.max(8, Math.min(draft.x, window.innerWidth - W - 8)) : 0
  const top = draft ? Math.max(8, Math.min(draft.y, window.innerHeight - 220)) : 0

  return (
    <>
      <div data-bug-reporter style={{ position: 'fixed', bottom: 4, left: '50%', transform: 'translateX(-50%)', zIndex: 2000 }}>
        <ButtonGroup size="sm">
          <Button ref={bugRef} variant={bugMode ? 'danger' : 'light'} onClick={() => setBugMode(!bugMode)} data-testid="bug-toggle"
            aria-pressed={bugMode} title={bugMode ? 'Bug reports on: right-click anything to report it (Shift + right-click for the normal menu). Click to turn off.' : 'Report bugs: turn on, then right-click anything'}
            style={{ padding: '0 4px', lineHeight: 1, boxShadow: '0 1px 3px rgba(0,0,0,.2)' }}>
            <MaterialIcon name="bug_report" size={14} />
            {reports.length > 0 && <span className="ms-1" style={{ fontSize: 11 }}>{reports.length}</span>}
          </Button>
          <Dropdown as={ButtonGroup} drop="up">
            <Dropdown.Toggle split variant={bugMode ? 'danger' : 'light'} aria-label="Bug report options"
              style={{ padding: '0 3px', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
            <Dropdown.Menu style={{ fontSize: 12 }}>
              <Dropdown.Item onClick={openNote} data-testid="report-write">
                <MaterialIcon name="edit_note" size={14} /> Write a report…
              </Dropdown.Item>
              <Dropdown.Divider />
              <Dropdown.Header>{reports.length} {canSend ? 'kept' : 'bug'} report{reports.length === 1 ? '' : 's'}</Dropdown.Header>
              {canSend && (
                <Dropdown.Item onClick={sendKept} disabled={!reports.length} data-testid="report-send-kept">
                  <MaterialIcon name="send" size={14} /> Send {reports.length === 1 ? 'it' : 'them'}
                </Dropdown.Item>
              )}
              <Dropdown.Item onClick={copyAll} disabled={!reports.length}>
                <MaterialIcon name="content_copy" size={14} /> {copied ? 'Copied!' : 'Copy all as Markdown'}
              </Dropdown.Item>
              <Dropdown.Item onClick={() => download(`bug-reports-${new Date().toISOString().slice(0, 10)}.md`, reportsToMarkdown(reports), 'text/markdown')}
                disabled={!reports.length}>
                <MaterialIcon name="download" size={14} /> Save as .md
              </Dropdown.Item>
              <Dropdown.Divider />
              <Dropdown.Item onClick={async () => { if (await askConfirm(`Delete all ${reports.length} bug reports?`, { ok: 'Delete', danger: true })) clearBugReports() }}
                disabled={!reports.length} className="text-danger">
                <MaterialIcon name="delete" size={14} /> Delete all
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        </ButtonGroup>
        {sent && <span className="ms-1 small" role="status" style={{ background: C.surface, borderRadius: 4, padding: '1px 6px', boxShadow: '0 1px 4px rgba(0,0,0,.25)' }}>
          {sent === 'sent' ? 'Sent, thank you' : sent === 'kept' ? 'Kept with your bug reports' : sent.endsWith('kept') ? sent : `${sent}, thank you`}</span>}
      </div>

      {draft && createPortal(
        <div data-bug-reporter data-testid="bug-note" role="dialog" aria-label="Bug report"
          onKeyDown={e => {
            if (e.key === 'Escape') { e.stopPropagation(); setDraft(null) }
          }}
          style={{ position: 'fixed', left, top, width: W, zIndex: 2100, background: C.surface, border: `1px solid ${C.danger}`,
            borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,.25)', padding: 10, fontSize: 12 }}>
          <div className="d-flex align-items-center gap-1 mb-1 fw-semibold" style={{ color: C.danger }}>
            <MaterialIcon name="bug_report" size={14} /> What went wrong, or what would help?
          </div>
          <Form.Control as="textarea" rows={4} ref={noteRef} value={draft.note} aria-label="Bug note" style={{ fontSize: 12 }}
            placeholder="What you did, what you expected, what happened…" onChange={e => setDraft(d => ({ ...d, note: e.target.value }))} />
          <Form.Check type="checkbox" id="bug-capture" className="mt-1" checked={draft.capture}
            onChange={() => setDraft(d => ({ ...d, capture: !d.capture }))}
            label={<span className="text-muted" style={{ fontSize: 11 }}>Record where: {draft.preview || 'this screen'}</span>} />
          <div className="d-flex justify-content-end gap-2 mt-2">
            <Button size="sm" variant="link" className="text-muted p-0" onClick={() => setDraft(null)}>Cancel</Button>
            <Button size="sm" disabled={!draft.note.trim()} onClick={() => (canSend ? send('feature') : save('feature'))}
              style={{ background: C.accent, borderColor: C.accent, color: C.surface }}>{canSend ? 'Send' : 'Save'} as Feature Request</Button>
            <Button size="sm" variant="danger" disabled={!draft.note.trim()} onClick={() => (canSend ? send() : save())}
              data-testid="report-send">{canSend ? 'Send' : 'Save'}</Button>
          </div>
        </div>, draft.host?.isConnected ? draft.host : document.body
      )}
    </>
  )
}
