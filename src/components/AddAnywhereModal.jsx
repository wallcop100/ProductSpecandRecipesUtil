import React, { useState, useMemo, useEffect } from 'react'
import { Modal, Button, Badge, Form, ButtonGroup } from 'react-bootstrap'
import {
  DndContext, PointerSensor, useSensor, useSensors, closestCenter,
} from '@dnd-kit/core'
import useStore, { getRecipeForPosition } from '../store/useStore'
import RecipeSection from './RecipeSection'
import IconButton from './IconButton'
import MaterialIcon from './MaterialIcon'
import EntityPill from './EntityPill'
import { positionFamilyOf } from '../utils/positionFamily'
import { familyOf } from '../utils/etRef'

const EMPTY_FILTERS = { family: '', tag: '', manufacturer: '', containsET: '' }

// Group container-internal rows by ContextRef so each container gets a section
// titled by its ElementTypeRef instead of a generic "DL/LIN Internal" heading.
function groupByContainer(rows) {
  const map = new Map()
  for (const r of rows) {
    const ref = r.ContextRef || r.contextRef || '—'
    if (!map.has(ref)) map.set(ref, [])
    map.get(ref).push(r)
  }
  return [...map.entries()].map(([contextRef, groupRows]) => ({ contextRef, rows: groupRows }))
}

/**
 * AddAnywhereModal — step through targets and add (or skip) a primed ET.
 *
 * A unit toggle chooses whether the primed ET is added into position recipes
 * or into container element types' internal recipes. Filters (built on a first
 * page) remove non-matching targets entirely.
 *
 * Props:
 *   show, onHide
 *   etRef         — the ET to add
 *   sectionKey    — section to add it to (position unit)
 *   excludePosRef — position already handled before the modal opened (position unit)
 *   startPosRef   — position to land on first (position unit, multi-add path)
 */
