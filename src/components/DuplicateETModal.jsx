import React, { useMemo, useState, useEffect } from 'react'
import { Modal, Button, Form, InputGroup } from 'react-bootstrap'
import useStore, { collectAllETRefs } from '../store/useStore'
import { getUsedIn } from '../utils/containerUtils'

/**
 * DuplicateETModal — fork a container element type under a new ref.
 *
 * Prefills the suggested next sequential ref, lets the user rename it (with a
 * Suggest button), validates against existing refs, and creates the copy only
 * for the current position (posRef). The source ET and other positions that use
 * it are left untouched.
 */
export default function DuplicateETModal({ show, etRef, posRef, onClose }) {
  const elementTypes = useStore(s => s.elementTypes)
  const psRows = useStore(s => s.psRows)
  const recipes = useStore(s => s.recipes)
  const duplicateET = useStore(s => s.duplicateET)
  const suggestNextETRef = useStore(s => s.suggestNextETRef)

  const [value, setValue] = useState('')

  // Set of all known refs (lowercased) for collision detection
  const knownRefs = useMemo(() => {
    const set = new Set(collectAllETRefs(elementTypes, psRows, recipes).map(r => r.toLowerCase()))
    for (const r of recipes) {
      const cr = r.ContextRef || r.contextRef
      if (cr && (r.ContextType || r.contextType) === 'ElementType') set.add(cr.toLowerCase())
    }
    return set
  }, [elementTypes, psRows, recipes])

  // Prefill with the suggested next ref each time the modal opens for a new ET
  useEffect(() => {
    if (show && etRef) setValue(suggestNextETRef(etRef) || '')
  }, [show, etRef, suggestNextETRef])

  const otherUsers = useMemo(
    () => (etRef ? getUsedIn(etRef, recipes, posRef) : []),
    [etRef, recipes, posRef]
  )

  const trimmed = value.trim()
  const isEmpty = trimmed.length === 0
  const collides = !isEmpty && knownRefs.has(trimmed.toLowerCase())
  const valid = !isEmpty && !collides

  function handleSuggest() {
    setValue(suggestNextETRef(etRef) || '')
  }

  function handleConfirm() {
    if (!valid) return
    duplicateET(etRef, trimmed, posRef)
    onClose()
  }

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 18 }}>Duplicate element type</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="text-muted small mb-3">
          Forks <code>{etRef}</code> under a new ref for <strong>{posRef}</strong> only.
          {otherUsers.length > 0 && (
            <> The original stays shared with {otherUsers.length} other position{otherUsers.length === 1 ? '' : 's'}.</>
          )}
        </p>
        <Form.Group>
          <Form.Label className="small fw-semibold">New element type ref</Form.Label>
          <InputGroup>
            <Form.Control
              autoFocus
              value={value}
              isInvalid={collides}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleConfirm() }}
              placeholder="e.g. ET-DL-02"
            />
            <Button variant="outline-secondary" onClick={handleSuggest} title="Suggest the next available ref">
              ✨ Suggest
            </Button>
            <Form.Control.Feedback type="invalid">
              That ref already exists — choose another.
            </Form.Control.Feedback>
          </InputGroup>
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="link" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleConfirm} disabled={!valid}>
          Duplicate
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
