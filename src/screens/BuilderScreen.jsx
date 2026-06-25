import React, { useState, useMemo } from 'react'
import {
  Button, Alert, Nav, Spinner,
} from 'react-bootstrap'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  closestCenter,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { useDroppable } from '@dnd-kit/core'
import useStore, { getRecipeForPosition } from '../store/useStore'
import { getUsedIn } from '../utils/containerUtils'
import { findBestTemplate } from '../utils/templateLoader'
import PositionList from '../components/PositionList'
import IngredientCard from '../components/IngredientCard'
import SlotCard from '../components/SlotCard'
import ElementPalette from '../components/ElementPalette'
import TagReviewSidebar from '../components/TagReviewSidebar'
import ValidationPanel from '../components/ValidationPanel'
import TemplatePicker from '../components/TemplatePicker'
import ContextTreePanel from '../components/ContextTreePanel'

/**
 * BuilderScreen — three-column recipe editing layout.
 */
export default function BuilderScreen({ onOpenTemplateEditor, onOpenProductSpec, onBackToSetup }) {
  const activePositionRef = useStore(s => s.activePositionRef)
  const activeContextType = useStore(s => s.activeContextType)
  const activeETRef = useStore(s => s.activeETRef)
  const showContextTree = useStore(s => s.showContextTree)
  const recipes = useStore(s => s.recipes)
  const templates = useStore(s => s.templates)
  const positionUI = useStore(s => s.positionUI)
  const psChanges = useStore(s => s.psChanges)
  const rsChanges = useStore(s => s.rsChanges)
  const isLoading = useStore(s => s.isLoading)

  const applyTemplate = useStore(s => s.applyTemplate)
  const reapplyTemplate = useStore(s => s.reapplyTemplate)
  const addRecipeRow = useStore(s => s.addRecipeRow)
  const resolveSlot = useStore(s => s.resolveSlot)
  const reorderIngredients = useStore(s => s.reorderIngredients)
  const moveIngredientAcrossSections = useStore(s => s.moveIngredientAcrossSections)
  const runValidation = useStore(s => s.runValidation)
  const exportChanges = useStore(s => s.exportChanges)
  const saveAsTemplate = useStore(s => s.saveAsTemplate)
  const openETRecipe = useStore(s => s.openETRecipe)
  const closeETRecipe = useStore(s => s.closeETRecipe)
  const duplicateET = useStore(s => s.duplicateET)
  const setShowContextTree = useStore(s => s.setShowContextTree)

  const [rightTab, setRightTab] = useState('palette')
  const [showDeleted, setShowDeleted] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(null)
  const [exportSuccess, setExportSuccess] = useState(false)
  const [skippedTemplates, setSkippedTemplates] = useState(new Set())
  const [activeId, setActiveId] = useState(null)  // for DragOverlay
  const [templateNameInput, setTemplateNameInput] = useState('')
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  // Track which template (if any) was applied to each position { [posRef]: templateId }
  const [appliedTemplateId, setAppliedTemplateId] = useState({})

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  // Current recipe grouped by section, optionally filtering soft-deleted rows
  const rawRecipe = activePositionRef
    ? getRecipeForPosition(recipes, activePositionRef)
    : { position: [], dlInternal: [], linInternal: [] }

  function filterDeleted(rows) {
    if (showDeleted) return rows
    return rows.filter(r => (r.IsDeleted || r.isDeleted) !== 'Y')
  }

  const currentRecipe = {
    position: filterDeleted(rawRecipe.position),
    dlInternal: filterDeleted(rawRecipe.dlInternal),
    linInternal: filterDeleted(rawRecipe.linInternal),
  }

  // ET mode: deduplicated internal rows from the first position that uses this ET
  const etModeRows = useMemo(() => {
    if (activeContextType !== 'ElementType' || !activeETRef) return []
    const allRows = recipes.filter(r =>
      (r.ContextType || r.contextType) === 'ElementType' &&
      (r.ContextRef || r.contextRef) === activeETRef
    )
    const firstPos = allRows[0]?.PositionTypeRef ?? allRows[0]?.positionTypeRef
    if (!firstPos) return []
    return allRows
      .filter(r => (r.PositionTypeRef || r.positionTypeRef) === firstPos)
      .sort((a, b) => ((a.RecipeIndex ?? a.recipeIndex ?? 0) - (b.RecipeIndex ?? b.recipeIndex ?? 0)))
  }, [recipes, activeContextType, activeETRef])

  const etModePosRef = etModeRows[0]?.PositionTypeRef ?? etModeRows[0]?.positionTypeRef ?? activePositionRef

  const etModeUsedIn = useMemo(() => {
    if (!activeETRef) return []
    return getUsedIn(activeETRef, recipes, null)
  }, [activeETRef, recipes])

  const activePosUI = activePositionRef ? (positionUI[activePositionRef] || {}) : {}
  const activeTags = activePosUI.tags || []

  // Find best template offer
  const bestTemplate = activePositionRef && !skippedTemplates.has(activePositionRef)
    ? findBestTemplate(activeTags, templates)
    : null

  const hasRecipeRows =
    currentRecipe.position.length > 0 ||
    currentRecipe.dlInternal.length > 0 ||
    currentRecipe.linInternal.length > 0

  // Only offer template if there are no rows yet
  const showTemplateBanner = bestTemplate && !hasRecipeRows

  // Check if section contains LIN fittings
  const isLinPosition = activeTags.includes('LIN')
  const internalSectionLabel = isLinPosition ? 'Inside LIN Element' : 'Inside DL Element'
  const internalSection = isLinPosition ? 'lin_internal' : 'dl_internal'

  // -------------------------------------------------------------------------
  // Drag and drop
  // -------------------------------------------------------------------------

  function handleDragStart({ active }) {
    setActiveId(active.id)
  }

  function handleDragEnd({ active, over }) {
    setActiveId(null)
    const inETMode = activeContextType === 'ElementType' && activeETRef
    if (!over || (!activePositionRef && !inETMode)) return

    const activeDnd = active.data.current || {}
    const overDnd = over.data.current || {}

    // Palette drop onto a slot (SlotCard) — resolve the slot
    if (activeDnd.type === 'palette-item' && overDnd.type === 'slot') {
      resolveSlot(activePositionRef, overDnd.slotKey, activeDnd.elementTypeRef)
      return
    }

    // Palette drop onto a section droppable or a recipe row
    if (activeDnd.type === 'palette-item') {
      const targetSection = overDnd.section || 'position'
      addRecipeRow(activePositionRef, targetSection, {
        elementTypeRef: activeDnd.elementTypeRef,
        ElementTypeRef: activeDnd.elementTypeRef,
      })
      return
    }

    // Reorder within section
    if (
      activeDnd.type === 'recipe-row' &&
      overDnd.type === 'recipe-row' &&
      activeDnd.section === overDnd.section
    ) {
      const section = activeDnd.section
      const sectionRows = section === 'position'
        ? currentRecipe.position
        : section === 'dl_internal'
          ? currentRecipe.dlInternal
          : currentRecipe.linInternal

      const oldIdx = sectionRows.findIndex(r => r._id === active.id)
      const newIdx = sectionRows.findIndex(r => r._id === over.id)
      if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
        reorderIngredients(activePositionRef, section, oldIdx, newIdx)
      }
      return
    }

    // Cross-section move
    if (
      activeDnd.type === 'recipe-row' &&
      overDnd.type === 'recipe-row' &&
      activeDnd.section !== overDnd.section
    ) {
      moveIngredientAcrossSections(activePositionRef, active.id, overDnd.section)
      return
    }

    // Drop recipe row onto section droppable
    if (activeDnd.type === 'recipe-row' && overDnd.section) {
      if (activeDnd.section !== overDnd.section) {
        moveIngredientAcrossSections(activePositionRef, active.id, overDnd.section)
      }
    }
  }

  function handleApplyTemplate() {
    if (!bestTemplate || !activePositionRef) return
    applyTemplate(activePositionRef, bestTemplate.id)
    setAppliedTemplateId(prev => ({ ...prev, [activePositionRef]: bestTemplate.id }))
  }

  function handleSkipTemplate() {
    setSkippedTemplates(prev => new Set([...prev, activePositionRef]))
  }

  function handleReapplyTemplate() {
    if (!activePositionRef) return
    const tplId = appliedTemplateId[activePositionRef]
    if (!tplId) return
    reapplyTemplate(activePositionRef, tplId)
  }

  function handleClearTemplate() {
    if (!activePositionRef) return
    const rows = useStore.getState().recipes.filter(
      r => (r.PositionTypeRef || r.positionTypeRef) === activePositionRef
    )
    rows.forEach(r => useStore.getState().removeRecipeRow(activePositionRef, r._id))
    setAppliedTemplateId(prev => {
      const next = { ...prev }
      delete next[activePositionRef]
      return next
    })
  }

  async function handleExport() {
    setExporting(true)
    setExportError(null)
    setExportSuccess(false)
    try {
      await exportChanges()
      setExportSuccess(true)
      setTimeout(() => setExportSuccess(false), 3000)
    } catch (err) {
      setExportError(err.message || 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  async function handleSaveAsTemplate() {
    if (!templateNameInput.trim() || !activePositionRef) return
    await saveAsTemplate(activePositionRef, templateNameInput.trim(), 'project')
    setTemplateNameInput('')
    setShowSaveTemplate(false)
  }

  const hasDirtyChanges = psChanges.length > 0 || rsChanges.length > 0

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div
        className="d-flex align-items-center gap-2 px-3 py-2 border-bottom bg-white"
        style={{ flexShrink: 0 }}
      >
        <Button variant="outline-secondary" size="sm" onClick={onBackToSetup}>
          ← Back
        </Button>
        <Button variant="outline-secondary" size="sm" onClick={onOpenTemplateEditor}>
          Template Editor
        </Button>
        <Button variant="outline-secondary" size="sm" onClick={() => onOpenProductSpec()}>
          Product Spec
        </Button>
        <div className="flex-grow-1" />
        <Button
          variant={showDeleted ? 'secondary' : 'outline-secondary'}
          size="sm"
          onClick={() => setShowDeleted(v => !v)}
          title="Toggle visibility of soft-deleted rows"
        >
          {showDeleted ? 'Hide deleted' : 'Show deleted'}
        </Button>
        <Button
          variant="outline-primary"
          size="sm"
          onClick={() => runValidation()}
        >
          Run Validation
        </Button>
        {showSaveTemplate ? (
          <div className="d-flex gap-1 align-items-center">
            <input
              className="form-control form-control-sm"
              style={{ width: 180 }}
              placeholder="Template name…"
              value={templateNameInput}
              onChange={e => setTemplateNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveAsTemplate() }}
              autoFocus
            />
            <Button variant="success" size="sm" onClick={handleSaveAsTemplate}>Save</Button>
            <Button variant="link" size="sm" onClick={() => setShowSaveTemplate(false)}>Cancel</Button>
          </div>
        ) : (
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={() => setShowSaveTemplate(true)}
            disabled={!hasRecipeRows}
          >
            Save as template
          </Button>
        )}
        <Button
          variant={hasDirtyChanges ? 'primary' : 'outline-secondary'}
          size="sm"
          onClick={handleExport}
          disabled={exporting || !hasDirtyChanges}
        >
          {exporting ? <><Spinner size="sm" animation="border" className="me-1" />Exporting…</> : 'Export changes'}
        </Button>
        {exportSuccess && <span className="text-success small">✓ Exported</span>}
        {exportError && <span className="text-danger small">{exportError}</span>}
      </div>

      {/* Three-column body */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left panel: Position list + optional Context Tree */}
        <div
          style={{
            width: 240,
            flexShrink: 0,
            borderRight: '1px solid #dee2e6',
            display: 'flex',
            flexDirection: 'column',
            background: '#f8f9fa',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '4px 8px', borderBottom: '1px solid #e9ecef' }}>
            <Button
              variant={showContextTree ? 'secondary' : 'outline-secondary'}
              size="sm"
              style={{ fontSize: 10, padding: '1px 7px' }}
              onClick={() => setShowContextTree(!showContextTree)}
              title="Toggle context tree"
            >
              {showContextTree ? '▲ Tree' : '▼ Tree'}
            </Button>
          </div>
          <div style={{ flex: showContextTree ? '0 0 50%' : '1 1 auto', overflowY: 'auto' }}>
            <PositionList />
          </div>
          {showContextTree && (
            <div style={{ flex: '0 0 50%', borderTop: '1px solid #dee2e6', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div className="px-2 py-1 text-uppercase text-muted fw-bold" style={{ fontSize: 9, letterSpacing: 0.5, borderBottom: '1px solid #e9ecef', flexShrink: 0 }}>
                Context Tree
              </div>
              <ContextTreePanel />
            </div>
          )}
        </div>

        {/* Centre: Recipe canvas */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
            {activeContextType === 'ElementType' && activeETRef ? (
              /* ET internal recipe editing mode */
              <>
                {/* ET mode header */}
                <div
                  className="d-flex align-items-center gap-2 mb-3 px-3 py-2 rounded"
                  style={{ background: '#f0f4ff', border: '1px solid #c7d7f5', fontSize: 12, flexShrink: 0 }}
                >
                  <Button variant="outline-secondary" size="sm" style={{ fontSize: 11 }} onClick={closeETRecipe}>
                    ← Back
                  </Button>
                  <span className="fw-semibold">Editing ET: {activeETRef}</span>
                  {etModeUsedIn.length > 0 && (
                    <span className="text-muted small">— Used in: {etModeUsedIn.join(', ')}</span>
                  )}
                  <div className="flex-grow-1" />
                  <Button
                    variant="outline-primary"
                    size="sm"
                    style={{ fontSize: 11 }}
                    onClick={() => duplicateET(activeETRef)}
                  >
                    Duplicate ET
                  </Button>
                </div>

                <RecipeSection
                  title="ET Internal Recipe"
                  sectionKey="position"
                  rows={filterDeleted(etModeRows)}
                  posRef={etModePosRef}
                  onOpenProductSpec={onOpenProductSpec}
                  disableSorting
                />
              </>
            ) : !activePositionRef ? (
              <div className="text-center text-muted mt-5">
                <p>Select a position from the left panel to start editing its recipe.</p>
              </div>
            ) : (
              <>
                {/* Template offer banner */}
                {showTemplateBanner && (
                  <Alert variant="warning" className="d-flex align-items-center gap-2 py-2">
                    <span>
                      Apply template: <strong>{bestTemplate.name}</strong>?
                    </span>
                    <Button size="sm" variant="warning" onClick={handleApplyTemplate}>
                      Apply
                    </Button>
                    <Button size="sm" variant="outline-secondary" onClick={handleSkipTemplate}>
                      Skip
                    </Button>
                  </Alert>
                )}

                {isLoading && (
                  <div className="text-center py-3">
                    <Spinner animation="border" size="sm" /> Loading…
                  </div>
                )}

                {/* Applied template chip */}
                {appliedTemplateId[activePositionRef] && (() => {
                  const tpl = templates.find(t => t.id === appliedTemplateId[activePositionRef])
                  return tpl ? (
                    <div
                      className="d-flex align-items-center gap-2 mb-3 px-2 py-1 rounded"
                      style={{ background: '#f0f4ff', border: '1px solid #c7d7f5', fontSize: 12 }}
                    >
                      <span className="text-muted">Template:</span>
                      <span className="fw-semibold">{tpl.name}</span>
                      <Button
                        variant="outline-primary"
                        size="sm"
                        style={{ padding: '1px 8px', fontSize: 11 }}
                        onClick={handleReapplyTemplate}
                      >
                        Re-apply
                      </Button>
                      <Button
                        variant="outline-danger"
                        size="sm"
                        style={{ padding: '1px 8px', fontSize: 11 }}
                        onClick={handleClearTemplate}
                      >
                        Clear
                      </Button>
                    </div>
                  ) : null
                })()}

                {/* Position Level section */}
                <RecipeSection
                  title="Position Level"
                  sectionKey="position"
                  rows={currentRecipe.position}
                  posRef={activePositionRef}
                  onOpenProductSpec={onOpenProductSpec}
                />

                {/* Internal element section */}
                <RecipeSection
                  title={internalSectionLabel}
                  sectionKey={internalSection}
                  rows={isLinPosition ? currentRecipe.linInternal : currentRecipe.dlInternal}
                  posRef={activePositionRef}
                  onOpenProductSpec={onOpenProductSpec}
                />
              </>
            )}
          </div>

        {/* Right panel: tabs */}
        <div
          style={{
            width: 260,
            flexShrink: 0,
            borderLeft: '1px solid #dee2e6',
            display: 'flex',
            flexDirection: 'column',
            background: '#fff',
          }}
        >
          <Nav
            variant="tabs"
            className="px-2 pt-2"
            activeKey={rightTab}
            onSelect={k => setRightTab(k)}
          >
            <Nav.Item>
              <Nav.Link eventKey="palette" className="py-1 px-2 small">Elements</Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey="tags" className="py-1 px-2 small">Tags</Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey="templates" className="py-1 px-2 small">Templates</Nav.Link>
            </Nav.Item>
            <Nav.Item>
              <Nav.Link eventKey="validation" className="py-1 px-2 small">Validation</Nav.Link>
            </Nav.Item>
          </Nav>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {rightTab === 'palette' && <ElementPalette />}
            {rightTab === 'tags' && <TagReviewSidebar />}
            {rightTab === 'templates' && (
              <TemplatePicker
                posRef={activePositionRef}
                activeTags={activeTags}
                hasRows={hasRecipeRows}
                onApply={templateId =>
                  setAppliedTemplateId(prev => ({ ...prev, [activePositionRef]: templateId }))
                }
              />
            )}
            {rightTab === 'validation' && <ValidationPanel />}
          </div>
        </div>
      </div>
      </DndContext>
    </div>
  )
}

// ---------------------------------------------------------------------------
// RecipeSection — renders a sortable section of recipe rows
// ---------------------------------------------------------------------------

function RecipeSection({ title, sectionKey, rows, posRef, onOpenProductSpec, disableSorting = false }) {
  const addRecipeRow = useStore(s => s.addRecipeRow)
  const resolveSlot = useStore(s => s.resolveSlot)

  const { setNodeRef: setSectionDropRef, isOver: isSectionOver } = useDroppable({
    id: `section-drop-${sectionKey}-${posRef || 'none'}`,
    data: { type: 'section', section: sectionKey },
  })

  const sortableIds = disableSorting ? [] : rows.map(r => r._id).filter(Boolean)

  return (
    <div className="mb-4">
      <div
        className="d-flex align-items-center gap-2 mb-2"
        style={{ borderBottom: '2px solid #dee2e6', paddingBottom: 4 }}
      >
        <h6 className="mb-0 text-uppercase text-muted small fw-bold">{title}</h6>
        <Button
          variant="outline-secondary"
          size="sm"
          style={{ padding: '1px 8px', fontSize: 12 }}
          onClick={() => addRecipeRow(posRef, sectionKey, {})}
        >
          + Add row
        </Button>
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
                />
              )
              : (
                <IngredientCard
                  key={row._id}
                  row={row}
                  posRef={posRef}
                  sectionKey={sectionKey}
                  onOpenProductSpec={onOpenProductSpec}
                />
              )
          ))}
        </div>
      </SortableContext>
    </div>
  )
}
