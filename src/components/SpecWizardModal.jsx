import React, { useState, useMemo, useEffect } from 'react'
import { Modal, Button, Form, ProgressBar } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import FlagPill from './FlagPill'
import { familyOf } from '../utils/etRef'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isComplete(psRow) {
  if (!psRow) return false
  const code = (psRow.ProductCode || psRow.productCode || '').trim()
  const mfr  = (psRow.Manufacturer || psRow.manufacturer || '').trim()
  return !!(code && mfr)
}

// ---------------------------------------------------------------------------
// Step-through — only ETs actually used in a recipe need a spec.
// ETs that exist only in the DB (never used in a recipe) are surfaced as a
// soft count, not queued.
// ---------------------------------------------------------------------------

function StepThroughSection() {
  const psRows       = useStore(s => s.psRows)
  const recipes      = useStore(s => s.recipes)
  const elementTypes = useStore(s => s.elementTypes)
  const updatePSRow  = useStore(s => s.updatePSRow)

  // ET refs referenced by at least one live recipe row (preserve display case)
  const usedRefs = useMemo(() => {
    const m = new Map()  // lower → display ref
    for (const r of recipes) {
      if ((r.IsDeleted || r.isDeleted) === 'Y') continue
      const ref = (r.ElementTypeRef || r.elementTypeRef || '').trim()
      const k = ref.toLowerCase()
      if (k && !m.has(k)) m.set(k, ref)
    }
    return m
  }, [recipes])

  const psByRef = useMemo(() => {
    const m = new Map()
    for (const r of psRows) {
      const k = (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase()
      if (k && !m.has(k)) m.set(k, r)
    }
    return m
  }, [psRows])

  const mfrOptions = useMemo(() => {
    const set = new Set()
    for (const r of psRows) {
      const m = r.Manufacturer || r.manufacturer
      if (m?.trim()) set.add(m.trim())
    }
    return [...set].sort()
  }, [psRows])

  // Queue: every recipe-used ET whose spec is incomplete — including ETs that
  // have no PS row yet (missing row ⇒ incomplete). Excludes TBC/deleted.
  const queue = useMemo(() => (
    [...usedRefs.entries()]
      .filter(([low]) => {
        const ps = psByRef.get(low)
        if (ps && ((ps.IsDeleted || ps.isDeleted) === 'Y' || (ps.IsTBC || ps.isTBC) === 'Y')) return false
        return !isComplete(ps)
      })
      .map(([, display]) => display)
      .sort((a, b) => a.localeCompare(b))
  ), [usedRefs, psByRef])

  // Soft flag: ETs in the DB/spec that are incomplete but no recipe uses them
  const dbOnlyMissing = useMemo(() => psRows.filter(r => {
    if ((r.IsDeleted || r.isDeleted) === 'Y') return false
    const etRef = (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase()
    if (usedRefs.has(etRef)) return false
    return !isComplete(r)
  }).length, [psRows, usedRefs])

  // Advancing is tracked by a "skipped/handled this session" set rather than a
  // numeric index: completing or TBC-ing a row drops it from `queue`, so an
  // index would jump over the next item. `pending[0]` is always what to show.
  const [skipped, setSkipped] = useState(() => new Set())
  const [sessionTotal] = useState(() => queue.length)
  const [localMfr,  setLocalMfr]  = useState('')
  const [localCode, setLocalCode] = useState('')
  const [localDesc, setLocalDesc] = useState('')

  const pending = useMemo(() => queue.filter(r => !skipped.has(r)), [queue, skipped])
  const ref = pending[0] || null
  const psRow = ref ? psByRef.get(ref.toLowerCase()) : null

  function advance() {
    if (!ref) return
    setSkipped(prev => new Set(prev).add(ref))
  }

  useEffect(() => {
    if (!psRow) { setLocalMfr(''); setLocalCode(''); setLocalDesc(''); return }
    setLocalMfr(psRow.Manufacturer  || psRow.manufacturer  || '')
    setLocalCode(psRow.ProductCode  || psRow.productCode   || '')
    setLocalDesc(psRow.ComponentDescription || psRow.componentDescription || '')
  }, [ref])

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
    advance()
  }

  function setNA() {
    if (!ref) return
    updatePSRow(ref, { Manufacturer: 'Ideaworks', ProductCode: 'N/A' })
    advance()
  }

  function skipAsTBC() {
    if (!ref) return
    updatePSRow(ref, { IsTBC: 'Y' })
    advance()
  }

  function togglePropertiesTBC() {
    if (!ref) return
    const on = (psRow?.IsPropertiesTBC || psRow?.isPropertiesTBC) === 'Y'
    updatePSRow(ref, { IsPropertiesTBC: on ? null : 'Y' })
  }

  const done = pending.length === 0
  const handled = Math.max(0, sessionTotal - pending.length)

  const softFlag = dbOnlyMissing > 0 ? (
    <div className="text-muted small mt-3">
      {dbOnlyMissing} element type{dbOnlyMissing === 1 ? '' : 's'} in the database still lack a spec but
      {' '}aren't used in any recipe — no action needed unless you add them.
    </div>
  ) : null

  if (queue.length === 0) {
    return (
      <div className="text-center py-4">
        <MaterialIcon name="check_circle" size={36} style={{ color: '#198754' }} />
        <div className="fw-semibold mt-2">All recipe elements have a spec!</div>
        <div className="text-muted small mt-1">Every element type used in a recipe has a manufacturer and product code, or is marked TBC.</div>
        {softFlag}
      </div>
    )
  }

  if (done) {
    return (
      <div className="text-center py-4">
        <MaterialIcon name="check_circle" size={36} style={{ color: '#198754' }} />
        <div className="fw-semibold mt-2">Done!</div>
        <div className="text-muted small mt-1">You've stepped through all {sessionTotal} incomplete specs.</div>
        {softFlag}
      </div>
    )
  }

  return (
    <>
      <ProgressBar
        now={sessionTotal > 0 ? Math.round((handled / sessionTotal) * 100) : 0}
        style={{ height: 4, marginBottom: 20 }}
        variant="success"
      />
      <div className="d-flex align-items-center gap-2 mb-3">
        <span className="fw-semibold" style={{ fontSize: 13 }}>{ref}</span>
        {etFamily && <span className="text-muted" style={{ fontSize: 11 }}>{etFamily}</span>}
        <FlagPill
          label="Properties TBC"
          value={(psRow?.IsPropertiesTBC || psRow?.isPropertiesTBC) === 'Y' ? 'Y' : null}
          onChange={togglePropertiesTBC}
          activeVariant="warning"
        />
        <span className="ms-auto text-muted" style={{ fontSize: 12 }}>{handled + 1} of {sessionTotal}</span>
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
          <Button variant="outline-secondary" size="sm" style={{ fontSize: 12 }} onClick={advance}>
            Skip
          </Button>
          <Button variant="outline-warning" size="sm" style={{ fontSize: 12 }} onClick={skipAsTBC}>
            Skip &amp; mark TBC
          </Button>
          <Button variant="primary" size="sm" style={{ fontSize: 12 }} onClick={saveCurrentAndAdvance}>
            Save &amp; Next →
          </Button>
        </div>
      </div>

      {softFlag}
    </>
  )
}

// ---------------------------------------------------------------------------
// SpecWizardModal — single step-through section
// ---------------------------------------------------------------------------

export default function SpecWizardModal({ show, onHide }) {
  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 14 }}>Fill Missing Specs</Modal.Title>
      </Modal.Header>

      <Modal.Body style={{ minHeight: 340 }}>
        {show && <StepThroughSection />}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" size="sm" onClick={onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  )
}
