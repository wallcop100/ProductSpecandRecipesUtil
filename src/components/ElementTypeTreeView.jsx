import React, { useMemo, useState } from 'react'
import { Button, Form } from 'react-bootstrap'
import useStore from '../store/useStore'
import FilterBar from './FilterBar'
import MaterialIcon from './MaterialIcon'
import ContentsBadge from './ContentsBadge'
import { getInternalItems, getUsedIn } from '../utils/containerUtils'
import { familyOf } from '../utils/etRef'
import { colorsForType, ICONS } from '../utils/entityStyle'

/**
 * ElementTypeTreeView — the Elements root view.
 *
 * Lists every container element type (those that appear as a recipe ContextRef,
 * i.e. have an internal recipe), with its internal-item count and how many
 * positions use it. Selecting one opens the shared ET editor (via openETRecipe),
 * which BuilderScreen renders as the focused internal-recipe editor.
 */
export default function ElementTypeTreeView() {
  const recipes = useStore(s => s.recipes)
  const elementTypes = useStore(s => s.elementTypes)
  const activeETRef = useStore(s => s.activeETRef)
  const openETRecipe = useStore(s => s.openETRecipe)
  const addLocalElementType = useStore(s => s.addLocalElementType)
  const toggleContainerET = useStore(s => s.toggleContainerET)
  const containerETRefs = useStore(s => s.containerETRefs)

  const [filter, setFilter] = useState('')
  const [familyFilter, setFamilyFilter] = useState('')
  const [newWrapperRef, setNewWrapperRef] = useState(null)  // null = not creating

  async function createBlankWrapper() {
    const ref = (newWrapperRef || '').trim()
    if (!ref) { setNewWrapperRef(null); return }
    addLocalElementType(ref)
    // Force it to count as a wrapper (manual include) if not already detected.
    if (!containerETRefs.has(ref.toLowerCase())) await toggleContainerET(ref)
    setNewWrapperRef(null)
    openETRecipe(ref)   // jump straight into its (empty) internal recipe
  }

  const etMap = useMemo(() => {
    const m = new Map()
    for (const et of elementTypes) {
      const ref = et.ElementTypeRef || et.elementTypeRef
      if (ref) m.set(ref.toLowerCase(), et)
    }
    return m
  }, [elementTypes])

  // Container ETs = unique ContextRefs used as ElementType context, PLUS any ET
  // flagged a container (e.g. a freshly-created blank wrapper with no internals yet).
  const containers = useMemo(() => {
    const set = new Set(
      recipes
        .filter(r => (r.ContextType || r.contextType) === 'ElementType')
        .map(r => (r.ContextRef || r.contextRef))
        .filter(Boolean)
    )
    // Include flagged containers that don't yet have internal rows
    for (const et of elementTypes) {
      const r = et.ElementTypeRef || et.elementTypeRef
      if (r && containerETRefs.has(r.toLowerCase())) set.add(r)
    }
    const refs = [...set]
    return refs
      .map(ref => {
        const et = etMap.get(ref.toLowerCase())
        const usedIn = getUsedIn(ref, recipes, null)
        return {
          ref,
          name: et?.Name || et?.name || null,
          family: familyOf(ref, et),
          itemCount: getInternalItems(ref, recipes, elementTypes).length,
          usedIn,
        }
      })
      .sort((a, b) => a.ref.localeCompare(b.ref))
  }, [recipes, elementTypes, etMap, containerETRefs])

  const familyOptions = useMemo(
    () => [...new Set(containers.map(c => c.family))].sort((a, b) => a.localeCompare(b)),
    [containers]
  )

  const q = filter.trim().toLowerCase()
  // Text filter matches the ref, name, OR any position it's used in
  const visible = containers.filter(c => {
    if (familyFilter && c.family !== familyFilter) return false
    if (!q) return true
    return c.ref.toLowerCase().includes(q) ||
      (c.name && c.name.toLowerCase().includes(q)) ||
      c.usedIn.some(p => p.toLowerCase().includes(q))
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div
        className="d-flex align-items-center gap-2 px-3 py-2 border-bottom bg-white"
        style={{ flexShrink: 0, position: 'sticky', top: 0, zIndex: 2 }}
      >
        <strong className="small text-uppercase text-muted" style={{ letterSpacing: 0.5 }}>
          Element Types ({containers.length})
        </strong>
        {newWrapperRef === null ? (
          <Button variant="outline-primary" size="sm" style={{ fontSize: 11 }} onClick={() => setNewWrapperRef('')}>
            + New wrapper
          </Button>
        ) : (
          <div className="d-flex gap-1 align-items-center">
            <Form.Control
              size="sm" autoFocus style={{ width: 200, fontSize: 12 }}
              placeholder="New wrapper ref (e.g. ET-DL-99)"
              value={newWrapperRef}
              onChange={e => setNewWrapperRef(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createBlankWrapper(); if (e.key === 'Escape') setNewWrapperRef(null) }}
            />
            <Button variant="success" size="sm" style={{ fontSize: 11 }} onClick={createBlankWrapper}>Create</Button>
            <Button variant="link" size="sm" style={{ fontSize: 11 }} onClick={() => setNewWrapperRef(null)}>Cancel</Button>
          </div>
        )}
        <div className="ms-auto" style={{ width: 420 }}>
          <FilterBar
            text={filter}
            onText={setFilter}
            placeholder="Filter by ref or used-in position…"
            familyOptions={familyOptions}
            family={familyFilter}
            onFamily={setFamilyFilter}
          />
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0.75rem' }}>
        {containers.length === 0 && (
          <div className="text-muted text-center mt-4 small">
            No container element types yet — they appear here once a position uses a DL/LIN
            element with internal items.
          </div>
        )}
        {containers.length > 0 && visible.length === 0 && (
          <div className="text-muted text-center mt-4 small">No element types match “{filter}”.</div>
        )}
        {visible.map(c => {
          const active = c.ref === activeETRef
          const { accent, fill } = colorsForType('ElementType')
          const usedInLabel = c.usedIn.length > 0 ? c.usedIn.join(', ') : 'not used in any position'
          return (
            <div
              key={c.ref}
              onClick={() => openETRecipe(c.ref)}
              className="px-2 py-2 mb-1"
              style={{
                cursor: 'pointer',
                border: '1px solid #e5e7eb',
                borderLeft: `3px solid ${accent}`,
                borderRadius: 6,
                background: active ? fill : '#fff',
              }}
            >
              <div className="d-flex align-items-center gap-2">
                <MaterialIcon name={ICONS.collection} size={18} style={{ color: accent }} title="Collection" />
                <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600 }}>{c.ref}</span>
                {c.name && <span className="text-muted" style={{ fontSize: 11 }}>{c.name}</span>}
                <div className="flex-grow-1" />
                <ContentsBadge count={c.itemCount} title={`${c.itemCount} internal items`} />
                <span className="badge bg-light text-dark border" style={{ fontSize: 10 }} title={usedInLabel}>
                  used in {c.usedIn.length}
                </span>
              </div>
              {/* Used-in at a glance (full list on hover via title) */}
              <div
                className="text-muted text-truncate"
                style={{ fontSize: 10, marginTop: 2 }}
                title={usedInLabel}
              >
                {c.usedIn.length > 0
                  ? <>→ {usedInLabel}</>
                  : <span className="fst-italic">not used in any position</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