export default function AddAnywhereModal({ show, onHide, etRef, sectionKey, excludePosRef, startPosRef, initialFilters, initialUnit }) {
  const positionTypes  = useStore(s => s.positionTypes)
  const elementTypes   = useStore(s => s.elementTypes)
  const psRows         = useStore(s => s.psRows)
  const recipes        = useStore(s => s.recipes)
  const positionUI     = useStore(s => s.positionUI)
  const tagPalette     = useStore(s => s.tagPalette)
  const addRecipeRow   = useStore(s => s.addRecipeRow)
  const addToElementTypeRecipe = useStore(s => s.addToElementTypeRecipe)
  const ignoredPositionFamilies      = useStore(s => s.ignoredPositionFamilies)
  const reorderIngredients           = useStore(s => s.reorderIngredients)
  const moveIngredientAcrossSections = useStore(s => s.moveIngredientAcrossSections)

  const [unit, setUnit]             = useState('position')  // 'position' | 'element'
  const [phase, setPhase]           = useState('filter')    // 'filter' | 'cycle'
  const [index, setIndex]           = useState(0)
  const [sessionAdded, setSessionAdded] = useState(new Set())
  const [filters, setFilters]       = useState(EMPTY_FILTERS)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const isPos = unit === 'position'
  const unitNoun = isPos ? 'PositionType' : 'ElementType'
  const unitNounPl = isPos ? 'PositionTypes' : 'ElementTypes'

  const ps        = useMemo(() => psRows.find(p => (p.ElementTypeRef || p.elementTypeRef || '').toLowerCase() === (etRef || '').toLowerCase()), [psRows, etRef])
  const mfr       = ps?.Manufacturer  || ps?.manufacturer  || ''
  const code      = ps?.ProductCode   || ps?.productCode   || ''
  const specLabel = [mfr, code].filter(Boolean).join(' – ')

  const ignoredFamilySet = useMemo(() => new Set(ignoredPositionFamilies), [ignoredPositionFamilies])

  const psByRef = useMemo(() => {
    const m = new Map()
    for (const r of psRows) {
      const ref = (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase()
      if (ref && !m.has(ref)) m.set(ref, r)
    }
    return m
  }, [psRows])
  const mfrOf = ref => (psByRef.get((ref || '').toLowerCase())?.Manufacturer || '').trim()

  const etObjByRef = useMemo(() => {
    const m = new Map()
    for (const e of elementTypes) {
      const k = (e.ElementTypeRef || e.elementTypeRef || '').toLowerCase()
      if (k) m.set(k, e)
    }
    return m
  }, [elementTypes])

  // Live recipe rows per position (non-deleted)
  const rowsForPos = useMemo(() => {
    const m = new Map()
    for (const r of recipes) {
      if ((r.IsDeleted || r.isDeleted) === 'Y') continue
      const ref = r.PositionTypeRef || r.positionTypeRef
      if (!m.has(ref)) m.set(ref, [])
      m.get(ref).push(r)
    }
    return m
  }, [recipes])

  // Container ETs = refs used as an ElementType context, plus the positions/rows they hold
  const containerData = useMemo(() => {
    const m = new Map()  // ref → { internalRows:[], posRefs:Set }
    for (const r of recipes) {
      if ((r.ContextType || r.contextType) !== 'ElementType') continue
      if ((r.IsDeleted || r.isDeleted) === 'Y') continue
      const cr = r.ContextRef || r.contextRef
      if (!cr) continue
      if (!m.has(cr)) m.set(cr, { internalRows: [], posRefs: new Set() })
      const entry = m.get(cr)
      entry.internalRows.push(r)
      const pr = r.PositionTypeRef || r.positionTypeRef
      if (pr) entry.posRefs.add(pr)
    }
    return m
  }, [recipes])

  // Filter option lists (unit-aware)
  const familyOptions = useMemo(() => {
    const s = new Set()
    if (isPos) {
      for (const pt of positionTypes) { const f = positionFamilyOf(pt); if (f) s.add(f) }
    } else {
      for (const ref of containerData.keys()) { const f = familyOf(ref, etObjByRef.get(ref.toLowerCase())); if (f) s.add(f) }
    }
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [isPos, positionTypes, containerData, etObjByRef])

  const tagOptions = useMemo(() => {
    const s = new Set(tagPalette || [])
    for (const ui of Object.values(positionUI)) for (const t of (ui?.tags || [])) s.add(t)
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [tagPalette, positionUI])

  const mfrOptions = useMemo(() => {
    const s = new Set()
    for (const r of psRows) { const m = (r.Manufacturer || r.manufacturer || '').trim(); if (m) s.add(m) }
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [psRows])

  // Existing ET refs for the "Contains ET" filter suggestions (filters surface only real data)
  const allKnownETRefs = useMemo(() => {
    const m = new Map()
    const add = r => { const k = (r || '').toLowerCase(); if (k && !m.has(k)) m.set(k, r) }
    for (const e of elementTypes) add(e.ElementTypeRef || e.elementTypeRef)
    for (const r of psRows) add(r.ElementTypeRef || r.elementTypeRef)
    for (const r of recipes) add(r.ElementTypeRef || r.elementTypeRef)
    return [...m.values()].sort((a, b) => a.localeCompare(b))
  }, [elementTypes, psRows, recipes])

  // Tags a container inherits from the positions that use it
  const tagsForContainer = ref => {
    const entry = containerData.get(ref)
    const s = new Set()
    if (entry) for (const pr of entry.posRefs) for (const t of (positionUI[pr]?.tags || [])) s.add(t)
    return s
  }

  // Universe (before filters) for the count callout
  const universe = useMemo(() => {
    if (!etRef) return []
    if (isPos) {
      return positionTypes.filter(pt => {
        const ref = pt.PositionTypeRef
        if (ref === excludePosRef) return false
        if (positionUI[ref]?.ignored) return false
        if (ignoredFamilySet.size > 0 && ignoredFamilySet.has(pt.Family || '')) return false
        return true
      })
    }
    return [...containerData.keys()]
  }, [etRef, isPos, positionTypes, positionUI, ignoredFamilySet, excludePosRef, containerData])

  // Filtered, sorted targets: { kind, ref, tags }
  const targets = useMemo(() => {
    if (!etRef) return []
    const f = filters
    if (isPos) {
      return universe
        .filter(pt => {
          const ref = pt.PositionTypeRef
          if (f.family && positionFamilyOf(pt) !== f.family) return false
          if (f.tag && !((positionUI[ref]?.tags) || []).includes(f.tag)) return false
          const rows = rowsForPos.get(ref) || []
          if (f.manufacturer && !rows.some(r => mfrOf(r.ElementTypeRef || r.elementTypeRef) === f.manufacturer)) return false
          if (f.containsET && !rows.some(r => (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() === f.containsET.toLowerCase())) return false
          return true
        })
        .map(pt => ({ kind: 'position', ref: pt.PositionTypeRef, tags: positionUI[pt.PositionTypeRef]?.tags ?? [] }))
        .sort((a, b) => a.ref.localeCompare(b.ref))
    }
    return universe
      .filter(ref => {
        const entry = containerData.get(ref)
        if (f.family && familyOf(ref, etObjByRef.get(ref.toLowerCase())) !== f.family) return false
        if (f.manufacturer && mfrOf(ref) !== f.manufacturer) return false
        if (f.tag && !tagsForContainer(ref).has(f.tag)) return false
        if (f.containsET && !entry.internalRows.some(r => (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() === f.containsET.toLowerCase())) return false
        return true
      })
      .map(ref => ({ kind: 'element', ref, tags: [...tagsForContainer(ref)] }))
      .sort((a, b) => a.ref.localeCompare(b.ref))
  }, [etRef, isPos, universe, filters, positionUI, rowsForPos, containerData, etObjByRef])

  useEffect(() => {
    if (!show) return
    // Seed from the review filter when primed, else start blank.
    setUnit(initialUnit || 'position')
    setPhase('filter')
    setFilters(initialFilters ? { ...EMPTY_FILTERS, ...initialFilters } : EMPTY_FILTERS)
    setIndex(0)
    setSessionAdded(new Set())
  }, [show]) // eslint-disable-line react-hooks/exhaustive-deps

  // Switching unit clears filters + progress (families/manufacturers differ).
  function switchUnit(next) {
    setUnit(next)
    setFilters(EMPTY_FILTERS)
    setIndex(0)
    setSessionAdded(new Set())
  }

  function startCycle() {
    const startIdx = (isPos && startPosRef)
      ? Math.max(0, targets.findIndex(t => t.ref === startPosRef))
      : 0
    setIndex(startIdx)
    setPhase('cycle')
  }

  // Clamp index when the list shrinks
  useEffect(() => {
    setIndex(i => Math.min(i, Math.max(0, targets.length - 1)))
  }, [targets.length])

  const current = targets[index] || null
  const ref     = current?.ref

  // Recipe rows for the current target
  const posGrouped = useMemo(() => {
    if (!current || current.kind !== 'position') return null
    return getRecipeForPosition(recipes, current.ref)
  }, [current, recipes])

  const elementRows = useMemo(() => {
    if (!current || current.kind !== 'element') return null
    const entry = containerData.get(current.ref)
    if (!entry) return { firstPos: null, rows: [] }
    const firstPos = [...entry.posRefs][0] || null
    const rows = firstPos
      ? entry.internalRows.filter(r => (r.PositionTypeRef || r.positionTypeRef) === firstPos)
      : []
    rows.sort((a, b) => (a.RecipeIndex ?? a.recipeIndex ?? 0) - (b.RecipeIndex ?? b.recipeIndex ?? 0))
    return { firstPos, rows }
  }, [current, containerData])

  // Does the current target already hold the primed ET?
  const alreadyInRecipe = useMemo(() => {
    if (!ref || !etRef) return false
    const low = etRef.toLowerCase()
    if (isPos) {
      return recipes.some(r =>
        (r.PositionTypeRef || r.positionTypeRef) === ref &&
        (r.ElementTypeRef  || r.elementTypeRef  || '').toLowerCase() === low &&
        (r.IsDeleted       || r.isDeleted) !== 'Y'
      )
    }
    const entry = containerData.get(ref)
    return !!entry && entry.internalRows.some(r => (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() === low)
  }, [ref, etRef, isPos, recipes, containerData])

  const addedThisSession = ref ? sessionAdded.has(ref) : false
  const isHandled        = alreadyInRecipe || addedThisSession
  const isLast           = index >= targets.length - 1
  const activeFilterCount = Object.values(filters).filter(Boolean).length

  // Is the primed ET already present in a given target (for the dot strip)?
  function hasPrimed(t) {
    const low = (etRef || '').toLowerCase()
    if (t.kind === 'position') {
      return recipes.some(r =>
        (r.PositionTypeRef || r.positionTypeRef) === t.ref &&
        (r.ElementTypeRef  || r.elementTypeRef  || '').toLowerCase() === low &&
        (r.IsDeleted || r.isDeleted) !== 'Y'
      )
    }
    const entry = containerData.get(t.ref)
    return !!entry && entry.internalRows.some(r => (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() === low)
  }

  function setFilter(key, val) { setFilters(prev => ({ ...prev, [key]: val })) }
  function filterRows(rows) { return (rows || []).filter(r => (r.IsDeleted || r.isDeleted) !== 'Y') }

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

  function advance() {
    if (!isLast) setIndex(i => i + 1)
    else onHide()
  }

  function handleAdd() {
    if (!ref || !etRef) return
    if (isPos) addRecipeRow(ref, sectionKey, { elementTypeRef: etRef, ElementTypeRef: etRef })
    else addToElementTypeRecipe(ref, etRef, { elementTypeRef: etRef, ElementTypeRef: etRef })
    setSessionAdded(prev => new Set([...prev, ref]))
    advance()
  }

  return (
    <Modal show={show} onHide={onHide} size="xl" centered>
      <Modal.Header closeButton>
        <div className="d-flex align-items-center gap-3 flex-wrap w-100">
          <Modal.Title style={{ fontSize: 14 }}>Add to {unitNounPl}</Modal.Title>
          {/* Primed ET chip */}
          <div
            className="d-inline-flex align-items-center gap-2 px-2 py-1 rounded"
            style={{ background: '#f0faf4', border: '1px solid #c3e6cb', fontSize: 12 }}
          >
            <MaterialIcon name="add_circle" size={13} style={{ color: '#198754' }} />
            <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{etRef}</span>
            {specLabel && <span className="text-muted">{specLabel}</span>}
          </div>
          {isPos && excludePosRef && (
            <span className="text-muted" style={{ fontSize: 11 }}>
              <MaterialIcon name="check" size={12} style={{ verticalAlign: 'middle', marginRight: 2 }} />
              already added to {excludePosRef}
            </span>
          )}
          {phase === 'cycle' && (
            <button
              className="btn btn-link p-0 ms-auto d-inline-flex align-items-center gap-1"
              style={{ fontSize: 11, color: activeFilterCount > 0 ? '#0d6efd' : '#6c757d' }}
              onClick={() => setPhase('filter')}
            >
              <MaterialIcon name="filter_list" size={14} />
              {activeFilterCount > 0 ? `${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''}` : 'Filters'}
            </button>
          )}
        </div>
      </Modal.Header>

      <Modal.Body style={{ minHeight: 380 }}>
        {phase === 'filter' ? (
          <div>
            {/* Big, unmistakable filter header */}
            <div className="text-center mb-4 pb-3 border-bottom">
              <div
                className="d-inline-flex align-items-center justify-content-center mb-2"
                style={{ width: 64, height: 64, borderRadius: '50%', background: '#e8f0fe' }}
              >
                <MaterialIcon name="filter_alt" size={38} style={{ color: '#0d6efd' }} />
              </div>
              <h5 className="mb-1" style={{ fontSize: 16, fontWeight: 600 }}>
                Which {unitNounPl}?
              </h5>
              <p className="text-muted mb-0" style={{ fontSize: 12, maxWidth: 440, margin: '0 auto' }}>
                Choose whether to add <strong>{etRef}</strong> into position recipes or into
                element types' internal recipes, then narrow the list — or leave the filters
                blank to step through <strong>every</strong> {unitNoun}.
              </p>
            </div>

            {/* Unit toggle */}
            <div className="d-flex justify-content-center mb-3">
              <ButtonGroup>
                <Button variant={isPos ? 'primary' : 'outline-secondary'} style={{ fontSize: 12 }}
                  className="d-inline-flex align-items-center gap-1" onClick={() => switchUnit('position')}>
                  <MaterialIcon name="place" size={15} /> PositionType recipes
                </Button>
                <Button variant={!isPos ? 'primary' : 'outline-secondary'} style={{ fontSize: 12 }}
                  className="d-inline-flex align-items-center gap-1" onClick={() => switchUnit('element')}>
                  <MaterialIcon name="widgets" size={15} /> ElementType internals
                </Button>
              </ButtonGroup>
            </div>

            <div className="row g-3 mb-3">
              <div className="col-6">
                <Form.Label style={{ fontSize: 11, fontWeight: 600 }}>{isPos ? 'Position Family' : 'Element Family'}</Form.Label>
                <Form.Select size="sm" value={filters.family} onChange={e => setFilter('family', e.target.value)} style={{ fontSize: 12 }}>
                  <option value="">All families</option>
                  {familyOptions.map(f => <option key={f} value={f}>{f}</option>)}
                </Form.Select>
              </div>
              <div className="col-6">
                <Form.Label style={{ fontSize: 11, fontWeight: 600 }}>Tag</Form.Label>
                <Form.Select size="sm" value={filters.tag} onChange={e => setFilter('tag', e.target.value)} style={{ fontSize: 12 }}>
                  <option value="">All tags</option>
                  {tagOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </Form.Select>
              </div>
              <div className="col-6">
                <Form.Label style={{ fontSize: 11, fontWeight: 600 }}>Manufacturer</Form.Label>
                <Form.Select size="sm" value={filters.manufacturer} onChange={e => setFilter('manufacturer', e.target.value)} style={{ fontSize: 12 }}>
                  <option value="">Any manufacturer</option>
                  {mfrOptions.map(m => <option key={m} value={m}>{m}</option>)}
                </Form.Select>
              </div>
              <div className="col-6">
                <Form.Label style={{ fontSize: 11, fontWeight: 600 }}>Contains ET</Form.Label>
                <Form.Control size="sm" list="addanywhere-et-list" value={filters.containsET}
                  placeholder="ET ref…" onChange={e => setFilter('containsET', e.target.value)}
                  style={{ fontSize: 12 }} />
                <datalist id="addanywhere-et-list">
                  {allKnownETRefs.map(r => <option key={r} value={r} />)}
                </datalist>
              </div>
            </div>

            <div className="d-flex align-items-center gap-3 pt-3 border-top">
              {/* Prominent match count */}
              <div className="d-flex align-items-center gap-2">
                <span
                  className="d-inline-flex align-items-center justify-content-center fw-bold"
                  style={{
                    minWidth: 34, height: 34, padding: '0 8px', borderRadius: 17,
                    background: targets.length === 0 ? '#f8d7da' : '#d1e7dd',
                    color: targets.length === 0 ? '#842029' : '#0a3622',
                    fontSize: 15,
                  }}
                >
                  {targets.length}
                </span>
                <div style={{ lineHeight: 1.2 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {unitNoun}{targets.length !== 1 ? 's' : ''} to review
                  </div>
                  {activeFilterCount > 0 && (
                    <div className="text-muted" style={{ fontSize: 11 }}>
                      filtered from {universe.length}
                      <button className="btn btn-link btn-sm p-0 ms-2" style={{ fontSize: 11 }}
                        onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</button>
                    </div>
                  )}
                </div>
              </div>

              {targets.length === 0 && (
                <span className="ms-auto text-danger" style={{ fontSize: 12 }}>
                  <MaterialIcon name="warning" size={14} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                  {activeFilterCount > 0 ? 'No matches — loosen the filters' : `No ${unitNounPl} available`}
                </span>
              )}
            </div>
          </div>
        ) : targets.length === 0 ? (
          <div className="text-muted small fst-italic py-3">
            {activeFilterCount > 0 ? `No ${unitNounPl} match the current filters.` : `No ${unitNounPl} to step through.`}
          </div>
        ) : (
          <>
            {/* Nav bar with dot progress */}
            <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
              <IconButton variant="outline-secondary" bsSize="sm" icon="chevron_left" title="Previous"
                disabled={index <= 0} onClick={() => setIndex(i => Math.max(0, i - 1))} />
              <span className="text-muted small">{index + 1} / {targets.length}</span>
              <IconButton variant="outline-secondary" bsSize="sm" icon="chevron_right" title="Next"
                disabled={isLast} onClick={() => setIndex(i => Math.min(targets.length - 1, i + 1))} />

              {/* Dot progress strip */}
              <div className="d-flex gap-1 flex-wrap ms-1" style={{ maxWidth: 380 }}>
                {targets.map((t, i) => {
                  const done = sessionAdded.has(t.ref)
                  const pre  = !done && hasPrimed(t)
                  const isCur = i === index
                  const bg = done ? '#198754' : pre ? '#adb5bd' : isCur ? '#0d6efd' : '#dee2e6'
                  return (
                    <button key={t.ref} onClick={() => setIndex(i)}
                      title={t.ref + (done ? ' ✓ added' : pre ? ' (already present)' : '')}
                      style={{ width: 9, height: 9, borderRadius: '50%', padding: 0, border: 'none', background: bg, cursor: 'pointer' }}
                    />
                  )
                })}
              </div>

              <span className="ms-auto text-muted small">{sessionAdded.size} added this session</span>
            </div>

            {/* Current target header */}
            {current && (
              <div className="d-flex align-items-center gap-2 mb-3 px-3 py-2 rounded"
                style={{ background: '#f8f9fa', border: '1px solid #dee2e6' }}>
                <EntityPill type={isPos ? 'PositionType' : 'ElementType'} label={current.ref} />
                {current.tags.map(t => (
                  <Badge key={t} bg="secondary" style={{ fontSize: 10 }}>{t}</Badge>
                ))}
                {isHandled && (
                  <span className="ms-auto d-inline-flex align-items-center gap-1 text-success small">
                    <MaterialIcon name="check_circle" size={14} />
                    {addedThisSession ? 'Added' : 'Already in recipe'}
                  </span>
                )}
              </div>
            )}

            {/* Live recipe */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              {isPos && posGrouped && (
                <>
                  <RecipeSection title="Position Level" sectionKey="position"
                    rows={filterRows(posGrouped.position)} posRef={current.ref} />
                  {/* Container internals — one section per container, titled by
                      the container's ElementTypeRef. */}
                  {groupByContainer(filterRows(posGrouped.dlInternal)).map(g => (
                    <RecipeSection key={`dl-${g.contextRef}`} title={g.contextRef} sectionKey="dl_internal"
                      rows={g.rows} posRef={current.ref} />
                  ))}
                  {groupByContainer(filterRows(posGrouped.linInternal)).map(g => (
                    <RecipeSection key={`lin-${g.contextRef}`} title={g.contextRef} sectionKey="lin_internal"
                      rows={g.rows} posRef={current.ref} />
                  ))}
                  {!filterRows(posGrouped.position).length && !filterRows(posGrouped.dlInternal).length && !filterRows(posGrouped.linInternal).length && (
                    <div className="text-muted small fst-italic py-3">This PositionType has no recipe rows yet.</div>
                  )}
                </>
              )}
              {!isPos && elementRows && (
                elementRows.rows.length > 0 ? (
                  <RecipeSection title={current.ref} sectionKey="position"
                    rows={elementRows.rows} posRef={elementRows.firstPos} disableSorting />
                ) : (
                  <div className="text-muted small fst-italic py-3">This ElementType has no internal recipe rows yet.</div>
                )
              )}
            </DndContext>
          </>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" size="sm" onClick={onHide} style={{ fontSize: 12 }}>
          {phase === 'filter' ? 'Cancel' : 'Done'}
        </Button>
        <div className="flex-grow-1" />
        {phase === 'cycle' && current && !isHandled && (
          <Button variant="outline-secondary" size="sm" style={{ fontSize: 12 }} onClick={advance}>
            Skip →
          </Button>
        )}
        {phase === 'cycle' && current && isHandled && !isLast && (
          <Button variant="outline-secondary" size="sm" style={{ fontSize: 12 }} onClick={advance}>
            Next →
          </Button>
        )}
        {phase === 'cycle' && current && !isHandled && (
          <Button variant="success" size="sm" style={{ fontSize: 12 }} onClick={handleAdd}>
            {isLast ? 'Add + Done' : 'Add + Next →'}
          </Button>
        )}
        {phase === 'filter' && (
          <Button variant="primary" className="d-inline-flex align-items-center gap-1"
            style={{ fontSize: 13, fontWeight: 600 }}
            disabled={targets.length === 0}
            onClick={startCycle}>
            Start review ({targets.length})
            <MaterialIcon name="arrow_forward" size={16} />
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  )
}
