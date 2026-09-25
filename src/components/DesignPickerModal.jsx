import React from 'react'
import { Modal, Button } from 'react-bootstrap'
import useStore from '../store/useStore'

/**
 * DesignPickerModal — every position recipe has one IsDesign item. Leaving a position whose
 * recipe has several position-level rows and none marked is held here until one is picked.
 * (A recipe of one row is settled without asking: that row is the design item.)
 */
export default function DesignPickerModal() {
  const prompt = useStore(s => s.designPrompt)
  const recipes = useStore(s => s.recipes)
  const resolve = useStore(s => s.resolveDesignPrompt)
  const cancel = useStore(s => s.cancelDesignPrompt)

  const rows = prompt ? recipes.filter(r => (r.PositionTypeRef || r.positionTypeRef) === prompt.posRef
    && (r.IsDeleted || r.isDeleted) !== 'Y' && (r.ContextType || r.contextType) === 'PositionType') : []

  return (
    <Modal show={!!prompt} onHide={cancel} centered size="sm">
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 15 }}>
          Which is <span style={{ fontFamily: 'monospace' }}>{prompt?.posRef}</span>'s design item?
        </Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ fontSize: 12 }}>
        <div className="text-muted mb-2">Every recipe needs exactly one IsDesign item. Pick it to carry on.</div>
        <div className="d-grid gap-1">
          {rows.map(r => (
            <Button key={r._id} variant="outline-primary" size="sm" className="text-start"
              style={{ fontFamily: 'monospace' }} onClick={() => resolve(r._id)}>
              {r.ElementTypeRef || r.elementTypeRef}
            </Button>
          ))}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="link" size="sm" className="text-muted" onClick={cancel}>
          Stay on {prompt?.posRef}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
