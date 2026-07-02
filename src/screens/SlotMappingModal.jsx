import React, { useState, useMemo } from 'react'
import { Modal, Button, Form, Badge, Alert, ListGroup } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from '../components/MaterialIcon'
import { ACTION_ICONS } from '../utils/entityStyle'

/**
 * SlotMappingModal
 * Shown when a template has unresolved slots.
 * Allows user to map each slot to an ElementType from the project.
 *
 * Props:
 *   show: bool
 *   template: { id, name, ingredients: [] }
 *   posRef: string — the position type ref being applied to
 *   onApply: (resolvedMappings: { [slotKey]: entityRef }) => void
 *   onCancel: () => void
 */
export default function SlotMappingModal({ show, template, posRef, onApply, onCancel }) {
  const elementTypes = useStore(s => s.elementTypes)
  const slotMappings = useStore(s => s.slotMappings)
  const addSlotMapping = useStore(s => s.resolveSlot)

  const templateId = template?.id
  const storedMappings = (templateId && slotMappings[templateId]) ? slotMappings[templateId] : {}

  // Local resolution state: { [slotKey]: entityRef }
  const [localMappings, setLocalMappings] = useState(() => ({ ...storedMappings }))
  const [searchTerms, setSearchTerms] = useState({})  // { [slotKey]: string }
  const [rememberForProject, setRememberForProject] = useState(true)
  const [applyToAll, setApplyToAll] = useState(false)
  const [applyError, setApplyError] = useState(null)

  const ingredients = useMemo(() => {
    if (!template) return []
    const ings = Array.isArray(template.ingredients) ? template.ingredients : []
    // Show all unresolved slots
    return ings.filter(ing => !storedMappings[ing.slotKey])
  }, [template, storedMappings])

  const allResolved = ingredients.every(ing => localMappings[ing.slotKey])

  function setMapping(slotKey, entityRef) {
    setLocalMappings(prev => ({ ...prev, [slotKey]: entityRef || null }))
  }

  function setSearch(slotKey, value) {
    setSearchTerms(prev => ({ ...prev, [slotKey]: value }))
  }

  function filteredETs(slotKey) {
    const q = (searchTerms[slotKey] || '').toLowerCase()
    if (!q) return elementTypes.slice(0, 40)
    return elementTypes.filter(et => {
      const ref = (et.ElementTypeRef || '').toLowerCase()
      const name = (et.Name || '').toLowerCase()
      return ref.includes(q) || name.includes(q)
    }).slice(0, 40)
  }

  async function handleApply() {
    setApplyError(null)
    const merged = { ...storedMappings, ...localMappings }

    if (rememberForProject && templateId) {
      // Persist each new mapping to SQLite via store
      for (const [slotKey, entityRef] of Object.entries(localMappings)) {
        if (entityRef && !storedMappings[slotKey]) {
          try {
            await window.electronAPI.db.upsertSlotMapping(
              useStore.getState().projectId,
              templateId,
              slotKey,
              entityRef
            )
          } catch (err) {
            console.warn('Failed to persist slot mapping:', err)
          }
        }
      }
    }

    onApply(merged, applyToAll)
  }

  if (!template) return null

  return (
    <Modal show={show} onHide={onCancel} size="lg" backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: '1rem' }}>
          Map template slots — <span className="text-muted">{template.name}</span>
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        <p className="text-muted small mb-3">
          The following slots need to be mapped to element types in this project.
          Existing mappings are pre-filled.
        </p>

        {ingredients.length === 0 && (
          <Alert variant="success" className="py-2">
            All slots are already mapped — you can apply immediately.
          </Alert>
        )}

        {ingredients.map(ing => {
          const selected = localMappings[ing.slotKey] || ''
          const isResolved = !!selected
          const results = filteredETs(ing.slotKey)

          return (
            <div key={ing.slotKey} className="mb-4 p-3 border rounded">
              <div className="d-flex align-items-center gap-2 mb-2">
                <Badge bg="warning" text="dark">{ing.slotKey}</Badge>
                <span className="fw-semibold small">{ing.slotLabel || ing.slotKey}</span>
                <Badge bg={ing.section === 'position' ? 'secondary' : 'info'} className="ms-auto">
                  {ing.section}
                </Badge>
                {isResolved
                  ? <Badge bg="success" className="d-inline-flex align-items-center gap-1"><MaterialIcon name={ACTION_ICONS.complete} size={12} /> {selected}</Badge>
                  : <Badge bg="danger">Unresolved</Badge>
                }
              </div>

              <Form.Control
                type="text"
                placeholder="Search element types…"
                size="sm"
                value={searchTerms[ing.slotKey] || ''}
                onChange={e => setSearch(ing.slotKey, e.target.value)}
                className="mb-1"
              />

              {(searchTerms[ing.slotKey] || '').length > 0 && (
                <ListGroup
                  style={{ maxHeight: 160, overflowY: 'auto', fontSize: 13 }}
                  className="mb-1"
                >
                  {results.length === 0 && (
                    <ListGroup.Item className="text-muted small">No matches</ListGroup.Item>
                  )}
                  {results.map(et => {
                    const ref = et.ElementTypeRef || et.elementTypeRef
                    return (
                      <ListGroup.Item
                        key={ref}
                        action
                        active={selected === ref}
                        onClick={() => {
                          setMapping(ing.slotKey, ref)
                          setSearch(ing.slotKey, '')
                        }}
                        className="py-1 px-2"
                      >
                        <span className="fw-semibold">{ref}</span>
                        {et.Name && <span className="text-muted ms-2">{et.Name}</span>}
                        {et.Family && <Badge bg="light" text="dark" className="ms-1" style={{ fontSize: 10 }}>{et.Family}</Badge>}
                      </ListGroup.Item>
                    )
                  })}
                </ListGroup>
              )}

              {selected && (
                <div className="d-flex align-items-center gap-2">
                  <span className="small text-success">Mapped to: <strong>{selected}</strong></span>
                  <Button
                    variant="link"
                    size="sm"
                    className="text-danger p-0"
                    onClick={() => setMapping(ing.slotKey, null)}
                  >
                    Clear
                  </Button>
                </div>
              )}
            </div>
          )
        })}

        {/* Options */}
        <div className="d-flex flex-column gap-2 mt-2 border-top pt-3">
          <Form.Check
            type="checkbox"
            label="Remember these mappings for this project"
            checked={rememberForProject}
            onChange={e => setRememberForProject(e.target.checked)}
          />
          <Form.Check
            type="checkbox"
            label="Apply to all positions using this template"
            checked={applyToAll}
            onChange={e => setApplyToAll(e.target.checked)}
          />
        </div>

        {applyError && <Alert variant="danger" className="mt-2 py-2">{applyError}</Alert>}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onCancel}>Cancel</Button>
        <Button
          variant="primary"
          onClick={handleApply}
          disabled={!allResolved && ingredients.length > 0}
        >
          Apply with resolved slots
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
