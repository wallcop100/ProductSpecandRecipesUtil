import React, { useState, useMemo, useEffect } from 'react'
import { Modal, Button, ProgressBar, Badge } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { positionFamilyOf } from '../utils/positionFamily'
import { ACTION_ICONS } from '../utils/entityStyle'

/**
 * EmptyPositionWizard — steps through position types that have no recipe rows so
 * the user can quickly audit them and flag the ones that genuinely need no recipe
 * as "ignored". Already-ignored positions are excluded from the queue.
 *
 * Props:
 *   show, onHide
 *   onOpenPosition(ref) — close the wizard and open that position for editing
 */
export default function EmptyPositionWizard({ show, onHide, onOpenPosition }) {
  const positionTypes = useStore(s => s.positionTypes)
  const recipes       = useStore(s => s.recipes)
  const positionUI    = useStore(s => s.positionUI)
  const ignoredPositionFamilies = useStore(s => s.ignoredPositionFamilies)
  const toggleIgnorePosition = useStore(s => s.toggleIgnorePosition)

  // Non-deleted recipe row count per position
  const countByRef = useMemo(() => {
    const map = {}
    for (const r of recipes) {
      if ((r.IsDeleted || r.isDeleted) === 'Y') continue
      const pr = r.PositionTypeRef || r.positionTypeRef
      if (pr) map[pr] = (map[pr] || 0) + 1
    }
    return map
  }, [recipes])

  // Snapshot the queue when the modal opens so flagging/ignoring during the run
  // doesn't reshuffle indices under the user.
  const [queue, setQueue] = useState([])
  const [index, setIndex] = useState(0)
  const [ignoredCount, setIgnoredCount] = useState(0)

  useEffect(() => {
    if (!show) return
    const ignoredFamilies = new Set(ignoredPositionFamilies)
    const empties = positionTypes
      .filter(pt => {
        const ref = pt.PositionTypeRef
        if (countByRef[ref]) return false
        if (positionUI[ref]?.ignored) return false
        if (ignoredFamilies.size > 0 && ignoredFamilies.has(positionFamilyOf(pt))) return false
        return true
      })
      .map(pt => pt.PositionTypeRef)
    setQueue(empties)
    setIndex(0)
    setIgnoredCount(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show])

  const ref = queue[index] || null
  const pt = positionTypes.find(p => p.PositionTypeRef === ref)
  const name = pt?.Name || pt?.name || ''
  const tags = positionUI[ref]?.tags ?? []
  const done = index >= queue.length

  function flagIgnore() {
    if (ref) {
      toggleIgnorePosition(ref)
      setIgnoredCount(c => c + 1)
    }
    setIndex(i => i + 1)
  }

  function skip() {
    setIndex(i => i + 1)
  }

  function openForEditing() {
    if (ref && onOpenPosition) onOpenPosition(ref)
  }

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 14 }}>
          Review empty positions
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
            <MaterialIcon name={ACTION_ICONS.complete} size={36} style={{ color: '#198754' }} />
            <div className="fw-semibold mt-2">No empty positions to review.</div>
            <div className="text-muted small mt-1">Every position has a recipe or is already flagged as ignore.</div>
          </div>
        ) : done ? (
          <div className="text-center py-4">
            <MaterialIcon name={ACTION_ICONS.complete} size={36} style={{ color: '#198754' }} />
            <div className="fw-semibold mt-2">Review complete</div>
            <div className="text-muted small mt-1">
              Flagged {ignoredCount} position{ignoredCount === 1 ? '' : 's'} as ignore
              {' '}out of {queue.length} reviewed.
            </div>
          </div>
        ) : (
          <>
            <ProgressBar
              now={Math.round((index / queue.length) * 100)}
              style={{ height: 4, marginBottom: 20 }}
              variant="warning"
            />
            <div className="mb-2">
              <span className="fw-semibold" style={{ fontSize: 14, fontFamily: 'monospace' }}>{ref}</span>
              {name && name !== ref && <span className="text-muted ms-2" style={{ fontSize: 12 }}>{name}</span>}
            </div>
            <div className="mb-3">
              {tags.length > 0
                ? tags.map(t => <Badge key={t} bg="secondary" className="me-1" style={{ fontSize: 11 }}>{t}</Badge>)
                : <span className="text-muted small fst-italic">no tags</span>}
            </div>
            <div className="alert alert-light border py-2 px-3 mb-0" style={{ fontSize: 12 }}>
              This position type has <strong>no recipe rows</strong>. Flag it as ignore if it
              genuinely doesn't need one, or open it to start a recipe.
            </div>
          </>
        )}
      </Modal.Body>

      {!done && queue.length > 0 ? (
        <Modal.Footer className="d-flex justify-content-between">
          <Button variant="outline-primary" size="sm" style={{ fontSize: 12 }} onClick={openForEditing}>
            Open to edit →
          </Button>
          <div className="d-flex gap-2">
            <Button variant="outline-secondary" size="sm" style={{ fontSize: 12 }} onClick={skip}>
              Skip
            </Button>
            <Button variant="warning" size="sm" style={{ fontSize: 12 }} onClick={flagIgnore}>
              Flag as ignore
            </Button>
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
