import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { Modal, Button, Form, ProgressBar, Badge, Tab, Nav } from 'react-bootstrap'
import useStore from '../store/useStore'
import { familyOf } from '../utils/etRef'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseIngredients(collection) {
  if (!collection) return []
  if (Array.isArray(collection.Ingredients)) return collection.Ingredients
  try { return JSON.parse(collection.Ingredients || '[]') } catch { return [] }
}

function isComplete(psRow) {
  if (!psRow) return false
  const code = (psRow.ProductCode || psRow.productCode || '').trim()
  const mfr  = (psRow.Manufacturer || psRow.manufacturer || '').trim()
  return !!(code && mfr)
}

// ---------------------------------------------------------------------------
// Section 1 — Connector product table
// ---------------------------------------------------------------------------

function ConnectorRow({ etRef, psRow, usedInCount, mfrOptions, onSave }) {
  const [editing, setEditing] = useState(false)
  const [localMfr,  setLocalMfr]  = useState('')
  const [localCode, setLocalCode] = useState('')
  const [localDesc, setLocalDesc] = useState('')

  function startEdit() {
    setLocalMfr(psRow?.Manufacturer  || psRow?.manufacturer  || '')
    setLocalCode(psRow?.ProductCode  || psRow?.productCode   || '')
    setLocalDesc(psRow?.ComponentDescription || psRow?.componentDescription || '')
    setEditing(true)
  }

  function save() {
    onSave(etRef, {
      Manufacturer: localMfr.trim(),
      ProductCode: localCode.trim(),
      ComponentDescription: localDesc.trim(),
    })
    setEditing(false)
  }

  function cancel() { setEditing(false) }

  const mfr  = psRow?.Manufacturer  || psRow?.manufacturer  || ''
  const code = psRow?.ProductCode   || psRow?.productCode   || ''
  const complete = isComplete(psRow)

  if (editing) {
    return (
      <tr style={{ background: '#fffbe6' }}>
        <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{etRef}</td>
        <td><span className="text-muted" style={{ fontSize: 11 }}>{usedInCount}</span></td>
        <td>
          <Form.Control size="sm" list="wizard-mfr-list" value={localMfr}
            onChange={e => setLocalMfr(e.target.value)} style={{ fontSize: 11 }} autoFocus />
        </td>
        <td>
          <Form.Control size="sm" value={localCode}
            onChange={e => setLocalCode(e.target.value)} style={{ fontSize: 11 }}
            onKeyDown={e => { if (e.key === 'Enter') save() }} />
        </td>
        <td>
          <Form.Control size="sm" value={localDesc}
            onChange={e => setLocalDesc(e.target.value)} style={{ fontSize: 11 }} />
        </td>
        <td>
          <div className="d-flex gap-1">
            <Button size="sm" variant="success" style={{ fontSize: 10, padding: '1px 6px' }} onClick={save}>✓</Button>
            <Button size="sm" variant="link" style={{ fontSize: 10, padding: '1px 4px' }} onClick={cancel}>✕</Button>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <tr
      onClick={startEdit}
      style={{
        cursor: 'pointer',
        background: complete ? '#f6fff8' : '#fff9f0',
      }}
    >
      <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{etRef}</td>
      <td><span className="text-muted" style={{ fontSize: 11 }}>{usedInCount}</span></td>
      <td style={{ fontSize: 12, color: mfr ? undefined : '#ccc' }}>{mfr || '—'}</td>
      <td style={{ fontSize: 12, color: code ? undefined : '#ccc' }}>{code || '—'}</td>
      <td style={{ fontSize: 12, color: '#6c757d' }}>
        {psRow?.ComponentDescription || psRow?.componentDescription || ''}
      </td>
      <td>
        {complete
          ? <span style={{ color: '#198754', fontSize: 12 }}>✓</span>
          : <span style={{ color: '#dc3545', fontSize: 12 }}>●</span>}
      </td>
    </tr>
  )
}

function ConnectorSection({ connectorRefs }) {
  const psRows       = useStore(s => s.psRows)
  const recipes      = useStore(s => s.recipes)
  const updatePSRow  = useStore(s => s.updatePSRow)
  const mfrOptions   = useMemo(() => {
    const set = new Set()
    for (const r of psRows) {
      const m = r.Manufacturer || r.manufacturer
      if (m?.trim()) set.add(m.trim())
    }
    return [...set].sort()
  }, [psRows])

  // "Used in" counts per ET ref
  const usedInCounts = useMemo(() => {
    const counts = {}
    for (const r of recipes) {
      if ((r.IsDeleted || r.isDeleted) === 'Y') continue
      const ref = (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase()
      counts[ref] = (counts[ref] || 0) + 1
    }
    return counts
  }, [recipes])

  const incomplete = connectorRefs.filter(ref => {
    const psRow = psRows.find(r => (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() === ref.toLowerCase())
    return !isComplete(psRow)
  })

  function handleSave(etRef, updates) {
    const orig = psRows.find(r => (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() === etRef.toLowerCase())
    if (!orig) return
    const changes = {}
    if (updates.Manufacturer !== (orig.Manufacturer || orig.manufacturer || '')) changes.Manufacturer = updates.Manufacturer
    if (updates.ProductCode  !== (orig.ProductCode  || orig.productCode  || '')) changes.ProductCode  = updates.ProductCode
    if (updates.ComponentDescription !== (orig.ComponentDescription || orig.componentDescription || ''))
      changes.ComponentDescription = updates.ComponentDescription
    if (Object.keys(changes).length > 0) updatePSRow(etRef, changes)
  }

  if (connectorRefs.length === 0) {
    return (
      <div className="text-center text-muted py-4">
        <div style={{ fontSize: 13 }}>No collections defined yet.</div>
        <div className="mt-1 small">Create collections in the Connectors screen to manage connector products here.</div>
      </div>
    )
  }

  return (
    <>
      {incomplete.length === 0 && (
        <div className="alert alert-success py-2 px-3 mb-3" style={{ fontSize: 12 }}>
          ✓ All connector specs are complete.
        </div>
      )}
      <div style={{ fontSize: 11, color: '#6c757d', marginBottom: 8 }}>
        Click any row to edit. Showing {connectorRefs.length} connector ET refs from your collections.
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className="table table-sm table-hover" style={{ fontSize: 12 }}>
          <thead className="table-light">
            <tr>
              <th>ET Ref</th>
              <th title="Recipe rows using this ref">Used in</th>
              <th>Manufacturer</th>
              <th>Product Code</th>
              <th>Description</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {connectorRefs.map(ref => {
              const psRow = psRows.find(r =>
                (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() === ref.toLowerCase()
              )
              return (
                <ConnectorRow
                  key={ref}
                  etRef={ref}
                  psRow={psRow}
                  usedInCount={usedInCounts[ref.toLowerCase()] || 0}
                  mfrOptions={mfrOptions}
                  onSave={handleSave}
                />
              )
            })}
          </tbody>
        </table>
      </div>
      <datalist id="wizard-mfr-list">
        {mfrOptions.map(m => <option key={m} value={m} />)}
      </datalist>
    </>
  )
}

// ---------------------------------------------------------------------------
// Section 2 — Regular ET step-through (unchanged logic, excludes connector refs)
// ---------------------------------------------------------------------------

function StepThroughSection({ excludeRefs }) {
  const psRows       = useStore(s => s.psRows)
  const elementTypes = useStore(s => s.elementTypes)
  const updatePSRow  = useStore(s => s.updatePSRow)
  const excludeSet   = useMemo(() => new Set(excludeRefs.map(r => r.toLowerCase())), [excludeRefs])

  const mfrOptions = useMemo(() => {
    const set = new Set()
    for (const r of psRows) {
      const m = r.Manufacturer || r.manufacturer
      if (m?.trim()) set.add(m.trim())
    }
    return [...set].sort()
  }, [psRows])

  const queue = useMemo(() => (
    psRows
      .filter(r => {
        if ((r.IsDeleted || r.isDeleted) === 'Y') return false
        if ((r.IsTBC || r.isTBC) === 'Y') return false
        const etRef = (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase()
        if (excludeSet.has(etRef)) return false
        const code = (r.ProductCode || r.productCode || '').trim()
        const mfr  = (r.Manufacturer || r.manufacturer || '').trim()
        return !code || !mfr
      })
      .map(r => r.ElementTypeRef || r.elementTypeRef)
  ), [psRows, excludeSet])

  const [index, setIndex] = useState(0)
  const [localMfr,  setLocalMfr]  = useState('')
  const [localCode, setLocalCode] = useState('')
  const [localDesc, setLocalDesc] = useState('')

  const ref = queue[index] || null
  const psRow = psRows.find(r =>
    (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() === (ref || '').toLowerCase()
  )

  useEffect(() => {
    if (!psRow) { setLocalMfr(''); setLocalCode(''); setLocalDesc(''); return }
    setLocalMfr(psRow.Manufacturer  || psRow.manufacturer  || '')
    setLocalCode(psRow.ProductCode  || psRow.productCode   || '')
    setLocalDesc(psRow.ComponentDescription || psRow.componentDescription || '')
  }, [ref])

  useEffect(() => { setIndex(0) }, [excludeSet])

  const etObj = elementTypes.find(e =>
    (e.ElementTypeRef || e.elementTypeRef || '').toLowerCase() === (ref || '').toLowerCase()
  )
  const etFamily = ref ? familyOf(ref, etObj) : null

  const similar = useMemo(() => {
    if (!ref || !etFamily || (localMfr && localCode)) return null
    return psRows.find(r => {
      const rRef = r.ElementTypeRef || r.elementTypeRef || ''
      if (rRef.toLowerCase() === (ref || '').toLowerCase()) return false
      const rEt  = elementTypes.find(e => (e.ElementTypeRef || e.elementTypeRef || '').toLowerCase() === rRef.toLowerCase())
      return familyOf(rRef, rEt) === etFamily && (r.ProductCode || r.productCode) && (r.Manufacturer || r.manufacturer)
    }) || null
  }, [ref, etFamily, psRows, elementTypes, localMfr, localCode])

  function saveCurrentAndAdvance() {
    if (ref) {
      const orig = psRow || {}
      const updates = {}
      const mfr  = localMfr.trim()
      const code = localCode.trim()
      const desc = localDesc.trim()
      if (mfr  !== (orig.Manufacturer || orig.manufacturer || '')) updates.Manufacturer = mfr
      if (code !== (orig.ProductCode  || orig.productCode  || '')) updates.ProductCode  = code
      if (desc !== (orig.ComponentDescription || orig.componentDescription || '')) updates.ComponentDescription = desc
      if (Object.keys(updates).length > 0) updatePSRow(ref, updates)
    }
    setIndex(i => i + 1)
  }

  function setNA() {
    if (!ref) return
    updatePSRow(ref, { Manufacturer: 'Ideaworks', ProductCode: 'N/A' })
    setIndex(i => i + 1)
  }

  const done = index >= queue.length

  if (queue.length === 0) {
    return (
      <div className="text-center py-4">
        <div style={{ fontSize: 36 }}>✓</div>
        <div className="fw-semibold mt-2">All non-connector specs complete!</div>
        <div className="text-muted small mt-1">Every ET has a manufacturer and product code, or is marked TBC.</div>
      </div>
    )
  }

  if (done) {
    return (
      <div className="text-center py-4">
        <div style={{ fontSize: 36 }}>✓</div>
        <div className="fw-semibold mt-2">Done!</div>
        <div className="text-muted small mt-1">You've stepped through all {queue.length} incomplete specs.</div>
      </div>
    )
  }

  return (
    <>
      <ProgressBar
        now={Math.round((index / queue.length) * 100)}
        style={{ height: 4, marginBottom: 20 }}
        variant="success"
      />
      <div className="d-flex align-items-center gap-2 mb-3">
        <span className="fw-semibold" style={{ fontSize: 13 }}>{ref}</span>
        {etFamily && <span className="text-muted" style={{ fontSize: 11 }}>{etFamily}</span>}
        <span className="ms-auto text-muted" style={{ fontSize: 12 }}>{index + 1} of {queue.length}</span>
      </div>

      {similar && (
        <div className="alert alert-warning py-2 px-3 mb-3 d-flex align-items-center gap-2" style={{ fontSize: 12 }}>
          <div className="flex-grow-1">
            Similar: <strong>{similar.ElementTypeRef || similar.elementTypeRef}</strong>
            {' '}— {similar.Manufacturer || similar.manufacturer} / {similar.ProductCode || similar.productCode}
          </div>
          <Button variant="warning" size="sm" style={{ fontSize: 11 }}
            onClick={() => {
              setLocalMfr(similar.Manufacturer  || similar.manufacturer  || '')
              setLocalCode(similar.ProductCode  || similar.productCode   || '')
            }}>Copy</Button>
        </div>
      )}

      <Form.Group className="mb-2">
        <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>Manufacturer</Form.Label>
        <Form.Control
          size="sm" list="wizard-mfr-list-2"
          value={localMfr}
          onChange={e => setLocalMfr(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') document.getElementById('wizard-code-input-2')?.focus() }}
          autoFocus style={{ fontSize: 12 }}
        />
        <datalist id="wizard-mfr-list-2">
          {mfrOptions.map(m => <option key={m} value={m} />)}
        </datalist>
      </Form.Group>

      <Form.Group className="mb-2">
        <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>Product Code</Form.Label>
        <Form.Control
          id="wizard-code-input-2" size="sm"
          value={localCode}
          onChange={e => setLocalCode(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') document.getElementById('wizard-desc-input-2')?.focus() }}
          style={{ fontSize: 12 }}
        />
      </Form.Group>

      <Form.Group className="mb-0">
        <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>Description</Form.Label>
        <Form.Control
          id="wizard-desc-input-2" size="sm"
          value={localDesc}
          onChange={e => setLocalDesc(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') saveCurrentAndAdvance() }}
          style={{ fontSize: 12 }}
        />
      </Form.Group>

      <div className="d-flex justify-content-between mt-4">
        <Button variant="outline-secondary" size="sm" style={{ fontSize: 12 }} onClick={setNA}>
          N/A (Ideaworks)
        </Button>
        <div className="d-flex gap-2">
          <Button variant="outline-secondary" size="sm" style={{ fontSize: 12 }} onClick={() => setIndex(i => i + 1)}>
            Skip
          </Button>
          <Button variant="primary" size="sm" style={{ fontSize: 12 }} onClick={saveCurrentAndAdvance}>
            Save &amp; Next →
          </Button>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// SpecWizardModal — two-section tabbed modal
// ---------------------------------------------------------------------------

export default function SpecWizardModal({ show, onHide }) {
  const etCollections = useStore(s => s.etCollections)
  const psRows        = useStore(s => s.psRows)
  const [activeTab, setActiveTab] = useState('connectors')

  // All unique ET refs across all collection ingredients
  const connectorRefs = useMemo(() => {
    const seen = new Set()
    const refs = []
    for (const c of etCollections) {
      const ings = Array.isArray(c.Ingredients) ? c.Ingredients : (() => { try { return JSON.parse(c.Ingredients || '[]') } catch { return [] } })()
      for (const ing of ings) {
        const ref = ing.ElementTypeRef || ing.slotLabel || ''
        if (ref && !seen.has(ref.toLowerCase())) {
          seen.add(ref.toLowerCase())
          refs.push(ref)
        }
      }
    }
    return refs
  }, [etCollections])

  // Incomplete counts for tab badges
  const connectorIncomplete = useMemo(() => connectorRefs.filter(ref => {
    const r = psRows.find(p => (p.ElementTypeRef || p.elementTypeRef || '').toLowerCase() === ref.toLowerCase())
    return !isComplete(r)
  }).length, [connectorRefs, psRows])

  const excludeSet = useMemo(() => new Set(connectorRefs.map(r => r.toLowerCase())), [connectorRefs])
  const regularIncomplete = useMemo(() => psRows.filter(r => {
    if ((r.IsDeleted || r.isDeleted) === 'Y') return false
    if ((r.IsTBC || r.isTBC) === 'Y') return false
    const etRef = (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase()
    if (excludeSet.has(etRef)) return false
    return !isComplete(r)
  }).length, [psRows, excludeSet])

  useEffect(() => {
    if (show) setActiveTab('connectors')
  }, [show])

  return (
    <Modal show={show} onHide={onHide} size="xl" centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 14 }}>Fill Missing Specs</Modal.Title>
      </Modal.Header>

      <Modal.Body style={{ minHeight: 380 }}>
        <Nav variant="tabs" activeKey={activeTab} onSelect={setActiveTab} className="mb-3">
          <Nav.Item>
            <Nav.Link eventKey="connectors">
              Connectors
              {connectorIncomplete > 0 && (
                <Badge bg="danger" className="ms-1" style={{ fontSize: 10 }}>{connectorIncomplete}</Badge>
              )}
            </Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="regular">
              Other ETs
              {regularIncomplete > 0 && (
                <Badge bg="danger" className="ms-1" style={{ fontSize: 10 }}>{regularIncomplete}</Badge>
              )}
            </Nav.Link>
          </Nav.Item>
        </Nav>

        {activeTab === 'connectors' && (
          <ConnectorSection connectorRefs={connectorRefs} />
        )}
        {activeTab === 'regular' && (
          <StepThroughSection excludeRefs={connectorRefs} />
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" size="sm" onClick={onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  )
}
