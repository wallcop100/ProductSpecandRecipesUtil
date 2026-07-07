import React, { useState, useMemo, useEffect } from 'react'
import { Modal, Button, Form } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { getNextAvailableRef } from '../utils/containerUtils'

/**
 * NewETWizardModal — guided flow for creating a brand-new element type and
 * optionally filling its product spec inline before landing in AddAnywhereModal.
 *
 * Props:
 *   show, onHide
 *   posRef      — originating position (for context label)
 *   sectionKey  — section the new row will land in
 *   onDone(etRef) — called on save; caller inserts the row + opens AddAnywhereModal
 */
export default function NewETWizardModal({ show, onHide, posRef, sectionKey, onDone }) {
  const elementTypes      = useStore(s => s.elementTypes)
  const psRows            = useStore(s => s.psRows)
  const recipes           = useStore(s => s.recipes)
  const createElementType = useStore(s => s.createElementType)
  const addPSRow          = useStore(s => s.addPSRow)
  const updatePSRow       = useStore(s => s.updatePSRow)
  const dbWriteEnabled    = useStore(s => s.dbWriteEnabled)
  const setDbWriteEnabled = useStore(s => s.setDbWriteEnabled)

  const [ref, setRef]               = useState('')
  const [name, setName]             = useState('')
  const [description, setDescription] = useState('')
  const [family, setFamily]         = useState('')
  const [manufacturer, setMfr]      = useState('')
  const [productCode, setCode]      = useState('')
  const [psDesc, setPsDesc]         = useState('')
  const [showSpec, setShowSpec]     = useState(false)
  const [saving, setSaving]         = useState(false)

  // Reset on open
  useEffect(() => {
    if (!show) return
    setRef(''); setName(''); setDescription(''); setFamily('')
    setMfr(''); setCode(''); setPsDesc('')
    setShowSpec(false); setSaving(false)
  }, [show])

  const familyOptions = useMemo(() => {
    const s = new Set()
    for (const e of elementTypes) { const f = (e.Family || e.family || '').trim(); if (f) s.add(f) }
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [elementTypes])

  // All known ET refs for the next-available suggestion
  const allETObjects = useMemo(() => {
    const seen = new Map()
    for (const et of elementTypes) {
      const r = et.ElementTypeRef || et.elementTypeRef
      if (r) seen.set(r.toLowerCase(), et)
    }
    for (const r of psRows) {
      const k = (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase()
      if (k && !seen.has(k)) seen.set(k, { ElementTypeRef: r.ElementTypeRef || r.elementTypeRef })
    }
    for (const r of recipes) {
      const k = (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase()
      if (k && !seen.has(k)) seen.set(k, { ElementTypeRef: r.ElementTypeRef || r.elementTypeRef })
    }
    return [...seen.values()]
  }, [elementTypes, psRows, recipes])

  const mfrOptions = useMemo(() => {
    const s = new Set()
    for (const r of psRows) { const m = (r.Manufacturer || r.manufacturer || '').trim(); if (m) s.add(m) }
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [psRows])

  // Live suggestion: next available ref for the typed prefix. Uppercased so it
  // also nudges the user toward capitalised refs.
  const suggested = useMemo(() => {
    const trimmed = ref.trim().toUpperCase()
    if (!trimmed) return ''
    // Synthesise a probe with a trailing number so getNextAvailableRef can strip it
    const probe = /-\d+$/.test(trimmed) ? trimmed : `${trimmed}-01`
    return getNextAvailableRef(probe, allETObjects) || ''
  }, [ref, allETObjects])

  // Nudge: the typed ref has lowercase letters (refs are conventionally caps).
  const notCapitalised = ref.trim() && ref.trim() !== ref.trim().toUpperCase()

  // Flag when the entered Manufacturer + Product Code already belongs to another ET.
  const dupSpec = useMemo(() => {
    const m = manufacturer.trim().toLowerCase()
    const c = productCode.trim().toLowerCase()
    if (!m || !c) return null
    const hit = psRows.find(r =>
      (r.Manufacturer || r.manufacturer || '').trim().toLowerCase() === m &&
      (r.ProductCode || r.productCode || '').trim().toLowerCase() === c &&
      (r.IsDeleted || r.isDeleted) !== 'Y' &&
      (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() !== ref.trim().toLowerCase()
    )
    return hit ? { ref: hit.ElementTypeRef || hit.elementTypeRef } : null
  }, [manufacturer, productCode, psRows, ref])

  const alreadyExists = useMemo(() => {
    const k = ref.trim().toLowerCase()
    if (!k) return false
    return allETObjects.some(e => (e.ElementTypeRef || e.elementTypeRef || '').toLowerCase() === k)
  }, [ref, allETObjects])

  const canSave = ref.trim() && !alreadyExists && !saving

  async function handleSave() {
    const trimRef = ref.trim()
    if (!trimRef || alreadyExists) return
    setSaving(true)
    try {
      // Register the ET in the catalogue (staging-backed; queues a DB row when
      // DB writes are on).
      createElementType({
        ref: trimRef,
        name: name.trim() || null,
        description: description.trim() || null,
        family: family.trim() || null,
      })

      // Only create a PS row when procurement data was actually entered.
      const psDefaults = {}
      if (manufacturer.trim()) psDefaults.Manufacturer = manufacturer.trim()
      if (productCode.trim())  psDefaults.ProductCode  = productCode.trim()
      if (psDesc.trim())       psDefaults.ComponentDescription = psDesc.trim()
      if (Object.keys(psDefaults).length) {
        const existing = psRows.find(p => (p.ElementTypeRef || p.elementTypeRef || '').toLowerCase() === trimRef.toLowerCase())
        if (existing) updatePSRow(trimRef, psDefaults)
        else addPSRow(trimRef, psDefaults)
      }

      onDone(trimRef)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal show={show} onHide={onHide} size="md" centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 14 }}>
          <MaterialIcon name="add_circle" size={16} style={{ verticalAlign: 'middle', marginRight: 6, color: '#198754' }} />
          New Element Type
          {posRef && <span className="text-muted fw-normal ms-2" style={{ fontSize: 12 }}>into {posRef}</span>}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body>
        {/* Ref field */}
        <Form.Group className="mb-3">
          <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>
            Element Type Ref <span className="text-danger">*</span>
          </Form.Label>
          <Form.Control
            size="sm"
            value={ref}
            onChange={e => setRef(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && canSave) handleSave() }}
            placeholder="e.g. ET-TAPE-004"
            isInvalid={alreadyExists}
            style={{ fontSize: 12, fontFamily: 'monospace' }}
            autoFocus
          />
          {alreadyExists && (
            <Form.Text className="text-danger" style={{ fontSize: 11 }}>
              This ref already exists — use "Pick existing" to add it.
            </Form.Text>
          )}
          {!alreadyExists && suggested && suggested !== ref.trim() && (
            <div style={{ fontSize: 11, marginTop: 4, color: '#0d6efd' }}>
              <MaterialIcon name="lightbulb" size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />
              {notCapitalised ? 'Suggested (capitalised):' : 'Next available:'}{' '}
              <button
                className="btn btn-link p-0"
                style={{ fontSize: 11, verticalAlign: 'baseline' }}
                onClick={() => setRef(suggested)}
              >
                {suggested}
              </button>
            </div>
          )}
        </Form.Group>

        {/* Name */}
        <Form.Group className="mb-3">
          <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>
            Name <span className="text-muted fw-normal">(optional)</span>
          </Form.Label>
          <Form.Control
            size="sm"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Short display name…"
            style={{ fontSize: 12 }}
          />
        </Form.Group>

        {/* Description */}
        <Form.Group className="mb-3">
          <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>
            Description <span className="text-muted fw-normal">(optional)</span>
          </Form.Label>
          <Form.Control
            as="textarea"
            rows={2}
            size="sm"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="What is this element type?…"
            style={{ fontSize: 12, resize: 'none' }}
          />
        </Form.Group>

        {/* Family / ParentRef */}
        <Form.Group className="mb-3">
          <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>
            Family <span className="text-muted fw-normal">(optional)</span>
          </Form.Label>
          <Form.Control
            size="sm"
            list="newet-family-list"
            value={family}
            onChange={e => setFamily(e.target.value)}
            placeholder="e.g. TAPE, PROFILE, CLIP…"
            style={{ fontSize: 12 }}
          />
          <datalist id="newet-family-list">
            {familyOptions.map(f => <option key={f} value={f} />)}
          </datalist>
        </Form.Group>

        {/* Where does this ET get saved? Teaches the catalogue concept in context. */}
        <div className="rounded p-2 mb-3" style={{ background: '#f0f4ff', border: '1px solid #c7d7f5' }}>
          <Form.Check
            type="switch"
            id="newet-db-write"
            checked={dbWriteEnabled}
            onChange={e => setDbWriteEnabled(e.target.checked)}
            label={<span style={{ fontSize: 12, fontWeight: 600 }}>Also add to the DesignDB ElementTypes table</span>}
          />
          <div className="text-muted mt-1" style={{ fontSize: 11 }}>
            {dbWriteEnabled
              ? 'This element type is written into the DesignDB ElementTypes table when you press “Update ElementTypes”. Use this so the whole team’s design database knows about it.'
              : 'Off: the element type is remembered in this project only. Turn on to write new/renamed element types back to the shared DesignDB file that the design pipeline reads.'}
          </div>
        </div>

        {/* Product Spec (collapsible) */}
        <div className="border rounded p-2" style={{ background: '#f8f9fa' }}>
          <button
            className="btn btn-link p-0 d-flex align-items-center gap-1 w-100 text-start"
            style={{ fontSize: 12, color: '#555', textDecoration: 'none' }}
            onClick={() => setShowSpec(v => !v)}
          >
            <MaterialIcon name={showSpec ? 'expand_more' : 'chevron_right'} size={16} />
            <span className="fw-semibold">Product Spec</span>
            <span className="text-muted fw-normal ms-1">— Manufacturer, Code, Description</span>
            {!showSpec && (manufacturer || productCode) && (
              <span className="ms-auto text-success" style={{ fontSize: 11 }}>
                <MaterialIcon name="check" size={12} /> filled
              </span>
            )}
            {!showSpec && !manufacturer && !productCode && (
              <span className="ms-auto text-muted" style={{ fontSize: 10 }}>optional — skip if in a rush</span>
            )}
          </button>

          {showSpec && (
            <div className="mt-2">
              <div className="row g-2">
                <div className="col-6">
                  <Form.Label style={{ fontSize: 11, color: '#666' }}>Manufacturer</Form.Label>
                  <Form.Control size="sm" value={manufacturer} onChange={e => setMfr(e.target.value)}
                    placeholder="e.g. Osram" list="newet-mfr-list" style={{ fontSize: 11 }} />
                  <datalist id="newet-mfr-list">
                    {mfrOptions.map(m => <option key={m} value={m} />)}
                  </datalist>
                </div>
                <div className="col-6">
                  <Form.Label style={{ fontSize: 11, color: '#666' }}>Product Code</Form.Label>
                  <Form.Control size="sm" value={productCode} onChange={e => setCode(e.target.value)}
                    placeholder="e.g. LEDTAPE-3000K" style={{ fontSize: 11 }} />
                </div>
                <div className="col-12">
                  <Form.Label style={{ fontSize: 11, color: '#666' }}>PS Description</Form.Label>
                  <Form.Control size="sm" value={psDesc} onChange={e => setPsDesc(e.target.value)}
                    placeholder="Component description…" style={{ fontSize: 11 }} />
                </div>
              </div>

              {/* Duplicate Manufacturer + Product Code guard */}
              {dupSpec && (
                <div className="mt-2 p-2 rounded" style={{ background: '#fff3cd', border: '1px solid #ffc107', fontSize: 11 }}>
                  <div className="d-flex align-items-start gap-1" style={{ color: '#856404' }}>
                    <MaterialIcon name="warning" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>
                      <strong style={{ fontFamily: 'monospace' }}>{dupSpec.ref}</strong> already uses this
                      Manufacturer + Product Code. Creating another means two ElementTypes for one product.
                    </span>
                  </div>
                  <div className="mt-2 d-flex gap-2 flex-wrap">
                    <Button size="sm" variant="warning" style={{ fontSize: 11 }}
                      onClick={() => onDone(dupSpec.ref)}>
                      Use existing {dupSpec.ref}
                    </Button>
                    <Button size="sm" variant="outline-secondary" style={{ fontSize: 11 }}
                      onClick={() => setCode('')}>
                      Adjust product code
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal.Body>

      <Modal.Footer>
        <Button variant="link" size="sm" onClick={onHide} style={{ fontSize: 12 }}>Cancel</Button>
        <Button
          variant="success" size="sm" style={{ fontSize: 12 }}
          onClick={handleSave}
          disabled={!canSave}
          title={alreadyExists ? 'Ref already exists' : !ref.trim() ? 'Enter a ref first' : ''}
        >
          {saving ? 'Creating…' : 'Create + Add to positions →'}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
