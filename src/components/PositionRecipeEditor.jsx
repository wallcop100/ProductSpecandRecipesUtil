import SaveTemplateModal from './SaveTemplateModal'
import React, { useState, useEffect } from 'react'
import { Button, Dropdown } from 'react-bootstrap'
import useStore, { getRecipeForPosition } from '../store/useStore'
import RecipeSection from './RecipeSection'
import TagBadge from './TagBadge'
import PositionTagEditor from './PositionTagEditor'
import TutorialHint from '../tutorial/TutorialHint'
import MaterialIcon from './MaterialIcon'
import IconButton from './IconButton'
import SharedToggle from './SharedToggle'
import SameRecipePill from './SameRecipePill'
import StatusPip from './StatusPip'
import usePositionList from './usePositionList'
import ConnectorSuggestions from './ConnectorSuggestions'
import { WagoSuggestion } from './GlobalConnectors'
import RecipeSuggestions from './RecipeSuggestions'
import RecipeErrorBanner from './RecipeErrorBanner'
import FormSpecPane from './FormSpecPane'
import ForkPositionModal from './ForkPositionModal'
import { openTemplates } from './useTemplateMatches'
import { colorsForType, ICONS, ACTION_ICONS } from '../utils/entityStyle'
import { CONCEPTS } from './ConceptCard'
import { C } from '../styles/tokens'

// Group container-internal rows by ContextRef so each container gets a section
// titled by its ElementTypeRef.
function groupByContainer(rows) {
  const map = new Map()
  for (const r of rows) {
    const ref = r.ContextRef || r.contextRef || '—'
    if (!map.has(ref)) map.set(ref, [])
    map.get(ref).push(r)
  }
  return [...map.entries()].map(([contextRef, groupRows]) => ({ contextRef, rows: groupRows }))
}

/**
 * PositionRecipeEditor — the shared recipe-editing surface for one PositionType.
 *
 * Used by both the builder centre pane (FocusedPositionEditor) and the Review
 * modal so they stay feature-identical: header actions (copy/paste, connectors,
 * validation), row-selection bar, connector suggestions, and the Position-Level
 * RecipeSection with Add Entity / New / Replace.
 *
 * Props:
 *   posRef, name, tags[], count, showDeleted
 *   onOpenProductSpec, onOpenConnectors
 *   onAddRow(posRef, sectionKey), onNewET(posRef, sectionKey), onReplace(posRef, rowId, opts)
 *   showBack, onBack   — the "all PositionTypes" back button (builder only)
 *   embedded           — modal mode: no full-height wrapper
 */
