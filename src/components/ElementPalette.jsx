import React, { useState, useMemo } from 'react'
import { ButtonGroup, Button } from 'react-bootstrap'
import { useDraggable } from '@dnd-kit/core'
import useStore from '../store/useStore'
import FilterBar from './FilterBar'
import MaterialIcon from './MaterialIcon'
import { familyOf } from '../utils/etRef'
import { colorsForType, iconForEntity } from '../utils/entityStyle'

const FLAGGED_FAMILY = '⚠ Recipe-only (not in DB or Spec)'

/**
 * ElementPalette — draggable element types with two browse modes:
 *   "ET Ref"    — grouped by family, ET ref as primary identifier (original)
 *   "Mfr+Code"  — grouped by Manufacturer from PS rows, ProductCode as primary
 */
export default function ElementPalette() {
  const elementTypes = useStore(s => s.elementTypes)
  const psRows = useStore(s => s.psRows)
  const recipes = useStore(s => s.recipes)
  const addLocalElementType = useStore(s => s.addLocalElementType)

  const [mode, setMode] = useState('et-ref')   // 'et-ref' | 'mfr-code'
  const [search, setSearch] = useState('')
  const [familyFilter, setFamilyFilter] = useState('')
  const [expanded, setExpanded] = useState({})
  const [newETRef, setNewETRef] = useState('')
  const [showNewET, setShowNewET] = useState(false)

  // Build a lookup: lowercase ET ref → PS row
  const psRowByET = useMemo(() => {
    const map = new Map()
    for (const row of psRows) {
      const ref = (row.ElementTypeRef || row.elementTypeRef || '').toLowerCase()
      if (ref && !map.has(ref)) map.set(ref, row)
    }
    return map
  }, [psRows])

  // Merge all known ET refs from DB, PS, and recipes
  const allETs = useMemo(() => {
    const map = new Map()
    for (const et of elementTypes) {
      const key = (et.ElementTypeRef || et.elementTypeRef || '').toLowerCase()
      if (key) map.set(key, { ...et, _undefinedRef: false })
    }
    for (const row of psRows) {
      const ref = row.ElementTypeRef || row.elementTypeRef || ''
      const key = ref.toLowerCase()
      if (!key || map.has(key)) continue
      map.set(key, {
        ElementTypeRef: ref,
        Name: row.ComponentDescription || row.componentDescription || null,
        Family: null,
        _undefinedRef: false,
      })
    }
    for (const row of recipes) {
      const ref = row.ElementTypeRef || row.elementTypeRef || ''
      const key = ref.toLowerCase()
      if (!key || map.has(key)) continue
      map.set(key, { ElementTypeRef: ref, Name: null, Family: null, _undefinedRef: true })
    }

    return [...map.values()]
      .map(et => {
        const ref = et.ElementTypeRef || et.elementTypeRef
        const psRow = psRowByET.get((ref || '').toLowerCase())
        return {
          ...et,
          _family: et._undefinedRef ? FLAGGED_FAMILY : familyOf(ref, et),
          _psRow: psRow || null,
        }
      })
      .sort((a, b) => (a.ElementTypeRef || '').localeCompare(b.ElementTypeRef || ''))
  }, [elementTypes, psRows, recipes, psRowByET])

  // Group options depend on mode
  const groupOptions = useMemo(() => {
    if (mode === 'et-ref') {
      const set = new Set()
      for (const et of allETs) if (et._family !== FLAGGED_FAMILY) set.add(et._family)
      return [...set].sort((a, b) => a.localeCompare(b))
    } else {
      const set = new Set()
      for (const et of allETs) {
        const mfr = et._psRow?.Manufacturer || et._psRow?.manufacturer || null
        if (mfr) set.add(mfr)
      }
      return [...set].sort((a, b) => a.localeCompare(b))
    }
  }, [allETs, mode])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return allETs.filter(et => {
      const groupKey = groupKeyFor(et, mode)
      if (familyFilter && groupKey !== familyFilter) return false
      if (!q) return true
      const ref = (et.ElementTypeRef || '').toLowerCase()
      const name = (et.Name || '').toLowerCase()
      const family = (et._family || '').toLowerCase()
      const code = (et._psRow?.ProductCode || et._psRow?.productCode || '').toLowerCase()
      const mfr = (et._psRow?.Manufacturer || et._psRow?.manufacturer || '').toLowerCase()
      return ref.includes(q) || name.includes(q) || family.includes(q) || code.includes(q) || mfr.includes(q)
    })
  }, [allETs, search, familyFilter, mode])

  // Group by the active mode's key
  const grouped = useMemo(() => {
    const normal = new Map()
    const flagged = []
    for (const et of filtered) {
      if (et._undefinedRef) { flagged.push(et); continue }
      const key = groupKeyFor(et, mode)
      if (!normal.has(key)) normal.set(key, [])
      normal.get(key).push(et)
    }
    const result = new Map([...normal].sort(([a], [b]) => a.localeCompare(b)))
    if (flagged.length > 0) result.set(FLAGGED_FAMILY, flagged)
    return result
  }, [filtered, mode])

  const forceOpen = search.trim() !== '' || familyFilter !== ''
  const isOpen = family => forceOpen || !!expanded[family]

  function toggle(family) {
    setExpanded(prev => ({ ...prev, [family]: !prev[family] }))
  }
  function expandAll() {
    const next = {}
    for (const family of grouped.keys()) next[family] = true
    setExpanded(next)
  }
  function collapseAll() { setExpanded({}) }

  function handleAddET() {
    const ref = newETRef.trim()
    if (!ref) return
    addLocalElementType(ref)
    setNewETRef('')
    setShowNewET(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Mode toggle */}
      <div className="px-2 pt-2 pb-1 border-bottom">
        <ButtonGroup size="sm" className="w-100 mb-2">
          <Button
            variant={mode === 'et-ref' ? 'primary' : 'outline-secondary'}
            onClick={() => { setMode('et-ref'); setFamilyFilter('') }}
            style={{ fontSize: 11 }}
          >
            ET Ref
          </Button>
          <Button
            variant={mode === 'mfr-code' ? 'primary' : 'outline-secondary'}
            onClick={() => { setMode('mfr-code'); setFamilyFilter('') }}
            style={{ fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
          >
            <MaterialIcon name="category_search" size={14} />
            Mfr + Code
          </Button>
        </ButtonGroup>

        <FilterBar
          text={search}
          onText={setSearch}
          placeholder={mode === 'mfr-code' ? 'Search code, maker, ref…' : 'Search elements…'}
          familyOptions={groupOptions}
          family={familyFilter}
          onFamily={setFamilyFilter}
          compact={false}
        />
        <div className="d-flex gap-2 mt-1 align-items-center">
          <button className="btn btn-link btn-sm p-0" style={{ fontSize: 11, textDecoration: 'none' }} onClick={expandAll}>
            Expand all
          </button>
          <button className="btn btn-link btn-sm p-0" style={{ fontSize: 11, textDecoration: 'none' }} onClick={collapseAll}>
            Collapse all
          </button>
          <button
            className="btn btn-link btn-sm p-0 ms-auto"
            style={{ fontSize: 11, textDecoration: 'none', color: '#0d6efd' }}
            onClick={() => setShowNewET(v => !v)}
          >
            + New ET
          </button>
        </div>

        {showNewET && (
          <div className="d-flex gap-1 mt-2">
            <input
              className="form-control form-control-sm"
              placeholder="ET ref…"
              value={newETRef}
              onChange={e => setNewETRef(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddET(); if (e.key === 'Escape') setShowNewET(false) }}
              autoFocus
              style={{ fontSize: 12 }}
            />
            <button className="btn btn-sm btn-primary" onClick={handleAddET} style={{ fontSize: 11, whiteSpace: 'nowrap' }}>Add</button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
        {grouped.size === 0 && (
          <div className="text-muted small text-center py-3">No element types found.</div>
        )}
        {[...grouped.entries()].map(([group, ets]) => {
          const open = isOpen(group)
          return (
            <div key={group} className="mb-2">
              <div
                className="d-flex align-items-center gap-1 text-uppercase text-muted fw-bold mb-1"
                style={{ fontSize: 10, letterSpacing: 0.5, cursor: 'pointer', userSelect: 'none' }}
                onClick={() => toggle(group)}
              >
                <span style={{ width: 10 }}>{open ? '▾' : '▸'}</span>
                <span>{group}</span>
                <span className="text-muted" style={{ fontWeight: 400 }}>({ets.length})</span>
              </div>
              {open && ets.map(et => (
                <DraggableETCard key={et.ElementTypeRef || et.elementTypeRef} et={et} mode={mode} />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function groupKeyFor(et, mode) {
  if (mode === 'mfr-code') {
    return et._psRow?.Manufacturer || et._psRow?.manufacturer || et._family || 'Unknown Manufacturer'
  }
  return et._family
}

function DraggableETCard({ et, mode }) {
  const ref = et.ElementTypeRef || et.elementTypeRef
  const isCollection = useStore(s => ref ? s.containerETRefs.has(ref.toLowerCase()) : false)
  const { accent } = colorsForType('ElementType')

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${ref}`,
    data: { type: 'palette-item', elementTypeRef: ref },
  })

  const productCode = et._psRow?.ProductCode || et._psRow?.productCode || null
  const manufacturer = et._psRow?.Manufacturer || et._psRow?.manufacturer || null

  const primaryLabel = mode === 'mfr-code' && productCode ? productCode : ref
  const secondaryLabel = mode === 'mfr-code' ? ref : (et.Name || null)
  const { fill } = colorsForType('ElementType')

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        cursor: 'grab',
        opacity: isDragging ? 0.4 : 1,
        padding: '4px 8px',
        marginBottom: 3,
        marginLeft: 10,
        border: et._undefinedRef ? '1px solid #f59e0b' : '1px solid #dee2e6',
        borderLeft: et._undefinedRef ? '1px solid #f59e0b' : `3px solid ${accent}`,
        borderRadius: 4,
        background: et._undefinedRef ? '#fffbeb' : '#fff',
        userSelect: 'none',
        fontSize: 12,
      }}
    >
      <div className="d-flex align-items-center gap-2" style={{ fontSize: 12 }}>
        {/* Icon in its own pill */}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: fill,
            borderRadius: 4,
            padding: '2px 4px',
            flexShrink: 0,
          }}
          title={isCollection ? 'Collection' : 'Element'}
        >
          <MaterialIcon name={iconForEntity({ type: 'ElementType', isCollection })} size={14} style={{ color: accent }} />
        </span>
        <span className="fw-semibold" style={{ wordBreak: 'break-all' }}>{primaryLabel}</span>
      </div>
      {secondaryLabel && (
        <div className="text-muted" style={{ fontSize: 11, marginLeft: 26 }}>{secondaryLabel}</div>
      )}
      {mode === 'mfr-code' && manufacturer && productCode && (
        <div style={{ fontSize: 10, color: '#888', marginLeft: 26 }}>{manufacturer}</div>
      )}
      {et._undefinedRef && (
        <div style={{ fontSize: 10, color: '#b45309', marginLeft: 26 }}>not in DB or spec</div>
      )}
    </div>
  )
}
