import React, { useState, useEffect } from 'react'
import { Modal, Button, ProgressBar, Badge } from 'react-bootstrap'
import useStore from '../store/useStore'
import TagBadge from './TagBadge'

/**
 * TagDriftWizard — steps through positions whose rule-derived tags changed since
 * the last accepted baseline (because the underlying DB data changed). For each,
 * the user can Accept (re-baseline) or Skip. Templates/connectors key on these
 * tags, so a change may need attention.
 *
 * Props: show, onHide, onOpenPosition(ref?)
 */
export default function TagDriftWizard({ show, onHide, onOpenPosition }) {
  const tagDrift = useStore(s => s.tagDrift)
  const positionTypes = useStore(s => s.positionTypes)
  const acceptTagDrift = useStore(s => s.acceptTagDrift)
  const acceptAllTagDrift = useStore(s => s.acceptAllTagDrift)

  const [queue, setQueue] = useState([])
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (!show) return
    setQueue(Object.keys(tagDrift))
    setIndex(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show])

  const ref = queue[index] || null
  const info = ref ? tagDrift[ref] : null
  const pt = positionTypes.find(p => p.PositionTypeRef === ref)
  const name = pt?.Name || pt?.name || ''
  const done = index >= queue.length

  function accept() {
    if (ref) acceptTagDrift(ref)
    setIndex(i => i + 1)
  }
  function skip() { setIndex(i => i + 1) }
  function acceptAll() { acceptAllTagDrift(); onHide() }

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 14 }}>
          Review tag changes
          {!done && queue.length > 0 && (
            <span className="text-muted ms-2" style={{ fontSize: 12, fontWeight: 400 }}>
              {index + 1} of {queue.length}
            </span>
          )}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {queue.length === 0 ? (
          <div className="text-center py-4">
            <div style={{ fontSize: 36 }}>✓</div>
            <div className="fw-semibold mt-2">No tag changes to review.</div>
            <div className="text-muted small mt-1">Rule tags match the accepted baseline for every position.</div>
          </div>
        ) : done ? (
          <div className="text-center py-4">
            <div style={{ fontSize: 36 }}>✓</div>
            <div className="fw-semibold mt-2">Review complete</div>
          </div>
        ) : (
          <>
            <ProgressBar now={Math.round((index / queue.length) * 100)} style={{ height: 4, marginBottom: 20 }} variant="warning" />
            <div className="mb-2">
              <span className="fw-semibold" style={{ fontSize: 14, fontFamily: 'monospace' }}>{ref}</span>
              {name && name !== ref && <span className="text-muted ms-2" style={{ fontSize: 12 }}>{name}</span>}
            </div>

            {info?.changedFields?.length > 0 && (
              <div className="mb-3">
                <div className="text-muted small mb-1">Changed fields</div>
                {info.changedFields.map(f => (
                  <div key={f.column} className="small d-flex align-items-center gap-2 py-1">
                    <span className="fw-semibold" style={{ minWidth: 160 }}>{f.column}</span>
                    <span className="text-danger" style={{ textDecoration: 'line-through' }}>{f.from || '∅'}</span>
                    <span>→</span>
                    <span className="text-success">{f.to || '∅'}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="mb-2">
              <div className="text-muted small mb-1">Rule tags</div>
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <div className="d-flex gap-1 flex-wrap">
                  {(info?.tagsBefore || []).length === 0
                    ? <span className="text-muted fst-italic small">none</span>
                    : info.tagsBefore.map(t => (
                      <Badge key={t} bg="light" text="dark" style={{ textDecoration: 'line-through', border: '1px solid #dee2e6' }}>{t}</Badge>
                    ))}
                </div>
                <span>→</span>
                <div className="d-flex gap-1 flex-wrap">
                  {(info?.tagsAfter || []).length === 0
                    ? <span className="text-muted fst-italic small">none</span>
                    : info.tagsAfter.map(t => <TagBadge key={t} tag={t} />)}
                </div>
              </div>
            </div>

            <div className="alert alert-warning py-2 px-3 mb-0 mt-3" style={{ fontSize: 12 }}>
              Templates and connector sets match on these tags — confirm the new tagging is correct,
              or adjust rules/exceptions in the Tags window.
            </div>
          </>
        )}
      </Modal.Body>

      {!done && queue.length > 0 ? (
        <Modal.Footer className="d-flex justify-content-between">
          <div className="d-flex gap-2">
            <Button variant="outline-secondary" size="sm" onClick={acceptAll}>Accept all</Button>
            {onOpenPosition && (
              <Button variant="outline-primary" size="sm" onClick={() => { onOpenPosition(ref); onHide() }}>
                Open position →
              </Button>
            )}
          </div>
          <div className="d-flex gap-2">
            <Button variant="outline-secondary" size="sm" onClick={skip}>Skip</Button>
            <Button variant="warning" size="sm" onClick={accept}>Accept change</Button>
          </div>
        </Modal.Footer>
      ) : (
        <Modal.Footer>
          <Button variant="primary" size="sm" onClick={onHide}>Close</Button>
        </Modal.Footer>
      )}
    </Modal>
  )
}
