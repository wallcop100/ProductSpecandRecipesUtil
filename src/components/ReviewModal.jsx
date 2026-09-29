import InfoTip from './InfoTip'
import React, { useState, useMemo, useEffect } from 'react'
import { Modal, Button, Form, ButtonGroup, Dropdown } from 'react-bootstrap'
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
import { formWorklist } from '../utils/formSpec'
import { TAG_OPS } from '../utils/tagRules'
import { fieldsFor, recordsFor, filterMatches, cellText, legacyFilters, DEFAULT_COLUMNS, DEFAULT_FILTER_FIELDS } from '../utils/reviewFields'
import usePositionList, { byRef } from './usePositionList'

const EMPTY_FILTER = { match: 'all', conditions: [] }
const api = () => (typeof window !== 'undefined' && window.electronAPI?.db) || null
async function readPref(projectId, key) {
  try { const v = await api()?.getPref?.(projectId, key); return v ? JSON.parse(v) : null } catch { return null }
}
function writePref(projectId, key, value) {
  try { api()?.setPref?.(projectId, key, JSON.stringify(value)) } catch { /* not persisted */ }
}

/**
 * ReviewModal — build a filtered set of recipes and cycle through them one at a
 * time. The unit (positions or element types) is chosen per run; filters combine
 * with AND. This reviews RECIPES (not the product spec).
 *
 * initialRefs: PositionTypeRefs to jump straight into cycling, skipping the
 * filter-build step — e.g. "review the positions the Form just named".
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
  const formCaptures  = useStore(s => s.formCaptures)
  const containerETRefs = useStore(s => s.containerETRefs)

  const [unit, setUnit]       = useState('position')  // 'position' | 'element'
  const [filter, setFilter]   = useState(EMPTY_FILTER)
  const [columns, setColumns] = useState(DEFAULT_COLUMNS)   // per unit
  const [sortBy, setSortBy]   = useState({ key: 'Ref', dir: 1 })
  const [extraBoxes, setExtraBoxes] = useState([])     // columns added as filter boxes
  const [sets, setSets]       = useState([])                // saved filter sets, this project
  const [setName, setSetName] = useState('')                // the loaded / last saved set
  const projectId = useStore(s => s.projectId)
  const { statusOf } = usePositionList()
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
  // Saved sets and the last-used filter are per project.
  useEffect(() => {
    if (!show || projectId == null) return
    let live = true
    Promise.all([readPref(projectId, 'review_filter_sets'), readPref(projectId, 'review_last')]).then(([saved, last]) => {
      if (!live) return
      setSets(Array.isArray(saved) ? saved : [])
      if (last && !(initialRefs && initialRefs.length)) {
        if (last.unit) setUnit(last.unit)
        if (last.filter) setFilter(last.filter)
        if (last.columns) setColumns(c => ({ ...c, ...last.columns }))
        setSetName(last.setName || '')
      }
    })
    return () => { live = false }
  }, [show, projectId])
  const remember = (patch = {}) => projectId != null && writePref(projectId, 'review_last', { unit, filter, columns, setName, ...patch })
  const switchUnit = u => { if (u === unit) return; setUnit(u); setFilter(EMPTY_FILTER); setExtraBoxes([]); setSetName(''); setSortBy({ key: 'Ref', dir: 1 }) }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))


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

  const fields = useMemo(() => fieldsFor(unit, { positionTypes, elementTypes }), [unit, positionTypes, elementTypes])
  const records = useMemo(
    () => recordsFor(unit, { positionTypes, elementTypes, recipes: liveRows, psRows, positionUI, statusOf }),
    [unit, positionTypes, elementTypes, liveRows, psRows, positionUI, statusOf])

  const matches = useMemo(() => {
    if (useInitialRefs && initialRefs && initialRefs.length > 0) {
      return initialRefs.map(ref => {
        const pt = positionTypes.find(p => p.PositionTypeRef === ref)
        return { kind: 'position', ref, name: pt?.Name || pt?.PositionName || null }
      })
    }
    const hit = records.filter(m => filterMatches(filter, m.rec))
    const { key, dir } = sortBy
    return hit.sort((a, b) => {
      const x = a.rec[key], y = b.rec[key]
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : byRef(cellText(x), cellText(y))
      return (c || byRef(a.ref, b.ref)) * dir
    })
  }, [records, filter, sortBy, positionTypes, initialRefs, useInitialRefs])

  const current = matches[index] || null
  const canPrev = phase === 'cycle' && index > 0
  const canNext = phase === 'cycle' && index < matches.length - 1
  // Leaving a position settles its design item first (DesignPickerModal when it must ask).
  const leave = then => useStore.getState().leavePosition(current?.kind === 'position' ? current.ref : null, then)
  const goTo = i => leave(() => setIndex(i))
  const goPrev = () => goTo(Math.max(0, index - 1))
  const goNext = () => goTo(Math.min(matches.length - 1, index + 1))
  const close = () => leave(onHide)

  // The next position after this one that the Form is still not satisfied on.
  const nextUnreconciled = useMemo(() => {
    if (phase !== 'cycle' || !formCaptures || current?.kind !== 'position') return -1
    const open = new Set(formWorklist(recipes, formCaptures, containerETRefs || new Set()).map(w => w.posRef))
    for (let i = index + 1; i < matches.length; i++) if (open.has(matches[i].ref)) return i
    return -1
  }, [phase, formCaptures, current, recipes, containerETRefs, index, matches])

  // ← / → step through, except while typing.
  useEffect(() => {
    if (!show || phase !== 'cycle') return
    const onKey = ev => {
      const t = ev.target
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return
      if (ev.altKey || ev.ctrlKey || ev.metaKey) return
      if (ev.key === 'ArrowRight') { ev.preventDefault(); goNext() }
      else if (ev.key === 'ArrowLeft') { ev.preventDefault(); goPrev() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [show, phase, matches.length, index, current])

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

  const conds = filter.conditions.filter(c => c.field && c.op)
  const opLabel = op => TAG_OPS.find(o => o.op === op)?.label || op
  const fieldLabel = key => fields.find(f => f.key === key)?.label || key
  const condText = c => c.op === 'text' ? `${fieldLabel(c.field)}: ${c.value}` : `${fieldLabel(c.field)} ${opLabel(c.op)}${TAG_OPS.find(o => o.op === c.op)?.needsValue === false ? '' : ` ${c.value}`}`
  // Filter boxes: the unit's defaults plus any column added; each box is one 'text' condition.
  const boxFields = [...new Set([...DEFAULT_FILTER_FIELDS[unit], ...extraBoxes,
    ...filter.conditions.filter(c => c.op === 'text').map(c => c.field)])]
  const boxValue = key => filter.conditions.find(c => c.field === key && c.op === 'text')?.value || ''
  const setBox = (key, value) => {
    setSetName('')
    setFilter(f => {
      const rest = f.conditions.filter(c => !(c.field === key && c.op === 'text'))
      return { ...f, match: 'all', conditions: value.trim() ? [...rest, { field: key, op: 'text', value }] : rest }
    })
  }
  const valuesOf = key => {
    const seen = new Set()
    for (const m of records) for (const v of [].concat(m.rec?.[key] ?? [])) { const t = cellText(v); if (t) seen.add(t) }
    return [...seen].sort().slice(0, 200)
  }
  const cols = columns[unit] || DEFAULT_COLUMNS[unit]
  const toggleCol = key => {
    const next = { ...columns, [unit]: cols.includes(key) ? cols.filter(k => k !== key) : [...cols, key] }
    setColumns(next); remember({ columns: next })
  }
  const start = i => { remember(); setIndex(i); setPhase('cycle') }

  function saveSet() {
    const name = window.prompt('Name this filter set', setName || '')?.trim()
    if (!name) return
    const next = [...sets.filter(x => x.name !== name), { name, unit, filter, columns: cols }]
    setSets(next); setSetName(name)
    if (projectId != null) writePref(projectId, 'review_filter_sets', next)
    remember({ setName: name })
  }
  function loadSet(name) {
    const x = sets.find(y => y.name === name)
    if (!x) return
    setUnit(x.unit); setFilter(x.filter || EMPTY_FILTER); setSetName(name)
    if (x.columns) setColumns(c => ({ ...c, [x.unit]: x.columns }))
  }
  function deleteSet() {
    const next = sets.filter(x => x.name !== setName)
    setSets(next); setSetName('')
    if (projectId != null) writePref(projectId, 'review_filter_sets', next)
  }

  return (
    <Modal show={show} onHide={close} size="xl" centered>
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
              <p className="text-muted mb-0" style={{ fontSize: 12 }}>
                Filters are optional{' '}
                <InfoTip>Pick PositionTypes or ElementTypes and narrow with the filters below, or leave them blank to step through everything.</InfoTip>
              </p>
            </div>

            <div className="d-flex justify-content-center align-items-center gap-2 mb-3 flex-wrap">
              <span className="text-muted small">Step through</span>
              <ButtonGroup size="sm">
                <Button variant={unit === 'position' ? 'primary' : 'outline-secondary'} style={{ fontSize: 12 }}
                  onClick={() => switchUnit('position')}>PositionTypes</Button>
                <Button variant={unit === 'element' ? 'primary' : 'outline-secondary'} style={{ fontSize: 12 }}
                  onClick={() => switchUnit('element')}>ElementTypes</Button>
              </ButtonGroup>
              <Form.Select size="sm" aria-label="Saved filter sets" value={setName} onChange={e => loadSet(e.target.value)}
                style={{ fontSize: 12, width: 'auto' }}>
                <option value="">{sets.length ? 'Saved filters…' : 'No saved filters'}</option>
                {sets.map(x => <option key={x.name} value={x.name}>{x.name}</option>)}
              </Form.Select>
              <Button size="sm" variant="outline-secondary" style={{ fontSize: 12 }} onClick={saveSet} disabled={conds.length === 0}>Save…</Button>
              {setName && <IconButton icon="delete" size={16} title={`Delete “${setName}”`} onClick={deleteSet} />}
            </div>

            {/* Filter boxes: type part of a value; * and ? are wildcards, commas mean any of,
                a leading ! means not. Every filled box must match. */}
            <div className="row g-2 mb-2" data-testid="review-filter-boxes">
              {boxFields.map(key => (
                <div key={key} className="col-6 col-md-4">
                  <label className="text-muted d-flex align-items-center gap-1" style={{ fontSize: 11 }}>
                    {fieldLabel(key)}
                    {!DEFAULT_FILTER_FIELDS[unit].includes(key) && (
                      <button type="button" className="btn btn-link p-0 ms-auto text-muted" aria-label={`Remove the ${fieldLabel(key)} filter`}
                        onClick={() => { setExtraBoxes(x => x.filter(k => k !== key)); setBox(key, '') }}>
                        <MaterialIcon name="close" size={12} />
                      </button>
                    )}
                  </label>
                  <Form.Control size="sm" aria-label={`Filter ${fieldLabel(key)}`} value={boxValue(key)} style={{ fontSize: 12 }}
                    placeholder={key === 'Ref' ? 'e.g. C0?r, A*' : 'any'} list={`review-vals-${key}`}
                    onChange={e => setBox(key, e.target.value)} />
                  <datalist id={`review-vals-${key}`}>{valuesOf(key).map(v => <option key={v} value={v} />)}</datalist>
                </div>
              ))}
            </div>
            {conds.some(c => c.op !== 'text') && (
              <div className="d-flex flex-wrap gap-1 mb-2" style={{ fontSize: 11 }}>
                {conds.filter(c => c.op !== 'text').map((c, i) => (
                  <span key={i} className="badge bg-light text-dark border" style={{ fontWeight: 400 }}>
                    {condText(c)}{' '}
                    <button type="button" className="btn btn-link p-0" style={{ fontSize: 11 }} aria-label="Remove this filter"
                      onClick={() => { setSetName(''); setFilter(f => ({ ...f, conditions: f.conditions.filter(x => x !== c) })) }}>×</button>
                  </span>
                ))}
              </div>
            )}
            <div className="d-flex align-items-center gap-2 mt-1 mb-3">
              <Dropdown>
                <Dropdown.Toggle variant="link" size="sm" className="p-0" style={{ fontSize: 12 }}>+ Filter on another column</Dropdown.Toggle>
                <Dropdown.Menu style={{ fontSize: 12, maxHeight: 300, overflowY: 'auto' }}>
                  {fields.filter(f => !boxFields.includes(f.key)).map(f => (
                    <Dropdown.Item key={f.key} onClick={() => setExtraBoxes(x => [...x, f.key])}>{f.label}</Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown>
              <InfoTip>Type part of a value to find it. <code>*</code> and <code>?</code> are wildcards (<code>C0?r</code>, <code>ET-DL-*</code>), a comma means any of, and a leading <code>!</code> means not (<code>!*TBC*</code>). On a list (Tags, Contains ET…) a row matches when any item does.</InfoTip>
              {filter.conditions.length > 0 && (
                <Button variant="link" size="sm" className="p-0 text-muted" style={{ fontSize: 12 }}
                  onClick={() => { setFilter(EMPTY_FILTER); setSetName('') }}>Clear</Button>
              )}
              <div className="ms-auto text-muted small">{matches.length} match{matches.length === 1 ? '' : 'es'}</div>
              <Dropdown align="end" autoClose="outside">
                <Dropdown.Toggle as={IconButton} bsSize="sm" variant="outline-secondary" icon="view_column" title="Columns" />
                <Dropdown.Menu style={{ fontSize: 12, maxHeight: 320, overflowY: 'auto' }}>
                  {fields.map(f => (
                    <Dropdown.Item key={f.key} onClick={() => toggleCol(f.key)}>
                      <MaterialIcon name={cols.includes(f.key) ? 'check_box' : 'check_box_outline_blank'} size={14} /> {f.label}
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown>
              <Button variant="primary" size="sm" disabled={matches.length === 0} onClick={() => start(0)}>
                Start review →
              </Button>
            </div>

            <div style={{ maxHeight: 360, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 4 }}>
              <table className="table table-sm table-hover mb-0" style={{ fontSize: 12 }} data-testid="review-results">
                <thead style={{ position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 1 }}>
                  <tr>
                    {cols.map(k => (
                      <th key={k} role="button" style={{ whiteSpace: 'nowrap', cursor: 'pointer' }}
                        onClick={() => setSortBy(sb => ({ key: k, dir: sb.key === k ? -sb.dir : 1 }))}>
                        {fieldLabel(k)}{sortBy.key === k ? (sortBy.dir > 0 ? ' ▲' : ' ▼') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matches.slice(0, 500).map((m, i) => (
                    <tr key={m.ref} style={{ cursor: 'pointer' }} onClick={() => start(i)} title="Start the review here">
                      {cols.map(k => (
                        <td key={k} className="text-truncate" style={{ maxWidth: 260, fontFamily: k === 'Ref' ? 'monospace' : undefined }}>
                          {cellText(m.rec?.[k])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {matches.length > 500 && <div className="text-muted small p-2">Showing the first 500 of {matches.length}.</div>}
              {matches.length === 0 && <div className="text-muted small p-3 text-center">Nothing matches.</div>}
            </div>
          </>
        ) : (
          <>
            {/* Cycle header */}
            <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
              <IconButton variant="outline-secondary" bsSize="sm" icon="tune" title="Edit filters"
                onClick={() => { setUseInitialRefs(false); setPhase('build') }} />
              {useInitialRefs && (
                <span className="badge" style={{ fontSize: 11, background: '#e7f1ff', color: '#084298' }}>
                  Positions the Form named
                </span>
              )}
              {!useInitialRefs && setName && (
                <span className="badge" style={{ fontSize: 11, background: '#e7f1ff', color: '#084298' }}>{setName}</span>
              )}
              {!useInitialRefs && conds.map((c, i) => (
                <span key={i} className="badge bg-light text-dark border" style={{ fontSize: 11, fontWeight: 400 }}>
                  {i > 0 && <span className="text-muted">{filter.match === 'any' ? 'or ' : 'and '}</span>}{condText(c)}
                </span>
              ))}
              <div className="ms-auto d-flex align-items-center gap-2">
                <span className="text-muted small">{index + 1} of {matches.length}</span>
                <IconButton variant="outline-secondary" bsSize="sm" icon="chevron_left" title="Previous"
                  disabled={!canPrev} onClick={goPrev} />
                <IconButton variant="outline-secondary" bsSize="sm" icon="chevron_right" title="Next"
                  disabled={!canNext} onClick={goNext} />
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
                  onAddRow={() => onAddEntity && onAddEntity({ mode: 'existing', unit, filters: legacyFilters(filter) })}
                  onNewET={() => onAddEntity && onAddEntity({ mode: 'new', unit, filters: legacyFilters(filter) })}
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

      {/* Close is a quiet link on the left; the right-hand corner, where the eye and the
          mouse go for "next", is Next. */}
      <Modal.Footer className="d-flex align-items-center">
        <Button variant="link" size="sm" className="text-muted me-auto p-0" onClick={close}>Close</Button>
        {phase === 'cycle' && matches.length > 0 && (
          <>
            <Button variant="outline-secondary" size="sm" disabled={!canPrev} onClick={goPrev}
              title="Previous (←)">‹ Previous</Button>
            <span className="text-muted small" data-testid="review-counter">{index + 1} of {matches.length}</span>
            <Button variant={nextUnreconciled >= 0 ? 'outline-primary' : 'primary'} size="sm"
              disabled={!canNext} onClick={goNext} title="Next (→)">Next ›</Button>
            {nextUnreconciled >= 0 && (
              <Button variant="primary" size="sm" onClick={() => goTo(nextUnreconciled)}
                title="Skip positions the Form is already satisfied on">
                Next unreconciled: <span style={{ fontFamily: 'monospace' }}>{matches[nextUnreconciled].ref}</span> →
              </Button>
            )}
          </>
        )}
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
