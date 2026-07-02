import React, { useState, useMemo, useEffect } from 'react'
import { Modal, Button, ProgressBar } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import IconButton from './IconButton'
import { ACTION_ICONS } from '../utils/entityStyle'

/**
 * ValidationFixModal — step through validation issues one at a time (errors
 * first) with a "Go fix" action that jumps to the right place (position editor
 * or Product Spec) and closes the modal so the target is visible.
 */
export default function ValidationFixModal({ show, onHide, onOpenProductSpec }) {
  const validationResults = useStore(s => s.validationResults)
  const runValidation     = useStore(s => s.runValidation)
  const focusPosition     = useStore(s => s.focusPosition)

  const issues = useMemo(() => {
    const sev = i => (i.severity === 'error' ? 0 : 1)
    return [...validationResults].sort((a, b) => sev(a) - sev(b))
  }, [validationResults])

  const [index, setIndex] = useState(0)
  useEffect(() => { if (show) setIndex(0) }, [show])

  const issue = issues[index] || null

  function goFix() {
    if (!issue?.ref) return
    if (issue.fixKind === 'spec') onOpenProductSpec?.(issue.ref)
    else focusPosition(issue.ref)
    onHide()
  }

  const isError = issue?.severity === 'error'
  const color = isError ? '#dc3545' : '#997404'

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 14 }} className="d-flex align-items-center gap-2">
          <MaterialIcon name={ACTION_ICONS.review} size={18} /> Fix validation issues
        </Modal.Title>
      </Modal.Header>

      <Modal.Body style={{ minHeight: 220 }}>
        {issues.length === 0 ? (
          <div className="text-center py-4">
            <MaterialIcon name={ACTION_ICONS.complete} size={36} style={{ color: '#198754' }} />
            <div className="fw-semibold mt-2">Nothing to fix.</div>
            <div className="text-muted small mt-1">Run validation to check for issues.</div>
            <Button variant="outline-primary" size="sm" className="mt-3" onClick={() => runValidation()}>Run validation</Button>
          </div>
        ) : issue ? (
          <>
            <ProgressBar now={Math.round((index / issues.length) * 100)} style={{ height: 4, marginBottom: 16 }}
              variant={isError ? 'danger' : 'warning'} />
            <div className="d-flex align-items-center gap-2 mb-2">
              <MaterialIcon name={isError ? 'error' : 'warning'} size={18} style={{ color }} />
              <span className="fw-semibold" style={{ color }}>{issue.rule}</span>
              <span className="ms-auto text-muted small">{index + 1} of {issues.length}</span>
            </div>
            <div style={{ fontSize: 13 }}>{issue.message}</div>
            {issue.ref && (
              <Button variant="primary" size="sm" className="mt-3 d-inline-flex align-items-center gap-1" onClick={goFix}>
                <MaterialIcon name={issue.fixKind === 'spec' ? ACTION_ICONS.productSpec : 'open_in_new'} size={14} />
                {issue.fixKind === 'spec' ? 'Open in Product Spec' : `Go to ${issue.ref}`}
              </Button>
            )}
          </>
        ) : null}
      </Modal.Body>

      <Modal.Footer>
        <IconButton variant="outline-secondary" bsSize="sm" icon="chevron_left" title="Previous"
          disabled={index <= 0} onClick={() => setIndex(i => Math.max(0, i - 1))} />
        <IconButton variant="outline-secondary" bsSize="sm" icon="chevron_right" title="Next"
          disabled={index >= issues.length - 1} onClick={() => setIndex(i => Math.min(issues.length - 1, i + 1))} />
        <Button variant="secondary" size="sm" onClick={onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  )
}
