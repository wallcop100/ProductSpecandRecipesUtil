import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Modal, Form } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { ACTIONS, AREAS } from '../help/actions'
import { find } from '../help/search'
import { contextFor } from '../help/run'
import { useCompanion } from '../platform/companion'
import { shareOutcomes } from '../platform/outcomes'
import TutorialCard from '../tutorial/TutorialCard'
import SwapEverywhereModal from './SwapEverywhereModal'
import ForkPositionModal from './ForkPositionModal'
import NewETWizardModal from './NewETWizardModal'

/**
 * FindPalette — Ctrl+K (or the Find button): say what you want to do, in your own words, and go
 * straight there. "rename ET-PS-MINI-TINI" opens the Product Spec on it with the ref field open and
 * ET-PS-MINI-TINI-01 typed in. Actions, the project's ElementTypes / positions / templates, and the
 * tutorials, in one list (help/actions.js, help/search.js).
 *
 * Every search ends as an outcome (beside a companion): the result picked, or nothing — which is how
 * the missing words and the features nobody can find show up on Orion. Nothing here says so.
 */
const KIND_ICON = { et: 'category', position: 'place', template: 'dashboard_customize' }
const SHORTCUTS = [['Ctrl+K', 'Find'], ['Ctrl+Z', 'Undo'], ['Ctrl+Y', 'Redo'], ['Ctrl+S', 'Save now'],
  ['Ctrl+C / Ctrl+V', 'Copy / paste selected recipe rows'], ['↑ / ↓', 'Previous / next position (in the list)'], ['Esc', 'Close a window']]

