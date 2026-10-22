import React, { useEffect, useState } from 'react'
import { Modal, Button, Form } from 'react-bootstrap'
import MaterialIcon from './MaterialIcon'
import CopyButton from './CopyButton'
import { C } from '../styles/tokens'

/**
 * ConfirmSuggestionModal — halts an Add the companion is unsure of (utils/certainty.js) and asks
 * whether it is right, with what is needed to judge it: the position and its profile, the part, why
 * the companion thinks so, and what else the range has and the part is used with. Codes copy, for
 * looking up on the maker's site. The answer is a vote (datajoin `suggestion_votes`):
 *
 *   yes → confirmed     no → rejected, with the right code if known     not sure → unsure, added as TBC
 *
 * `noCode` (a connector set) drops the right-code field; `unsureLabel` renames Not sure.
 * A placeholder ("not known for …") asks for the code instead: one given is proposed for the next person.
 * Esc cancels: nothing is added, nothing is said.
 */
const Code = ({ code, what }) => code ? (
  <span className="font-monospace d-inline-flex align-items-center gap-1">{code}<CopyButton text={code} what={what} /></span>
) : <span className="text-muted fst-italic">no code</span>

export default function ConfirmSuggestionModal({ check, onAnswer, onCancel }) {
  const [wrong, setWrong] = useState(false)
  const [code, setCode] = useState('')
  const [note, setNote] = useState('')
  useEffect(() => { setWrong(false); setCode(''); setNote('') }, [check?.key])
  if (!check) return null
  const { posRef, profile, part, job, rule, evidence, siblings = [], alsoWith = [], placeholder, noCode, unsureLabel } = check
  const send = (vote, extra = {}) => onAnswer(vote, { code: code.trim().toUpperCase() || null, note: note.trim() || null, ...extra })
  const codeField = (label, autoFocus) => (
    <Form.Group className="mb-2">
      <Form.Label className="mb-1" style={{ fontSize: 12 }}>{label}</Form.Label>
      <Form.Control size="sm" className="font-monospace" value={code} autoFocus={autoFocus} placeholder="e.g. FPSN1013MC"
        onChange={e => setCode(e.target.value)} aria-label="Right code" />
    </Form.Group>
  )

  return (
    <Modal show onHide={onCancel} centered data-testid="confirm-suggestion">
      <div className="companion-card rounded">
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: 15 }} className="d-flex align-items-center gap-2">
            <MaterialIcon name="fact_check" size={18} style={{ color: C.companion }} />
            {placeholder ? `Do you know this profile's ${job}?` : `Is this the right ${job} for ${posRef}?`}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ fontSize: 12 }}>
          <p className="mb-2" style={{ color: C.companion, fontWeight: 600 }}>
            Please double check this now, your input helps future projects.
          </p>
          <table className="table table-sm mb-2" style={{ fontSize: 12 }}>
            <tbody>
              <tr><th className="text-muted fw-normal" style={{ width: 90 }}>Position</th><td><b>{posRef}</b></td></tr>
              {profile && <tr><th className="text-muted fw-normal">Built on</th><td>
                <span className="font-monospace">{profile.ref}</span>{profile.maker ? ` · ${profile.maker}` : ''} · <Code code={profile.code} what="profile code" />
                {profile.name && <div className="text-muted">{profile.name}</div>}</td></tr>}
              {!placeholder && <tr><th className="text-muted fw-normal">Suggested</th><td>
                {job} · <Code code={part?.code} what="suggested code" />{rule ? <span className="text-muted"> · {rule}</span> : null}
                {part?.name && <div className="text-muted">{part.name}</div>}</td></tr>}
              <tr><th className="text-muted fw-normal">Why</th><td>{evidence}</td></tr>
              {siblings.length > 0 && <tr><th className="text-muted fw-normal">Same range</th><td>
                {siblings.map(s => <div key={s.code}><Code code={s.code} what="code" /> <span className="text-muted">{s.name}</span></div>)}</td></tr>}
              {alsoWith.length > 0 && <tr><th className="text-muted fw-normal">Also used with</th><td>
                {alsoWith.map(a => <div key={a.code}><Code code={a.code} what="code" /> <span className="text-muted">{a.positions} position{a.positions === 1 ? '' : 's'}, {a.projects} project{a.projects === 1 ? '' : 's'}</span></div>)}</td></tr>}
            </tbody>
          </table>
          {placeholder && codeField(`The ${job}'s code, if you know it (blank adds a TBC placeholder)`, true)}
          {wrong && <>
            {!noCode && codeField('The right code, if you know it (it is added instead)', true)}
            <Form.Group><Form.Label className="mb-1" style={{ fontSize: 12 }}>Why it is wrong (optional)</Form.Label>
              <Form.Control size="sm" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. that clip is for the 1717 profile" aria-label="Note" /></Form.Group>
          </>}
        </Modal.Body>
        <Modal.Footer className="flex-nowrap">
          {placeholder ? <>
            <Button size="sm" variant="outline-secondary" onClick={onCancel}>Cancel</Button>
            <Button size="sm" variant="info" onClick={() => send(code.trim() ? 'proposed' : 'unsure')}>
              {code.trim() ? 'Add this code' : 'Add placeholder'}</Button>
          </> : wrong ? <>
            <Button size="sm" variant="outline-secondary" onClick={() => setWrong(false)}>Back</Button>
            <Button size="sm" variant="info" onClick={() => send('rejected')}>{code.trim() ? 'Add the right code' : "It's wrong: don't add it"}</Button>
          </> : <>
            <Button size="sm" variant="outline-secondary" onClick={() => send('unsure', { code: null })} title="Your answer counts for nothing either way">{unsureLabel || 'Not sure: add as TBC'}</Button>
            <Button size="sm" variant="outline-primary" onClick={() => setWrong(true)}><MaterialIcon name="thumb_down" size={13} /> No, it's wrong</Button>
            <Button size="sm" variant="info" onClick={() => send('confirmed', { code: null })}><MaterialIcon name="thumb_up" size={13} /> Yes, it's right</Button>
          </>}
        </Modal.Footer>
      </div>
    </Modal>
  )
}

