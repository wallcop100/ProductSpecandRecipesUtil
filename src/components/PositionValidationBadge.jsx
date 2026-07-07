import React, { useMemo, useRef, useState } from 'react'
import { OverlayTrigger, Popover } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { ACTION_ICONS } from '../utils/entityStyle'

/**
 * PositionValidationBadge — per-position validation status icon with a sticky
 * hover popover. The popover stays open while the mouse is over either the icon
 * or the popover itself, so links inside it can be clicked.
 *
 * Props:
 *   posRef: string
 *   size: number   — icon px (default 14)
 *   showOk: bool   — render a green tick when validated and clean (default false)
 */
export default function PositionValidationBadge({ posRef, size = 14, showOk = false }) {
  const validationResults = useStore(s => s.validationResults)
  const focusPosition     = useStore(s => s.focusPosition)

  const [show, setShow] = useState(false)
  const hideTimer = useRef(null)

  function openPop() {
    if (hideTimer.current) clearTimeout(hideTimer.current)
    setShow(true)
  }
  function schedulePop() {
    hideTimer.current = setTimeout(() => setShow(false), 150)
  }

  const issues = useMemo(
    () => validationResults.filter(i => i.fixKind !== 'spec' && i.ref === posRef),
    [validationResults, posRef]
  )

  if (validationResults.length === 0) return null

  const hasError   = issues.some(i => i.severity === 'error')
  const hasWarning = !hasError && issues.some(i => i.severity === 'warning')

  if (!hasError && !hasWarning) {
    return showOk
      ? <MaterialIcon name={ACTION_ICONS.complete} size={size} style={{ color: '#198754' }} title="Validation OK" />
      : null
  }

  const color = hasError ? '#dc3545' : '#ffc107'
  const icon  = hasError ? 'error' : 'warning'

  const popover = (
    <Popover
      style={{ maxWidth: 340 }}
      onMouseEnter={openPop}
      onMouseLeave={schedulePop}
    >
      <Popover.Header style={{ fontSize: 12 }}>
        {issues.length} issue{issues.length === 1 ? '' : 's'} — {posRef}
      </Popover.Header>
      <Popover.Body className="p-2">
        {issues.map((issue, i) => {
          const isErr = issue.severity === 'error'
          return (
            <div key={i}
              className="d-flex align-items-start gap-1 mb-1 p-1 rounded"
              style={{ fontSize: 11, cursor: 'pointer', background: isErr ? '#fff5f5' : '#fffbe6' }}
              onClick={() => { setShow(false); focusPosition(posRef) }}
              title="Go to this position to fix"
            >
              <MaterialIcon name={isErr ? 'error' : 'warning'} size={13} style={{ color: isErr ? '#dc3545' : '#997404', flexShrink: 0 }} />
              <span>{issue.message}</span>
            </div>
          )
        })}
        <button
          className="btn btn-link btn-sm p-0 d-flex align-items-center gap-1 mt-1"
          style={{ fontSize: 11, color: '#0d6efd', textDecoration: 'none' }}
          onClick={() => { setShow(false); focusPosition(posRef) }}
        >
          <MaterialIcon name="open_in_new" size={13} /> Open {posRef} to fix
        </button>
      </Popover.Body>
    </Popover>
  )

  return (
    <OverlayTrigger placement="auto" trigger="manual" show={show} overlay={popover}>
      <span
        style={{ display: 'inline-flex', alignItems: 'center', gap: 2, cursor: 'default' }}
        onMouseEnter={openPop}
        onMouseLeave={schedulePop}
      >
        <MaterialIcon name={icon} size={size} style={{ color }} />
        {issues.length > 1 && (
          <span style={{ fontSize: Math.max(9, size - 5), fontWeight: 700, color }}>{issues.length}</span>
        )}
      </span>
    </OverlayTrigger>
  )
}
