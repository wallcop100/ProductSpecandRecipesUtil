import React, { useState, useMemo } from 'react'
import { ButtonGroup, Button } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { familyOf } from '../utils/etRef'
import { ACTION_ICONS } from '../utils/entityStyle'

const STATUS_COLOR = {
  complete: '#22c55e',
  partial:  '#f59e0b',
  missing:  '#ef4444',
  deleted:  '#9ca3af',
}

function completenessOf(ref, psRowMap, missingSet) {
  const key = ref.toLowerCase()
  if (missingSet.has(key) && !psRowMap.has(key)) return 'missing'
  const row = psRowMap.get(key)
  if (!row) return 'missing'
  if ((row.IsDeleted || row.isDeleted) === 'Y') return 'deleted'
  const tbc = (row.IsTBC || row.isTBC) === 'Y'
  const code = (row.ProductCode || row.productCode || '').trim()
  return (!code || tbc) ? 'partial' : 'complete'
}

function getGroupKey(ref, viewMode, psRowMap, etObjMap) {
  if (viewMode === 'manufacturer') {
    const row = psRowMap.get(ref.toLowerCase())
    return (row?.Manufacturer || row?.manufacturer || '').trim() || 'No Manufacturer'
  }
  const et = etObjMap.get(ref.toLowerCase())
  return familyOf(ref, et)
}

