import React, { useState, useMemo, useEffect, useRef } from 'react'
import { Button, Form, Popover, Overlay } from 'react-bootstrap'
import useStore from '../store/useStore'
import ETSpecBrowser from '../components/ETSpecBrowser'
import ETSpecEditor  from '../components/ETSpecEditor'
import SpecWizardModal from '../components/SpecWizardModal'

/**
 * ProductSpecScreen — split-panel product spec editor.
 *
 * Props:
 *   onBack: () => void
 *   scrollToRef: string|null — auto-selects this ET on open
 */
export default function ProductSpecScreen({ onBack, scrollToRef }) {
  const psRows       = useStore(s => s.psRows)
  const psChanges    = useStore(s => s.psChanges)
  const recipes      = useStore(s => s.recipes)
  const updatePSRow  = useStore(s => s.updatePSRow)
  const addPSRow     = useStore(s => s.addPSRow)

  const [selectedRef,  setSelectedRef]  = useState(scrollToRef || null)
  const [bulkSelected, setBulkSelected] = useState(new Set())
  const [viewMode,     setViewMode]     = useState('family')
  const [showWizard,   setShowWizard]   = useState(false)
  const [showChangelog, setShowChangelog] = useState(false)

  // Bulk manufacturer popover state
  const [showBulkMfr, setShowBulkMfr]   = useState(false)
  const [bulkMfrInput, setBulkMfrInput]  = useState('')
  const bulkMfrBtnRef = useRef(null)

  // Sync selectedRef when scrollToRef prop changes (e.g. opening from "Add to spec" link)
  useEffect(() => { if (scrollToRef) setSelectedRef(scrollToRef) }, [scrollToRef])

  // Usage map: ET ref (lower) → { positions: Set, elements: Set }
  const etUsedIn = useMemo(() => {
    const map = {}
    for (const row of recipes) {
      const etRef      = row.ElementTypeRef || row.elementTypeRef
      const ctxType    = row.ContextType    || row.contextType
      const ctxRef     = row.ContextRef     || row.contextRef
      if (!etRef || !ctxRef) continue
      const key = etRef.toLowerCase()
      if (!map[key]) map[key] = { positions: new Set(), elements: new Set() }
      if (ctxType === 'PositionType') map[key].positions.add(ctxRef)
      else if (ctxType === 'ElementType') map[key].elements.add(ctxRef)
    }
    return map
  }, [recipes])

  // ETs in recipes with no PS row
  const missingPsETs = useMemo(() => {
    const psRefSet = new Set(
      psRows.map(r => (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase())
    )
    const missing = new Set()
    for (const row of recipes) {
      const etRef = row.ElementTypeRef || row.elementTypeRef
      if (etRef && !psRefSet.has(etRef.toLowerCase())) missing.add(etRef)
    }
    return [...missing].sort()
  }, [psRows, recipes])

  // Completeness stats
  const stats = useMemo(() => {
    let complete = 0, partial = 0, deleted = 0
    const dupCodes = new Map()
    for (const r of psRows) {
      const code = (r.ProductCode || r.productCode || '').trim().toUpperCase()
      if (code && code !== 'N/A') dupCodes.set(code, (dupCodes.get(code) || 0) + 1)
    }
    const dupSet = new Set([...dupCodes.entries()].filter(([, v]) => v > 1).map(([k]) => k))
    for (const r of psRows) {
      if ((r.IsDeleted || r.isDeleted) === 'Y') { deleted++; continue }
      const tbc  = (r.IsTBC || r.isTBC) === 'Y'
      const code = (r.ProductCode || r.productCode || '').trim()
      const mfr  = (r.Manufacturer || r.manufacturer || '').trim()
      if (code && mfr && !tbc) complete++
      else partial++
    }
    return { complete, partial, missing: missingPsETs.length, deleted, duplicates: dupSet.size }
  }, [psRows, missingPsETs])

  // Change log: deduplicate by etRef+field, keep first before / last after
  const changelog = useMemo(() => {
    const byKey = new Map()
    for (const change of psChanges) {
      const etRef   = change.elementTypeRef
      const before  = change.before || {}
      const updates = change.updates || {}
      for (const [field, after] of Object.entries(updates)) {
        const key = `${etRef}::${field}`
        if (!byKey.has(key)) {
          byKey.set(key, { etRef, field, before: before[field] ?? null, after })
        } else {
          byKey.get(key).after = after
        }
      }
    }
    // Only entries where before !== after
    return [...byKey.values()].filter(c => String(c.before ?? '') !== String(c.after ?? ''))
  }, [psChanges])

  // Navigate prev/next in the filtered list (ETSpecBrowser handles filtering;
  // we expose navigation via the selected ref directly here using the full psRows list
  // as a fallback — ETSpecBrowser ↑/↓ keys are the primary keyboard nav)
  function handleNavigate(direction) {
    const allRefs = psRows
      .filter(r => (r.IsDeleted || r.isDeleted) !== 'Y')
      .map(r => r.ElementTypeRef || r.elementTypeRef)
      .sort()
    const idx = allRefs.findIndex(r => r.toLowerCase() === (selectedRef || '').toLowerCase())
    if (direction === 'prev' && idx > 0) setSelectedRef(allRefs[idx - 1])
    if (direction === 'next' && idx < allRefs.length - 1) setSelectedRef(allRefs[idx + 1])
  }

  // Bulk helpers
  function handleBulkToggle(key) {
    setBulkSelected(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  function handleSelectAll(refs) {
    setBulkSelected(prev => {
      const next = new Set(prev)
      refs.forEach(r => next.add(r.toLowerCase()))
      return next
    })
  }
  function clearBulk() { setBulkSelected(new Set()) }

  function bulkSetNA() {
    for (const key of bulkSelected) {
      const ref = psRows.find(r => (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() === key)
      if (ref) {
        updatePSRow(ref.ElementTypeRef || ref.elementTypeRef, { Manufacturer: 'Ideaworks', ProductCode: 'N/A' })
      } else {
        // Missing ET — create it
        addPSRow(
          [...missingPsETs].find(r => r.toLowerCase() === key) || key,
          { Manufacturer: 'Ideaworks', ProductCode: 'N/A' }
        )
      }
    }
    clearBulk()
  }

  function bulkSetManufacturer(mfr) {
    const trimmed = mfr.trim()
    if (!trimmed) return
    for (const key of bulkSelected) {
      const ref = psRows.find(r => (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() === key)
      if (ref) updatePSRow(ref.ElementTypeRef || ref.elementTypeRef, { Manufacturer: trimmed })
    }
    clearBulk()
    setShowBulkMfr(false)
    setBulkMfrInput('')
  }

  function bulkDelete() {
    for (const key of bulkSelected) {
      const ref = psRows.find(r => (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() === key)
      if (ref) updatePSRow(ref.ElementTypeRef || ref.elementTypeRef, { IsDeleted: 'Y' })
    }
    clearBulk()
  }

  const mfrOptions = useMemo(() => {
    const set = new Set()
    for (const r of psRows) {
      const m = r.Manufacturer || r.manufacturer
      if (m && m.trim()) set.add(m.trim())
    }
    return [...set].sort()
  }, [psRows])

  const total = stats.complete + stats.partial + stats.missing + stats.deleted
  const pctComplete = total > 0 ? Math.round((stats.complete / total) * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Header */}
      <div
        className="d-flex align-items-center gap-2 px-3 py-2 border-bottom bg-white"
        style={{ flexShrink: 0 }}
      >
        <Button variant="outline-secondary" size="sm" onClick={onBack}>
          ← Back
        </Button>
        <span className="fw-semibold ms-1">Product Spec</span>

        {/* Completeness bar */}
        <div className="d-flex align-items-center gap-2 ms-3" style={{ flexShrink: 0 }}>
          <div style={{ width: 120, height: 6, borderRadius: 3, background: '#e9ecef', overflow: 'hidden' }}>
            <div style={{ width: `${pctComplete}%`, height: '100%', background: '#22c55e', transition: 'width 0.3s' }} />
          </div>
          <span style={{ fontSize: 11, color: '#6c757d', whiteSpace: 'nowrap' }}>
            {stats.complete} / {total - stats.deleted} complete
          </span>
          <span style={{ fontSize: 10, color: '#ef4444' }} title="Missing spec">● {stats.missing}</span>
          <span style={{ fontSize: 10, color: '#f59e0b' }} title="Partial/TBC">● {stats.partial}</span>
          {stats.duplicates > 0 && (
            <span style={{ fontSize: 10, color: '#dc3545' }} title="Duplicate product codes">⚠ {stats.duplicates} dup</span>
          )}
        </div>

        <div className="flex-grow-1" />

        {/* Change log chip */}
        {changelog.length > 0 && (
          <button
            className={`btn btn-sm ${showChangelog ? 'btn-primary' : 'btn-outline-primary'}`}
            style={{ fontSize: 11, padding: '2px 8px' }}
            onClick={() => setShowChangelog(v => !v)}
          >
            {changelog.length} change{changelog.length !== 1 ? 's' : ''}
          </button>
        )}

        {/* Quick-fill wizard */}
        <Button
          variant="outline-success" size="sm"
          style={{ fontSize: 11, padding: '2px 8px', whiteSpace: 'nowrap' }}
          onClick={() => setShowWizard(true)}
        >
          Fill Missing
        </Button>
      </div>

      {/* Change log drawer */}
      {showChangelog && changelog.length > 0 && (
        <div
          className="border-bottom px-3 py-2"
          style={{ background: '#f8f9fa', flexShrink: 0, maxHeight: 200, overflowY: 'auto', fontSize: 12 }}
        >
          <div className="fw-semibold mb-1" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6c757d' }}>
            Unsaved changes
          </div>
          {changelog.map((c, i) => (
            <div key={i} className="d-flex align-items-baseline gap-2 mb-1" style={{ fontSize: 11 }}>
              <span className="text-muted" style={{ fontSize: 10, minWidth: 100, flexShrink: 0 }}>{c.field}</span>
              <button
                className="btn btn-link btn-sm p-0"
                style={{ fontSize: 11, textDecoration: 'none', fontWeight: 500 }}
                onClick={() => setSelectedRef(c.etRef)}
              >
                {c.etRef}
              </button>
              <span className="text-muted">
                {String(c.before ?? '—')} → <strong>{String(c.after ?? '—')}</strong>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Bulk action bar */}
      {bulkSelected.size > 0 && (
        <div
          className="d-flex align-items-center gap-2 px-3 py-1 border-bottom"
          style={{ background: '#e8f0fe', flexShrink: 0, fontSize: 12 }}
        >
          <span className="fw-semibold">{bulkSelected.size} selected</span>
          <Button variant="outline-secondary" size="sm" style={{ fontSize: 11 }} onClick={bulkSetNA}>
            Set N/A
          </Button>

          <span ref={bulkMfrBtnRef}>
            <Button
              variant="outline-secondary" size="sm" style={{ fontSize: 11 }}
              onClick={() => setShowBulkMfr(v => !v)}
            >
              Set Manufacturer…
            </Button>
          </span>
          <Overlay
            target={bulkMfrBtnRef.current}
            show={showBulkMfr}
            placement="bottom-start"
            rootClose
            onHide={() => setShowBulkMfr(false)}
          >
            <Popover style={{ minWidth: 240 }}>
              <Popover.Body className="p-2">
                <Form.Control
                  size="sm" list="bulk-mfr-list"
                  placeholder="Manufacturer…"
                  value={bulkMfrInput}
                  onChange={e => setBulkMfrInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') bulkSetManufacturer(bulkMfrInput) }}
                  autoFocus
                  style={{ fontSize: 12 }}
                />
                <datalist id="bulk-mfr-list">
                  {mfrOptions.map(m => <option key={m} value={m} />)}
                </datalist>
                <Button
                  variant="primary" size="sm" className="w-100 mt-2" style={{ fontSize: 12 }}
                  onClick={() => bulkSetManufacturer(bulkMfrInput)}
                >Apply</Button>
              </Popover.Body>
            </Popover>
          </Overlay>

          <Button variant="outline-danger" size="sm" style={{ fontSize: 11 }} onClick={bulkDelete}>
            Delete
          </Button>
          <button className="btn btn-link btn-sm p-0 ms-auto" style={{ fontSize: 11, color: '#6c757d' }} onClick={clearBulk}>
            Clear
          </button>
        </div>
      )}

      {/* Split panel */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: browser */}
        <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid #dee2e6', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <ETSpecBrowser
            selectedRef={selectedRef}
            onSelect={setSelectedRef}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            bulkSelected={bulkSelected}
            onBulkToggle={handleBulkToggle}
            onSelectAll={handleSelectAll}
            etUsedIn={etUsedIn}
            missingETs={missingPsETs}
          />
        </div>

        {/* Right: editor */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <ETSpecEditor
            selectedRef={selectedRef}
            etUsedIn={etUsedIn}
            missingETs={missingPsETs}
            onNavigate={handleNavigate}
          />
        </div>
      </div>

      {/* Quick-fill wizard modal */}
      <SpecWizardModal show={showWizard} onHide={() => setShowWizard(false)} />
    </div>
  )
}
