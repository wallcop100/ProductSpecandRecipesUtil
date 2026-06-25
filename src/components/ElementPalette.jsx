import React, { useState, useMemo } from 'react'
import { useDraggable } from '@dnd-kit/core'
import useStore from '../store/useStore'
import FilterBar from './FilterBar'
import { familyOf } from '../utils/etRef'

const FLAGGED_FAMILY = '⚠ Recipe-only (not in DB or Spec)'

/**
 * ElementPalette — draggable element types, grouped into collapsible families.
 *
 * Families come from the DB `Family` field, falling back to a heuristic parse of
 * the ref (familyOf). Groups are collapsed by default to cut noise; a family and
 * text filter narrow the list. ET refs found only in recipes (not in the DB or
 * Product Spec) are flagged in their own group.
 */
export default function ElementPalette() {
  const elementTypes = useStore(s => s.elementTypes)
  const psRows = useStore(s => s.psRows)
  const recipes = useStore(s => s.recipes)

  const [search, setSearch] = useState('')
  const [familyFilter, setFamilyFilter] = useState('')
  const [expanded, setExpanded] = useState({})   // { [family]: true }

  // Merge all known ET refs from DB, PS, and recipes; tag a resolved family.
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
      .map(et => ({
        ...et,
        _family: et._undefinedRef ? FLAGGED_FAMILY : familyOf(et.ElementTypeRef || et.elementTypeRef, et),
      }))
      .sort((a, b) => (a.ElementTypeRef || '').localeCompare(b.ElementTypeRef || ''))
  }, [elementTypes, psRows, recipes])

  // Families present (excluding the flagged group, which always sorts last)
  const familyOptions = useMemo(() => {
    const set = new Set()
    for (const et of allETs) if (et._family !== FLAGGED_FAMILY) set.add(et._family)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [allETs])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return allETs.filter(et => {
      if (familyFilter && et._family !== familyFilter) return false
      if (!q) return true
      return (et.ElementTypeRef || '').toLowerCase().includes(q) ||
        (et.Name || '').toLowerCase().includes(q) ||
        (et._family || '').toLowerCase().includes(q)
    })
  }, [allETs, search, familyFilter])

  // Group by family; flagged group floats to the end
  const grouped = useMemo(() => {
    const normal = new Map()
    const flagged = []
    for (const et of filtered) {
      if (et._undefinedRef) { flagged.push(et); continue }
      if (!normal.has(et._family)) normal.set(et._family, [])
      normal.get(et._family).push(et)
    }
    const result = new Map(normal)
    if (flagged.length > 0) result.set(FLAGGED_FAMILY, flagged)
    return result
  }, [filtered])

  // While searching/filtering, force groups open so matches are visible
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
  function collapseAll() {
    setExpanded({})
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="p-2 border-bottom">
        <FilterBar
          text={search}
          onText={setSearch}
          placeholder="Search elements…"
          familyOptions={familyOptions}
          family={familyFilter}
          onFamily={setFamilyFilter}
          compact={false}
        />
        <div className="d-flex gap-2 mt-2">
          <button className="btn btn-link btn-sm p-0" style={{ fontSize: 11, textDecoration: 'none' }} onClick={expandAll}>
            Expand all
          </button>
          <button className="btn btn-link btn-sm p-0" style={{ fontSize: 11, textDecoration: 'none' }} onClick={collapseAll}>
            Collapse all
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
        {grouped.size === 0 && (
          <div className="text-muted small text-center py-3">No element types found.</div>
        )}
        {[...grouped.entries()].map(([family, ets]) => {
          const open = isOpen(family)
          return (
            <div key={family} className="mb-2">
              <div
                className="d-flex align-items-center gap-1 text-uppercase text-muted fw-bold mb-1"
                style={{ fontSize: 10, letterSpacing: 0.5, cursor: 'pointer', userSelect: 'none' }}
                onClick={() => toggle(family)}
              >
                <span style={{ width: 10 }}>{open ? '▾' : '▸'}</span>
                <span>{family}</span>
                <span className="text-muted" style={{ fontWeight: 400 }}>({ets.length})</span>
              </div>
              {open && ets.map(et => (
                <DraggableETCard key={et.ElementTypeRef || et.elementTypeRef} et={et} />
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DraggableETCard({ et }) {
  const ref = et.ElementTypeRef || et.elementTypeRef

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette-${ref}`,
    data: { type: 'palette-item', elementTypeRef: ref },
  })

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
        borderRadius: 4,
        background: et._undefinedRef ? '#fffbeb' : '#fff',
        userSelect: 'none',
        fontSize: 12,
      }}
    >
      <div className="fw-semibold" style={{ fontSize: 12 }}>{ref}</div>
      {et.Name && <div className="text-muted" style={{ fontSize: 11 }}>{et.Name}</div>}
      {et._undefinedRef && (
        <div style={{ fontSize: 10, color: '#b45309' }}>not in DB or spec</div>
      )}
    </div>
  )
}
