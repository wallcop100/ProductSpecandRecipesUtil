import React, { useState, useMemo } from 'react'
import { Form, Badge } from 'react-bootstrap'
import { useDraggable } from '@dnd-kit/core'
import useStore from '../store/useStore'

/**
 * ElementPalette — scrollable list of draggable element types, grouped by Family.
 * Also includes ET refs found only in recipes (not in the DB element_types list).
 */
export default function ElementPalette() {
  const elementTypes = useStore(s => s.elementTypes)
  const psRows = useStore(s => s.psRows)
  const recipes = useStore(s => s.recipes)
  const [search, setSearch] = useState('')

  // Merge all known ET refs from DB, PS, and recipes.
  // Flag only those that exist in recipes but in neither DB nor PS.
  const allETs = useMemo(() => {
    const dbRefs = new Set(elementTypes.map(et =>
      (et.ElementTypeRef || et.elementTypeRef || '').toLowerCase()
    ))
    const psRefs = new Set(psRows.map(r =>
      (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase()
    ))

    // Start with DB items
    const map = new Map()
    for (const et of elementTypes) {
      const key = (et.ElementTypeRef || et.elementTypeRef || '').toLowerCase()
      if (key) map.set(key, { ...et, _undefinedRef: false })
    }

    // Add PS-only items (in PS but not in DB)
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

    // Add recipe-only items (in recipes but in neither DB nor PS) — flagged
    for (const row of recipes) {
      const ref = row.ElementTypeRef || row.elementTypeRef || ''
      const key = ref.toLowerCase()
      if (!key || map.has(key)) continue
      map.set(key, {
        ElementTypeRef: ref,
        Name: null,
        Family: null,
        _undefinedRef: true,  // in recipes only — needs attention
      })
    }

    return [...map.values()].sort((a, b) =>
      (a.ElementTypeRef || '').localeCompare(b.ElementTypeRef || '')
    )
  }, [elementTypes, psRows, recipes])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return allETs
    return allETs.filter(et =>
      (et.ElementTypeRef || '').toLowerCase().includes(q) ||
      (et.Name || '').toLowerCase().includes(q) ||
      (et.Family || '').toLowerCase().includes(q)
    )
  }, [allETs, search])

  // Group by Family; undefined refs float to their own group at the end
  const grouped = useMemo(() => {
    const normal = new Map()
    const flagged = []
    for (const et of filtered) {
      if (et._undefinedRef) {
        flagged.push(et)
        continue
      }
      const family = et.Family || et.family || 'Ungrouped'
      if (!normal.has(family)) normal.set(family, [])
      normal.get(family).push(et)
    }
    const result = new Map(normal)
    if (flagged.length > 0) result.set('⚠ Recipe-only (not in DB or Spec)', flagged)
    return result
  }, [filtered])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="p-2 border-bottom">
        <Form.Control
          type="text"
          size="sm"
          placeholder="Search elements…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
        {grouped.size === 0 && (
          <div className="text-muted small text-center py-3">No element types found.</div>
        )}
        {[...grouped.entries()].map(([family, ets]) => (
          <div key={family} className="mb-3">
            <div
              className="text-uppercase text-muted fw-bold mb-1"
              style={{ fontSize: 10, letterSpacing: 0.5 }}
            >
              {family}
            </div>
            {ets.map(et => (
              <DraggableETCard key={et.ElementTypeRef || et.elementTypeRef} et={et} />
            ))}
          </div>
        ))}
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
