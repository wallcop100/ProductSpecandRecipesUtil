import React, { useMemo, useState, useEffect } from 'react'
import { Button } from 'react-bootstrap'
import useStore, { getRecipeForPosition } from '../store/useStore'
import TagBadge from './TagBadge'
import FilterBar from './FilterBar'
import PositionRecipeEditor from './PositionRecipeEditor'
import MaterialIcon from './MaterialIcon'
import IconButton from './IconButton'
import PositionValidationBadge from './PositionValidationBadge'
import ConnectorSuggestions from './ConnectorSuggestions'
import CollectionBadge from './CollectionBadge'
import FormCoverageBadge from './FormCoverageBadge'
import { formWorklist } from '../utils/formSpec'
import EmptyPositionWizard from './EmptyPositionWizard'
import TagDriftWizard from './TagDriftWizard'
import { colorsForType, ICONS, ACTION_ICONS } from '../utils/entityStyle'
import { positionFamilyOf } from '../utils/positionFamily'

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
export default function ProjectTreeView({ onOpenProductSpec, onOpenConnectors, showDeleted, onAddRow, onNewET, onReplace }) {
  const positionTypes = useStore(s => s.positionTypes)
  const recipes = useStore(s => s.recipes)
  const positionUI = useStore(s => s.positionUI)
  const validationResults = useStore(s => s.validationResults)
  const activePositionRef = useStore(s => s.activePositionRef)
  const setActivePosition = useStore(s => s.setActivePosition)
  const toggleIgnorePosition = useStore(s => s.toggleIgnorePosition)
  const ignoredPositionFamilies = useStore(s => s.ignoredPositionFamilies)
  const toggleIgnorePositionFamily = useStore(s => s.toggleIgnorePositionFamily)
  const tagDrift = useStore(s => s.tagDrift)

  const [filter, setFilter] = useState('')
  const [formOnly, setFormOnly] = useState(false)   // "Form incomplete" chip
  const [activeTags, setActiveTags] = useState([])
  const [showEmptyWizard, setShowEmptyWizard] = useState(false)
  const [showDriftWizard, setShowDriftWizard] = useState(false)
  const [showIgnored, setShowIgnored] = useState(false)
  const [collapsedFamilies, setCollapsedFamilies] = useState(() => new Set())
  const [showTags, setShowTags] = useState(false)      // overview per-row tags (default off)
  const [showStatus, setShowStatus] = useState(false)  // overview per-row validation/connector status (default off)
  const driftCount = Object.keys(tagDrift || {}).length

  const NO_FAMILY = '(no family)'
  function groupByFamily(pts) {
    const map = new Map()
    for (const pt of pts) {
      const fam = positionFamilyOf(pt) || NO_FAMILY
      if (!map.has(fam)) map.set(fam, [])
      map.get(fam).push(pt)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }
  function toggleFamilyCollapse(fam) {
    setCollapsedFamilies(prev => {
      const next = new Set(prev)
      if (next.has(fam)) next.delete(fam); else next.add(fam)
      return next
    })
  }

  // Tags actually present across positions (alphabetical)
  const availableTags = useMemo(() => {
    const present = new Set()
    for (const ui of Object.values(positionUI)) {
      for (const t of (ui.tags || [])) present.add(t)
    }
    return [...present].sort((a, b) => a.localeCompare(b))
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

  const ignoredFamilySet = useMemo(() => new Set(ignoredPositionFamilies), [ignoredPositionFamilies])

  // A position is "ignored" if individually flagged, or its family is ignored.
  const isIgnoredPt = (pt) =>
    !!positionUI[pt.PositionTypeRef]?.ignored ||
    (ignoredFamilySet.size > 0 && ignoredFamilySet.has(positionFamilyOf(pt)))

  // Positions with no recipe rows and not ignored (individually or by family)
  const emptyCount = useMemo(() => positionTypes.reduce((n, pt) => {
    const ref = pt.PositionTypeRef
    return (!countByRef[ref] && !isIgnoredPt(pt)) ? n + 1 : n
  }, 0), [positionTypes, countByRef, positionUI, ignoredFamilySet])

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
        issues={issuesByRef[activePositionRef] || []}
        count={countByRef[activePositionRef] || 0}
        showDeleted={showDeleted}
        onOpenProductSpec={onOpenProductSpec}
        onOpenConnectors={onOpenConnectors}
        onBack={() => setActivePosition(null)}
        onAddRow={onAddRow}
        onNewET={onNewET}
        onReplace={onReplace}
      />
    )
  }

  // ---- Overview list ----
  // Positions the Form is not yet satisfied on. Silent when no Form is attached.
  const formCaptures = useStore(s => s.formCaptures)
  const containerETRefs = useStore(s => s.containerETRefs)
  const incompleteRefs = useMemo(
    () => new Set(formWorklist(recipes, formCaptures, containerETRefs).map(w => w.posRef)),
    [recipes, formCaptures, containerETRefs]
  )

  const q = filter.trim().toLowerCase()
  const visible = positionTypes.filter(pt => {
    const ref = pt.PositionTypeRef || ''
    const name = pt.Name || pt.name || ''
    const tags = positionUI[ref]?.tags || []
    if (activeTags.length > 0 && !activeTags.every(t => tags.includes(t))) return false
    if (formOnly && !incompleteRefs.has(ref)) return false
    if (!q) return true
    return ref.toLowerCase().includes(q) ||
      name.toLowerCase().includes(q) ||
      tags.some(t => t.toLowerCase().includes(q))
  })

  // Ignored positions/families are out-of-scope: kept out of the main list and
  // every total, but revealed in a collapsible "Ignored" section so they stay
  // reachable to un-ignore or edit.
  const activeVisible = visible.filter(pt => !isIgnoredPt(pt))
  const ignoredVisible = visible.filter(pt => isIgnoredPt(pt))

  function renderPositionRow(pt) {
    const ref = pt.PositionTypeRef
    const name = pt.Name || pt.name || ''
    const tags = positionUI[ref]?.tags || []
    const count = countByRef[ref] || 0
    const ownIgnored = !!positionUI[ref]?.ignored
    const family = positionFamilyOf(pt)
    const familyIgnored = !!family && ignoredFamilySet.has(family)
    const isIgnored = ownIgnored || familyIgnored
    const drifted = !!(tagDrift && tagDrift[ref])
    return (
      <div
        key={ref}
        onClick={() => setActivePosition(ref)}
        className="d-flex align-items-center gap-2 px-2 py-2 mb-1"
        style={{
          cursor: 'pointer',
          border: '1px solid #e5e7eb',
          borderLeft: `3px solid ${colorsForType('PositionType').accent}`,
          borderRadius: 6,
          background: '#fff',
          opacity: isIgnored ? 0.55 : 1,
        }}
      >
        <MaterialIcon name={ICONS.position} size={18} style={{ color: colorsForType('PositionType').accent }} title="Position" />
        <span className="fw-semibold" style={{ fontSize: 13 }}>{ref}</span>
        {name && name !== ref && <span className="text-muted" style={{ fontSize: 11 }}>{name}</span>}
        {ownIgnored && (
          <span className="badge" style={{ background: '#fff3cd', color: '#856404', fontSize: 10, border: '1px solid #ffc107' }}>
            Ignore
          </span>
        )}
        {familyIgnored && (
          <span className="badge" style={{ background: '#fff3cd', color: '#856404', fontSize: 10, border: '1px solid #ffc107' }}
            title={`Family “${family}” is ignored`}>
            family ignored
          </span>
        )}
        {showTags && tags.slice(0, 4).map(tag => (
          <TagBadge key={tag} tag={tag} />
        ))}
        {drifted && (
          <MaterialIcon
            name="warning" size={14}
            style={{ color: '#e0a800', cursor: 'pointer', flexShrink: 0 }}
            title="Rule-derived tags changed since last accepted — click to review"
            onClick={e => { e.stopPropagation(); setShowDriftWizard(true) }}
          />
        )}
        <CollectionBadge posRef={ref} />
        {/* Silent unless a Form template is attached and mentions this position. */}
        <FormCoverageBadge posRef={ref} />
        <div className="flex-grow-1" />
        {count > 0
          ? <span className="badge bg-light text-dark border" style={{ fontSize: 10 }}>{count} {count === 1 ? 'row' : 'rows'}</span>
          : <span className="text-muted fst-italic" style={{ fontSize: 11 }}>empty</span>}
        {showStatus && !isIgnored && <PositionValidationBadge posRef={ref} size={14} />}
        {/* Ignore toggle — stop propagation so it doesn't open the position */}
        <button
          className="btn btn-link p-0"
          style={{ fontSize: 14, color: isIgnored ? '#ffc107' : '#ccc', lineHeight: 1 }}
          title={isIgnored ? 'Remove Ignore flag' : 'Flag as no recipe needed'}
          onClick={e => { e.stopPropagation(); toggleIgnorePosition(ref) }}
        >
          <MaterialIcon name={isIgnored ? 'do_not_disturb_on' : 'do_not_disturb_off'} size={16} />
        </button>
        <MaterialIcon name="chevron_right" size={18} className="text-muted" />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }} data-debug-id="ProjectTreeView/Overview (main surface)">
      <div
        className="d-flex align-items-center gap-2 px-3 py-2 border-bottom bg-white"
        style={{ flexShrink: 0, position: 'sticky', top: 0, zIndex: 2 }}
      >
        <strong className="small text-uppercase text-muted" style={{ letterSpacing: 0.5 }}>
          PositionTypes
        </strong>
        <Button
          variant={emptyCount > 0 ? 'outline-warning' : 'outline-secondary'}
          size="sm"
          style={{ fontSize: 11 }}
          disabled={emptyCount === 0}
          onClick={() => setShowEmptyWizard(true)}
          title="Step through positions with no recipe and flag the ones to ignore"
        >
          Review empty{emptyCount > 0 ? ` (${emptyCount})` : ''}
        </Button>
        {driftCount > 0 && (
          <Button
            variant="warning"
            size="sm"
            style={{ fontSize: 11 }}
            onClick={() => setShowDriftWizard(true)}
            title="Positions whose rule-derived tags changed since the last accepted baseline"
          >
            Tag changes ({driftCount})
          </Button>
        )}
        <div className="ms-auto d-flex align-items-center gap-2">
          {/* Per-row detail toggles — default off to keep the list scannable */}
          <Button
            variant={showTags ? 'secondary' : 'outline-secondary'} size="sm"
            style={{ fontSize: 11 }} onClick={() => setShowTags(v => !v)}
            title="Show tags on each row"
          >Tags</Button>
          <Button
            variant={showStatus ? 'secondary' : 'outline-secondary'} size="sm"
            style={{ fontSize: 11 }} onClick={() => setShowStatus(v => !v)}
            title="Show validation / connector status on each row"
          >Status</Button>
          <div style={{ width: 300 }}>
            <FilterBar
              text={filter}
              onText={setFilter}
              placeholder="Filter positions…"
              tagOptions={availableTags}
              activeTags={activeTags}
              onToggleTag={toggleTag}
              extraChips={formCaptures ? [{
                key: 'form-incomplete',
                label: `Form incomplete${incompleteRefs.size ? ` (${incompleteRefs.size})` : ''}`,
                active: formOnly,
                onToggle: () => setFormOnly(v => !v),
                title: 'Only positions missing a product the Form specifies, or holding one it has dropped',
              }] : []}
            />
          </div>
        </div>
      </div>

      <EmptyPositionWizard
        show={showEmptyWizard}
        onHide={() => setShowEmptyWizard(false)}
        onOpenPosition={(ref) => { setShowEmptyWizard(false); setActivePosition(ref) }}
      />

      <TagDriftWizard
        show={showDriftWizard}
        onHide={() => setShowDriftWizard(false)}
        onOpenPosition={(ref) => { setShowDriftWizard(false); setActivePosition(ref) }}
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0.75rem' }}>
        {activeVisible.length === 0 && ignoredVisible.length === 0 && (
          <div className="text-muted text-center mt-4 small">No PositionTypes match the filter.</div>
        )}
        {activeVisible.length === 0 && ignoredVisible.length > 0 && (
          <div className="text-muted text-center mt-4 small">All matching PositionTypes are ignored.</div>
        )}

        {/* Active PositionTypes, grouped into collapsible family sections. */}
        {groupByFamily(activeVisible).map(([fam, pts]) => {
          const realFam = fam !== NO_FAMILY
          const collapsed = collapsedFamilies.has(fam)
          return (
            <div key={fam} className="mb-2">
              <div
                className="d-flex align-items-center gap-2 px-2 py-1 mb-1"
                style={{ borderBottom: '2px solid #e5e7eb', cursor: 'pointer', userSelect: 'none' }}
                onClick={() => toggleFamilyCollapse(fam)}
              >
                <MaterialIcon name={collapsed ? ACTION_ICONS.collapse : ACTION_ICONS.expand} size={16} style={{ color: '#888' }} />
                <span className="fw-bold text-uppercase" style={{ fontSize: 11, letterSpacing: 0.5 }}>{fam}</span>
                <span className="text-muted" style={{ fontSize: 11 }}>({pts.length})</span>
                <div className="flex-grow-1" />
                {realFam && (
                  <Button
                    variant="link" size="sm"
                    className="p-0 d-inline-flex align-items-center gap-1"
                    style={{ fontSize: 11, textDecoration: 'none', color: '#adb5bd' }}
                    onMouseEnter={e => { e.currentTarget.style.color = '#e0a800' }}
                    onMouseLeave={e => { e.currentTarget.style.color = '#adb5bd' }}
                    onClick={e => { e.stopPropagation(); toggleIgnorePositionFamily(fam) }}
                    title={`Ignore every PositionType in the “${fam}” family — they move to the Ignored section below`}
                  >
                    <MaterialIcon name="do_not_disturb_on" size={14} /> Ignore family
                  </Button>
                )}
              </div>
              {!collapsed && pts.map(renderPositionRow)}
            </div>
          )
        })}

        {/* Ignored PositionTypes — hidden by default, grouped so a whole
            ignored family can be un-ignored from its header. */}
        {ignoredVisible.length > 0 && (
          <div className="mt-3">
            <button
              className="btn btn-link p-0 text-muted small text-decoration-none"
              onClick={() => setShowIgnored(v => !v)}
            >
              <MaterialIcon name={showIgnored ? ACTION_ICONS.expand : ACTION_ICONS.collapse} size={14} /> Ignored ({ignoredVisible.length})
            </button>
            {showIgnored && (
              <div className="mt-2">
                {groupByFamily(ignoredVisible).map(([fam, pts]) => {
                  const familyIgnored = fam !== NO_FAMILY && ignoredFamilySet.has(fam)
                  return (
                    <div key={fam} className="mb-2">
                      <div className="d-flex align-items-center gap-2 px-2 py-1 mb-1"
                        style={{ borderBottom: '1px solid #eee' }}>
                        <span className="fw-bold text-uppercase text-muted" style={{ fontSize: 11, letterSpacing: 0.5 }}>{fam}</span>
                        <span className="text-muted" style={{ fontSize: 11 }}>({pts.length})</span>
                        <div className="flex-grow-1" />
                        {familyIgnored && (
                          <Button
                            variant="link" size="sm"
                            className="p-0 d-inline-flex align-items-center gap-1 text-success"
                            style={{ fontSize: 11, textDecoration: 'none' }}
                            onClick={() => toggleIgnorePositionFamily(fam)}
                            title={`Un-ignore the whole “${fam}” family`}
                          >
                            <MaterialIcon name="do_not_disturb_off" size={14} /> Un-ignore family
                          </Button>
                        )}
                      </div>
                      {pts.map(renderPositionRow)}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// FocusedPositionEditor — full-surface editor for a single position
// ---------------------------------------------------------------------------

function FocusedPositionEditor({ pt, tags, count, showDeleted, onOpenProductSpec, onOpenConnectors, onBack, onAddRow, onNewET, onReplace }) {
  return (
    <PositionRecipeEditor
      posRef={pt.PositionTypeRef}
      name={pt.Name || pt.name || ''}
      tags={tags}
      count={count}
      showDeleted={showDeleted}
      onOpenProductSpec={onOpenProductSpec}
      onOpenConnectors={onOpenConnectors}
      onAddRow={onAddRow}
      onNewET={onNewET}
      onReplace={onReplace}
      showBack
      onBack={onBack}
    />
  )
}
