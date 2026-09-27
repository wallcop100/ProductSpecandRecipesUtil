import InfoTip from './InfoTip'
import React, { useMemo } from 'react'
import { Modal, Button } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'

/** Which workbook a retire touches. */
const Tag = ({ children }) => (
  <span className="rounded px-1" style={{ fontSize: 9, background: '#f1f3f5', color: '#495057', border: '1px solid #e0e0e0' }}>
    {children}
  </span>
)

/**
 * RetireUnusedModal — review, then retire, the ElementTypes that exist only to serve dead
 * positions (excluded in the Form, or with no placed Position). Nothing is marked until you
 * confirm, and marking flows to Export as patches like every other change — the workbooks are
 * never written here. One undo puts it all back.
 *
 * The plan comes from the store (retirablePlan); this component only shows it and calls
 * retireDeadElementTypes on confirm. Driven by `show` from the parent.
 */
export default function RetireUnusedModal({ show, onHide, tabs = null, animation = true }) {
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
    <Modal animation={animation} show={show} onHide={onHide} size={tabs ? 'xl' : 'lg'} centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 15 }} className="d-flex align-items-center gap-2">
          <MaterialIcon name="cleaning_services" size={18} /> Clean up unused ElementTypes
        </Modal.Title>
        {tabs}
      </Modal.Header>

      <Modal.Body style={{ fontSize: 12 }}>
        {plan.length === 0 ? (
          <div className="px-2 py-2 rounded d-flex align-items-center gap-2"
            style={{ background: '#d1e7dd', color: '#0f5132' }}>
            <MaterialIcon name="check_circle" size={16} /> Nothing to clean up
          </div>
        ) : (
          <>
            <div className="text-muted mb-3">
              Unused by any live recipe{' '}
              <InfoTip>
                Either the only position using one was excluded or never placed, or its Product Spec
                row is an orphan. Marking one deleted writes an <strong>IsDeleted</strong> patch to each
                workbook that holds it (the tags on the right). Nothing touches your files until Export,
                and one undo puts the marks back.
              </InfoTip>
            </div>
            {plan.map(p => (
              <div key={p.ref} className="d-flex align-items-baseline gap-2 py-1 border-bottom" style={{ minWidth: 0 }}>
                <MaterialIcon name="do_not_disturb_on" size={13} style={{ color: '#842029', flexShrink: 0 }} />
                <span style={{ fontFamily: 'monospace', fontWeight: 600, flexShrink: 0 }}>{p.ref}</span>
                <span className="text-muted text-truncate" style={{ minWidth: 0, flex: 1 }}>
                  {p.onlyIn.length ? `only in ${p.onlyIn.join(', ')}` : 'not used by any recipe'}
                </span>
                <span className="d-flex gap-1 flex-shrink-0">
                  {p.rsRowIds.length > 0 && <Tag>Recipe</Tag>}
                  {p.inPs && <Tag>Spec</Tag>}
                  {p.inDb && <Tag>DesignDB</Tag>}
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
