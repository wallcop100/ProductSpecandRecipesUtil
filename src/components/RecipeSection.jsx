import React, { useState } from 'react'
import { Button } from 'react-bootstrap'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import useStore from '../store/useStore'
import IngredientCard from './IngredientCard'
import SlotCard from './SlotCard'
import ETRefSelect from './ETRefSelect'
import MaterialIcon from './MaterialIcon'
import { TYPE_COLORS } from '../utils/entityStyle'

const SECTION_COLOR = {
  position:    TYPE_COLORS.PositionType.accent,  // blue
  dl_internal: TYPE_COLORS.ElementType.accent,   // orange
  lin_internal: TYPE_COLORS.ElementType.accent,  // orange
}

/**
 * RecipeSection — a sortable, droppable section of recipe rows.
 *
 * Reused both by the per-position editor and by the project tree outliner, so
 * the droppable carries its own posRef: that lets any expanded position in the
 * tree receive palette drops and reorders independently.
 *
 * Props:
 *   title, sectionKey ('position'|'dl_internal'|'lin_internal'), rows, posRef,
 *   onOpenProductSpec, disableSorting
 */
export default function RecipeSection({
  title, sectionKey, rows, posRef, onOpenProductSpec, disableSorting = false,
  onAddRow,   // opens right drawer in pick mode (existing ET)
  onNewET,    // opens NewETWizardModal (brand new ET)
  onReplace,  // replace a row's ElementType (Existing/New fork)
}) {
  const addRecipeRow = useStore(s => s.addRecipeRow)
  const resolveSlot = useStore(s => s.resolveSlot)
  const rowClipboard = useStore(s => s.rowClipboard)
  const requestPaste = useStore(s => s.requestPaste)

  const [adding, setAdding] = useState(false)
  const [choosing, setChoosing] = useState(false)   // inline Existing / New fork

  const { setNodeRef: setSectionDropRef, isOver: isSectionOver } = useDroppable({
    id: `section-drop-${sectionKey}-${posRef || 'none'}`,
    data: { type: 'section', section: sectionKey, posRef },
  })

  const sortableIds = disableSorting ? [] : rows.map(r => r._id).filter(Boolean)

  function handleAdd(elementTypeRef) {
    addRecipeRow(posRef, sectionKey, { elementTypeRef })
    setAdding(false)
  }

  return (
    <div className="mb-4" data-debug-id={`RecipeSection:${sectionKey}`}>
      <div
        className="d-flex align-items-center gap-2 mb-2"
        style={{ borderBottom: `2px solid ${SECTION_COLOR[sectionKey] || '#dee2e6'}`, paddingBottom: 4 }}
      >
        <h6 className="mb-0 text-uppercase text-muted small fw-bold">{title}</h6>
        {adding ? (
          <div style={{ width: 240 }}>
            <ETRefSelect
              placeholder="Pick or type an element type…"
              onCommit={handleAdd}
              onCancel={() => setAdding(false)}
            />
          </div>
        ) : choosing ? (
          <div className="d-flex align-items-center gap-1">
            <Button
              variant="outline-primary" size="sm"
              style={{ padding: '1px 8px', fontSize: 11 }}
              onClick={() => {
                setChoosing(false)
                if (onAddRow) onAddRow(posRef, sectionKey)
                else setAdding(true)
              }}
            >
              Existing
            </Button>
            <Button
              variant="outline-success" size="sm"
              style={{ padding: '1px 8px', fontSize: 11 }}
              onClick={() => {
                setChoosing(false)
                if (onNewET) onNewET(posRef, sectionKey)
                else setAdding(true)
              }}
            >
              New ↗
            </Button>
            <button className="btn btn-link btn-sm p-0 text-muted" style={{ fontSize: 11 }}
              onClick={() => setChoosing(false)}>Cancel</button>
          </div>
        ) : (
          <Button
            variant="outline-secondary" size="sm"
            style={{ padding: '1px 8px', fontSize: 12 }}
            onClick={() => (onAddRow || onNewET) ? setChoosing(true) : setAdding(true)}
            title="Add an entity into this recipe section"
          >
            + Add Entity
          </Button>
        )}
        {/* Paste affordance — appears whenever the clipboard holds rows */}
        {rowClipboard && posRef && (
          <Button
            variant="primary"
            size="sm"
            className="d-inline-flex align-items-center gap-1"
            style={{ padding: '1px 8px', fontSize: 12 }}
            onClick={() => requestPaste(posRef, sectionKey)}
            title={`Paste ${rowClipboard.label} into this section (Ctrl+V pastes to the whole position)`}
          >
            <MaterialIcon name="content_paste" size={14} /> Paste ({rowClipboard.count})
          </Button>
        )}
      </div>

      <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setSectionDropRef}
          style={{
            minHeight: 48,
            borderRadius: 4,
            transition: 'background 0.15s',
            background: isSectionOver ? '#eef3ff' : undefined,
          }}
        >
          {rows.length === 0 && (
            <div
              className="text-muted small text-center py-3 border border-dashed rounded"
              style={{ borderStyle: 'dashed' }}
            >
              No rows yet — drag an element here or click + Add row
            </div>
          )}
          {rows.map(row => (
            row.resolved === false
              ? (
                <SlotCard
                  key={row._id || row.slotKey}
                  slot={row}
                  posRef={posRef}
                  sectionKey={sectionKey}
                  onResolve={(slotKey, entityRef) => resolveSlot(posRef, slotKey, entityRef)}
                  onNewET={onNewET ? slot => onNewET(posRef, sectionKey, { mode: 'slot', slotKey: slot.slotKey }) : null}
                />
              )
              : (
                <IngredientCard
                  key={row._id}
                  row={row}
                  posRef={posRef}
                  sectionKey={sectionKey}
                  onOpenProductSpec={onOpenProductSpec}
                  onReplace={onReplace}
                />
              )
          ))}
        </div>
      </SortableContext>
    </div>
  )
}
