import React from 'react'
import { Modal, Button } from 'react-bootstrap'
import useStore from '../store/useStore'

/**
 * PasteMergeModal — shown when a paste would duplicate rows already in the
 * position. Lets the user merge quantities into the existing rows or keep the
 * pasted rows separate. Driven by the store's `pendingPaste` state; mount once.
 */
export default function PasteMergeModal() {
  const pendingPaste = useStore(s => s.pendingPaste)
  const confirmPaste = useStore(s => s.confirmPaste)
  const cancelPaste  = useStore(s => s.cancelPaste)
  const dupCount = useStore(s =>
    pendingPaste ? s.pasteDuplicateCount(pendingPaste.posRef, pendingPaste.forceSection) : 0
  )

  const show = !!pendingPaste

  return (
    <Modal show={show} onHide={cancelPaste} centered size="sm">
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 14 }}>Duplicate element{dupCount === 1 ? '' : 's'}</Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ fontSize: 13 }}>
        {dupCount} pasted row{dupCount === 1 ? '' : 's'} already exist{dupCount === 1 ? 's' : ''} here.
        Add their quantities to the existing rows, or keep them as separate rows?
      </Modal.Body>
      <Modal.Footer>
        <Button variant="link" size="sm" onClick={cancelPaste}>Cancel</Button>
        <Button variant="outline-primary" size="sm" onClick={() => confirmPaste('separate')}>
          Keep separate
        </Button>
        <Button variant="primary" size="sm" onClick={() => confirmPaste('merge')}>
          Merge quantities
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
