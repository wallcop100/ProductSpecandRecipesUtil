import React, { useMemo, useState, useEffect } from 'react'
import { Button } from 'react-bootstrap'
import useStore, { getRecipeForPosition } from '../store/useStore'
import RecipeSection from './RecipeSection'
import TagBadge from './TagBadge'
import FilterBar from './FilterBar'
import MaterialIcon from './MaterialIcon'
import ConnectorSuggestions from './ConnectorSuggestions'
import CollectionBadge from './CollectionBadge'
import EmptyPositionWizard from './EmptyPositionWizard'
import TagDriftWizard from './TagDriftWizard'
import { colorsForType, ICONS } from '../utils/entityStyle'
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
export default function ProjectTreeView({ onOpenProductSpec, onOpenConnectors, showDeleted }) {
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
  const [activeTags, setActiveTags] = useState([])
  const [showEmptyWizard, setShowEmptyWizard] = useState(false)
  const [showDriftWizard, setShowDriftWizard] = useState(false)
  const [showIgnored, setShowIgnored] = useState(false)
  const driftCount = Object.keys(tagDrift || {}).length

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

  // Ignored positions/families are out-of-scope: kept out of the main list and
  // every total, but revealed in a collapsible "Ignored" section so they stay
  // reachable to un-ignore or edit.
  const activeVisible = visible.filter(pt => !isIgnoredPt(pt))
  const ignoredVisible = visible.filter(pt => isIgnoredPt(pt))

  function renderPositionRow(pt) {
    const ref = pt.PositionTypeRef
    const name = pt.Name || pt.name || ''
    const tags = positionUI[ref]?.tags || []
    const issues = issuesByRef[ref] || []
    const count = countByRef[ref] || 0
    const hasError = issues.some(i => i.severity === 'error')
    const hasWarning = issues.some(i => i.severity === 'warning')
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
        {family && (
          <span
            className="badge"
            style={{
              background: familyIgnored ? '#fff3cd' : '#eef1f5',
              color: familyIgnored ? '#856404' : '#5a6472',
              border: `1px solid ${familyIgnored ? '#ffc107' : '#d4dae2'}`,
              fontSize: 10, cursor: 'pointer',
            }}
            title={familyIgnored
              ? `Family “${family}” is ignored — click to un-ignore the whole family`
              : `Click to ignore the whole “${family}” family`}
            onClick={e => { e.stopPropagation(); toggleIgnorePositionFamily(family) }}
          >
            {familyIgnored ? `family ignored: ${family}` : `⌥ ${family}`}
          </span>
        )}
        {tags.slice(0, 4).map(tag => (
          <TagBadge key={tag} tag={tag} />
        ))}
        {drifted && (
          <span
            className="badge"
            style={{ background: '#fff3cd', color: '#856404', fontSize: 10, border: '1px solid #ffc107', cursor: 'pointer' }}
            title="Rule-derived tags changed since last accepted — click to review"
            onClick={e => { e.stopPropagation(); setShowDriftWizard(true) }}
          >
            ⚠ tags changed
          </span>
        )}
        <CollectionBadge posRef={ref} />
        <div className="flex-grow-1" />
        {count > 0
          ? <span className="badge bg-light text-dark border" style={{ fontSize: 10 }}>{count} {count === 1 ? 'row' : 'rows'}</span>
          : <span className="text-muted fst-italic" style={{ fontSize: 11 }}>empty</span>}
        {!isIgnored && hasError && <span title="Has errors" style={{ color: '#dc3545', fontSize: 13 }}>●</span>}
        {!isIgnored && !hasError && hasWarning && <span title="Has warnings" style={{ color: '#ffc107', fontSize: 13 }}>●</span>}
        {/* Ignore toggle — stop propagation so it doesn't open the position */}
        <button
          className="btn btn-link p-0"
          style={{ fontSize: 14, color: isIgnored ? '#ffc107' : '#ccc', lineHeight: 1 }}
          title={isIgnored ? 'Remove Ignore flag' : 'Flag as no recipe needed'}
          onClick={e => { e.stopPropagation(); toggleIgnorePosition(ref) }}
        >
          <MaterialIcon name={isIgnored ? 'do_not_disturb_on' : 'do_not_disturb_off'} size={16} />
        </button>
        <span className="text-muted" style={{ fontSize: 16, lineHeight: 1 }}>›</span>
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
          Position Types
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
          <div className="text-muted text-center mt-4 small">No positions match the filter.</div>
        )}
        {activeVisible.length === 0 && ignoredVisible.length > 0 && (
          <div className="text-muted text-center mt-4 small">All matching positions are ignored.</div>
        )}
        {activeVisible.map(renderPositionRow)}

        {/* Ignored positions — hidden by default to cut noise, but reachable */}
        {ignoredVisible.length > 0 && (
          <div className="mt-3">
            <button
              className="btn btn-link p-0 text-muted small text-decoration-none"
              onClick={() => setShowIgnored(v => !v)}
            >
              {showIgnored ? '▾' : '▸'} Ignored ({ignoredVisible.length})
            </button>
            {showIgnored && (
              <div className="mt-2">
                {ignoredVisible.map(renderPositionRow)}
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

function FocusedPositionEditor({ pt, tags, issues, count, showDeleted, onOpenProductSpec, onOpenConnectors, onBack }) {
  const recipes = useStore(s => s.recipes)
  const ref = pt.PositionTypeRef
  const name = pt.Name || pt.name || ''
  const validationRun = useStore(s => s.validationResults).length > 0

  // Copy / paste
  const selectedRowIds = useStore(s => s.selectedRowIds)
  const clearRowSelection = useStore(s => s.clearRowSelection)
  const copySelectedRows = useStore(s => s.copySelectedRows)
  const copyPositionRecipe = useStore(s => s.copyPositionRecipe)
  const pasteClipboard = useStore(s => s.pasteClipboard)
  const rowClipboard = useStore(s => s.rowClipboard)
  const [pasteMsg, setPasteMsg] = useState(null)

  const hasError = issues.some(i => i.severity === 'error')
  const hasWarning = issues.some(i => i.severity === 'warning')

  function filterDeleted(rows) {
    return showDeleted ? rows : rows.filter(r => (r.IsDeleted || r.isDeleted) !== 'Y')
  }

  const grouped = getRecipeForPosition(recipes, ref)

  function flashPaste(msg) {
    setPasteMsg(msg)
    setTimeout(() => setPasteMsg(null), 2500)
  }
  function doCopySelection() {
    const clip = copySelectedRows()
    if (clip) flashPaste(`Copied ${clip.count} row${clip.count === 1 ? '' : 's'}`)
  }
  function doPaste() {
    const n = pasteClipboard(ref)
    if (n > 0) flashPaste(`Pasted ${n} row${n === 1 ? '' : 's'} into ${ref}`)
  }

  // Keyboard: Ctrl/Cmd+C copies the selection, Ctrl/Cmd+V pastes into this position.
  // Ignored only while typing in a TEXT field — checkboxes/buttons (e.g. the row
  // select box) must NOT swallow the shortcut, otherwise copy fails right after
  // ticking a row.
  useEffect(() => {
    function onKey(e) {
      const t = e.target
      const tag = t?.tagName
      const type = (t?.type || '').toLowerCase()
      const isTextField =
        tag === 'TEXTAREA' || t?.isContentEditable ||
        (tag === 'INPUT' && !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(type))
      if (isTextField) return
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key === 'c' && selectedRowIds.length > 0) { e.preventDefault(); doCopySelection() }
      else if (e.key === 'v' && rowClipboard) { e.preventDefault(); doPaste() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRowIds, rowClipboard, ref])

  // Clear any stale selection when switching positions
  useEffect(() => { clearRowSelection() /* eslint-disable-next-line */ }, [ref])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }} data-debug-id="ProjectTreeView/FocusedEditor (main surface)">
      {/* Focused header */}
      <div
        className="d-flex align-items-center gap-2 px-3 py-2 border-bottom bg-white"
        style={{ flexShrink: 0 }}
      >
        <Button variant="outline-secondary" size="sm" style={{ fontSize: 11 }} onClick={onBack}>
          ← All position types
        </Button>
        <MaterialIcon name={ICONS.position} size={20} style={{ color: colorsForType('PositionType').accent }} title="Position" />
        <span className="fw-semibold" style={{ fontSize: 15 }}>{ref}</span>
        {name && name !== ref && <span className="text-muted" style={{ fontSize: 12 }}>{name}</span>}
        {tags.map(tag => (
          <TagBadge key={tag} tag={tag} />
        ))}
        <div className="flex-grow-1" />
        <Button
          variant="outline-secondary" size="sm" style={{ fontSize: 11 }}
          onClick={() => { const c = copyPositionRecipe(ref); if (c) flashPaste(`Copied ${c.count} row${c.count === 1 ? '' : 's'}`) }}
          disabled={count === 0}
          title="Copy this whole position's recipe"
        >
          Copy recipe
        </Button>
        <Button
          variant="outline-secondary" size="sm" style={{ fontSize: 11 }}
          onClick={doPaste}
          disabled={!rowClipboard}
          title={rowClipboard ? `Paste ${rowClipboard.label} (Ctrl+V)` : 'Clipboard empty'}
        >
          Paste{rowClipboard ? ` (${rowClipboard.count})` : ''}
        </Button>
        <Button
          variant="link" size="sm" style={{ fontSize: 11, textDecoration: 'none' }}
          onClick={() => onOpenConnectors?.(ref)}
          title="Open the Connectors screen focused on this position"
        >
          Manage connectors →
        </Button>
        {hasError && <span title="Has errors" style={{ color: '#dc3545', fontSize: 14 }}>● errors</span>}
        {!hasError && hasWarning && <span title="Has warnings" style={{ color: '#ffc107', fontSize: 14 }}>● warnings</span>}
        {!hasError && !hasWarning && count > 0 && validationRun && (
          <span style={{ color: '#198754', fontSize: 13 }}>● ok</span>
        )}
      </div>

      {/* Selection bar — clear about what will be copied */}
      {selectedRowIds.length > 0 && (
        <div
          className="d-flex align-items-center gap-2 px-3 py-1"
          style={{ flexShrink: 0, background: '#e7f1ff', borderBottom: '1px solid #b6d4fe', fontSize: 12 }}
        >
          <span className="fw-semibold text-primary">{selectedRowIds.length} row{selectedRowIds.length === 1 ? '' : 's'} selected</span>
          <Button variant="primary" size="sm" style={{ fontSize: 11 }} onClick={doCopySelection}>Copy (Ctrl+C)</Button>
          <Button variant="link" size="sm" style={{ fontSize: 11 }} onClick={clearRowSelection}>Clear</Button>
        </div>
      )}
      {pasteMsg && (
        <div className="px-3 py-1 text-success" style={{ flexShrink: 0, background: '#d1e7dd', fontSize: 12 }}>
          ✓ {pasteMsg}
        </div>
      )}

      {/* Editor body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
        {count === 0 && (
          <div className="text-muted small mb-3">
            No recipe yet — drag an element from the palette, use the Templates tab to apply
            one, or add connectors via <span className="fw-semibold">Manage connectors →</span>.
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
    </div>
  )
}
