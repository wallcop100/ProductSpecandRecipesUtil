import React, { useState, useEffect, useMemo } from 'react'
import { Modal, Button, Form, Badge, ButtonGroup } from 'react-bootstrap'
import useStore, { getRecipeForPosition } from '../store/useStore'

const SECTION_TITLE = {
  position: 'PositionType Level',
  dl_internal: 'Inside DL Wrapper',
  lin_internal: 'Inside LIN Wrapper',
}

/**
 * TransformToTemplateModal (T-F4) — "Transform Active Position into a Template".
 *
 * Lists the active position's current rows; each row becomes a template slot.
 * The user edits slot labels and chooses per row whether it stays primed
 * (grey-hatched, fill-later) or is an Exact Ref (fixed to the row's current
 * ElementType, exports like any ingredient).
 */
export default function TransformToTemplateModal({ show, onHide, posRef }) {
  const recipes = useStore(s => s.recipes)
  const transformToTemplate = useStore(s => s.transformToTemplate)

  const [name, setName] = useState('')
  const [toLibrary, setToLibrary] = useState(false)
  const [slots, setSlots] = useState([])   // [{ row, section, slotLabel, exact }]
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState(false)

  const grouped = useMemo(
    () => (posRef ? getRecipeForPosition(recipes, posRef) : null),
    [recipes, posRef]
  )

  useEffect(() => {
    if (!show || !grouped) return
    const defs = []
    for (const [section, rows] of [
      ['position', grouped.position],
      ['dl_internal', grouped.dlInternal],
      ['lin_internal', grouped.linInternal],
    ]) {
      for (const row of rows || []) {
        if ((row.IsDeleted || row.isDeleted) === 'Y') continue
        if (row.resolved === false) continue   // an unfilled slot can't seed a slot
        const etRef = row.elementTypeRef || row.ElementTypeRef || ''
        defs.push({ row, section, slotLabel: etRef, exact: false })
      }
    }
    setSlots(defs)
    setName('')
    setToLibrary(false)
    setSaving(false)
    setSavedMsg(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, posRef])

  function updateSlot(idx, patch) {
    setSlots(prev => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)))
  }

  async function handleSave() {
    if (!name.trim() || slots.length === 0) return
    setSaving(true)
    try {
      await transformToTemplate(posRef, name.trim(), toLibrary ? 'global' : 'project', slots)
      setSavedMsg(true)
      setTimeout(onHide, 800)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal show={show} onHide={onHide} size="lg" centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 15 }}>
          Transform {posRef} into a Template
        </Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ maxHeight: '60vh' }}>
        <div className="text-muted mb-3" style={{ fontSize: 12 }}>
          Each row becomes a template slot. <strong>Primed</strong> slots are
          placeholders filled with a new or existing ElementType when the template
          is applied; <strong>Exact Ref</strong> slots stay fixed to the row's
          current ElementType.
        </div>

        {slots.length === 0 && (
          <div className="text-muted small fst-italic">This position has no rows to transform.</div>
        )}

        {['position', 'dl_internal', 'lin_internal'].map(section => {
          const sectionSlots = slots.map((s, idx) => ({ ...s, idx })).filter(s => s.section === section)
          if (sectionSlots.length === 0) return null
          return (
            <div key={section} className="mb-3">
              <div className="fw-semibold text-muted mb-1" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                {SECTION_TITLE[section]}
              </div>
              {sectionSlots.map(s => {
                const etRef = s.row.elementTypeRef || s.row.ElementTypeRef || '—'
                return (
                  <div key={s.row._id || s.idx} className="d-flex align-items-center gap-2 py-1 border-bottom" style={{ fontSize: 12 }}>
                    <Badge bg="light" text="dark" style={{ fontFamily: 'monospace', fontSize: 10, minWidth: 90 }}>{etRef}</Badge>
                    <Form.Control
                      size="sm"
                      style={{ maxWidth: 260, fontSize: 12 }}
                      value={s.slotLabel}
                      disabled={s.exact}
                      title={s.exact ? 'Exact Ref slots use the ElementTypeRef itself' : 'Slot label shown on the primed slot'}
                      onChange={e => updateSlot(s.idx, { slotLabel: e.target.value })}
                      placeholder="Slot label…"
                    />
                    <ButtonGroup size="sm" className="ms-auto">
                      <Button
                        variant={s.exact ? 'outline-secondary' : 'secondary'}
                        style={{ fontSize: 10, padding: '1px 8px' }}
                        title="Placeholder — filled with a new or existing ElementType on apply"
                        onClick={() => updateSlot(s.idx, { exact: false })}
                      >
                        Primed
                      </Button>
                      <Button
                        variant={s.exact ? 'primary' : 'outline-secondary'}
                        style={{ fontSize: 10, padding: '1px 8px' }}
                        title={`Fixed to ${etRef} — applies as a normal row`}
                        onClick={() => updateSlot(s.idx, { exact: true })}
                      >
                        Exact Ref
                      </Button>
                    </ButtonGroup>
                  </div>
                )
              })}
            </div>
          )
        })}
      </Modal.Body>
      <Modal.Footer>
        <Form.Control
          size="sm"
          style={{ maxWidth: 220 }}
          placeholder="Template name…"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
        />
        <Form.Check
          type="checkbox"
          id="transform-to-library"
          label="My library"
          checked={toLibrary}
          onChange={e => setToLibrary(e.target.checked)}
          style={{ fontSize: 12, whiteSpace: 'nowrap' }}
          title="Save to your cross-project library (available in every project)"
        />
        <Button variant="secondary" size="sm" onClick={onHide}>Cancel</Button>
        <Button variant="success" size="sm" onClick={handleSave}
          disabled={saving || !name.trim() || slots.length === 0}>
          {savedMsg ? 'Saved ✓' : saving ? 'Saving…' : 'Save template'}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