export default function FindPalette({ screen }) {
  const [show, setShow] = useState(false)
  const [q, setQ] = useState('')
  const [at, setAt] = useState(0)
  const [hosted, setHosted] = useState(null)        // { kind, props }
  const [tutorial, setTutorial] = useState(null)
  const input = useRef(null)
  const picked = useRef(false)
  const companion = useCompanion()

  useEffect(() => {
    const onKey = e => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setShow(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => { if (show) { setQ(''); setAt(0); picked.current = false; setTimeout(() => input.current?.focus(), 0) } }, [show])

  // The store as it is when you type: read on demand, so a closed palette never re-renders with it.
  const state = show ? useStore.getState() : null
  const results = useMemo(() => (show ? find(q, { actions: ACTIONS, state: useStore.getState(), screen }) : []), [q, show, screen])
  useEffect(() => setAt(0), [q])

  function record(outcome, final = null) {
    const key = q.trim().toLowerCase().slice(0, 120)
    if (key.length < 3) return
    shareOutcomes(companion, state?.projectNumber, [{ kind: 'search', key, tier: 'search', source: screen || '',
      supplied: results[0] ? (results[0].action?.id || results[0].kind) : 'no results', final, outcome }])
  }
  function close() {
    if (!picked.current) record('dismissed')
    setShow(false)
  }
  function go(r) {
    if (!r) return
    picked.current = true
    record('accepted', r.kind === 'action' ? r.action.id : `${r.kind}:${r.ref}`)
    setShow(false)
    const host = (kind, props) => (kind === 'report' ? useStore.getState().requestBugNote() : setHosted({ kind, props: props || {} }))
    const ctx = contextFor({ ref: r.ref, pos: r.pos, host, tutorial: setTutorial })
    if (r.kind === 'action') return r.action.run(ctx)
    if (r.kind === 'et') return ctx.spec(r.ref)
    if (r.kind === 'position') return ctx.openPosition(r.ref)
    if (r.kind === 'template') return ctx.go('template-editor')
  }
  const onKeyDown = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setAt(i => Math.min(results.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt(i => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[at]) }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
  }

  const hostedEl = hosted?.kind === 'swap' ? <SwapEverywhereModal show fromRef={hosted.props.fromRef} onHide={() => setHosted(null)} />
    : hosted?.kind === 'forkPosition' ? <ForkPositionModal show sourceRef={hosted.props.sourceRef} onHide={() => setHosted(null)} />
      : hosted?.kind === 'newET' ? <NewETWizardModal show posRef={hosted.props.posRef} onHide={() => setHosted(null)} onDone={() => setHosted(null)} />
        : hosted?.kind === 'shortcuts' ? (
          <Modal show centered onHide={() => setHosted(null)} size="sm">
            <Modal.Header closeButton><Modal.Title style={{ fontSize: 15 }}>Keyboard shortcuts</Modal.Title></Modal.Header>
            <Modal.Body style={{ fontSize: 12 }}>
              {SHORTCUTS.map(([k, v]) => <div key={k} className="d-flex py-1 border-bottom"><kbd className="me-3" style={{ minWidth: 110 }}>{k}</kbd>{v}</div>)}
            </Modal.Body>
          </Modal>) : null

  return (
    <>
      <button type="button" data-testid="find-open" onClick={() => setShow(true)} title="Find a function, an ElementType or a position (Ctrl+K)"
        className="btn btn-light btn-sm d-inline-flex align-items-center gap-1"
        style={{ position: 'fixed', top: 4, right: 'calc(50% + 52px)', zIndex: 2000, padding: '1px 8px', fontSize: 12, boxShadow: '0 1px 4px rgba(0,0,0,.25)' }}>
        <MaterialIcon name="search" size={15} /> Find <kbd style={{ fontSize: 9, padding: '0 3px' }}>Ctrl K</kbd>
      </button>
      <Modal show={show} onHide={close} size="lg" data-testid="find" contentClassName="border-0"
        dialogClassName="mt-5" style={{ zIndex: 2100 }}>
        <div className="p-2">
          <Form.Control ref={input} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKeyDown} aria-label="Find"
            placeholder='What do you want to do? e.g. "rename ET-PS-MINI-TINI", "change family", "did my patch work"'
            style={{ fontSize: 14 }} />
          {q.trim() && (
            <div className="mt-2" style={{ maxHeight: 440, overflowY: 'auto' }} role="listbox">
              {results.length === 0 && (
                <div className="text-muted small p-2">Nothing matches. Try other words, or
                  <button type="button" className="btn btn-link btn-sm p-0 ms-1 align-baseline" onClick={() => { picked.current = true; record('dismissed', 'reported'); setShow(false); useStore.getState().requestBugNote() }}>tell us what you were looking for</button>.
                </div>
              )}
              {results.map((r, i) => (
                <div key={`${r.kind}|${r.action?.id || r.ref}|${r.ref || ''}|${r.pos || ''}`} role="option" aria-selected={i === at}
                  data-testid={`find-${r.kind === 'action' ? r.action.id : r.kind}`}
                  onMouseEnter={() => setAt(i)} onClick={() => go(r)}
                  className="d-flex align-items-start gap-2 px-2 py-1 rounded"
                  style={{ cursor: 'pointer', background: i === at ? '#e8f0fe' : 'transparent', fontSize: 13 }}>
                  <MaterialIcon name={r.kind === 'action' ? (r.action.tutorial ? 'school' : 'bolt') : KIND_ICON[r.kind]} size={16}
                    style={{ color: '#1c5cab', marginTop: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div>
                      {r.title}
                      {r.kind === 'action' && <span className="text-muted ms-2" style={{ fontSize: 10 }}>{AREAS[r.action.area]}</span>}
                      {r.kind !== 'action' && <span className="text-muted ms-2" style={{ fontSize: 10 }}>{r.kind === 'et' ? 'ElementType' : r.kind}</span>}
                    </div>
                    {i === at && (r.kind === 'action' ? r.action.how : r.sub) && (
                      <div className="text-muted" style={{ fontSize: 11 }}>{r.kind === 'action' ? r.action.how : r.sub}</div>
                    )}
                  </div>
                  {r.kind === 'action' && r.action.inPlace && <span className="text-muted" style={{ fontSize: 10 }}>{r.action.tutorial ? 'guide' : 'runs now'}</span>}
                </div>
              ))}
            </div>
          )}
          <div className="text-muted mt-2 px-1" style={{ fontSize: 10 }}>↑ ↓ to move · Enter to go · Esc to close</div>
        </div>
      </Modal>
      {hostedEl}
      {tutorial && <TutorialCard id={tutorial} show onHide={() => setTutorial(null)} />}
    </>
  )
}
