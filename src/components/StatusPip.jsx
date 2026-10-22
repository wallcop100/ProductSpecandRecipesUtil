import React, { useMemo, useRef, useState } from 'react'
import { OverlayTrigger, Popover } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { positionHealth, STATUS_LABEL } from '../utils/positionHealth'
import { C } from '../styles/tokens'

const COLOR = { red: C.danger, amber: C.attn, green: C.success, purple: C.companion, grey: C.faint }
const HEAD = { red: 'Needs fixing', amber: 'Needs a decision', green: 'Done', purple: 'Suggestions waiting', grey: '' }
const ICON = { error: 'error', warning: 'warning', info: 'info' }
// What a green pip has passed (report #22): the position rules in utils/validationRules.
const CHECKED = [
  'one design element, every other row a contract item',
  'quantities and multipliers',
  'template slots filled',
  'driver for Local; locking lever and clips for LIN',
  'connector sets complete; IP-rated connectors outside',
]

/**
 * StatusPip — the one status mark for a position, in the rail and the editor header.
 * Colour is worst-of (utils/positionHealth); the popover lists why, each reason one click to the fix.
 * `status` is usePositionList's statusOf(pt). The popover stays open under the mouse so it can be clicked.
 */
export default function StatusPip({ posRef, status, size = 9 }) {
  const results = useStore(s => s.validationResults)
  const companion = useStore(s => !!s.companionPending[posRef])
  const focusPosition = useStore(s => s.focusPosition)
  const here = useStore(s => s.activePositionRef === posRef && s.rootView === 'positions')
  const [show, setShow] = useState(false)
  const timer = useRef(null)
  const open = () => { clearTimeout(timer.current); setShow(true) }
  const later = () => { timer.current = setTimeout(() => setShow(false), 150) }

  const issues = useMemo(() => results.filter(i => i.fixKind !== 'spec' && i.ref === posRef), [results, posRef])
  const { level, reasons } = positionHealth({ status, issues, companion })
  const half = level === 'amber' && reasons.every(r => r.kind !== 'validation')
  const head = HEAD[level] || STATUS_LABEL[status] || ''
  const go = () => { setShow(false); focusPosition(posRef) }

  const pop = (
    <Popover style={{ maxWidth: 340 }} onMouseEnter={open} onMouseLeave={later}>
      <Popover.Header style={{ fontSize: 12 }}>{head || posRef}{head && ` — ${posRef}`}</Popover.Header>
      <Popover.Body className="p-2" style={{ fontSize: 11 }}>
        {reasons.length === 0 && level === 'green' && (
          <div className="text-muted">Passed every check:
            <ul className="mb-0 ps-3">{CHECKED.map(c => <li key={c}>{c}</li>)}</ul>
          </div>
        )}
        {reasons.length === 0 && level !== 'green' && <div className="text-muted">Nothing outstanding.</div>}
        {reasons.map((r, i) => (
          <div key={i} className="d-flex align-items-start gap-1 mb-1 p-1 rounded"
            style={{ cursor: 'pointer', background: r.severity === 'error' ? C.dangerTint : r.severity === 'warning' ? C.attnTint : undefined }}
            onClick={go}>
            <MaterialIcon name={ICON[r.severity]} size={13} style={{ color: r.severity === 'error' ? C.danger : r.severity === 'warning' ? C.attnInk : C.muted, flexShrink: 0 }} />
            <span>{r.message}</span>
          </div>
        ))}
        {reasons.length > 0 && !here && (
          <button className="btn btn-link btn-sm p-0 d-flex align-items-center gap-1 mt-1" style={{ fontSize: 11, color: C.accent, textDecoration: 'none' }} onClick={go}>
            <MaterialIcon name="open_in_new" size={13} /> Open {posRef}
          </button>
        )}
      </Popover.Body>
    </Popover>
  )

  return (
    <OverlayTrigger placement="auto" trigger="manual" show={show} overlay={pop}>
      <span role="img" tabIndex={0} data-level={level} data-half={half || undefined} data-testid={`pip-${posRef}`}
        aria-label={reasons[0]?.message || head}
        onMouseEnter={open} onMouseLeave={later} onFocus={open} onBlur={later}
        style={level === 'grey'   // a grey line, not a pip: nothing here is wrong
          ? { width: size, height: 2, margin: `${(size - 2) / 2}px 0`, borderRadius: 1, background: COLOR.grey, display: 'inline-block', flexShrink: 0, cursor: 'default' }
          : { width: size, height: size, borderRadius: '50%',
              // half-filled: the Form still asks for something; a full amber pip is a validation warning
              background: half ? `linear-gradient(90deg, ${COLOR[level]} 50%, transparent 50%)` : COLOR[level],
              boxShadow: half ? `inset 0 0 0 1px ${COLOR[level]}` : undefined, display: 'inline-block', flexShrink: 0, cursor: 'default' }} />
    </OverlayTrigger>
  )
}
