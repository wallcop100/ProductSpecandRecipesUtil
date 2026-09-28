import React, { useMemo, useState } from 'react'
import { Button } from 'react-bootstrap'
import useStore, { getRecipeForPosition } from '../store/useStore'
import TagBadge from './TagBadge'
import FilterBar from './FilterBar'
import TutorialHint from '../tutorial/TutorialHint'
import PositionRecipeEditor from './PositionRecipeEditor'
import MaterialIcon from './MaterialIcon'
import IconButton from './IconButton'
import ConnectorSuggestions from './ConnectorSuggestions'
import CollectionBadge from './CollectionBadge'
import FormCoverageBadge from './FormCoverageBadge'
import EmptyPositionWizard from './EmptyPositionWizard'
import TagDriftWizard from './TagDriftWizard'
import { colorsForType, ICONS, ACTION_ICONS } from '../utils/entityStyle'
import { positionFamilyOf } from '../utils/positionFamily'
import usePositionList, { NO_FAMILY } from './usePositionList'
import PositionRail from './PositionRail'
import PositionListMenu from './PositionListMenu'

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

  const setPositionList = useStore(s => s.setPositionList)
  const formCaptures = useStore(s => s.formCaptures)
  const [showEmptyWizard, setShowEmptyWizard] = useState(false)
  const [showDriftWizard, setShowDriftWizard] = useState(false)
  const driftCount = Object.keys(tagDrift || {}).length

  // Filters, sort, collapsed families and the ignored toggle are shared with the sidebar.
  const {
    view, countByRef, incompleteRefs, availableTags, isIgnored: isIgnoredPt, ignoredFamilySet,
    active: activeVisible, ignored: ignoredVisible, groups, ignoredGroups,
  } = usePositionList()
  const showTags = view.showTags
  const showIgnored = view.showIgnored
  const collapsedFamilies = new Set(view.collapsed)
  const toggleFamilyCollapse = fam => setPositionList(v => ({
    collapsed: v.collapsed.includes(fam) ? v.collapsed.filter(f => f !== fam) : [...v.collapsed, fam],
  }))
  const toggleTag = tag => setPositionList(v => ({ tags: v.tags.includes(tag) ? v.tags.filter(t => t !== tag) : [...v.tags, tag] }))

  // Index validation issues by positionTypeRef
  const issuesByRef = useMemo(() => {
    const map = {}
    for (const issue of validationResults) {
      if (issue.ref) (map[issue.ref] ||= []).push(issue)
    }
    return map
  }, [validationResults])

  // Positions with no recipe rows and not ignored (individually or by family)
  const emptyCount = positionTypes.reduce((n, pt) => (!countByRef[pt.PositionTypeRef] && !isIgnoredPt(pt)) ? n + 1 : n, 0)

  // Recipe coverage (ignored positions don't count).
  const scopedTotal = positionTypes.filter(pt => !isIgnoredPt(pt)).length
  const reciped = scopedTotal - emptyCount
  const pct = scopedTotal ? Math.round((reciped / scopedTotal) * 100) : 0

  const activePt = activePositionRef
    ? positionTypes.find(pt => pt.PositionTypeRef === activePositionRef)
    : null

  // Positions come from the DesignDB and from nowhere else. If there are none, the
  // workbook is the thing to look at — say so rather than showing a bare sentence.
  if (positionTypes.length === 0) {
    return (
      <div className="text-center mt-5 mx-auto" style={{ maxWidth: 380 }}>
        <MaterialIcon name="table_chart" size={32} style={{ color: '#adb5bd' }} />
        <div className="fw-semibold mt-2">No positions in this project</div>
        <div className="text-muted mt-1" style={{ fontSize: 12, lineHeight: 1.6 }}>
          PositionTypes are read from the DesignDB workbook. If you expected some here,
          the DesignDB may be empty, or a different workbook was picked as the DB.
        </div>
      </div>
    )
  }

  const wizards = (
    <>
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
    </>
  )

  // ---- Focused editor: the list collapses to a sidebar beside it ----
  if (activePt) {
    return (
      <div className="d-flex" style={{ height: '100%', minHeight: 0 }}>
        {wizards}
        <PositionRail onReviewEmpty={() => setShowEmptyWizard(true)} onReviewDrift={() => setShowDriftWizard(true)} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
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
        </div>
      </div>
    )
  }

  // ---- Overview list ----
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
        <TutorialHint id="builder-tree" />
        {scopedTotal > 0 && (
          <span className="d-inline-flex align-items-center gap-2"
            title={`${reciped} of ${scopedTotal} in-scope positions have at least one recipe row (ignored ones don't count)`}>
            <span style={{ fontSize: 11, color: '#555', whiteSpace: 'nowrap' }}>
              <strong>{reciped}</strong>/{scopedTotal} reciped
            </span>
            <span style={{ width: 64, height: 4, background: '#e9ecef', borderRadius: 2, overflow: 'hidden' }}>
              <span style={{
                display: 'block', width: `${pct}%`, height: '100%',
                background: pct === 100 ? '#198754' : '#0d6efd', transition: 'width .2s ease',
              }} />
            </span>
          </span>
        )}
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
          <div style={{ width: 300 }}>
            <FilterBar
              text={view.text}
              onText={text => setPositionList({ text })}
              placeholder="Filter positions…"
              tagOptions={availableTags}
              activeTags={view.tags}
              onToggleTag={toggleTag}
              extraChips={formCaptures ? [{
                key: 'form-incomplete',
                label: `Form incomplete${incompleteRefs.size ? ` (${incompleteRefs.size})` : ''}`,
                active: view.formOnly,
                onToggle: () => setPositionList(v => ({ formOnly: !v.formOnly })),
                title: 'Only positions missing a product the Form specifies, or holding one it has dropped',
              }] : []}
            />
          </div>
          <PositionListMenu
            families={[...groups, ...ignoredGroups].map(([f]) => f)}
            emptyCount={emptyCount} driftCount={driftCount}
            hasForm={!!formCaptures} incompleteCount={incompleteRefs.size}
            onReviewEmpty={() => setShowEmptyWizard(true)} onReviewDrift={() => setShowDriftWizard(true)}
            showTagsOption
          />
        </div>
      </div>

      {wizards}

      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem 0.75rem' }}>
        {activeVisible.length === 0 && ignoredVisible.length === 0 && (
          <div className="text-muted text-center mt-4 small">No PositionTypes match the filter.</div>
        )}
        {activeVisible.length === 0 && ignoredVisible.length > 0 && (
          <div className="text-muted text-center mt-4 small">All matching PositionTypes are ignored.</div>
        )}

        {/* Active PositionTypes, grouped into collapsible family sections. */}
        {groups.map(([fam, pts]) => {
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
              onClick={() => setPositionList(v => ({ showIgnored: !v.showIgnored }))}
            >
              <MaterialIcon name={showIgnored ? ACTION_ICONS.expand : ACTION_ICONS.collapse} size={14} /> Ignored ({ignoredVisible.length})
            </button>
            {showIgnored && (
              <div className="mt-2">
                {ignoredGroups.map(([fam, pts]) => {
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
