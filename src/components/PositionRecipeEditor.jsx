import React, { useState, useEffect } from 'react'
import { Button } from 'react-bootstrap'
import useStore, { getRecipeForPosition } from '../store/useStore'
import RecipeSection from './RecipeSection'
import TagBadge from './TagBadge'
import MaterialIcon from './MaterialIcon'
import IconButton from './IconButton'
import PositionValidationBadge from './PositionValidationBadge'
import ConnectorSuggestions from './ConnectorSuggestions'
import RecipeErrorBanner from './RecipeErrorBanner'
import FormSpecPane from './FormSpecPane'
import { colorsForType, ICONS, ACTION_ICONS } from '../utils/entityStyle'

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
  const recipes = useStore(s => s.recipes)
  const selectedRowIds = useStore(s => s.selectedRowIds)
  const clearRowSelection = useStore(s => s.clearRowSelection)
  const copySelectedRows = useStore(s => s.copySelectedRows)
  const copyPositionRecipe = useStore(s => s.copyPositionRecipe)
  const requestPaste = useStore(s => s.requestPaste)
  const rowClipboard = useStore(s => s.rowClipboard)
  const [pasteMsg, setPasteMsg] = useState(null)

  const ref = posRef
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
            icon={ACTION_ICONS.back} title="All PositionTypes" onClick={onBack} />
        )}
        <MaterialIcon name={ICONS.position} size={20} style={{ color: colorsForType('PositionType').accent }} title="PositionType" />
        <span className="fw-semibold" style={{ fontSize: 15 }}>{ref}</span>
        {name && name !== ref && <span className="text-muted" style={{ fontSize: 12 }}>{name}</span>}
        {tags.map(tag => <TagBadge key={tag} tag={tag} />)}
        <div className="flex-grow-1" />
        <IconButton
          variant="outline-secondary" bsSize="sm" style={{ fontSize: 11 }}
          icon={ACTION_ICONS.copy}
          onClick={() => { const c = copyPositionRecipe(ref); if (c) flashPaste(`Copied ${c.count} row${c.count === 1 ? '' : 's'}`) }}
          disabled={count === 0}
          title="Copy this whole PositionType's recipe"
        />
        <IconButton
          variant="outline-secondary" bsSize="sm" style={{ fontSize: 11 }}
          icon={ACTION_ICONS.paste}
          badge={rowClipboard ? rowClipboard.count : null}
          onClick={doPaste}
          disabled={!rowClipboard}
          title={rowClipboard ? `Paste ${rowClipboard.label} (Ctrl+V)` : 'Clipboard empty'}
        />
        {onOpenConnectors && (
          <Button
            variant="link" size="sm" className="d-inline-flex align-items-center gap-1" style={{ fontSize: 11, textDecoration: 'none' }}
            onClick={() => onOpenConnectors(ref)}
            title="Open the Connectors screen focused on this PositionType"
          >
            <MaterialIcon name="cable" size={14} /> Manage connectors
          </Button>
        )}
        <PositionValidationBadge posRef={ref} size={16} showOk={count > 0} />
      </div>

      {/* Selection bar */}
      {selectedRowIds.length > 0 && (
        <div className="d-flex align-items-center gap-2 px-3 py-1"
          style={{ flexShrink: 0, background: '#e7f1ff', borderBottom: '1px solid #b6d4fe', fontSize: 12 }}>
          <span className="fw-semibold text-primary">{selectedRowIds.length} row{selectedRowIds.length === 1 ? '' : 's'} selected</span>
          <IconButton variant="primary" bsSize="sm" style={{ fontSize: 11 }} icon={ACTION_ICONS.copy}
            title="Copy selection (Ctrl+C)" onClick={doCopySelection} />
          <IconButton variant="link" bsSize="sm" style={{ fontSize: 11 }} icon="deselect"
            title="Clear selection" onClick={clearRowSelection} />
        </div>
      )}
      {pasteMsg && (
        <div className="px-3 py-1 text-success d-flex align-items-center gap-1" style={{ flexShrink: 0, background: '#d1e7dd', fontSize: 12 }}>
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
        <ConnectorSuggestions posRef={ref} />
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
            Element internals are shown read-only on each container row above — use
            <span className="fw-semibold"> Edit internals → </span> to change them.
          </div>
        )}
      </div>
      {/* Always rendered: with no Form attached it is the prompt to start stage ①. */}
      <FormSpecPane posRef={ref} embedded={embedded} />
      </div>
    </div>
  )
}
