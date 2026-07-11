import React, { useState, useMemo, useEffect } from 'react'
import { Modal, Button, ProgressBar } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import IconButton from './IconButton'
import { ACTION_ICONS } from '../utils/entityStyle'
import { positionFamilyOf } from '../utils/positionFamily'

/**
 * ValidationFixModal — step through validation issues one at a time (errors
 * first) with a "Go fix" action that jumps to the right place (position editor
 * or Product Spec) and closes the modal so the target is visible.
 *
 * Not every flag is a defect — some positions simply carry no recipe. So the
 * step also offers to mark the position (or its whole family) as "no recipe
 * needed", which drops it and its issues out of scope on the spot.
 */
export default function ValidationFixModal({ show, onHide, onOpenProductSpec }) {
  const validationResults = useStore(s => s.validationResults)
  const runValidation     = useStore(s => s.runValidation)
  const focusPosition     = useStore(s => s.focusPosition)
  const positionTypes     = useStore(s => s.positionTypes)
  const toggleIgnorePosition       = useStore(s => s.toggleIgnorePosition)
  const toggleIgnorePositionFamily = useStore(s => s.toggleIgnorePositionFamily)

  const issues = useMemo(() => {
    const sev = i => (i.severity === 'error' ? 0 : 1)
    return [...validationResults].sort((a, b) => sev(a) - sev(b))
  }, [validationResults])

  const [index, setIndex] = useState(0)
  const [confirmFamily, setConfirmFamily] = useState(false)
  useEffect(() => { if (show) setIndex(0) }, [show])

  const issue = issues[index] || null

  // Ignoring shrinks the list; keep the cursor in range.
  useEffect(() => {
    if (index >= issues.length && issues.length > 0) setIndex(issues.length - 1)
  }, [issues.length, index])
  // A pending "ignore family?" confirm never carries to the next issue.
  useEffect(() => { setConfirmFamily(false) }, [issue?.ref])

  function goFix() {
    if (!issue?.ref) return
    if (issue.fixKind === 'spec') onOpenProductSpec?.(issue.ref)
    else focusPosition(issue.ref)
    onHide()
  }

  const isError = issue?.severity === 'error'
  const color = isError ? '#dc3545' : '#997404'

  // Recipe issues carry a PositionTypeRef; those are the ones a position/family
  // "no recipe needed" flag can silence. Spec issues carry an ET ref instead.
  const isRecipeIssue = !!issue?.ref && issue.fixKind !== 'spec'
  const pt = isRecipeIssue
    ? positionTypes.find(p => (p.PositionTypeRef || p.positionTypeRef) === issue.ref)
    : null
  const family = pt ? positionFamilyOf(pt) : null

  async function ignorePosition() {
    await toggleIgnorePosition(issue.ref)
    runValidation()   // the position's issues drop out; the clamp effect fixes the cursor
  }
  async function ignoreFamily() {
    if (!family) return
    await toggleIgnorePositionFamily(family)
    runValidation()
    setConfirmFamily(false)
  }

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

            {/* Escape hatch: some positions simply carry no recipe. Flag it here and its
                issues drop out on the spot — a family flag needs a confirm, it hides many. */}
            {isRecipeIssue && (
              <div className="mt-3 pt-3 border-top">
                {!confirmFamily ? (
                  <div className="d-flex align-items-center flex-wrap gap-2">
                    <span className="text-muted" style={{ fontSize: 12 }}>
                      <MaterialIcon name="do_not_disturb_on" size={14} /> No recipe needed?
                    </span>
                    <Button variant="outline-secondary" size="sm" className="d-inline-flex align-items-center gap-1"
                      style={{ fontSize: 12 }} onClick={ignorePosition}>
                      Ignore {issue.ref}
                    </Button>
                    {family && (
                      <Button variant="outline-secondary" size="sm" className="d-inline-flex align-items-center gap-1"
                        style={{ fontSize: 12 }} onClick={() => setConfirmFamily(true)}>
                        Ignore family {family}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="px-2 py-2 rounded" style={{ background: '#fff3cd', border: '1px solid #f0e0a8' }}>
                    <div className="mb-2" style={{ fontSize: 12, color: '#856404' }}>
                      Ignore the whole <strong>{family}</strong> family? Every position in it drops out of
                      validation and totals, not just <span style={{ fontFamily: 'monospace' }}>{issue.ref}</span>.
                    </div>
                    <div className="d-flex gap-2">
                      <Button variant="warning" size="sm" className="d-inline-flex align-items-center gap-1"
                        style={{ fontSize: 12 }} onClick={ignoreFamily}>
                        <MaterialIcon name="do_not_disturb_on" size={14} /> Ignore family
                      </Button>
                      <Button variant="outline-secondary" size="sm" style={{ fontSize: 12 }}
                        onClick={() => setConfirmFamily(false)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
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
