import React, { useState, useMemo, useEffect } from 'react'
import {
  Button, ButtonGroup, Nav, Spinner,
} from 'react-bootstrap'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import useStore, { getRecipeForPosition } from '../store/useStore'
import { getUsedIn } from '../utils/containerUtils'
import ProjectNavigator from '../components/ProjectNavigator'
import ProjectTreeView from '../components/ProjectTreeView'
import ElementTypeTreeView from '../components/ElementTypeTreeView'
import RecipeSection from '../components/RecipeSection'
import DuplicateETModal from '../components/DuplicateETModal'
import ConnectorWizardModal from '../components/ConnectorWizardModal'
import Breadcrumbs from '../components/Breadcrumbs'
import ElementPalette from '../components/ElementPalette'
import TagReviewSidebar from '../components/TagReviewSidebar'
import ValidationPanel from '../components/ValidationPanel'
import TemplatePicker from '../components/TemplatePicker'

/**
 * BuilderScreen — three-column layout.
 *
 * The centre is the project tree outliner (the primary editing surface): every
 * position on one scannable, collapsible surface, edited inline. The left
 * column is a compact jump/filter index; the right column holds the palette and
 * supporting tabs. Drilling into a container element's internal recipe swaps the
 * centre for a focused ET editor.
 */
export default function BuilderScreen({ onOpenTemplateEditor, onOpenProductSpec, onBackToSetup }) {
  const rootView = useStore(s => s.rootView)
  const activePositionRef = useStore(s => s.activePositionRef)
  const activeContextType = useStore(s => s.activeContextType)
  const activeETRef = useStore(s => s.activeETRef)
  const recipes = useStore(s => s.recipes)
  const positionUI = useStore(s => s.positionUI)
  const psChanges = useStore(s => s.psChanges)
  const rsChanges = useStore(s => s.rsChanges)
  const past = useStore(s => s.past)
  const future = useStore(s => s.future)

  const setRootView = useStore(s => s.setRootView)
  const addRecipeRow = useStore(s => s.addRecipeRow)
  const resolveSlot = useStore(s => s.resolveSlot)
  const reorderIngredients = useStore(s => s.reorderIngredients)
  const moveIngredientAcrossSections = useStore(s => s.moveIngredientAcrossSections)
  const runValidation = useStore(s => s.runValidation)
  const exportChanges = useStore(s => s.exportChanges)
  const saveAsTemplate = useStore(s => s.saveAsTemplate)
  const closeETRecipe = useStore(s => s.closeETRecipe)
  const undo = useStore(s => s.undo)
  const redo = useStore(s => s.redo)

  const [showDupModal, setShowDupModal] = useState(false)
  const [showConnModal, setShowConnModal] = useState(false)
  const [rightTab, setRightTab] = useState('palette')
  const [showDeleted, setShowDeleted] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(null)
  const [exportSuccess, setExportSuccess] = useState(false)
  const [, setActiveId] = useState(null)  // drag tracking
  const [templateNameInput, setTemplateNameInput] = useState('')
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  // Track which template (if any) was applied to each position { [posRef]: templateId }
  const [appliedTemplateId, setAppliedTemplateId] = useState({})

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const canUndo = past.length > 0
  const canRedo = future.length > 0

  // Keyboard: Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z = redo
  useEffect(() => {
    function onKey(e) {
      const mod = e.ctrlKey || e.metaKey
      if (!mod || e.key.toLowerCase() !== 'z') return
      const tag = (e.target?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return
      e.preventDefault()
      if (e.shiftKey) redo()
      else undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  function filterDeleted(rows) {
    if (showDeleted) return rows
    return rows.filter(r => (r.IsDeleted || r.isDeleted) !== 'Y')
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

  const inETMode = activeContextType === 'ElementType' && !!activeETRef

  // Active-position context for the right-hand Tags/Templates tabs
  const activeTags = activePositionRef ? (positionUI[activePositionRef]?.tags || []) : []
  const activeGrouped = activePositionRef ? getRecipeForPosition(recipes, activePositionRef) : null
  const hasRecipeRows = !!activeGrouped && (
    activeGrouped.position.length > 0 ||
    activeGrouped.dlInternal.length > 0 ||
    activeGrouped.linInternal.length > 0
  )

  // -------------------------------------------------------------------------
  // Drag and drop — position-aware so any expanded node can receive drops
  // -------------------------------------------------------------------------

  function handleDragStart({ active }) {
    setActiveId(active.id)
  }

  function handleDragEnd({ active, over }) {
    setActiveId(null)
    if (!over) return

    const a = active.data.current || {}
    const o = over.data.current || {}

    // Palette drop onto a slot — resolve it
    if (a.type === 'palette-item' && o.type === 'slot') {
      const pos = o.posRef || activePositionRef
      if (pos) resolveSlot(pos, o.slotKey, a.elementTypeRef)
      return
    }

    // Palette drop onto a section droppable or a recipe row
    if (a.type === 'palette-item') {
      const pos = o.posRef || activePositionRef
      const section = o.section || 'position'
      if (pos) {
        addRecipeRow(pos, section, {
          elementTypeRef: a.elementTypeRef,
          ElementTypeRef: a.elementTypeRef,
        })
      }
      return
    }

    // Recipe-row interactions are scoped to a single position
    if (a.type === 'recipe-row') {
      const pos = a.posRef
      if (!pos) return

      // Reorder within the same section
      if (o.type === 'recipe-row' && o.posRef === pos && a.section === o.section) {
        const grouped = getRecipeForPosition(recipes, pos)
        const rows = filterDeleted(
          a.section === 'position' ? grouped.position
            : a.section === 'dl_internal' ? grouped.dlInternal
              : grouped.linInternal
        )
        const oldIdx = rows.findIndex(r => r._id === active.id)
        const newIdx = rows.findIndex(r => r._id === over.id)
        if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
          reorderIngredients(pos, a.section, oldIdx, newIdx)
        }
        return
      }

      // Cross-section move (row → row in a different section of the same position)
      if (o.type === 'recipe-row' && o.posRef === pos && a.section !== o.section) {
        moveIngredientAcrossSections(pos, active.id, o.section)
        return
      }

      // Drop a recipe row onto a section droppable of the same position
      if (o.section && o.posRef === pos && a.section !== o.section) {
        moveIngredientAcrossSections(pos, active.id, o.section)
      }
    }
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

        <ButtonGroup size="sm" className="ms-2">
          <Button
            variant={rootView === 'positions' ? 'primary' : 'outline-primary'}
            onClick={() => setRootView('positions')}
          >
            PositionTypes
          </Button>
          <Button
            variant={rootView === 'elements' ? 'primary' : 'outline-primary'}
            onClick={() => setRootView('elements')}
          >
            ElementTypes
          </Button>
        </ButtonGroup>

        <ButtonGroup size="sm" className="ms-2">
          <Button variant="outline-secondary" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            ↶ Undo
          </Button>
          <Button variant="outline-secondary" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
            ↷ Redo
          </Button>
        </ButtonGroup>

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
            title={hasRecipeRows ? 'Save the active position as a template' : 'Select a position with rows to save as a template'}
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

      {/* Breadcrumb bar */}
      <div className="px-3 py-1 border-bottom bg-light" style={{ flexShrink: 0 }}>
        <Breadcrumbs />
      </div>

      {/* Three-column body */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left panel: compact jump/filter index */}
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
          <ProjectNavigator />
        </div>

        {/* Centre: project tree outliner (or ET internal editor) */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {inETMode ? (
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
              {/* ET mode header */}
              <div
                className="d-flex align-items-center gap-2 mb-3 px-3 py-2 rounded"
                style={{ background: '#f0f4ff', border: '1px solid #c7d7f5', fontSize: 12, flexShrink: 0 }}
              >
                <Button variant="outline-secondary" size="sm" style={{ fontSize: 11 }} onClick={closeETRecipe}>
                  ← Back to tree
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
                  onClick={() => setShowConnModal(true)}
                >
                  + Connector
                </Button>
                <Button
                  variant="outline-primary"
                  size="sm"
                  style={{ fontSize: 11 }}
                  onClick={() => setShowDupModal(true)}
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
            </div>
          ) : rootView === 'elements' ? (
            <ElementTypeTreeView />
          ) : (
            <ProjectTreeView
              onOpenProductSpec={onOpenProductSpec}
              showDeleted={showDeleted}
            />
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

      <DuplicateETModal
        show={showDupModal}
        etRef={activeETRef}
        posRef={etModePosRef}
        onClose={() => setShowDupModal(false)}
      />

      <ConnectorWizardModal
        show={showConnModal}
        posRef={etModePosRef}
        context="element"
        onClose={() => setShowConnModal(false)}
      />
    </div>
  )
}