export default function PositionRecipeEditor({
  posRef, name, tags = [], count = 0, showDeleted = false,
  onOpenProductSpec, onOpenConnectors,
  onAddRow, onNewET, onReplace,
  showBack = false, onBack,
  embedded = false,
  showInternals = false,   // also render container internals (grouped by ElementTypeRef)
}) {
  const backTitle = useStore(s => s.positionHistory.length ? `Back to ${s.positionHistory[s.positionHistory.length - 1]}`
    : s.returnScreen ? `Back to ${s.returnScreen === 'product-spec' ? 'Product Spec' : 'Connectors'}` : 'All PositionTypes')
  const recipes = useStore(s => s.recipes)
  const selectedRowIds = useStore(s => s.selectedRowIds)
  const clearRowSelection = useStore(s => s.clearRowSelection)
  const setSelectMode = useStore(s => s.setSelectMode)
  const copySelectedRows = useStore(s => s.copySelectedRows)
  const copyPositionRecipe = useStore(s => s.copyPositionRecipe)
  const requestPaste = useStore(s => s.requestPaste)
  const rowClipboard = useStore(s => s.rowClipboard)
  const [pasteMsg, setPasteMsg] = useState(null)
  const [forking, setForking] = useState(false)
  const showDeletedRows = useStore(s => s.showDeleted)
  const toggleShowDeleted = useStore(s => s.toggleShowDeleted)
  const wrappersOpen = useStore(s => s.screenView.recipes?.wrappers?.all) === true
  const [savingTemplate, setSavingTemplate] = useState(false)

  const ref = posRef
  const { statusOf } = usePositionList()
  const headerStatus = statusOf(useStore(s => s.positionTypes).find(pt => pt.PositionTypeRef === ref) || { PositionTypeRef: ref })
  const grouped = getRecipeForPosition(recipes, ref)

  function filterDeleted(rows) {
    return showDeleted ? rows : rows.filter(r => (r.IsDeleted || r.isDeleted) !== 'Y')
  }
  function flashPaste(msg) {
    setPasteMsg(msg)
    setTimeout(() => setPasteMsg(null), 2500)
  }
  function doCopySelection() {
    const clip = copySelectedRows()
    if (clip) flashPaste(`Copied ${clip.count} row${clip.count === 1 ? '' : 's'}`)
  }
  function doPaste() {
    const n = requestPaste(ref)
    if (n > 0) flashPaste(`Pasted ${n} row${n === 1 ? '' : 's'} into ${ref}`)
  }

  // Ctrl/Cmd+C copies the selection, Ctrl/Cmd+V pastes — ignored while typing.
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

  // Clear stale selection when switching PositionTypes.
  useEffect(() => { clearRowSelection() /* eslint-disable-next-line */ }, [ref])

  const outerStyle = embedded
    ? { display: 'flex', flexDirection: 'column' }
    : { display: 'flex', flexDirection: 'column', height: '100%' }

  return (
    <div style={outerStyle} data-debug-id="PositionRecipeEditor">
      {/* Header */}
      <div className="d-flex align-items-center gap-2 px-3 py-2 border-bottom bg-white" style={{ flexShrink: 0 }}>
        {showBack && (
          <IconButton variant="outline-secondary" bsSize="sm" style={{ fontSize: 11 }}
            icon={ACTION_ICONS.back} title={backTitle} onClick={onBack} />
        )}
        <MaterialIcon name={ICONS.position} size={20} style={{ color: colorsForType('PositionType').accent }} title="PositionType" />
        <span className="fw-semibold" style={{ fontSize: 15 }}>{ref}</span>
        {name && name !== ref && <span className="text-muted" style={{ fontSize: 12 }}>{name}</span>}
        <PositionTagEditor posRef={ref} />
        <SameRecipePill posRef={ref} />
        <TutorialHint id="recipe-editor" concept={CONCEPTS.WRAPPER} />
        <div className="flex-grow-1" />
        {/* Paste and the rare acts (copy the whole recipe, fork, save as template) live
            in the ⋮ menu; Ctrl+V still pastes. */}
        <SharedToggle />
        <Dropdown align="end">
          <Dropdown.Toggle as={IconButton} bsSize="sm" variant="outline-secondary"
            icon={ACTION_ICONS.more} title="Recipe actions" aria-label="Recipe actions" />
          <Dropdown.Menu style={{ fontSize: 12 }}>
            {rowClipboard && (
              <Dropdown.Item onClick={doPaste} title={`Paste ${rowClipboard.label} (Ctrl+V)`} data-testid="paste-rows">
                <MaterialIcon name={ACTION_ICONS.paste} size={14} /> Paste {rowClipboard.count} row{rowClipboard.count === 1 ? '' : 's'}
              </Dropdown.Item>
            )}
            <Dropdown.Item disabled={count === 0} onClick={() => setSelectMode(true)}>
              <MaterialIcon name="checklist" size={14} /> Select multiple
            </Dropdown.Item>
            <Dropdown.Item disabled={count === 0}
              onClick={() => { const c = copyPositionRecipe(ref); if (c) flashPaste(`Copied ${c.count} row${c.count === 1 ? '' : 's'}`) }}>
              <MaterialIcon name={ACTION_ICONS.copy} size={14} /> Copy whole recipe
            </Dropdown.Item>
            <Dropdown.Item disabled={count === 0} onClick={() => setForking(true)}>
              <MaterialIcon name={ACTION_ICONS.fork} size={14} /> Fork into new position(s)…
            </Dropdown.Item>
            <Dropdown.Item disabled={count === 0} onClick={() => setSavingTemplate(true)}>
              <MaterialIcon name="bookmark_add" size={14} /> Save as template…
            </Dropdown.Item>
            <Dropdown.Item onClick={() => openTemplates(ref)} data-testid="apply-template">
              <MaterialIcon name="bookmark" size={14} /> Apply a template…
            </Dropdown.Item>
            <Dropdown.Divider />
            {onOpenConnectors && (
              <Dropdown.Item onClick={() => onOpenConnectors(ref)}>
                <MaterialIcon name="cable" size={14} /> Connectors for this PositionType
              </Dropdown.Item>
            )}
            <Dropdown.Item onClick={toggleShowDeleted} data-testid="toggle-deleted">
              <MaterialIcon name={showDeletedRows ? ACTION_ICONS.hideDeleted : ACTION_ICONS.showDeleted} size={14} /> {showDeletedRows ? 'Hide IsDeleted rows' : 'Show IsDeleted rows'}
            </Dropdown.Item>
            <Dropdown.Item onClick={() => useStore.getState().setScreenView('recipes', { wrappers: { all: !wrappersOpen } })}>
              <MaterialIcon name={wrappersOpen ? 'unfold_less' : 'unfold_more'} size={14} /> {wrappersOpen ? 'Collapse' : 'Expand'} all wrappers
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
        <StatusPip posRef={ref} status={headerStatus} size={12} />
      </div>

      {/* Selection bar */}
      {selectedRowIds.length > 0 && (
        <div className="d-flex align-items-center gap-2 px-3 py-1"
          style={{ flexShrink: 0, background: C.accentTint, borderBottom: `1px solid ${C.accentEdge}`, fontSize: 12 }}>
          <span className="fw-semibold text-primary">{selectedRowIds.length} row{selectedRowIds.length === 1 ? '' : 's'} selected</span>
          <IconButton variant="primary" bsSize="sm" style={{ fontSize: 11 }} icon={ACTION_ICONS.copy}
            title="Copy selection (Ctrl+C)" onClick={doCopySelection} />
          <IconButton variant="link" bsSize="sm" style={{ fontSize: 11 }} icon="deselect"
            title="Clear selection" onClick={clearRowSelection} />
        </div>
      )}
      {pasteMsg && (
        <div className="px-3 py-1 text-success d-flex align-items-center gap-1" style={{ flexShrink: 0, background: C.subtle, fontSize: 12 }}>
          <MaterialIcon name="check" size={14} /> {pasteMsg}
        </div>
      )}

      {/* Body. When a Form template is attached the surface splits: the recipe on the
          left, the Form's spec on the right behind a rule. Never a modal — you
          compare while you work. */}
      <div className="d-flex" style={embedded ? { minHeight: 0 } : { flex: 1, minHeight: 0 }}>
      <div style={embedded
        ? { padding: '0.5rem 0.25rem', flex: 1, minWidth: 0 }
        : { flex: 1, minWidth: 0, overflowY: 'auto', padding: '1rem 1.25rem' }}>
        {count === 0 && (
          <div className="text-muted small mb-3">
            No recipe yet — drag an element from the palette, use the Templates tab to apply
            one, or add connectors via <span className="fw-semibold">Manage connectors →</span>.
          </div>
        )}
        <RecipeErrorBanner />
        <RecipeSuggestions key={ref} posRef={ref} />
        <ConnectorSuggestions posRef={ref} />
        <WagoSuggestion key={ref} posRef={ref} inRecipe />
        <RecipeSection
          title="PositionType Level"
          sectionKey="position"
          rows={filterDeleted(grouped.position)}
          posRef={ref}
          onOpenProductSpec={onOpenProductSpec}
          onAddRow={onAddRow}
          onNewET={onNewET}
          onReplace={onReplace}
        />
        {showInternals ? (
          <>
            {groupByContainer(filterDeleted(grouped.dlInternal)).map(g => (
              <RecipeSection key={`dl-${g.contextRef}`} title={g.contextRef} sectionKey="dl_internal"
                rows={g.rows} posRef={ref} onOpenProductSpec={onOpenProductSpec}
                onAddRow={onAddRow} onNewET={onNewET} onReplace={onReplace} />
            ))}
            {groupByContainer(filterDeleted(grouped.linInternal)).map(g => (
              <RecipeSection key={`lin-${g.contextRef}`} title={g.contextRef} sectionKey="lin_internal"
                rows={g.rows} posRef={ref} onOpenProductSpec={onOpenProductSpec}
                onAddRow={onAddRow} onNewET={onNewET} onReplace={onReplace} />
            ))}
          </>
        ) : (
          <div className="text-muted mb-3" style={{ fontSize: 11 }}>
            Element internals are shown read-only on each container row above — use the
            row's <span className="fw-semibold">Edit internals →</span> to change them.
          </div>
        )}
      </div>
      {/* In the builder the Form spec lives in the right drawer (K3LGUL); the Review
          window has no drawer, so it keeps its own beside the recipe. */}
      {embedded && <FormSpecPane posRef={ref} embedded />}
      </div>

      <ForkPositionModal show={forking} sourceRef={ref} onHide={() => setForking(false)} />
      <SaveTemplateModal show={savingTemplate} posRef={ref} name={name}
        onHide={saved => { setSavingTemplate(false); if (saved) flashPaste('Saved as a template — find it under Templates') }} />
    </div>
  )
}