export default function ETSpecBrowser({
  selectedRef, onSelect,
  viewMode, onViewModeChange,
  bulkSelected, onBulkToggle, onSelectAll,
  etUsedIn = {}, missingETs = [],
}) {
  const elementTypes = useStore(s => s.elementTypes)
  const psRows      = useStore(s => s.psRows)
  const recipes     = useStore(s => s.recipes)
  const psChanges   = useStore(s => s.psChanges)

  // ET refs with an unsynced product-spec change (cleared on export)
  const dirtyRefs = useMemo(() => {
    const s = new Set()
    for (const c of psChanges) if (c.elementTypeRef) s.add(c.elementTypeRef.toLowerCase())
    return s
  }, [psChanges])

  const [search, setSearch]               = useState('')
  const [groupFilter, setGroupFilter]     = useState('')
  const [statusFilters, setStatusFilters] = useState([])
  const [usageFilters, setUsageFilters]   = useState([])
  const [expanded, setExpanded]           = useState({})
  const [missingOpen, setMissingOpen]     = useState(true)

  const missingSet = useMemo(() => new Set(missingETs.map(r => r.toLowerCase())), [missingETs])

  const psRowMap = useMemo(() => {
    const m = new Map()
    for (const r of psRows) {
      const k = (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase()
      if (k) m.set(k, r)
    }
    return m
  }, [psRows])

  const etObjMap = useMemo(() => {
    const m = new Map()
    for (const et of elementTypes) {
      const k = (et.ElementTypeRef || et.elementTypeRef || '').toLowerCase()
      if (k) m.set(k, et)
    }
    return m
  }, [elementTypes])

  const duplicateCodes = useMemo(() => {
    const counts = {}
    for (const r of psRows) {
      const code = (r.ProductCode || r.productCode || '').trim().toUpperCase()
      if (!code || code === 'N/A') continue
      counts[code] = (counts[code] || 0) + 1
    }
    return new Set(Object.entries(counts).filter(([, v]) => v > 1).map(([k]) => k))
  }, [psRows])

  const allRefs = useMemo(() => {
    const set = new Set()
    for (const et of elementTypes) { const r = et.ElementTypeRef || et.elementTypeRef; if (r) set.add(r) }
    for (const r of psRows)        { const ref = r.ElementTypeRef || r.elementTypeRef; if (ref) set.add(ref) }
    for (const r of recipes)       { const ref = r.ElementTypeRef || r.elementTypeRef; if (ref) set.add(ref) }
    return [...set].sort()
  }, [elementTypes, psRows, recipes])

  const groupOptions = useMemo(() => {
    const set = new Set()
    for (const ref of allRefs) set.add(getGroupKey(ref, viewMode, psRowMap, etObjMap))
    return [...set].sort()
  }, [allRefs, viewMode, psRowMap, etObjMap])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return allRefs.filter(ref => {
      const key = ref.toLowerCase()
      const psRow = psRowMap.get(key)
      const status = completenessOf(ref, psRowMap, missingSet)
      const group = getGroupKey(ref, viewMode, psRowMap, etObjMap)
      const code = (psRow?.ProductCode || psRow?.productCode || '').trim().toUpperCase()
      const isDeleted = (psRow?.IsDeleted || psRow?.isDeleted) === 'Y'
      const isDup = code && code !== 'N/A' && duplicateCodes.has(code)

      if (groupFilter && group !== groupFilter) return false

      if (statusFilters.length > 0) {
        const match = statusFilters.some(f => {
          if (f === 'Missing')    return status === 'missing'
          if (f === 'Partial/TBC') return status === 'partial'
          if (f === 'Duplicate')  return isDup
          if (f === 'Deleted')    return isDeleted
          return false
        })
        if (!match) return false
      }

      if (usageFilters.length > 0) {
        const usage = etUsedIn[key]
        const inPos = (usage?.positions?.size || 0) > 0
        const inEl  = (usage?.elements?.size  || 0) > 0
        const match = usageFilters.some(f => {
          if (f === 'In positions') return inPos
          if (f === 'In elements')  return inEl
          if (f === 'Unused')       return !inPos && !inEl
          return false
        })
        if (!match) return false
      }

      if (!q) return true
      return ref.toLowerCase().includes(q) ||
        (psRow?.ProductCode  || '').toLowerCase().includes(q) ||
        (psRow?.Manufacturer || '').toLowerCase().includes(q) ||
        group.toLowerCase().includes(q)
    })
  }, [allRefs, search, groupFilter, statusFilters, usageFilters, psRowMap, missingSet, duplicateCodes, etUsedIn, viewMode, etObjMap])

  const grouped = useMemo(() => {
    const m = new Map()
    for (const ref of filtered) {
      const key = getGroupKey(ref, viewMode, psRowMap, etObjMap)
      if (!m.has(key)) m.set(key, [])
      m.get(key).push(ref)
    }
    return new Map([...m].sort(([a], [b]) => a.localeCompare(b)))
  }, [filtered, viewMode, psRowMap, etObjMap])

  const forceOpen = search.trim() !== '' || groupFilter !== '' || statusFilters.length > 0 || usageFilters.length > 0
  const isOpen = g => forceOpen || !!expanded[g]
  function toggleGroup(g) { setExpanded(p => ({ ...p, [g]: !p[g] })) }
  function toggleStatus(f) { setStatusFilters(p => p.includes(f) ? p.filter(x => x !== f) : [...p, f]) }
  function toggleUsage(f)  { setUsageFilters(p =>  p.includes(f) ? p.filter(x => x !== f) : [...p, f]) }

  function handleKeyDown(e) {
    if (!selectedRef) return
    const flat = filtered
    const idx = flat.findIndex(r => r.toLowerCase() === selectedRef.toLowerCase())
    if (e.key === 'ArrowDown' && idx < flat.length - 1) { e.preventDefault(); onSelect(flat[idx + 1]) }
    if (e.key === 'ArrowUp' && idx > 0) { e.preventDefault(); onSelect(flat[idx - 1]) }
  }

  const allVisibleRefs = [...missingETs, ...filtered]

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%', outline: 'none' }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Controls */}
      <div className="px-2 pt-2 pb-1 border-bottom" style={{ flexShrink: 0 }}>
        <ButtonGroup size="sm" className="w-100 mb-2">
          <Button
            variant={viewMode === 'family' ? 'primary' : 'outline-secondary'}
            style={{ fontSize: 11 }}
            onClick={() => { onViewModeChange('family'); setGroupFilter('') }}
          >
            By Family
          </Button>
          <Button
            variant={viewMode === 'manufacturer' ? 'primary' : 'outline-secondary'}
            style={{ fontSize: 11 }}
            onClick={() => { onViewModeChange('manufacturer'); setGroupFilter('') }}
          >
            By Manufacturer
          </Button>
        </ButtonGroup>

        <div className="d-flex gap-1 mb-1">
          <div className="position-relative" style={{ flex: 1 }}>
            <input
              className="form-control form-control-sm"
              style={{ fontSize: 11, paddingRight: 22 }}
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="btn btn-sm p-0 position-absolute"
                style={{ right: 6, top: '50%', transform: 'translateY(-50%)', lineHeight: 1, color: '#888' }}
                onClick={() => setSearch('')}
                title="Clear search" aria-label="Clear search"
              ><MaterialIcon name="close" size={15} /></button>
            )}
          </div>
          <select
            className="form-select form-select-sm"
            style={{ fontSize: 11, width: 100 }}
            value={groupFilter}
            onChange={e => setGroupFilter(e.target.value)}
            title={viewMode === 'manufacturer' ? 'Filter by manufacturer' : 'Filter by family'}
          >
            <option value="">All</option>
            {groupOptions.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        <div className="d-flex flex-wrap gap-1 mb-1">
          {['Missing', 'Partial/TBC', 'Duplicate', 'Deleted'].map(f => (
            <button
              key={f} type="button"
              className={`btn btn-sm ${statusFilters.includes(f) ? 'btn-primary' : 'btn-outline-secondary'}`}
              style={{ fontSize: 10, padding: '0 6px', borderRadius: 10 }}
              onClick={() => toggleStatus(f)}
            >{f}</button>
          ))}
        </div>
        <div className="d-flex flex-wrap gap-1 mb-1">
          {['In positions', 'In elements', 'Unused'].map(f => (
            <button
              key={f} type="button"
              className={`btn btn-sm ${usageFilters.includes(f) ? 'btn-info' : 'btn-outline-secondary'}`}
              style={{ fontSize: 10, padding: '0 6px', borderRadius: 10 }}
              onClick={() => toggleUsage(f)}
            >{f}</button>
          ))}
        </div>

        {allVisibleRefs.length > 0 && (
          <button
            type="button"
            className="btn btn-link btn-sm p-0"
            style={{ fontSize: 10, color: '#6c757d', textDecoration: 'none' }}
            onClick={() => onSelectAll(allVisibleRefs)}
          >
            Select all visible ({allVisibleRefs.length})
          </button>
        )}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Missing ETs section */}
        {missingETs.length > 0 && (
          <div style={{ borderBottom: '1px solid #fde68a' }}>
            <div
              className="d-flex align-items-center gap-1 px-2 py-1"
              style={{ background: '#fff8e1', cursor: 'pointer', userSelect: 'none' }}
              onClick={() => setMissingOpen(v => !v)}
            >
              <MaterialIcon name={missingOpen ? ACTION_ICONS.expand : ACTION_ICONS.collapse} size={13} style={{ width: 13 }} />
              <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700, color: '#92400e' }}>
                Missing spec
              </span>
              <span style={{ marginLeft: 4, background: '#f59e0b', color: '#fff', borderRadius: 10, padding: '0 6px', fontSize: 10 }}>
                {missingETs.length}
              </span>
            </div>
            {missingOpen && missingETs.map(ref => (
              <BrowserRow
                key={ref}
                ref_={ref}
                status="missing"
                productCode=""
                isSelected={selectedRef?.toLowerCase() === ref.toLowerCase()}
                isChecked={bulkSelected.has(ref.toLowerCase())}
                onSelect={() => onSelect(ref)}
                onCheck={() => onBulkToggle(ref.toLowerCase())}
                rowBg="#fffbeb"
              />
            ))}
          </div>
        )}

        {/* Grouped list */}
        {[...grouped.entries()].map(([group, refs]) => (
          <div key={group}>
            <div
              className="d-flex align-items-center gap-1 px-2 py-1"
              style={{
                cursor: 'pointer', userSelect: 'none', fontSize: 10,
                textTransform: 'uppercase', letterSpacing: 0.5, color: '#6c757d', fontWeight: 700,
                borderBottom: '1px solid #f0f0f0', background: '#fafafa',
              }}
              onClick={() => toggleGroup(group)}
            >
              <MaterialIcon name={isOpen(group) ? ACTION_ICONS.expand : ACTION_ICONS.collapse} size={13} style={{ width: 13 }} />
              <span>{group}</span>
              <span style={{ fontWeight: 400, marginLeft: 2 }}>({refs.length})</span>
            </div>
            {isOpen(group) && refs.map(ref => {
              const psRow = psRowMap.get(ref.toLowerCase())
              const isDirty = dirtyRefs.has(ref.toLowerCase())
              return (
                <BrowserRow
                  key={ref}
                  ref_={ref}
                  status={completenessOf(ref, psRowMap, missingSet)}
                  productCode={(psRow?.ProductCode || psRow?.productCode || '').trim()}
                  isSelected={selectedRef?.toLowerCase() === ref.toLowerCase()}
                  isChecked={bulkSelected.has(ref.toLowerCase())}
                  isDirty={isDirty}
                  isNew={!!psRow && psRow._row_num == null && isDirty}
                  onSelect={() => onSelect(ref)}
                  onCheck={() => onBulkToggle(ref.toLowerCase())}
                />
              )
            })}
          </div>
        ))}

        {grouped.size === 0 && missingETs.length === 0 && (
          <div className="text-muted small text-center py-4">No element types found.</div>
        )}
      </div>
    </div>
  )
}

