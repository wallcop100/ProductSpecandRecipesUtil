import React, { useState, useMemo, useEffect } from 'react'
import { Modal, Button, Form, ButtonGroup } from 'react-bootstrap'
import {
  DndContext, PointerSensor, useSensor, useSensors, closestCenter,
} from '@dnd-kit/core'
import useStore, { getRecipeForPosition } from '../store/useStore'
import RecipeSection from './RecipeSection'
import PositionRecipeEditor from './PositionRecipeEditor'
import IconButton from './IconButton'
import MaterialIcon from './MaterialIcon'
import EntityPill from './EntityPill'
import { familyOf } from '../utils/etRef'
import { positionFamilyOf } from '../utils/positionFamily'
import { ACTION_ICONS } from '../utils/entityStyle'

const EMPTY_FILTERS = { family: '', manufacturer: '', tag: '', containsET: '' }

/**
 * ReviewModal — build a filtered set of recipes and cycle through them one at a
 * time. The unit (positions or element types) is chosen per run; filters combine
 * with AND. This reviews RECIPES (not the product spec).
 *
 * initialRefs: PositionTypeRefs to jump straight into cycling, skipping the
 * filter-build step — e.g. "review what the product-code import just prefilled".
 */
export default function ReviewModal({ show, onHide, onOpenProductSpec, onAddEntity, onReplaceInReview, initialRefs }) {
  const positionTypes = useStore(s => s.positionTypes)
  const recipes       = useStore(s => s.recipes)
  const psRows        = useStore(s => s.psRows)
  const elementTypes  = useStore(s => s.elementTypes)
  const positionUI    = useStore(s => s.positionUI)
  const tagPalette    = useStore(s => s.tagPalette)
  const reorderIngredients = useStore(s => s.reorderIngredients)
  const moveIngredientAcrossSections = useStore(s => s.moveIngredientAcrossSections)

  const [unit, setUnit]       = useState('position')  // 'position' | 'element'
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [phase, setPhase]     = useState('build')      // 'build' | 'cycle'
  const [index, setIndex]     = useState(0)
  // Once the user opens the filter builder, initialRefs stops driving matches —
  // otherwise "Edit filters" from an initialRefs cycle could never escape it.
  const [useInitialRefs, setUseInitialRefs] = useState(false)

  useEffect(() => {
    if (!show) return
    setIndex(0)
    if (initialRefs && initialRefs.length > 0) { setUnit('position'); setPhase('cycle'); setUseInitialRefs(true) }
    else { setPhase('build'); setUseInitialRefs(false) }
  }, [show, initialRefs])
  // Changing the unit invalidates the criteria (families/manufacturers differ)
  useEffect(() => { setFilters(EMPTY_FILTERS) }, [unit])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const psByRef = useMemo(() => {
    const m = new Map()
    for (const r of psRows) {
      const ref = (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase()
      if (ref && !m.has(ref)) m.set(ref, r)
    }
    return m
  }, [psRows])

  const liveRows = useMemo(
    () => recipes.filter(r => (r.IsDeleted || r.isDeleted) !== 'Y'),
    [recipes]
  )

  // Known ET refs (for the family/manufacturer/element universe)
  const allETRefs = useMemo(() => {
    const m = new Map()  // lower → display ref
    const add = ref => { const k = (ref || '').toLowerCase(); if (k && !m.has(k)) m.set(k, ref) }
    for (const e of elementTypes) add(e.ElementTypeRef || e.elementTypeRef)
    for (const r of psRows) add(r.ElementTypeRef || r.elementTypeRef)
    for (const r of liveRows) add(r.ElementTypeRef || r.elementTypeRef)
    return [...m.values()]
  }, [elementTypes, psRows, liveRows])

  const etObjByRef = useMemo(() => {
    const m = new Map()
    for (const e of elementTypes) {
      const k = (e.ElementTypeRef || e.elementTypeRef || '').toLowerCase()
      if (k) m.set(k, e)
    }
    return m
  }, [elementTypes])

  const mfrOf = ref => {
    const ps = psByRef.get((ref || '').toLowerCase())
    return (ps?.Manufacturer || ps?.manufacturer || '').trim()
  }

  // Tags per ET ref (via the positions that use it) — for the element unit
  const tagsByET = useMemo(() => {
    const m = new Map()
    for (const r of liveRows) {
      const k = (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase()
      if (!k) continue
      const posRef = r.PositionTypeRef || r.positionTypeRef
      const tags = positionUI[posRef]?.tags || []
      if (!m.has(k)) m.set(k, new Set())
      for (const t of tags) m.get(k).add(t)
    }
    return m
  }, [liveRows, positionUI])

  // -------- option lists (depend on unit) --------
  const familyOptions = useMemo(() => {
    const s = new Set()
    if (unit === 'position') {
      for (const pt of positionTypes) { const f = positionFamilyOf(pt); if (f) s.add(f) }
    } else {
      for (const ref of allETRefs) { const f = familyOf(ref, etObjByRef.get(ref.toLowerCase())); if (f) s.add(f) }
    }
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [unit, positionTypes, allETRefs, etObjByRef])

  const mfrOptions = useMemo(() => {
    const s = new Set()
    for (const r of psRows) { const mf = (r.Manufacturer || r.manufacturer || '').trim(); if (mf) s.add(mf) }
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [psRows])

  const tagOptions = useMemo(() => {
    const s = new Set(tagPalette || [])
    for (const ui of Object.values(positionUI)) for (const t of (ui?.tags || [])) s.add(t)
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [tagPalette, positionUI])

  // -------- matching --------
  const rowsForPos = useMemo(() => {
    const m = new Map()
    for (const r of liveRows) {
      const ref = r.PositionTypeRef || r.positionTypeRef
      if (!m.has(ref)) m.set(ref, [])
      m.get(ref).push(r)
    }
    return m
  }, [liveRows])

  const matches = useMemo(() => {
    if (useInitialRefs && initialRefs && initialRefs.length > 0) {
      return initialRefs.map(ref => {
        const pt = positionTypes.find(p => p.PositionTypeRef === ref)
        return { kind: 'position', ref, name: pt?.Name || pt?.PositionName || null }
      })
    }
    const f = filters
    if (unit === 'position') {
      return positionTypes.filter(pt => {
        const ref = pt.PositionTypeRef
        if (f.family && positionFamilyOf(pt) !== f.family) return false
        if (f.tag && !((positionUI[ref]?.tags) || []).includes(f.tag)) return false
        const rows = rowsForPos.get(ref) || []
        if (f.containsET && !rows.some(r => (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() === f.containsET.toLowerCase())) return false
        if (f.manufacturer && !rows.some(r => mfrOf(r.ElementTypeRef || r.elementTypeRef) === f.manufacturer)) return false
        return true
      }).map(pt => ({ kind: 'position', ref: pt.PositionTypeRef, name: pt.Name || pt.PositionName || null }))
    }
    // element unit
    return allETRefs.filter(ref => {
      const low = ref.toLowerCase()
      if (f.family && familyOf(ref, etObjByRef.get(low)) !== f.family) return false
      if (f.manufacturer && mfrOf(ref) !== f.manufacturer) return false
      if (f.tag && !(tagsByET.get(low)?.has(f.tag))) return false
      if (f.containsET) {
        const internal = liveRows.some(r =>
          (r.ContextType || r.contextType) === 'ElementType' &&
          (r.ContextRef || r.contextRef) === ref &&
          (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() === f.containsET.toLowerCase()
        )
        if (!internal) return false
      }
      return true
    }).map(ref => ({ kind: 'element', ref, name: psByRef.get(ref.toLowerCase())?.ComponentDescription || null }))
  }, [unit, filters, positionTypes, positionUI, rowsForPos, allETRefs, etObjByRef, tagsByET, liveRows, psByRef, initialRefs, useInitialRefs])

  const current = matches[index] || null

  // Recipe rows for the current match
  const grouped = useMemo(() => {
    if (!current || current.kind !== 'position') return null
    return getRecipeForPosition(recipes, current.ref)
  }, [current, recipes])

  const etGrouped = useMemo(() => {
    if (!current || current.kind !== 'element') return null
    const rows = liveRows.filter(r =>
      (r.ContextType || r.contextType) === 'ElementType' && (r.ContextRef || r.contextRef) === current.ref
    )
    const firstPos = rows[0]?.PositionTypeRef ?? rows[0]?.positionTypeRef
    const posRows = firstPos ? rows.filter(r => (r.PositionTypeRef || r.positionTypeRef) === firstPos) : []
    posRows.sort((a, b) => (a.RecipeIndex ?? a.recipeIndex ?? 0) - (b.RecipeIndex ?? b.recipeIndex ?? 0))
    return { posRef: firstPos, rows: posRows }
  }, [current, liveRows])

  // PositionTypes that use the current container ET as their internal recipe —
  // editing here applies to all of them, so warn when there's more than one.
  const etUsedIn = useMemo(() => {
    if (!current || current.kind !== 'element') return []
    const s = new Set()
    for (const r of liveRows) {
      if ((r.ContextType || r.contextType) === 'ElementType' && (r.ContextRef || r.contextRef) === current.ref) {
        const p = r.PositionTypeRef || r.positionTypeRef
        if (p) s.add(p)
      }
    }
    return [...s]
  }, [current, liveRows])

  function filterRows(rows) {
    return (rows || []).filter(r => (r.IsDeleted || r.isDeleted) !== 'Y')
  }

  // DnD so the embedded RecipeSection stays functional (reorder / cross-section)
  function handleDragEnd({ active, over }) {
    if (!over || !current || current.kind !== 'position') return
    const a = active.data.current || {}
    const o = over.data.current || {}
    if (a.type !== 'recipe-row' || a.posRef !== current.ref) return
    const g = getRecipeForPosition(recipes, current.ref)
    if (o.type === 'recipe-row' && o.posRef === current.ref && a.section === o.section) {
      const rows = filterRows(a.section === 'position' ? g.position : a.section === 'dl_internal' ? g.dlInternal : g.linInternal)
      const oldIdx = rows.findIndex(r => r._id === active.id)
      const newIdx = rows.findIndex(r => r._id === over.id)
      if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) reorderIngredients(current.ref, a.section, oldIdx, newIdx)
    } else if (o.section && o.posRef === current.ref && a.section !== o.section) {
      moveIngredientAcrossSections(current.ref, active.id, o.section)
    }
  }

  const activeFilterChips = Object.entries(filters).filter(([, v]) => v)
  const FILTER_LABEL = { family: 'Family', manufacturer: 'Mfr', tag: 'Tag', containsET: 'Contains' }

  function setFilter(key, val) { setFilters(prev => ({ ...prev, [key]: val })) }

  return (
    <Modal show={show} onHide={onHide} size="xl" centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 14 }} className="d-flex align-items-center gap-2">
          <MaterialIcon name={ACTION_ICONS.review} size={18} /> Review recipes
        </Modal.Title>
      </Modal.Header>

      <Modal.Body style={{ minHeight: 420 }}>
        {phase === 'build' ? (
          <>
            {/* Big, unmistakable filter header (matches the Add-Anywhere first page) */}
            <div className="text-center mb-4 pb-3 border-bottom">
              <div className="d-inline-flex align-items-center justify-content-center mb-2"
                style={{ width: 64, height: 64, borderRadius: '50%', background: '#e8f0fe' }}>
                <MaterialIcon name="filter_alt" size={38} style={{ color: '#0d6efd' }} />
              </div>
              <h5 className="mb-1" style={{ fontSize: 16, fontWeight: 600 }}>What do you want to review?</h5>
              <p className="text-muted mb-0" style={{ fontSize: 12, maxWidth: 440, margin: '0 auto' }}>
                Pick PositionTypes or ElementTypes and narrow with the filters below —
                or leave them blank to step through <strong>everything</strong>.
              </p>
            </div>

            <div className="d-flex justify-content-center align-items-center gap-2 mb-3">
              <span className="text-muted small">Step through</span>
              <ButtonGroup size="sm">
                <Button variant={unit === 'position' ? 'primary' : 'outline-secondary'} style={{ fontSize: 12 }}
                  onClick={() => setUnit('position')}>PositionTypes</Button>
                <Button variant={unit === 'element' ? 'primary' : 'outline-secondary'} style={{ fontSize: 12 }}
                  onClick={() => setUnit('element')}>ElementTypes</Button>
              </ButtonGroup>
            </div>

            <div className="row g-2">
              <FilterSelect col label="Family" icon="account_tree" value={filters.family}
                onChange={v => setFilter('family', v)} options={familyOptions} />
              <FilterSelect col label="Manufacturer" icon="factory" value={filters.manufacturer}
                onChange={v => setFilter('manufacturer', v)} options={mfrOptions} />
              <FilterSelect col label="Tag" icon={ACTION_ICONS.tags} value={filters.tag}
                onChange={v => setFilter('tag', v)} options={tagOptions} />
              <div className="col-6">
                <label className="text-muted d-flex align-items-center gap-1" style={{ fontSize: 11 }}>
                  <MaterialIcon name="widgets" size={13} /> Contains element type
                </label>
                <Form.Control size="sm" list="review-et-list" value={filters.containsET}
                  placeholder="ET ref…" onChange={e => setFilter('containsET', e.target.value)} style={{ fontSize: 12 }} />
                <datalist id="review-et-list">
                  {allETRefs.map(r => <option key={r} value={r} />)}
                </datalist>
              </div>
            </div>

            <div className="d-flex align-items-center gap-2 mt-4">
              <Button variant="link" size="sm" style={{ fontSize: 12 }} onClick={() => setFilters(EMPTY_FILTERS)}>Clear</Button>
              <div className="ms-auto text-muted small">{matches.length} match{matches.length === 1 ? '' : 'es'}</div>
              <Button variant="primary" size="sm" disabled={matches.length === 0}
                onClick={() => { setIndex(0); setPhase('cycle') }}>
                Start review →
              </Button>
            </div>
            {activeFilterChips.length === 0 && (
              <div className="text-muted small mt-3">No filters set — every {unit === 'position' ? 'PositionType' : 'ElementType'} matches.</div>
            )}
          </>
        ) : (
          <>
            {/* Cycle header */}
            <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
              <IconButton variant="outline-secondary" bsSize="sm" icon="tune" title="Edit filters"
                onClick={() => { setUseInitialRefs(false); setPhase('build') }} />
              {useInitialRefs && (
                <span className="badge" style={{ fontSize: 11, background: '#e7f1ff', color: '#084298' }}>
                  Prefilled from product-code import
                </span>
              )}
              {activeFilterChips.map(([k, v]) => (
                <span key={k} className="badge bg-light text-dark border" style={{ fontSize: 11 }}>
                  {FILTER_LABEL[k]}: {v}
                </span>
              ))}
              <div className="ms-auto d-flex align-items-center gap-2">
                <span className="text-muted small">{index + 1} of {matches.length}</span>
                <IconButton variant="outline-secondary" bsSize="sm" icon="chevron_left" title="Previous"
                  disabled={index <= 0} onClick={() => setIndex(i => Math.max(0, i - 1))} />
                <IconButton variant="outline-secondary" bsSize="sm" icon="chevron_right" title="Next"
                  disabled={index >= matches.length - 1} onClick={() => setIndex(i => Math.min(matches.length - 1, i + 1))} />
              </div>
            </div>

            {/* Element unit keeps its own pill header; the position unit gets its
                header from the shared PositionRecipeEditor below. */}
            {current && current.kind === 'element' && (
              <div className="d-flex align-items-center gap-2 mb-3 px-2 py-1 rounded" style={{ background: '#f8f9fa' }}>
                <EntityPill
                  type="ElementType"
                  label={current.ref}
                  sublabel={familyOf(current.ref, etObjByRef.get(current.ref.toLowerCase()))}
                  stack
                />
                {current.name && <span className="text-muted small">{current.name}</span>}
              </div>
            )}

            {/* Current match recipe (live-editable) */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              {current?.kind === 'position' && grouped && (
                <PositionRecipeEditor
                  embedded
                  showInternals
                  posRef={current.ref}
                  name={current.name}
                  tags={positionUI[current.ref]?.tags || []}
                  count={(rowsForPos.get(current.ref) || []).length}
                  onOpenProductSpec={onOpenProductSpec}
                  onAddRow={() => onAddEntity && onAddEntity({ mode: 'existing', unit, filters })}
                  onNewET={() => onAddEntity && onAddEntity({ mode: 'new', unit, filters })}
                  onReplace={(posRef, rowId, opts) => onReplaceInReview && onReplaceInReview(posRef, rowId, opts)}
                />
              )}
              {current?.kind === 'element' && etGrouped && (
                <>
                  {etUsedIn.length > 1 && (
                    <div className="d-flex align-items-start gap-2 mb-2 px-2 py-1 rounded"
                      style={{ background: '#fff3cd', border: '1px solid #ffc107', fontSize: 11 }}>
                      <MaterialIcon name="warning" size={14} style={{ color: '#856404', flexShrink: 0, marginTop: 1 }} />
                      <span style={{ color: '#856404' }}>
                        Shared assembly — edits here apply to all {etUsedIn.length} PositionTypes that use{' '}
                        <span style={{ fontFamily: 'monospace' }}>{current.ref}</span>: {etUsedIn.join(', ')}
                      </span>
                    </div>
                  )}
                  {etGrouped.rows.length > 0 ? (
                    <RecipeSection title={current.ref} sectionKey="position"
                      rows={filterRows(etGrouped.rows)} posRef={etGrouped.posRef} onOpenProductSpec={onOpenProductSpec} disableSorting />
                  ) : (
                    <div className="text-muted small fst-italic py-3">This ElementType has no internal recipe.</div>
                  )}
                </>
              )}
            </DndContext>
          </>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" size="sm" onClick={onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  )
}

// Group container-internal rows by their ContextRef (the container's
// ElementTypeRef) so each container gets its own section titled by that ref,
// rather than a generic "DL/LIN Internal" heading.
function groupByContainer(rows) {
  const map = new Map()
  for (const r of rows) {
    const ref = r.ContextRef || r.contextRef || '—'
    if (!map.has(ref)) map.set(ref, [])
    map.get(ref).push(r)
  }
  return [...map.entries()].map(([contextRef, groupRows]) => ({ contextRef, rows: groupRows }))
}

function FilterSelect({ label, icon, value, onChange, options }) {
  return (
    <div className="col-6">
      <label className="text-muted d-flex align-items-center gap-1" style={{ fontSize: 11 }}>
        <MaterialIcon name={icon} size={13} /> {label}
      </label>
      <Form.Select size="sm" value={value} onChange={e => onChange(e.target.value)} style={{ fontSize: 12 }}>
        <option value="">Any</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </Form.Select>
    </div>
  )
}
