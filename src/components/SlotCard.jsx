import React, { useState } from 'react'
import { Card, Badge, Button } from 'react-bootstrap'
import { useDroppable } from '@dnd-kit/core'
import ETRefSelect from './ETRefSelect'
import FlagPill from './FlagPill'

// Grey hatching — the visual signature of a primed, unfilled slot (T-R1)
const HATCH = 'repeating-linear-gradient(45deg, #f1f3f5, #f1f3f5 8px, #e9ecef 8px, #e9ecef 16px)'

/**
 * SlotCard — a primed template slot, shown in the recipe canvas.
 *
 * The slot label comes from the template ingredient's `slotLabel` — it is NOT
 * a real ElementTypeRef. Clicking the card opens the Existing/New Add-Entity
 * fork; "Use Exact Ref" converts the slot into a normal fixed RS row using the
 * label as the literal ref. Unfilled slots are held back from export and raise
 * a validation error (T-E4).
 *
 * Props:
 *   slot: recipe row with resolved=false (has slotKey, slotLabel, template flags)
 *   posRef: string
 *   sectionKey: string
 *   onResolve: (slotKey, entityRef) => void
 *   onNewET: (slot) => void — optional, opens the New ET wizard for this slot
 */
export default function SlotCard({ slot, posRef, sectionKey, onResolve, onNewET }) {
  const [choosing, setChoosing] = useState(false)   // Existing / New fork
  const [picking, setPicking] = useState(false)     // existing-ET autocomplete

  const { setNodeRef, isOver } = useDroppable({
    id: `slot-drop-${slot._id || slot.slotKey}`,
    data: { type: 'slot', slotKey: slot.slotKey, posRef, section: sectionKey },
  })

  const slotLabel = slot.slotLabel || slot.slotKey || 'Unnamed slot'

  return (
    <div style={{ marginBottom: 6 }}>
      <Card
        ref={setNodeRef}
        onClick={() => { if (!choosing && !picking) setChoosing(true) }}
        style={{
          borderLeft: '4px solid #adb5bd',
          borderRadius: 6,
          border: isOver ? '2px dashed #6c757d' : '1px dashed #adb5bd',
          background: isOver ? '#e9ecef' : HATCH,
          cursor: choosing || picking ? 'default' : 'pointer',
        }}
        title="Primed slot — click to fill with an existing or new ElementType"
      >
        <Card.Body className="py-2 px-3">
          <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
            <Badge bg="secondary" style={{ fontSize: 11 }}>{slotLabel}</Badge>
            <span className="text-muted small fst-italic">
              Primed slot — fill with an ElementType
            </span>
          </div>

          {/* Read-only flag pills from template */}
          <div className="d-flex gap-1 mb-2 flex-wrap">
            <FlagPill label="Design" value={slot.isDesign || slot.IsDesign || null} readOnly />
            <FlagPill label="Contract" value={slot.isContractItem || slot.IsContractItem || null} readOnly />
            <FlagPill label="TBC" value={slot.isTBC || slot.IsTBC || null} readOnly />
          </div>

          {picking ? (
            <div style={{ width: 260 }} onClick={e => e.stopPropagation()}>
              <ETRefSelect
                placeholder="Pick or type an element type…"
                onCommit={ref => { setPicking(false); setChoosing(false); if (ref) onResolve(slot.slotKey, ref) }}
                onCancel={() => { setPicking(false); setChoosing(true) }}
              />
            </div>
          ) : choosing ? (
            <div className="d-flex align-items-center gap-1 flex-wrap" onClick={e => e.stopPropagation()}>
              <Button variant="outline-primary" size="sm" style={{ padding: '1px 8px', fontSize: 11 }}
                onClick={() => setPicking(true)}>
                Existing
              </Button>
              {onNewET && (
                <Button variant="outline-success" size="sm" style={{ padding: '1px 8px', fontSize: 11 }}
                  onClick={() => { setChoosing(false); onNewET(slot) }}>
                  New ↗
                </Button>
              )}
              <Button variant="outline-secondary" size="sm" style={{ padding: '1px 8px', fontSize: 11 }}
                title={`Use "${slotLabel}" literally as the ElementTypeRef — becomes a normal fixed row`}
                onClick={() => { setChoosing(false); onResolve(slot.slotKey, slotLabel) }}>
                Use Exact Ref
              </Button>
              <button className="btn btn-link btn-sm p-0 text-muted" style={{ fontSize: 11 }}
                onClick={() => setChoosing(false)}>Cancel</button>
            </div>
          ) : (
            <span className="text-muted" style={{ fontSize: 11 }}>
              Click to fill, or drag an element type here
            </span>
          )}
        </Card.Body>
      </Card>
    </div>
  )
}