/**
 * ConfirmLearnedModal — one popup for every learned value an Apply would use that the companion is
 * unsure of (a "no" newer than its last yes), never one per row. Each row: yes / no / not sure.
 * `items`: [{ key, code, maker, value, from, evidence }]. onDone(answers {key: vote}) — any "no"
 * sends the person back to fix those rows; onCancel goes back with nothing said.
 */
export function ConfirmLearnedModal({ items, what = 'family', onDone, onCancel }) {
  const [answers, setAnswers] = useState({})
  const anyNo = Object.values(answers).includes('rejected')
  const pick = (key, vote) => setAnswers(a => ({ ...a, [key]: a[key] === vote ? undefined : vote }))
  return (
    <Modal show onHide={onCancel} centered size="lg" data-testid="confirm-learned">
      <div className="companion-card rounded">
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: 15 }} className="d-flex align-items-center gap-2">
            <MaterialIcon name="fact_check" size={18} style={{ color: C.companion }} />
            {items.length} learned {what === 'family' ? `famil${items.length === 1 ? 'y needs' : 'ies need'}` : `value${items.length === 1 ? ' needs' : 's need'}`} a check
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ fontSize: 12 }}>
          <p className="mb-2" style={{ color: C.companion, fontWeight: 600 }}>
            Please double check this now, your input helps future projects.
          </p>
          <p className="text-muted mb-2">Someone said these were wrong since they were last confirmed. Is each one right for this code?</p>
          <table className="table table-sm mb-0" style={{ fontSize: 12 }}>
            <tbody>
              {items.map(it => (
                <tr key={it.key} data-testid="learned-row">
                  <td><Code code={it.code} what="code" />{it.maker && <div className="text-muted">{it.maker}</div>}</td>
                  <td><span className="font-monospace">{it.value}</span>
                    <div className="text-muted">{[it.from && `from ${it.from}`, it.evidence].filter(Boolean).join('; ')}</div></td>
                  <td className="text-end text-nowrap">
                    {[['confirmed', 'thumb_up', 'Right'], ['rejected', 'thumb_down', 'Wrong'], ['unsure', 'help', 'Not sure']].map(([vote, icon, label]) => (
                      <Button key={vote} size="sm" className="ms-1" variant={answers[it.key] === vote ? 'info' : 'outline-primary'}
                        aria-label={`${label}: ${it.code}`} aria-pressed={answers[it.key] === vote} onClick={() => pick(it.key, vote)}>
                        <MaterialIcon name={icon} size={13} /> {label}</Button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Modal.Body>
        <Modal.Footer className="flex-nowrap">
          <span className="text-muted me-auto">{anyNo ? 'Move the wrong ones to the right family, then apply again.' : 'Unanswered counts as not sure.'}</span>
          <Button size="sm" variant="outline-secondary" onClick={onCancel}>Back</Button>
          <Button size="sm" variant="info" onClick={() => onDone(answers)}>{anyNo ? 'Back to fix them' : 'Apply'}</Button>
        </Modal.Footer>
      </div>
    </Modal>
  )
}
