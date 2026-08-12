import React, { useMemo } from 'react'
import { Modal, Button } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'

/**
 * RetireUnusedModal — review, then retire, the ElementTypes that exist only to serve dead
 * positions (excluded in the Form, or with no placed Position). Nothing is marked until you
 * confirm, and marking flows to Export as patches like every other change — the workbooks are
 * never written here. One undo puts it all back.
 *
 * The plan comes from the store (retirablePlan); this component only shows it and calls
 * retireDeadElementTypes on confirm. Driven by `show` from the parent.
 */
export default function RetireUnusedModal({ show, onHide }) {
  const retirablePlan = useStore(s => s.retirablePlan)
  const retireDeadElementTypes = useStore(s => s.retireDeadElementTypes)

  // Recompute each time it opens — the recipe may have changed since last time.
  const plan = useMemo(() => (show ? retirablePlan() : []), [show, retirablePlan])
  const rowCount = plan.reduce((n, p) => n + p.rsRowIds.length, 0)

  function confirm() {
    retireDeadElementTypes(plan)
    onHide()
  }

  return (
    <Modal show={show} onHide={onHide} size="lg" centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 15 }} className="d-flex align-items-center gap-2">
          <MaterialIcon name="cleaning_services" size={18} /> Clean up unused ElementTypes
        </Modal.Title>
      </Modal.Header>

      <Modal.Body style={{ fontSize: 12 }}>
        {plan.length === 0 ? (
          <div className="px-2 py-2 rounded d-flex align-items-center gap-2"
            style={{ background: '#d1e7dd', color: '#0f5132' }}>
            <MaterialIcon name="check_circle" size={16} /> Nothing to clean up — every ElementType
            is used by a position that is still being built.
          </div>
        ) : (
          <>
            <div className="text-muted mb-3" style={{ lineHeight: 1.5 }}>
              These ElementTypes are used <strong>only</strong> by positions the Form excluded, or
              that have no instances placed in the DesignDB. Marking them deleted writes an
              IsDeleted patch to the <strong>Recipe Spec</strong>, the <strong>Product Spec</strong>,
              and the <strong>DesignDB</strong>. Nothing here touches your files — it becomes part of
              Export, and one undo puts it back.
            </div>
            {plan.map(p => (
              <div key={p.ref} className="d-flex align-items-baseline gap-2 py-1 border-bottom">
                <MaterialIcon name="do_not_disturb_on" size={13} style={{ color: '#842029', flexShrink: 0 }} />
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{p.ref}</span>
                <span className="text-muted ms-auto text-truncate" style={{ minWidth: 0 }}>
                  only in {p.onlyIn.join(', ')}
                </span>
              </div>
            ))}
          </>
        )}
      </Modal.Body>

      <Modal.Footer className="d-flex align-items-center">
        <span className="text-muted me-auto" style={{ fontSize: 11 }}>
          {plan.length} ElementType{plan.length === 1 ? '' : 's'} · {rowCount} recipe row{rowCount === 1 ? '' : 's'}
        </span>
        <Button size="sm" variant="secondary" onClick={onHide}>Cancel</Button>
        <Button size="sm" variant="danger" disabled={plan.length === 0} onClick={confirm}>
          Mark {plan.length} deleted
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
