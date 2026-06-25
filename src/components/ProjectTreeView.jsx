import React, { useMemo, useState } from 'react'
import { Button } from 'react-bootstrap'
import useStore, { getRecipeForPosition } from '../store/useStore'
import RecipeSection from './RecipeSection'
import TagBadge from './TagBadge'
import FilterBar from './FilterBar'
import ConnectorSuggestions from './ConnectorSuggestions'
import ConnectorWizardModal from './ConnectorWizardModal'
import { TAG_GROUPS } from '../utils/constants'

/**
 * ProjectTreeView — the PositionTypes surface.
 *
 * Two states sharing the centre real estate:
 *   - Overview: a scannable list of every position (ref, tags, row count,
 *     validation) when nothing is selected.
 *   - Focused: clicking a position hands the whole surface to that one
 *     position's editor — it does not expand inline among the others.
 * The left index and breadcrumbs switch between positions; the back link
 * returns to the overview.
 */
export default function ProjectTreeView({ onOpenProductSpec, showDeleted }) {
  const positionTypes = useStore(s => s.positionTypes)
  const recipes = useStore(s => s.recipes)
  const positionUI = useStore(s => s.positionUI)
  const validationResults = useStore(s => s.validationResults)
  const activePositionRef = useStore(s => s.activePositionRef)
  const setActivePosition = useStore(s => s.setActivePosition)

  const [filter, setFilter] = useState('')
  const [activeTags, setActiveTags] = useState([])

  // Tags actually present across positions (ordered by TAG_GROUPS)
  const availableTags = useMemo(() => {
    const present = new Set()
    for (const ui of Object.values(positionUI)) {
      for (const t of (ui.tags || [])) present.add(t)
    }
    const ordered = []
    for (const group of Object.values(TAG_GROUPS)) {
      for (const t of group) if (present.has(t)) ordered.push(t)
    }
    for (const t of present) if (!ordered.includes(t)) ordered.push(t)
    return ordered
  }, [positionUI])

  function toggleTag(tag) {
    setActiveTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  // Index validation issues by positionTypeRef
  const issuesByRef = useMemo(() => {
    const map = {}
    for (const issue of validationResults) {
      if (issue.ref) (map[issue.ref] ||= []).push(issue)
    }
    return map
  }, [validationResults])

  // Row counts per position (excludes soft-deleted)
  const countByRef = useMemo(() => {
    const map = {}
    for (const r of recipes) {
      if ((r.IsDeleted || r.isDeleted) === 'Y') continue
      const pr = r.PositionTypeRef || r.positionTypeRef
      if (pr) map[pr] = (map[pr] || 0) + 1
    }
    return map
  }, [recipes])

  const tagGroupMap = useMemo(() => {
    const map = {}
    for (const [group, tags] of Object.entries(TAG_GROUPS)) {
      for (const tag of tags) map[tag] = group
    }
    return map
  }, [])

  const activePt = activePositionRef
    ? positionTypes.find(pt => pt.PositionTypeRef === activePositionRef)
    : null

  if (positionTypes.length === 0) {
    return <div className="text-muted text-center mt-5">No positions loaded.</div>
  }

  // ---- Focused editor: one position takes the whole surface ----
  if (activePt) {
    return (
      <FocusedPositionEditor
        pt={activePt}
        tags={positionUI[activePositionRef]?.tags || []}
        tagGroupMap={tagGroupMap}
        issues={issuesByRef[activePositionRef] || []}
        count={countByRef[activePositionRef] || 0}
        showDeleted={showDeleted}
        onOpenProductSpec={onOpenProductSpec}
        onBack={() => setActivePosition(null)}
      />
    )
  }

  // ---- Overview list ----
  const q = filter.trim().toLowerCase()
  const visible = positionTypes.filter(pt => {
    const ref = pt.PositionTypeRef || ''
    const name = pt.Name || pt.name || ''
    const tags = positionUI[ref]?.tags || []
    if (activeTags.length > 0 && !activeTags.every(t => tags.includes(t))) return false
    if (!q) return true
    return ref.toLowerCase().includes(q) ||
      name.toLowerCase().includes(q) ||
      tags.some(t => t.toLowerCase().includes(q))
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        className="d-flex align-items-center gap-2 px-3 py-2 border-bottom bg-white"
        style={{ flexShrink: 0, position: 'sticky', top: 0, zIndex: 2 }}
      >
        <strong className="small text-uppercase text-muted" style={{ letterSpacing: 0.5 }}>
          Position Types
        </strong>
        <div className="ms-auto" style={{ width: 360 }}>
          <FilterBar
            text={filter}
            onText={setFilter}
            placeholder="Filter positions…"
            tagOptions={availableTags}
            activeTags={activeTags}
            onToggleTag={toggleTag}
          />
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0.75rem' }}>
        {visible.length === 0 && (
          <div className="text-muted text-center mt-4 small">No positions match the filter.</div>
        )}
        {visible.map(pt => {
          const ref = pt.PositionTypeRef
          const name = pt.Name || pt.name || ''
          const tags = positionUI[ref]?.tags || []
          const issues = issuesByRef[ref] || []
          const count = countByRef[ref] || 0
          const hasError = issues.some(i => i.severity === 'error')
          const hasWarning = issues.some(i => i.severity === 'warning')
          return (
            <div
              key={ref}
              onClick={() => setActivePosition(ref)}
              className="d-flex align-items-center gap-2 px-2 py-2 mb-1"
              style={{
                cursor: 'pointer',
                border: '1px solid #e5e7eb',
                borderLeft: '3px solid #e5e7eb',
                borderRadius: 6,
                background: '#fff',
              }}
            >
              <span className="fw-semibold" style={{ fontSize: 13 }}>{ref}</span>
              {name && name !== ref && <span className="text-muted" style={{ fontSize: 11 }}>{name}</span>}
              {tags.slice(0, 4).map(tag => (
                <TagBadge key={tag} tag={tag} group={tagGroupMap[tag] || 'Special'} />
              ))}
              <div className="flex-grow-1" />
              {count > 0
                ? <span className="badge bg-light text-dark border" style={{ fontSize: 10 }}>{count} {count === 1 ? 'row' : 'rows'}</span>
                : <span className="text-muted fst-italic" style={{ fontSize: 11 }}>empty</span>}
              {hasError && <span title="Has errors" style={{ color: '#dc3545', fontSize: 13 }}>●</span>}
              {!hasError && hasWarning && <span title="Has warnings" style={{ color: '#ffc107', fontSize: 13 }}>●</span>}
              <span className="text-muted" style={{ fontSize: 16, lineHeight: 1 }}>›</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// FocusedPositionEditor — full-surface editor for a single position
// ---------------------------------------------------------------------------

function FocusedPositionEditor({ pt, tags, tagGroupMap, issues, count, showDeleted, onOpenProductSpec, onBack }) {
  const recipes = useStore(s => s.recipes)
  const ref = pt.PositionTypeRef
  const name = pt.Name || pt.name || ''
  const validationRun = useStore(s => s.validationResults).length > 0
  const [showConnectors, setShowConnectors] = useState(false)

  const hasError = issues.some(i => i.severity === 'error')
  const hasWarning = issues.some(i => i.severity === 'warning')

  function filterDeleted(rows) {
    return showDeleted ? rows : rows.filter(r => (r.IsDeleted || r.isDeleted) !== 'Y')
  }

  const grouped = getRecipeForPosition(recipes, ref)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Focused header */}
      <div
        className="d-flex align-items-center gap-2 px-3 py-2 border-bottom bg-white"
        style={{ flexShrink: 0 }}
      >
        <Button variant="outline-secondary" size="sm" style={{ fontSize: 11 }} onClick={onBack}>
          ← All position types
        </Button>
        <span className="fw-semibold" style={{ fontSize: 15 }}>{ref}</span>
        {name && name !== ref && <span className="text-muted" style={{ fontSize: 12 }}>{name}</span>}
        {tags.map(tag => (
          <TagBadge key={tag} tag={tag} group={tagGroupMap[tag] || 'Special'} />
        ))}
        <div className="flex-grow-1" />
        <Button variant="outline-primary" size="sm" style={{ fontSize: 11 }} onClick={() => setShowConnectors(true)}>
          + Connector
        </Button>
        {hasError && <span title="Has errors" style={{ color: '#dc3545', fontSize: 14 }}>● errors</span>}
        {!hasError && hasWarning && <span title="Has warnings" style={{ color: '#ffc107', fontSize: 14 }}>● warnings</span>}
        {!hasError && !hasWarning && count > 0 && validationRun && (
          <span style={{ color: '#198754', fontSize: 13 }}>● ok</span>
        )}
      </div>

      {/* Editor body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
        {count === 0 && (
          <div className="text-muted small mb-3">
            No recipe yet — drag an element from the palette, use the Templates tab to apply
            one, or add a connection with <span className="fw-semibold">+ Connector</span>.
          </div>
        )}
        <ConnectorSuggestions posRef={ref} />
        <RecipeSection
          title="Position Level"
          sectionKey="position"
          rows={filterDeleted(grouped.position)}
          posRef={ref}
          onOpenProductSpec={onOpenProductSpec}
        />
        <div className="text-muted mb-3" style={{ fontSize: 11 }}>
          Element internals are shown read-only on each container row above — use
          <span className="fw-semibold"> Edit internals → </span> to change them.
        </div>
      </div>

      <ConnectorWizardModal show={showConnectors} posRef={ref} context="position" onClose={() => setShowConnectors(false)} />
    </div>
  )
}
