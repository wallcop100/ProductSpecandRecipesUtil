import React, { useState } from 'react'
import { Card, Badge, Button, Form, ListGroup } from 'react-bootstrap'
import { useDroppable } from '@dnd-kit/core'
import useStore from '../store/useStore'
import FlagPill from './FlagPill'

/**
 * SlotCard — an unresolved template slot, shown in the recipe canvas.
 *
 * Props:
 *   slot: recipe row with resolved=false (has slotKey, slotLabel, template flags)
 *   posRef: string
 *   sectionKey: string
 *   onResolve: (slotKey, entityRef) => void
 */
export default function SlotCard({ slot, posRef, sectionKey, onResolve }) {
  const elementTypes = useStore(s => s.elementTypes)
  const [showAssign, setShowAssign] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState('')

  const { setNodeRef, isOver } = useDroppable({
    id: `slot-drop-${slot._id || slot.slotKey}`,
    data: { type: 'slot', slotKey: slot.slotKey, posRef, section: sectionKey },
  })

  const filteredETs = elementTypes.filter(et => {
    const q = search.toLowerCase()
    if (!q) return true
    return (
      (et.ElementTypeRef || '').toLowerCase().includes(q) ||
      (et.Name || '').toLowerCase().includes(q)
    )
  }).slice(0, 40)

  function handleAssign() {
    if (!selected) return
    onResolve(slot.slotKey, selected)
    setShowAssign(false)
    setSelected('')
    setSearch('')
  }

  const slotLabel = slot.slotLabel || slot.slotKey || 'Unnamed slot'
  const slotKey = slot.slotKey

  return (
    <div style={{ marginBottom: 6 }}>
      <Card
        ref={setNodeRef}
        style={{
          borderLeft: '4px solid #fd7e14',
          borderRadius: 6,
          border: isOver ? '2px dashed #fd7e14' : undefined,
          background: isOver ? '#fff3e0' : undefined,
          outline: '1px dashed #fd7e14',
        }}
      >
        <Card.Body className="py-2 px-3">
          <div className="d-flex align-items-start gap-2">
            <div style={{ flex: 1 }}>
              <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                <Badge bg="warning" text="dark" style={{ fontSize: 11 }}>{slotLabel}</Badge>
                <span className="text-muted small fst-italic">Drag an element type here</span>
              </div>

              {/* Read-only flag pills from template */}
              <div className="d-flex gap-1 mb-2 flex-wrap">
                <FlagPill
                  label="Design"
                  value={slot.isDesign || slot.IsDesign || null}
                  readOnly
                />
                <FlagPill
                  label="Contract"
                  value={slot.isContractItem || slot.IsContractItem || null}
                  readOnly
                />
                <FlagPill
                  label="TBC"
                  value={slot.isTBC || slot.IsTBC || null}
                  readOnly
                />
              </div>

              {/* Assign manually link */}
              {!showAssign && (
                <Button
                  variant="link"
                  size="sm"
                  className="p-0"
                  style={{ fontSize: 12 }}
                  onClick={() => setShowAssign(true)}
                >
                  Assign manually
                </Button>
              )}

              {showAssign && (
                <div className="mt-1">
                  <Form.Control
                    type="text"
                    size="sm"
                    placeholder="Search element types…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="mb-1"
                    autoFocus
                  />
                  {search && (
                    <ListGroup style={{ maxHeight: 140, overflowY: 'auto', fontSize: 12 }} className="mb-1">
                      {filteredETs.length === 0 && (
                        <ListGroup.Item className="text-muted small py-1">No matches</ListGroup.Item>
                      )}
                      {filteredETs.map(et => {
                        const ref = et.ElementTypeRef || et.elementTypeRef
                        return (
                          <ListGroup.Item
                            key={ref}
                            action
                            active={selected === ref}
                            onClick={() => setSelected(ref)}
                            className="py-1 px-2"
                          >
                            <span className="fw-semibold">{ref}</span>
                            {et.Name && <span className="text-muted ms-1">{et.Name}</span>}
                          </ListGroup.Item>
                        )
                      })}
                    </ListGroup>
                  )}
                  <div className="d-flex gap-1">
                    <Button
                      size="sm"
                      variant="success"
                      onClick={handleAssign}
                      disabled={!selected}
                      style={{ fontSize: 11, padding: '1px 8px' }}
                    >
                      Assign
                    </Button>
                    <Button
                      size="sm"
                      variant="link"
                      onClick={() => { setShowAssign(false); setSearch(''); setSelected('') }}
                      style={{ fontSize: 11 }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card.Body>
      </Card>
    </div>
  )
}