function BrowserRow({ ref_, status, productCode, isSelected, isChecked, isDirty, isNew, onSelect, onCheck, rowBg }) {
  return (
    <div
      className="d-flex align-items-center gap-1 px-2"
      style={{
        cursor: 'pointer',
        background: isSelected ? '#e8f0fe' : isDirty ? '#fffdf5' : rowBg,
        borderLeft: isSelected ? '3px solid #4285f4' : isDirty ? '3px solid #f0ad4e' : '3px solid transparent',
        minHeight: 28,
        fontSize: 11,
      }}
      onClick={onSelect}
    >
      <input
        type="checkbox"
        checked={isChecked}
        onChange={e => { e.stopPropagation(); onCheck() }}
        onClick={e => e.stopPropagation()}
        style={{ flexShrink: 0, cursor: 'pointer' }}
      />
      <span
        style={{
          width: 8, height: 8, borderRadius: '50%',
          background: STATUS_COLOR[status] || '#ccc',
          flexShrink: 0, display: 'inline-block',
        }}
        title={status}
      />
      <span style={{ flex: 1, fontWeight: 500, wordBreak: 'break-all' }}>{ref_}</span>
      {isNew && (
        <span className="badge" style={{ background: '#d1e7dd', color: '#0a3622', border: '1px solid #a3cfbb', fontSize: 9, flexShrink: 0 }}
          title="New — added this session, not yet exported">new</span>
      )}
      {productCode && (
        <span style={{ fontSize: 10, color: '#888', flexShrink: 0, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {productCode}
        </span>
      )}
    </div>
  )
}
