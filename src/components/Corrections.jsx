import React, { useState } from 'react'
import { Modal, Button, Form } from 'react-bootstrap'
import MaterialIcon from './MaterialIcon'
import useStore from '../store/useStore'
import { getCompanion } from '../platform/companion'
import { buildReport } from '../utils/bugReports'
import { C } from '../styles/tokens'

// Companion corrections, all purple: a popup is a `.companion-card`, a Maybe waiting for a pick is
// `.companion-maybe` (dashed). No condition chips: what decides between options is read from the context
// (SUGGESTIONS_PLAN 3e), never labelled by hand.

export const Mono = ({ children }) => <span className="font-monospace">{children}</span>

const SCOPES = [
  ['everywhere', 'public', 'Everywhere', 'A correction: the old one was wrong or replaced. Others are offered it too.'],
  ['sometimes', 'rule', 'Sometimes', 'Right on some projects, not others. The next project is offered it as a choice.'],
  ['project', 'folder', 'Just this project', 'A choice for this job only. Nothing is suggested elsewhere.'],
]

export function Scope({ name, scope, setScope, note, setNote }) {
  return <>
    <div className="d-grid gap-2 mb-2">
      {SCOPES.map(([k, icon, label, help]) => (
        <label key={k} className="d-flex gap-2 align-items-start p-2 rounded" style={{ cursor: 'pointer',
          border: `1px solid ${scope === k ? C.companion : C.border}`, background: scope === k ? C.refTint : C.surface }}>
          <Form.Check type="radio" name={name} checked={scope === k} onChange={() => setScope(k)} className="mt-0" aria-label={label} />
          <MaterialIcon name={icon} size={16} style={{ color: C.companion }} />
          <span><b>{label}</b><div className="text-muted">{help}</div></span>
        </label>
      ))}
    </div>
    {scope !== 'project' && <Form.Control size="sm" value={note} onChange={e => setNote(e.target.value)}
      placeholder="Why?" aria-label="Note" />}
  </>
}

export const Facts = ({ rows }) => (
  <table className="table table-sm mb-2" style={{ fontSize: 12 }}><tbody>
    {rows.map(([k, v]) => <tr key={k}><th className="text-muted fw-normal" style={{ width: 90 }}>{k}</th><td>{v}</td></tr>)}
  </tbody></table>
)

/** A free-text note goes as a report, read before anyone else sees it. */
export async function sendNote(note, about) {
  if (!note.trim()) return
  const api = await getCompanion()
  api?.report?.({ ...buildReport({ note: `${about}\n${note.trim()}`, capture: false, companion: true }), project: useStore.getState().projectNumber || null })
}

/** One answer, sent by its scope. "Just this project" sends nothing: the edit itself is the record. */
export async function sendCorrection({ scope, note }, payload) {
  const project = useStore.getState().projectNumber || ''
  if (scope !== 'project') {
    const api = await getCompanion()
    api?.contribute?.({ ...payload, project, ...(scope === 'sometimes' ? { scope } : {}) })
    sendNote(note, `${payload.kind} ${payload.code}`)
  }
  if (project) useStore.getState().toast(`Saved for ${project}. Thank you for your contribution.`)
}

/**
 * "Not right…": the one way to disagree with a companion line. `facts` are [label, value] rows; `onSend`
 * gets { right, scope, note }. Without a right code there is nothing to teach, so it only reports.
 */
export function NotRightModal({ show, onHide, title, facts, placeholder, onSend }) {
  const [right, setRight] = useState('')
  const [scope, setScope] = useState('sometimes')
  const [note, setNote] = useState('')
  return (
    <Modal show={show} onHide={onHide} centered contentClassName="companion-card" data-testid="not-right">
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 15 }} className="d-flex align-items-center gap-2">
          <MaterialIcon name="fact_check" size={18} style={{ color: C.companion }} />{title}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ fontSize: 12 }}>
        <Facts rows={facts} />
        <Form.Group className="mb-2">
          <Form.Label className="mb-1" style={{ fontSize: 12 }}>The right code, if you know it</Form.Label>
          <Form.Control size="sm" className="font-monospace" placeholder={placeholder} value={right} onChange={e => setRight(e.target.value)} />
        </Form.Group>
        <div className="mb-1 fw-semibold">Is it wrong…</div>
        <Scope name="wrong" {...{ scope, setScope, note, setNote }} />
      </Modal.Body>
      <Modal.Footer className="flex-nowrap">
        <Button size="sm" variant="link" className="me-auto p-0 text-muted" style={{ fontSize: 11 }}
          onClick={() => { onHide(); useStore.getState().requestBugNote() }}>Not about this suggestion? Report a problem</Button>
        <Button size="sm" variant="outline-secondary" onClick={onHide}>Back</Button>
        <Button size="sm" variant="info" onClick={() => { onSend({ right: right.trim(), scope, note }); onHide() }}>It's wrong: don't add it</Button>
      </Modal.Footer>
    </Modal>
  )
}

/**
 * A replaced code with several successors, waiting for a pick. `fit` ({ code, with }) is the one that
 * matches a part already beside this ElementType in a recipe: shown alone, saying why, the rest behind "N more".
 */
export function MaybeReplaced({ code, options, fit, generic, onUse, onNotRight }) {
  const [all, setAll] = useState(!fit)
  const shown = all ? options : options.filter(o => o.code === fit.code)
  return (
    <div className="companion-maybe px-2 py-2 mb-3" style={{ fontSize: 11, marginTop: -8 }} data-testid="retired-maybe">
      <div className="d-flex align-items-center gap-2 mb-1">
        <MaterialIcon name="alt_route" size={14} style={{ color: C.companion }} />
        <b style={{ color: C.refInk }}>{generic ? `Which ${code.toLowerCase()}? Each product has its own` : 'Maybe replaced by one of these'}</b>
      </div>
      <div className="d-grid gap-1">
        {shown.map(o => (
          <div key={o.code} className="d-flex align-items-center gap-2 p-1 rounded bg-white border">
            <Mono>{o.code}</Mono>
            <span className="text-muted" style={{ flex: 1 }}>
              {o.code === fit?.code ? <>goes with <Mono>{fit.with}</Mono> in this recipe</>
                : o.used > 0 ? `used on ${o.used} project${o.used > 1 ? 's' : ''}` : ''}
            </span>
            <Button size="sm" variant="outline-primary" style={{ fontSize: 11, padding: '0 8px' }} onClick={() => onUse(o.code)}>Use</Button>
          </div>
        ))}
      </div>
      <div className="d-flex justify-content-between mt-1">
        {fit && !all ? <Button size="sm" variant="link" className="p-0" style={{ fontSize: 11 }} onClick={() => setAll(true)}>{options.length - 1} more</Button> : <span />}
        <Button size="sm" variant="link" className="p-0 text-muted" style={{ fontSize: 11 }} onClick={onNotRight}>Not right…</Button>
      </div>
    </div>
  )
}
