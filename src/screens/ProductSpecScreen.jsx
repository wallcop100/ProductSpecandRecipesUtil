import React, { useState, useMemo, useEffect, useRef } from 'react'
import { Button, Form, Popover, Overlay } from 'react-bootstrap'
import useStore from '../store/useStore'
import ETSpecBrowser from '../components/ETSpecBrowser'
import ETSpecEditor  from '../components/ETSpecEditor'
import ChangeSummaryModal from '../components/ChangeSummaryModal'
import IconButton from '../components/IconButton'
import TutorialHint from '../tutorial/TutorialHint'
import MaterialIcon from '../components/MaterialIcon'
import { ACTION_ICONS } from '../utils/entityStyle'
import { duplicateProductKeys } from '../utils/productCodes'

/**
 * ProductSpecScreen — split-panel product spec editor.
 *
 * Props:
 *   onBack: () => void
 *   scrollToRef: string|null — auto-selects this ET on open
 */
export default function ProductSpecScreen({ onBack, scrollToRef, onOpenCodeImport }) {
  const psRows       = useStore(s => s.psRows)
  const psChanges    = useStore(s => s.psChanges)
  const recipes      = useStore(s => s.recipes)
  const updatePSRow  = useStore(s => s.updatePSRow)
  const addPSRow     = useStore(s => s.addPSRow)
  const deletePSRow  = useStore(s => s.deletePSRow)
  const elementTypes = useStore(s => s.elementTypes)
  const alignmentGaps = useStore(s => s.alignmentGaps)

  const [selectedRef,  setSelectedRef]  = useState(scrollToRef || null)
  const [bulkSelected, setBulkSelected] = useState(new Set())
  const [leftWidth,    setLeftWidth]    = useState(320)   // resizable browser panel
  const draggingRef = useRef(false)

  useEffect(() => {
    function onMove(e) {
      if (!draggingRef.current) return
      // clamp between 220 and 520 px
      setLeftWidth(Math.min(520, Math.max(220, e.clientX)))
    }
    function onUp() { draggingRef.current = false; document.body.style.cursor = '' }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])
  const [viewMode,     setViewMode]     = useState('family')
  const [statusFilters, setStatusFilters] = useState([])   // shared by header pills + browser chips
  const [fillFocus,    setFillFocus]    = useState(0)      // bump to focus the editor on 'Fill next'
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

  // ETs a recipe uses with no PS row. One definition, shared with validation and
  // the export summary (specAlignment) — this screen used to compute its own and
  // disagree with both, not least by counting deleted rows.
  const gaps = useMemo(
    () => alignmentGaps(),
    [psRows, recipes, elementTypes, alignmentGaps]
  )
  const missingPsETs = useMemo(
    () => [...gaps.specRows.wrappers, ...gaps.specRows.products].map(g => g.ref).sort(),
    [gaps]
  )

  // Completeness stats
  const stats = useMemo(() => {
    let complete = 0, partial = 0, deleted = 0
    // A product is (manufacturer, code): "PLASTER IN KIT" from Orluna and from Phos
    // are two products, not a duplicate. See productCodes.duplicateProductKeys.
    const dupSet = duplicateProductKeys(psRows)
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

  // Pending-change count for the header chip; the review surface itself is
  // the shared Change Summary modal (T-Q1 — supersedes the old drawer).
  const changeCount = psChanges.length

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

  function toggleStatus(f) {
    setStatusFilters(p => (p.includes(f) ? p.filter(x => x !== f) : [...p, f]))
  }

  // The incomplete queue: recipe-used ElementTypes whose spec still needs a manufacturer
  // and code (not TBC, not deleted). The old 'Fill Missing' wizard's queue, inline now.
  const incompleteRefs = useMemo(() => {
    const used = new Set()
    for (const r of recipes) {
      if ((r.IsDeleted || r.isDeleted) === 'Y') continue
      const ref = (r.ElementTypeRef || r.elementTypeRef || '').trim()
      if (ref) used.add(ref)
    }
    const byRef = new Map()
    for (const r of psRows) {
      const k = (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase()
      if (k && !byRef.has(k)) byRef.set(k, r)
    }
    const has = v => String(v ?? '').trim() !== ''
    return [...used]
      .filter(ref => {
        const ps = byRef.get(ref.toLowerCase())
        if (ps && ((ps.IsDeleted || ps.isDeleted) === 'Y' || (ps.IsTBC || ps.isTBC) === 'Y')) return false
        return !(ps && has(ps.Manufacturer || ps.manufacturer) && has(ps.ProductCode || ps.productCode))
      })
      .sort((a, b) => a.localeCompare(b))
  }, [recipes, psRows])

  // Jump to the next incomplete ET after the current selection (wrapping), and tell the
  // editor to focus the first empty field. Replaces the separate step-through modal.
  function fillNext() {
    if (incompleteRefs.length === 0) return
    const cur = (selectedRef || '').toLowerCase()
    const at = incompleteRefs.findIndex(r => r.toLowerCase() === cur)
    const next = incompleteRefs[(at + 1) % incompleteRefs.length]
    setSelectedRef(next)
    setFillFocus(n => n + 1)
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
      if (ref) deletePSRow(ref.ElementTypeRef || ref.elementTypeRef)
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }} data-debug-id="ProductSpecScreen">
      {/* Header */}
      <div
        className="d-flex align-items-center gap-2 px-3 py-2 border-bottom bg-white"
        style={{ flexShrink: 0 }}
      >
        <IconButton variant="outline-secondary" bsSize="sm" icon={ACTION_ICONS.back}
          title="Back to builder" onClick={onBack} />
        <span className="fw-semibold ms-1">Product Spec</span>
        <TutorialHint id="product-spec" />
        {onOpenCodeImport && (
          <Button variant="outline-primary" size="sm" className="d-inline-flex align-items-center gap-1 ms-2"
            style={{ fontSize: 11 }} onClick={onOpenCodeImport}
            title="Import product codes from a spreadsheet and split them into distinct codes">
            <MaterialIcon name="auto_fix_high" size={14} /> Import product codes
          </Button>
        )}

        {/* Completeness bar */}
        <div className="d-flex align-items-center gap-2 ms-3" style={{ flexShrink: 0 }}>
          <div style={{ width: 120, height: 6, borderRadius: 3, background: '#e9ecef', overflow: 'hidden' }}>
            <div style={{ width: `${pctComplete}%`, height: '100%', background: '#22c55e', transition: 'width 0.3s' }} />
          </div>
          <span style={{ fontSize: 11, color: '#6c757d', whiteSpace: 'nowrap' }}>
            {stats.complete} / {total - stats.deleted} complete
          </span>
          {/* Bigger, discoverable status pills */}
          {stats.missing > 0 && (
            <StatPill color="#ef4444" bg="#fdecec" icon={ACTION_ICONS.missing}
              count={stats.missing} label="Missing spec"
              hint="ElementTypes referenced in recipes with no Product Spec row"
              active={statusFilters.includes('Missing')} onClick={() => toggleStatus('Missing')} />
          )}
          {stats.partial > 0 && (
            <StatPill color="#b45309" bg="#fff4e5" icon={ACTION_ICONS.partial}
              count={stats.partial} label="Partial / TBC"
              hint="Rows missing a manufacturer or product code, or marked TBC"
              active={statusFilters.includes('Partial/TBC')} onClick={() => toggleStatus('Partial/TBC')} />
          )}
          {stats.duplicates > 0 && (
            <StatPill color="#dc3545" bg="#fdecec" icon="warning"
              count={stats.duplicates} label="Duplicate codes"
              hint="Product codes shared by more than one ElementType"
              active={statusFilters.includes('Duplicate')} onClick={() => toggleStatus('Duplicate')} />
          )}
        </div>

        <div className="flex-grow-1" />

        {/* Pending-changes chip → Change Summary review (T-Q1) */}
        {changeCount > 0 && (
          <button
            className={`btn btn-sm ${showChangelog ? 'btn-primary' : 'btn-outline-primary'}`}
            style={{ fontSize: 11, padding: '2px 8px' }}
            onClick={() => setShowChangelog(v => !v)}
          >
            {changeCount} change{changeCount !== 1 ? 's' : ''}
          </button>
        )}

        {/* Step through the incomplete specs, inline in this editor — no separate modal. */}
        {incompleteRefs.length > 0 && (
          <Button
            variant="outline-success" size="sm"
            className="d-inline-flex align-items-center gap-1"
            style={{ fontSize: 11, padding: '2px 10px', whiteSpace: 'nowrap' }}
            title="Jump to the next ElementType whose spec still needs a manufacturer and code"
            onClick={fillNext}
          >
            <MaterialIcon name="edit" size={13} /> Fill next ({incompleteRefs.length})
          </Button>
        )}
      </div>

      {/* Change review — the shared per-entity summary (read-only here) */}
      <ChangeSummaryModal
        show={showChangelog}
        onHide={() => setShowChangelog(false)}
      />

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
            Mark IsDeleted
          </Button>
          <button className="btn btn-link btn-sm p-0 ms-auto" style={{ fontSize: 11, color: '#6c757d' }} onClick={clearBulk}>
            Clear
          </button>
        </div>
      )}

      {/* Split panel */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: browser (user-resizable) */}
        <div style={{ width: leftWidth, flexShrink: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
            statusFilters={statusFilters}
            onToggleStatus={toggleStatus}
          />
        </div>

        {/* Draggable splitter */}
        <div
          onMouseDown={() => { draggingRef.current = true; document.body.style.cursor = 'col-resize' }}
          title="Drag to resize"
          style={{
            width: 5, flexShrink: 0, cursor: 'col-resize',
            background: '#dee2e6', borderLeft: '1px solid #cfd4da', borderRight: '1px solid #cfd4da',
          }}
        />

        {/* Right: editor */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <ETSpecEditor
            selectedRef={selectedRef}
            etUsedIn={etUsedIn}
            missingETs={missingPsETs}
            onNavigate={handleNavigate}
            focusToken={fillFocus}
          />
        </div>
      </div>

    </div>
  )
}

// A status count that is also a filter toggle. Clicking narrows the list to that
// state; a hover popover explains it. `active` shows it pressed.
function StatPill({ color, bg, icon, count, label, hint, active, onClick }) {
  const [show, setShow] = useState(false)
  const ref = useRef(null)
  return (
    <>
      <button
        type="button"
        ref={ref}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={onClick}
        title={onClick ? `Filter to ${label.toLowerCase()}` : undefined}
        aria-pressed={!!active}
        aria-label={label}
        className="d-inline-flex align-items-center gap-1 border-0"
        style={{
          fontSize: 12, fontWeight: 600,
          color: active ? '#fff' : color, background: active ? color : bg,
          border: `1px solid ${color}${active ? '' : '33'}`, borderRadius: 12, padding: '2px 9px',
          cursor: onClick ? 'pointer' : 'default', whiteSpace: 'nowrap',
        }}
      >
        <MaterialIcon name={icon} size={15} /> {count}
      </button>
      <Overlay target={ref.current} show={show} placement="bottom">
        <Popover style={{ maxWidth: 260 }}>
          <Popover.Body className="py-2 px-2" style={{ fontSize: 12 }}>
            <div className="fw-semibold" style={{ color }}>{label}: {count}</div>
            <div className="text-muted" style={{ fontSize: 11 }}>{hint}</div>
          </Popover.Body>
        </Popover>
      </Overlay>
    </>
  )
}
