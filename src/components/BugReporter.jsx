import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, ButtonGroup, Dropdown, Form } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { buildReport, describeElement, domContext, reportsToMarkdown } from '../utils/bugReports'
import { download } from '../platform/fs'

/**
 * BugReporter — the alpha's bug-report mode. The bug beside ALPHA turns it on; then a
 * right-click anywhere opens a note at the pointer and saves it with what was on screen
 * (bugReports.js). Shift + right-click keeps the browser's own menu. The ▾ beside the bug
 * copies or saves every report as Markdown; the export window has the same, per report.
 */
export default function BugReporter({ screen }) {
  const bugMode = useStore(s => s.bugMode)
  const setBugMode = useStore(s => s.setBugMode)
  const reports = useStore(s => s.bugReports)
  const addBugReport = useStore(s => s.addBugReport)
  const clearBugReports = useStore(s => s.clearBugReports)
  const [draft, setDraft] = useState(null)   // { x, y, target, note, capture, preview }
  const [copied, setCopied] = useState(false)
  const trail = useRef([])
  const noteRef = useRef(null)
  const screenRef = useRef(screen)
  screenRef.current = screen

  // The last clicks, so a report says how you got there.
  useEffect(() => {
    const onClick = e => {
      if (e.target?.closest?.('[data-bug-reporter]')) return
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

  function save() {
    if (!draft?.note.trim()) return
    addBugReport(buildReport({
      note: draft.note, target: draft.target, state: useStore.getState(), screen: screenRef.current,
      trail: trail.current, capture: draft.capture,
    }))
    setDraft(null)
  }

  async function copyAll() {
    try { await navigator.clipboard.writeText(reportsToMarkdown(reports)); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* no clipboard */ }
  }

  const W = 320
  const left = draft ? Math.max(8, Math.min(draft.x, window.innerWidth - W - 8)) : 0
  const top = draft ? Math.max(8, Math.min(draft.y, window.innerHeight - 220)) : 0

  return (
    <>
      <div data-bug-reporter style={{ position: 'fixed', top: 4, left: 'calc(50% + 48px)', zIndex: 2000 }}>
        <ButtonGroup size="sm">
          <Button variant={bugMode ? 'danger' : 'light'} onClick={() => setBugMode(!bugMode)} data-testid="bug-toggle"
            aria-pressed={bugMode} title={bugMode ? 'Bug reports on: right-click anything to report it (Shift + right-click for the normal menu). Click to turn off.' : 'Report bugs: turn on, then right-click anything'}
            style={{ padding: '1px 6px', lineHeight: 1, boxShadow: '0 1px 4px rgba(0,0,0,.25)' }}>
            <MaterialIcon name="bug_report" size={16} />
            {reports.length > 0 && <span className="ms-1" style={{ fontSize: 11 }}>{reports.length}</span>}
          </Button>
          <Dropdown as={ButtonGroup} align="end">
            <Dropdown.Toggle split variant={bugMode ? 'danger' : 'light'} aria-label="Bug report options"
              style={{ padding: '1px 4px', boxShadow: '0 1px 4px rgba(0,0,0,.25)' }} />
            <Dropdown.Menu style={{ fontSize: 12 }}>
              <Dropdown.Header>{reports.length} bug report{reports.length === 1 ? '' : 's'}</Dropdown.Header>
              <Dropdown.Item onClick={copyAll} disabled={!reports.length}>
                <MaterialIcon name="content_copy" size={14} /> {copied ? 'Copied!' : 'Copy all as Markdown'}
              </Dropdown.Item>
              <Dropdown.Item onClick={() => download(`bug-reports-${new Date().toISOString().slice(0, 10)}.md`, reportsToMarkdown(reports), 'text/markdown')}
                disabled={!reports.length}>
                <MaterialIcon name="download" size={14} /> Save as .md
              </Dropdown.Item>
              <Dropdown.Divider />
              <Dropdown.Item onClick={() => { if (window.confirm(`Delete all ${reports.length} bug reports?`)) clearBugReports() }}
                disabled={!reports.length} className="text-danger">
                <MaterialIcon name="delete" size={14} /> Delete all
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        </ButtonGroup>
      </div>

      {draft && createPortal(
        <div data-bug-reporter data-testid="bug-note" role="dialog" aria-label="Bug report"
          onKeyDown={e => {
            if (e.key === 'Escape') { e.stopPropagation(); setDraft(null) }
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save() }
          }}
          style={{ position: 'fixed', left, top, width: W, zIndex: 2100, background: '#fff', border: '1px solid #dc3545',
            borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,.25)', padding: 10, fontSize: 12 }}>
          <div className="d-flex align-items-center gap-1 mb-1 fw-semibold" style={{ color: '#b02a37' }}>
            <MaterialIcon name="bug_report" size={14} /> What went wrong?
          </div>
          <Form.Control as="textarea" rows={4} ref={noteRef} value={draft.note} aria-label="Bug note" style={{ fontSize: 12 }}
            placeholder="What you did, what you expected, what happened…" onChange={e => setDraft(d => ({ ...d, note: e.target.value }))} />
          <Form.Check type="checkbox" id="bug-capture" className="mt-1" checked={draft.capture}
            onChange={() => setDraft(d => ({ ...d, capture: !d.capture }))}
            label={<span className="text-muted" style={{ fontSize: 11 }}>Record where: {draft.preview || 'this screen'}</span>} />
          <div className="d-flex justify-content-end gap-2 mt-2">
            <Button size="sm" variant="link" className="text-muted p-0" onClick={() => setDraft(null)}>Cancel</Button>
            <Button size="sm" variant="danger" disabled={!draft.note.trim()} onClick={save}>Save <kbd>Ctrl+Enter</kbd></Button>
          </div>
        </div>, draft.host?.isConnected ? draft.host : document.body
      )}
    </>
  )
}
