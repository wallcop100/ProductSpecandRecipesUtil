import React, { useState, useEffect, useMemo } from 'react'
import { Form, Button } from 'react-bootstrap'
import useStore from '../store/useStore'
import FlagPill from './FlagPill'
import EntityPill from './EntityPill'
import MaterialIcon from './MaterialIcon'
import { familyOf } from '../utils/etRef'

/**
 * ETSpecEditor — right-panel form for editing a single ET's product spec.
 *
 * Props:
 *   selectedRef: string|null
 *   etUsedIn: { [etRefLower]: { positions: Set, elements: Set } }
 *   missingETs: string[]
 *   onNavigate: ('prev'|'next') => void
 */
export default function ETSpecEditor({ selectedRef, etUsedIn = {}, missingETs = [], onNavigate }) {
  const psRows      = useStore(s => s.psRows)
  const updatePSRow = useStore(s => s.updatePSRow)
  const addPSRow    = useStore(s => s.addPSRow)
  const elementTypes = useStore(s => s.elementTypes)

  const mfrOptions = useMemo(() => {
    const set = new Set()
    for (const r of psRows) {
      const m = r.Manufacturer || r.manufacturer
      if (m && m.trim()) set.add(m.trim())
    }
    return [...set].sort()
  }, [psRows])

  const psRow = useMemo(() =>
    psRows.find(r =>
      (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() === (selectedRef || '').toLowerCase()
    )
  , [psRows, selectedRef])

  const isMissing = !psRow &&
    missingETs.some(r => r.toLowerCase() === (selectedRef || '').toLowerCase())

  const etObj = useMemo(() =>
    elementTypes.find(e =>
      (e.ElementTypeRef || e.elementTypeRef || '').toLowerCase() === (selectedRef || '').toLowerCase()
    )
  , [elementTypes, selectedRef])
  const etFamily = selectedRef ? familyOf(selectedRef, etObj) : null

  const similar = useMemo(() => {
    if (!selectedRef || !etFamily || !psRow) return null
    const code = psRow.ProductCode || psRow.productCode
    const mfr  = psRow.Manufacturer || psRow.manufacturer
    if (code && mfr) return null
    return psRows.find(r => {
      const rRef = r.ElementTypeRef || r.elementTypeRef || ''
      if (rRef.toLowerCase() === selectedRef.toLowerCase()) return false
      const rEt = elementTypes.find(e => (e.ElementTypeRef || e.elementTypeRef || '').toLowerCase() === rRef.toLowerCase())
      const rFamily = familyOf(rRef, rEt)
      return rFamily === etFamily && (r.ProductCode || r.productCode) && (r.Manufacturer || r.manufacturer)
    }) || null
  }, [psRow, selectedRef, etFamily, psRows, elementTypes])

  const [dismissedSimilar, setDismissedSimilar] = useState(false)
  const [showNotes, setShowNotes] = useState(false)

  useEffect(() => { setDismissedSimilar(false); setShowNotes(false) }, [selectedRef])

  const usage = selectedRef ? etUsedIn[selectedRef.toLowerCase()] : null

  if (!selectedRef) {
    return (
      <div className="d-flex align-items-center justify-content-center h-100 text-muted">
        <div className="text-center">
          <MaterialIcon name="inventory_2" size={48} style={{ opacity: 0.2 }} />
          <div className="mt-2" style={{ fontSize: 13 }}>
            Select an element type from the list to edit its spec.
          </div>
        </div>
      </div>
    )
  }

  if (isMissing) {
    return (
      <div className="p-4" style={{ maxWidth: 600 }}>
        <div className="fw-semibold mb-1" style={{ fontSize: 14 }}>{selectedRef}</div>
        <div className="alert alert-warning py-2 px-3 mb-3" style={{ fontSize: 12 }}>
          Referenced in recipes but has no product spec entry.
        </div>
        <Button variant="primary" size="sm" onClick={() => addPSRow(selectedRef)}>
          + Create spec entry
        </Button>
      </div>
    )
  }

  if (!psRow) {
    return (
      <div className="p-4" style={{ maxWidth: 600 }}>
        <div className="fw-semibold mb-1" style={{ fontSize: 14 }}>{selectedRef}</div>
        <div className="text-muted small mb-3">Not in the product spec yet.</div>
        <Button variant="outline-primary" size="sm" onClick={() => addPSRow(selectedRef)}>
          + Add to product spec
        </Button>
      </div>
    )
  }

  const productCode   = psRow.ProductCode || psRow.productCode || ''
  const manufacturer  = psRow.Manufacturer || psRow.manufacturer || ''
  const description   = psRow.ComponentDescription || psRow.componentDescription || ''
  const notes         = psRow.InternalNotesText || psRow.internalNotesText || ''
  const isTBC         = psRow.IsTBC || psRow.isTBC || null
  const isPropTBC     = psRow.IsPropertiesTBC || psRow.isPropertiesTBC || null
  const isDeleted     = (psRow.IsDeleted || psRow.isDeleted) === 'Y'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      <div className="p-4" style={{ maxWidth: 600 }}>
        {/* Header row */}
        <div className="d-flex align-items-start gap-2 mb-3">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="fw-semibold" style={{ fontSize: 14, wordBreak: 'break-all' }}>{selectedRef}</div>
            {etFamily && <div className="text-muted" style={{ fontSize: 11 }}>{etFamily}</div>}
          </div>
          {onNavigate && (
            <div className="d-flex gap-1">
              <Button variant="outline-secondary" size="sm" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => onNavigate('prev')}>← Prev</Button>
              <Button variant="outline-secondary" size="sm" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => onNavigate('next')}>Next →</Button>
            </div>
          )}
          {(!productCode || !manufacturer) && !isDeleted && (
            <Button
              variant="outline-secondary" size="sm"
              style={{ fontSize: 11, padding: '2px 10px', whiteSpace: 'nowrap' }}
              title="Set Manufacturer=Ideaworks, ProductCode=N/A"
              onClick={() => updatePSRow(selectedRef, { Manufacturer: 'Ideaworks', ProductCode: 'N/A' })}
            >
              N/A
            </Button>
          )}
        </div>

        {isDeleted && (
          <div className="alert alert-secondary py-1 px-2 mb-3 d-flex align-items-center gap-2" style={{ fontSize: 11 }}>
            <span className="flex-grow-1">Marked as deleted.</span>
            <button className="btn btn-link btn-sm p-0" style={{ fontSize: 11 }} onClick={() => updatePSRow(selectedRef, { IsDeleted: null })}>Restore</button>
          </div>
        )}

        {/* Copy-from-similar */}
        {similar && !dismissedSimilar && (
          <div className="alert alert-warning py-2 px-3 mb-3 d-flex align-items-center gap-2" style={{ fontSize: 12 }}>
            <div className="flex-grow-1">
              <strong>{similar.ElementTypeRef || similar.elementTypeRef}</strong>{' '}
              has: {similar.Manufacturer || similar.manufacturer} / {similar.ProductCode || similar.productCode}
            </div>
            <Button
              variant="warning" size="sm" style={{ fontSize: 11, padding: '1px 8px' }}
              onClick={() => {
                updatePSRow(selectedRef, {
                  Manufacturer: similar.Manufacturer || similar.manufacturer,
                  ProductCode:  similar.ProductCode  || similar.productCode,
                })
                setDismissedSimilar(true)
              }}
            >Copy</Button>
            <button className="btn-close" style={{ fontSize: 10 }} onClick={() => setDismissedSimilar(true)} />
          </div>
        )}

        {/* Manufacturer */}
        <Form.Group className="mb-3">
          <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>Manufacturer</Form.Label>
          <Form.Control
            size="sm"
            list="etspec-mfr-list"
            key={`mfr-${selectedRef}-${manufacturer}`}
            defaultValue={manufacturer}
            onBlur={e => { const v = e.target.value.trim(); if (v !== manufacturer) updatePSRow(selectedRef, { Manufacturer: v }) }}
            onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
            style={{ fontSize: 12 }}
            disabled={isDeleted}
          />
          <datalist id="etspec-mfr-list">
            {mfrOptions.map(m => <option key={m} value={m} />)}
          </datalist>
        </Form.Group>

        {/* Product code */}
        <Form.Group className="mb-3">
          <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>Product Code</Form.Label>
          <Form.Control
            size="sm"
            key={`code-${selectedRef}-${productCode}`}
            defaultValue={productCode}
            onBlur={e => { const v = e.target.value.trim(); if (v !== productCode) updatePSRow(selectedRef, { ProductCode: v }) }}
            onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
            style={{ fontSize: 12 }}
            disabled={isDeleted}
          />
        </Form.Group>

        {/* Description */}
        <Form.Group className="mb-3">
          <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>Description</Form.Label>
          <Form.Control
            as="textarea" rows={2} size="sm"
            key={`desc-${selectedRef}-${description}`}
            defaultValue={description}
            onBlur={e => { const v = e.target.value.trim(); if (v !== description) updatePSRow(selectedRef, { ComponentDescription: v }) }}
            style={{ fontSize: 12, resize: 'vertical' }}
            disabled={isDeleted}
          />
        </Form.Group>

        {/* Flags + delete */}
        <div className="d-flex align-items-center gap-3 mb-3 flex-wrap">
          <FlagPill label="TBC" value={isTBC} onChange={val => updatePSRow(selectedRef, { IsTBC: val })} activeVariant="danger" />
          <FlagPill label="Properties TBC" value={isPropTBC} onChange={val => updatePSRow(selectedRef, { IsPropertiesTBC: val })} activeVariant="warning" />
          <div className="ms-auto">
            {!isDeleted ? (
              <button className="btn btn-link btn-sm p-0 text-danger" style={{ fontSize: 11 }} onClick={() => updatePSRow(selectedRef, { IsDeleted: 'Y' })}>Delete</button>
            ) : (
              <button className="btn btn-link btn-sm p-0 text-secondary" style={{ fontSize: 11 }} onClick={() => updatePSRow(selectedRef, { IsDeleted: null })}>Restore</button>
            )}
          </div>
        </div>

        {/* Internal notes (collapsed) */}
        <div className="mb-3">
          <button
            className="btn btn-link btn-sm p-0"
            style={{ fontSize: 11, textDecoration: 'none', color: '#6c757d' }}
            onClick={() => setShowNotes(v => !v)}
          >
            {showNotes ? '▾' : '▸'} Internal notes
          </button>
          {showNotes && (
            <Form.Control
              as="textarea" rows={3} size="sm"
              key={`notes-${selectedRef}-${showNotes}`}
              defaultValue={notes}
              onBlur={e => { const v = e.target.value.trim(); if (v !== notes) updatePSRow(selectedRef, { InternalNotesText: v }) }}
              style={{ fontSize: 12, resize: 'vertical', marginTop: 6 }}
            />
          )}
        </div>

        {/* Used-in */}
        {usage && (usage.positions?.size > 0 || usage.elements?.size > 0) && (
          <div className="mt-3 pt-3 border-top">
            <div className="text-muted mb-2" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Used in
            </div>
            {usage.positions?.size > 0 && (
              <div className="mb-2">
                <div className="text-muted" style={{ fontSize: 11 }}>Positions</div>
                <div className="d-flex flex-wrap gap-1 mt-1">
                  {[...usage.positions].map(r => <EntityPill key={r} type="PositionType" label={r} style={{ fontSize: 10 }} />)}
                </div>
              </div>
            )}
            {usage.elements?.size > 0 && (
              <div>
                <div className="text-muted" style={{ fontSize: 11 }}>Element assemblies</div>
                <div className="d-flex flex-wrap gap-1 mt-1">
                  {[...usage.elements].map(r => <EntityPill key={r} type="ElementType" label={r} style={{ fontSize: 10 }} />)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
