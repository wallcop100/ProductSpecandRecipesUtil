import React, { useMemo } from 'react'
import { Button, Badge, Form, Alert } from 'react-bootstrap'
import useStore from '../store/useStore'
import TagBadge from './TagBadge'
import { TAG_GROUPS } from '../utils/constants'

// Map each tag to its group for coloring
function buildTagGroupMap() {
  const map = {}
  for (const [group, tags] of Object.entries(TAG_GROUPS)) {
    for (const tag of tags) {
      map[tag] = group
    }
  }
  return map
}
const TAG_GROUP_MAP = buildTagGroupMap()

// All available tags in a flat list, for the full toggle panel
const ALL_TAGS = Object.values(TAG_GROUPS).flat()

/**
 * TagReviewSidebar — tag management for the active position type.
 */
export default function TagReviewSidebar() {
  const activePositionRef = useStore(s => s.activePositionRef)
  const positionUI = useStore(s => s.positionUI)
  const updatePositionUI = useStore(s => s.updatePositionUI)

  const ui = activePositionRef ? (positionUI[activePositionRef] || {}) : null
  const derivedTags = ui?.derivedTags || []
  const activeTags = ui?.tags || []
  const confidence = ui?.tagConfidence || ui?.derivedConfidence || 'low'
  const isManual = ui?.tagSource === 'manual'
  const notes = ui?.userNotes || ''

  function toggleTag(tag) {
    if (!activePositionRef || !ui) return
    const current = activeTags
    const next = current.includes(tag)
      ? current.filter(t => t !== tag)
      : [...current, tag]
    updatePositionUI(activePositionRef, { tags: next, tagSource: 'manual', tagConfidence: null })
  }

  function handleResetToDerived() {
    if (!activePositionRef || !ui) return
    updatePositionUI(activePositionRef, {
      tags: derivedTags,
      tagSource: 'derived',
      tagConfidence: confidence,
    })
  }

  function handleNotesChange(value) {
    if (!activePositionRef) return
    updatePositionUI(activePositionRef, { userNotes: value })
  }

  async function handleApplyToSimilar() {
    if (!activePositionRef) return
    const positionTypes = useStore.getState().positionTypes
    const sourcePT = positionTypes.find(p => p.PositionTypeRef === activePositionRef)
    if (!sourcePT) return
    for (const pt of positionTypes) {
      if (pt.PositionTypeRef === activePositionRef) continue
      if (
        pt.DriverLocation === sourcePT.DriverLocation &&
        pt.SecondaryPowerType === sourcePT.SecondaryPowerType
      ) {
        await updatePositionUI(pt.PositionTypeRef, { tags: [...activeTags], tagSource: 'manual' })
      }
    }
  }

  if (!activePositionRef) {
    return (
      <div className="p-3 text-muted small">Select a position to review its tags.</div>
    )
  }

  const confidenceColor = confidence === 'high' ? 'success' : confidence === 'medium' ? 'warning' : 'danger'

  return (
    <div className="p-3">
      <div className="d-flex align-items-center gap-2 mb-2">
        <span className="fw-semibold small">Tags</span>
        <Badge bg={confidenceColor} style={{ fontSize: 10 }}>{confidence} confidence</Badge>
        {isManual && <Badge bg="info" style={{ fontSize: 10 }}>manual</Badge>}
      </div>

      {/* Current tags */}
      <div className="d-flex flex-wrap gap-1 mb-3">
        {activeTags.length === 0 && <span className="text-muted small">No tags set</span>}
        {activeTags.map(tag => (
          <TagBadge key={tag} tag={tag} group={TAG_GROUP_MAP[tag] || 'Special'} />
        ))}
      </div>

      {/* Tag toggles by group */}
      <div className="mb-3">
        {Object.entries(TAG_GROUPS).map(([group, tags]) => (
          <div key={group} className="mb-2">
            <div className="text-muted fw-bold mb-1" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {group}
            </div>
            <div className="d-flex flex-wrap gap-1">
              {tags.map(tag => {
                const active = activeTags.includes(tag)
                const isDerived = derivedTags.includes(tag)
                return (
                  <span
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    style={{
                      cursor: 'pointer',
                      padding: '2px 8px',
                      borderRadius: 12,
                      fontSize: 11,
                      fontWeight: active ? 700 : 400,
                      border: `1px solid ${active ? '#0d6efd' : '#dee2e6'}`,
                      background: active ? '#cfe2ff' : '#fff',
                      color: active ? '#084298' : '#6c757d',
                      userSelect: 'none',
                      position: 'relative',
                    }}
                    title={isDerived ? 'Derived from DB fields' : 'Not derived'}
                  >
                    {tag}
                    {isDerived && !active && (
                      <span style={{ fontSize: 8, marginLeft: 3, color: '#aaa' }}>D</span>
                    )}
                  </span>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="d-flex gap-2 mb-3 flex-wrap">
        {isManual && (
          <Button
            variant="outline-secondary"
            size="sm"
            style={{ fontSize: 11 }}
            onClick={handleResetToDerived}
          >
            Reset to derived
          </Button>
        )}
        <Button
          variant="outline-primary"
          size="sm"
          style={{ fontSize: 11 }}
          onClick={handleApplyToSimilar}
          title="Apply tags to all positions with the same DriverLocation + SecondaryPowerType"
        >
          Apply to similar
        </Button>
      </div>

      {/* User notes */}
      <div>
        <div className="fw-semibold small mb-1">Notes</div>
        <Form.Control
          as="textarea"
          rows={3}
          size="sm"
          value={notes}
          onChange={e => handleNotesChange(e.target.value)}
          placeholder="Add notes for this position…"
        />
      </div>
    </div>
  )
}
