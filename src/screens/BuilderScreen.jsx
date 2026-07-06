import React, { useState, useMemo, useEffect } from 'react'
import {
  Button, ButtonGroup, Nav, Spinner, Form, Modal,
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
import ProjectIdPill from '../components/ProjectIdPill'
import ElementPalette from '../components/ElementPalette'
import ValidationPanel from '../components/ValidationPanel'
import TemplatePicker from '../components/TemplatePicker'
import PasteMergeModal from '../components/PasteMergeModal'
import FavoritesPanel from '../components/FavoritesPanel'
import ReviewModal from '../components/ReviewModal'
import ValidationFixModal from '../components/ValidationFixModal'
import LinWrapperWizardModal from '../components/LinWrapperWizardModal'
import AddAnywhereModal from '../components/AddAnywhereModal'
import NewETWizardModal from '../components/NewETWizardModal'
import ConflictModal from '../components/ConflictModal'
import IconButton from '../components/IconButton'
import MaterialIcon from '../components/MaterialIcon'
import { ACTION_ICONS, ICONS } from '../utils/entityStyle'

/**
 * BuilderScreen — three-column layout.
 *
 * The centre is the project tree outliner (the primary editing surface): every
 * position on one scannable, collapsible surface, edited inline. The left
 * column is a compact jump/filter index; the right column holds the palette and
 * supporting tabs. Drilling into a container element's internal recipe swaps the
 * centre for a focused ET editor.
 */
export default function BuilderScreen({ onOpenTemplateEditor, onOpenProductSpec, onOpenConnectors, onOpenTags, onBackToSetup }) {
  const rootView = useStore(s => s.rootView)
  const projectNumber = useStore(s => s.projectNumber)
  const configName = useStore(s => s.configName)
  const folderPath = useStore(s => s.folderPath)
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
  const updateRecipeRow = useStore(s => s.updateRecipeRow)
  const ensurePSRow = useStore(s => s.ensurePSRow)
  const resolveSlot = useStore(s => s.resolveSlot)
  const reorderIngredients = useStore(s => s.reorderIngredients)
  const moveIngredientAcrossSections = useStore(s => s.moveIngredientAcrossSections)
  const runValidation = useStore(s => s.runValidation)
  const exportChanges = useStore(s => s.exportChanges)
  const saveAsTemplate = useStore(s => s.saveAsTemplate)
  const closeETRecipe = useStore(s => s.closeETRecipe)
  const undo = useStore(s => s.undo)
  const redo = useStore(s => s.redo)
  const snapshotProject = useStore(s => s.snapshotProject)
  const dbWriteEnabled = useStore(s => s.dbWriteEnabled)
  const dbChanges = useStore(s => s.dbChanges)
  const exportCatalogueChanges = useStore(s => s.exportCatalogueChanges)

  const [showDupModal, setShowDupModal] = useState(false)
  const [showConnModal, setShowConnModal] = useState(false)
  const [showLinWizard, setShowLinWizard] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [addRowTarget, setAddRowTarget] = useState(null)      // { posRef, sectionKey }
  const [addAnywhereState, setAddAnywhereState] = useState(null) // { etRef, sectionKey, excludePosRef, startPosRef }
  const [newETTarget, setNewETTarget] = useState(null)        // { posRef, sectionKey }
  const [justAdded, setJustAdded] = useState(null)           // { etRef, posRef, sectionKey }
  const [reviewAddCtx, setReviewAddCtx] = useState(null)     // { unit, filters } for review→add priming
  const [showFixer, setShowFixer] = useState(false)
  const [rightTab, setRightTab] = useState('palette')
  const [showDeleted, setShowDeleted] = useState(false)
  const [leftOpen, setLeftOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState(null)
  const [exportSuccess, setExportSuccess] = useState(false)
  const [snapshotMsg, setSnapshotMsg] = useState(null)
  const [showSnapshotPrompt, setShowSnapshotPrompt] = useState(false)
  const snapshotOfferedRef = React.useRef(false)
  const [, setActiveId] = useState(null)  // drag tracking
  const [templateNameInput, setTemplateNameInput] = useState('')
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [saveToLibrary, setSaveToLibrary] = useState(false)
  // Track which template (if any) was applied to each position { [posRef]: templateId }
  const [appliedTemplateId, setAppliedTemplateId] = useState({})

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  const canUndo = past.length > 0
  const canRedo = future.length > 0

  // Keyboard: Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y = redo
  useEffect(() => {
    function onKey(e) {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const tag = (e.target?.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return
      const k = e.key.toLowerCase()
      if (k === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (k === 'y' && !e.shiftKey) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  function filterDeleted(rows) {
    if (showDeleted) return rows
    return rows.filter(r => (r.IsDeleted || r.isDeleted) !== 'Y')
  }

  function handleAddRow(posRef, sectionKey) {
    setAddRowTarget({ posRef, sectionKey })
    setRightOpen(true)
    setRightTab('palette')
  }

  function handlePickET(etRef) {
    if (!addRowTarget) return
    if (addRowTarget.mode === 'replace') { doReplace(addRowTarget, etRef); setAddRowTarget(null); return }
    if (addRowTarget.mode === 'reviewAdd') { setAddRowTarget(null); openReviewAddAnywhere(etRef); return }
    // Streamlined existing-pick: add the row and exit pick mode. Adding an
    // EXISTING ET to several positions is the "Add to multiple" toggle's job.
    addRecipeRow(addRowTarget.posRef, addRowTarget.sectionKey, { elementTypeRef: etRef, ElementTypeRef: etRef })
    setAddRowTarget(null)
  }

  // Replace a row's ElementType in place (Existing/New fork). keepFields
  // preserves quantity/flags; otherwise they reset to defaults for the new ET.
  function handleReplace(posRef, rowId, { mode, keepFields, resumeReview } = {}) {
    if (mode === 'new') {
      setNewETTarget({ posRef, sectionKey: null, mode: 'replace', rowId, keepFields, resumeReview })
    } else {
      setAddRowTarget({ posRef, sectionKey: null, mode: 'replace', rowId, keepFields, resumeReview })
      setRightOpen(true)
      setRightTab('palette')
    }
  }

  // From the review modal: close it, run the replace pick, reopen when done.
  function handleReplaceFromReview(posRef, rowId, opts) {
    setShowReview(false)
    handleReplace(posRef, rowId, { ...opts, resumeReview: true })
  }

  function doReplace(target, etRef) {
    const { posRef, rowId, keepFields } = target
    const patch = { elementTypeRef: etRef, ElementTypeRef: etRef }
    if (!keepFields) {
      Object.assign(patch, {
        quantity: 1, Quantity: 1,
        packQuantity: null, PackQuantity: null,
        isDesign: null, IsDesign: null,
        isContractItem: null, IsContractItem: null,
        isTRItem: null, IsTRItem: null,
        dimQtyMultiplier: null, Dim_QuantityMultiplier: null,
        isInteger: null, IsInteger: null,
      })
    }
    updateRecipeRow(posRef, rowId, patch)
    ensurePSRow(etRef)
    if (target.resumeReview) setShowReview(true)
  }

  function handleAddToMultiple() {
    if (!justAdded) return
    const { etRef, posRef, sectionKey } = justAdded
    setJustAdded(null)
    setAddAnywhereState({ etRef, sectionKey, excludePosRef: posRef, startPosRef: null })
  }

  function handlePickETMulti(etRef) {
    if (!addRowTarget) return
    if (addRowTarget.mode === 'replace') { doReplace(addRowTarget, etRef); setAddRowTarget(null); return }
    if (addRowTarget.mode === 'reviewAdd') { setAddRowTarget(null); openReviewAddAnywhere(etRef); return }
    // Multi-add: don't insert yet — open step-through for all positions starting at the current one
    setAddAnywhereState({ etRef, sectionKey: addRowTarget.sectionKey, excludePosRef: null, startPosRef: addRowTarget.posRef })
    setAddRowTarget(null)
  }

  function handleCancelPick() {
    const backToReview = addRowTarget?.mode === 'reviewAdd' || addRowTarget?.resumeReview
    setAddRowTarget(null)
    setJustAdded(null)
    if (backToReview) { setReviewAddCtx(null); setShowReview(true) }
  }

  // Review → Add Entity: close the review, run the Existing/New pick, then open
  // the step-through primed with the review's own filter, and reopen the review
  // when done.
  function handleReviewAddEntity({ mode, unit, filters } = {}) {
    setShowReview(false)
    const ctx = { unit, filters }
    setReviewAddCtx(ctx)
    if (mode === 'new') {
      setNewETTarget({ posRef: null, sectionKey: 'position', mode: 'reviewAdd' })
    } else {
      setAddRowTarget({ posRef: null, sectionKey: 'position', mode: 'reviewAdd' })
      setRightOpen(true)
      setRightTab('palette')
    }
  }

  function openReviewAddAnywhere(etRef) {
    setAddAnywhereState({
      etRef, sectionKey: 'position',
      initialFilters: reviewAddCtx?.filters,
      initialUnit: reviewAddCtx?.unit,
      resumeReview: true,
    })
    setReviewAddCtx(null)
  }

  function handleNewET(posRef, sectionKey) {
    setNewETTarget({ posRef, sectionKey })
  }

  function handleNewETDone(etRef) {
    if (!newETTarget) return
    if (newETTarget.mode === 'replace') { doReplace(newETTarget, etRef); setNewETTarget(null); return }
    if (newETTarget.mode === 'reviewAdd') { setNewETTarget(null); openReviewAddAnywhere(etRef); return }
    const { posRef, sectionKey } = newETTarget
    setNewETTarget(null)
    addRecipeRow(posRef, sectionKey, { elementTypeRef: etRef, ElementTypeRef: etRef })
    // Same as existing-pick: show the "🎉 Added" invite (skippable) instead of
    // jumping straight into the multi-add filters.
    setRightOpen(true)
    setRightTab('palette')
    setJustAdded({ etRef, posRef, sectionKey })
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

  // Offer a snapshot before export only when the newest snapshot is stale
  // (older than a day) or there's never been one — and only once per session.
  async function handleExport() {
    if (!snapshotOfferedRef.current) {
      snapshotOfferedRef.current = true
      let stale = true
      try {
        const t = await window.electronAPI.lastSnapshotTime?.(folderPath)
        stale = !t || (Date.now() - t) > 24 * 60 * 60 * 1000
      } catch { /* treat as stale */ }
      if (stale) { setShowSnapshotPrompt(true); return }  // in-app prompt drives the export
    }
    doExport()
  }

  async function doExport() {
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

  async function handleSnapshot() {
    setExportError(null)
    try {
      const res = await snapshotProject()
      if (res?.ok === false) throw new Error(res.error || 'unknown error')
      if (res?.dir) {
        setSnapshotMsg('Snapshot saved')
        setTimeout(() => setSnapshotMsg(null), 3000)
      }
    } catch (err) {
      setExportError(`Snapshot failed: ${err.message}`)
    }
  }

  async function handleExportCatalogue() {
    if (dbChanges.length === 0) return
    if (!window.confirm(
      `Write ${dbChanges.length} change${dbChanges.length === 1 ? '' : 's'} to the DesignDB ElementTypes catalogue?\n\n` +
      'This edits the shared DB file. Only the ElementTypes sheet is touched — ' +
      'Positions, Elements and LinksMap are left to the design pipeline.'
    )) return
    setExportError(null)
    try {
      await exportCatalogueChanges()
      setSnapshotMsg('Catalogue exported')
      setTimeout(() => setSnapshotMsg(null), 3000)
    } catch (err) {
      setExportError(err.message || 'Catalogue export failed')
    }
  }

  async function handleSaveAsTemplate() {
    if (!templateNameInput.trim() || !activePositionRef) return
    await saveAsTemplate(activePositionRef, templateNameInput.trim(), saveToLibrary ? 'global' : 'project')
    setTemplateNameInput('')
    setShowSaveTemplate(false)
    setSaveToLibrary(false)
  }

  const hasDirtyChanges = psChanges.length > 0 || rsChanges.length > 0

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }} data-debug-id="BuilderScreen">
      {/* Toolbar */}
      <div
        className="d-flex align-items-center gap-2 px-3 py-2 border-bottom bg-white"
        style={{ flexShrink: 0 }}
        data-debug-id="BuilderScreen/Toolbar"
      >
        <IconButton variant="outline-secondary" bsSize="sm" icon={ACTION_ICONS.back}
          title="Back to project setup" onClick={onBackToSetup} />
        {projectNumber && (
          <ProjectIdPill number={projectNumber} configName={configName} size="sm" className="me-1" />
        )}
        <IconButton variant="outline-secondary" bsSize="sm" icon="dashboard_customize"
          title="Template Editor" onClick={onOpenTemplateEditor} />
        <IconButton variant="outline-secondary" bsSize="sm" icon={ACTION_ICONS.productSpec}
          title="Product Spec" onClick={() => onOpenProductSpec()} />
        <IconButton variant="outline-secondary" bsSize="sm" icon={ACTION_ICONS.tags}
          title="Tags" onClick={onOpenTags} />

        <ButtonGroup size="sm" className="ms-2">
          <Button
            variant={rootView === 'positions' ? 'primary' : 'outline-primary'}
            onClick={() => setRootView('positions')}
            className="d-inline-flex align-items-center gap-1"
            title="Browse by PositionType"
          >
            <MaterialIcon name={ICONS.position} size={15} /> PositionTypes
          </Button>
          <Button
            variant={rootView === 'elements' ? 'primary' : 'outline-primary'}
            onClick={() => setRootView('elements')}
            className="d-inline-flex align-items-center gap-1"
            title="Browse by ElementType"
          >
            <MaterialIcon name={ICONS.element} size={15} /> ElementTypes
          </Button>
        </ButtonGroup>

        <ButtonGroup size="sm" className="ms-2">
          <IconButton variant="outline-secondary" icon={ACTION_ICONS.undo}
            onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" />
          <IconButton variant="outline-secondary" icon={ACTION_ICONS.redo}
            onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" />
        </ButtonGroup>

        <div className="flex-grow-1" />
        <IconButton
          variant={showDeleted ? 'secondary' : 'outline-secondary'}
          bsSize="sm"
          icon={showDeleted ? ACTION_ICONS.hideDeleted : ACTION_ICONS.showDeleted}
          onClick={() => setShowDeleted(v => !v)}
          title={showDeleted ? 'Hide soft-deleted rows' : 'Show soft-deleted rows'}
        />
        <IconButton
          variant="outline-primary"
          bsSize="sm"
          icon={ACTION_ICONS.validate}
          onClick={() => runValidation()}
          title="Run validation"
        />
        <IconButton
          variant="outline-primary"
          bsSize="sm"
          icon={ACTION_ICONS.review}
          onClick={() => setShowReview(true)}
          title="Review recipes by family / manufacturer / tag / contains…"
        />
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
            <Form.Check
              type="checkbox"
              id="save-to-library"
              label="My library"
              checked={saveToLibrary}
              onChange={e => setSaveToLibrary(e.target.checked)}
              style={{ fontSize: 12, whiteSpace: 'nowrap' }}
              title="Save to your cross-project favourites (available in every project)"
            />
            <Button variant="success" size="sm" onClick={handleSaveAsTemplate}>Save</Button>
            <Button variant="link" size="sm" onClick={() => setShowSaveTemplate(false)}>Cancel</Button>
          </div>
        ) : (
          <IconButton
            variant="outline-secondary"
            bsSize="sm"
            icon={ACTION_ICONS.saveTemplate}
            onClick={() => setShowSaveTemplate(true)}
            disabled={!hasRecipeRows}
            title={hasRecipeRows ? 'Save the active position as a template' : 'Select a position with rows to save as a template'}
          />
        )}
        {/* Snapshot is now offered as part of the export flow (see the
            snapshot-before-export prompt), so no standalone toolbar button. */}
        {/* Catalogue export appears only when there are pending ElementType
            catalogue changes to write to the shared DesignDB file. */}
        {dbWriteEnabled && dbChanges.length > 0 && (
          <Button
            variant="warning"
            size="sm"
            className="d-inline-flex align-items-center gap-1"
            onClick={handleExportCatalogue}
            title={`Write ${dbChanges.length} new/edited ElementType${dbChanges.length === 1 ? '' : 's'} to the shared DesignDB catalogue (ElementTypes sheet only)`}
          >
            <MaterialIcon name="inventory_2" size={15} />
            Save {dbChanges.length} to DB
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
        {exportSuccess && <span className="text-success small d-inline-flex align-items-center gap-1"><MaterialIcon name="check" size={14} /> Exported</span>}
        {snapshotMsg && <span className="text-success small d-inline-flex align-items-center gap-1"><MaterialIcon name="check" size={14} /> {snapshotMsg}</span>}
        {exportError && <span className="text-danger small">{exportError}</span>}
      </div>

      {/* Breadcrumb bar */}
      <div className="px-3 py-1 border-bottom bg-light" style={{ flexShrink: 0 }}>
        <Breadcrumbs />
      </div>

      {/* Main body: canvas with drawer toggles */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>

        {/* Left drawer toggle */}
        <button
          onClick={() => setLeftOpen(v => !v)}
          title={leftOpen ? 'Close navigator' : 'Open navigator'}
          style={{
            position: 'absolute',
            left: leftOpen ? 260 : 0,
            top: '50%',
            transform: 'translateY(-50%)',
            transition: 'left 0.2s ease',
            zIndex: 10,
            background: '#f8f9fa',
            border: '1px solid #dee2e6',
            borderLeft: 'none',
            borderRadius: '0 4px 4px 0',
            padding: '8px 4px',
            cursor: 'pointer',
            lineHeight: 1,
            fontSize: 13,
            color: '#555',
          }}
        >
          <MaterialIcon name={leftOpen ? 'chevron_left' : 'chevron_right'} size={16} />
        </button>

        {/* Right drawer toggle */}
        <button
          onClick={() => setRightOpen(v => !v)}
          title={rightOpen ? 'Close palette' : 'Open palette'}
          style={{
            position: 'absolute',
            right: rightOpen ? 280 : 0,
            top: '50%',
            transform: 'translateY(-50%)',
            transition: 'right 0.2s ease',
            zIndex: 10,
            background: '#f8f9fa',
            border: '1px solid #dee2e6',
            borderRight: 'none',
            borderRadius: '4px 0 0 4px',
            padding: '8px 4px',
            cursor: 'pointer',
            lineHeight: 1,
            fontSize: 13,
            color: '#555',
          }}
        >
          <MaterialIcon name={rightOpen ? 'chevron_right' : 'chevron_left'} size={16} />
        </button>

        {/* Left drawer: navigator — in-flow so it pushes the canvas */}
        <div
          style={{
            width: leftOpen ? 260 : 0,
            flexShrink: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            background: '#f8f9fa',
            borderRight: leftOpen ? '1px solid #dee2e6' : 'none',
            transition: 'width 0.2s ease',
          }}
        >
          <div className="d-flex align-items-center justify-content-between px-3 py-2 border-bottom" style={{ flexShrink: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: '#555' }}>Navigator</span>
            <button className="btn btn-link p-0" style={{ color: '#888', lineHeight: 1 }} onClick={() => setLeftOpen(false)} title="Close navigator" aria-label="Close navigator"><MaterialIcon name="close" size={18} /></button>
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <ProjectNavigator />
          </div>
        </div>

        {/* Centre: project tree outliner (or ET internal editor) */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} data-debug-id="BuilderScreen/Centre (main surface)">
          {inETMode ? (
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
              {/* ET mode header */}
              <div
                className="d-flex align-items-center gap-2 mb-3 px-3 py-2 rounded"
                style={{ background: '#f0f4ff', border: '1px solid #c7d7f5', fontSize: 12, flexShrink: 0 }}
              >
                <IconButton variant="outline-secondary" bsSize="sm" style={{ fontSize: 11 }}
                  icon={ACTION_ICONS.back} title="Back to tree" onClick={closeETRecipe} />
                <span className="fw-semibold">Editing ET: {activeETRef}</span>
                {etModeUsedIn.length > 0 ? (
                  <span
                    className="badge"
                    style={{ background: '#fff3cd', color: '#856404', border: '1px solid #ffc107', fontSize: 11 }}
                    title={`Shared assembly — edits here apply to all ${etModeUsedIn.length} position${etModeUsedIn.length === 1 ? '' : 's'}: ${etModeUsedIn.join(', ')}`}
                  >
                    <MaterialIcon name="warning" size={12} /> Edits apply to {etModeUsedIn.length} position{etModeUsedIn.length === 1 ? '' : 's'}: {etModeUsedIn.join(', ')}
                  </span>
                ) : (
                  <span className="text-muted small">— not used by any position yet</span>
                )}
                <div className="flex-grow-1" />
                {activeETRef?.toUpperCase().includes('LIN') && (
                  <Button
                    variant="outline-success"
                    size="sm"
                    className="d-inline-flex align-items-center gap-1"
                    style={{ fontSize: 11 }}
                    onClick={() => setShowLinWizard(true)}
                    title="Open LIN wrapper wizard to build this element's internal recipe"
                  >
                    <MaterialIcon name="linear_scale" size={14} /> LIN wizard
                  </Button>
                )}
                <Button
                  variant="outline-primary"
                  size="sm"
                  className="d-inline-flex align-items-center gap-1"
                  style={{ fontSize: 11 }}
                  onClick={() => setShowConnModal(true)}
                  title="Add a connector to this element's internal recipe"
                >
                  <MaterialIcon name="cable" size={14} /> Connector
                </Button>
                <Button
                  variant="outline-primary"
                  size="sm"
                  className="d-inline-flex align-items-center gap-1"
                  style={{ fontSize: 11 }}
                  onClick={() => setShowDupModal(true)}
                  title="Duplicate this element type under a new ref"
                >
                  <MaterialIcon name="difference" size={14} /> Duplicate ET
                </Button>
              </div>

              <RecipeSection
                title="ET Internal Recipe"
                sectionKey="position"
                rows={filterDeleted(etModeRows)}
                posRef={etModePosRef}
                onOpenProductSpec={onOpenProductSpec}
                onAddRow={handleAddRow}
                onNewET={handleNewET}
                onReplace={handleReplace}
                disableSorting
              />
            </div>
          ) : rootView === 'elements' ? (
            <ElementTypeTreeView />
          ) : (
            <ProjectTreeView
              onOpenProductSpec={onOpenProductSpec}
              onOpenConnectors={onOpenConnectors}
              showDeleted={showDeleted}
              onAddRow={handleAddRow}
              onNewET={handleNewET}
              onReplace={handleReplace}
            />
          )}
        </div>

        {/* Right drawer: tabbed palette */}
        <div
          data-debug-id="BuilderScreen/RightDrawer"
          style={{
            width: rightOpen ? 280 : 0,
            flexShrink: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            background: '#fff',
            borderLeft: rightOpen ? '1px solid #dee2e6' : 'none',
            transition: 'width 0.2s ease',
          }}
        >
          <div style={{ flexShrink: 0, borderBottom: '1px solid #dee2e6', display: 'flex', alignItems: 'center' }}>
            <Nav
              variant="tabs"
              activeKey={rightTab}
              onSelect={k => setRightTab(k)}
              className="px-2 pt-1 flex-grow-1"
              style={{ borderBottom: 'none' }}
            >
              <Nav.Item>
                <Nav.Link eventKey="palette" className="py-1 px-2 small">ElementTypes</Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="templates" className="py-1 px-2 small">Templates</Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="favorites" className="py-1 px-2 small" title="Favourites">
                  <MaterialIcon name={ACTION_ICONS.favorite} size={14} />
                </Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link eventKey="validation" className="py-1 px-2 small">Validation</Nav.Link>
              </Nav.Item>
            </Nav>
            <button className="btn btn-link p-0 me-2" style={{ color: '#888', lineHeight: 1 }} onClick={() => setRightOpen(false)} title="Close palette" aria-label="Close palette"><MaterialIcon name="close" size={18} /></button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {rightTab === 'palette' && (
              <ElementPalette
                pickTarget={addRowTarget}
                onPickET={handlePickET}
                onPickETMulti={handlePickETMulti}
                onCancelPick={handleCancelPick}
                onNewET={handleNewET}
                justAdded={justAdded}
                onAddToMultiple={handleAddToMultiple}
              />
            )}
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
            {rightTab === 'favorites' && <FavoritesPanel />}
            {rightTab === 'validation' && (
              <ValidationPanel
                onOpenProductSpec={onOpenProductSpec}
                onOpenFixer={() => setShowFixer(true)}
              />
            )}
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

      <PasteMergeModal />

      <ReviewModal
        show={showReview}
        onHide={() => setShowReview(false)}
        onOpenProductSpec={onOpenProductSpec}
        onAddEntity={handleReviewAddEntity}
        onReplaceInReview={handleReplaceFromReview}
      />

      <ValidationFixModal
        show={showFixer}
        onHide={() => setShowFixer(false)}
        onOpenProductSpec={onOpenProductSpec}
      />

      <LinWrapperWizardModal
        show={showLinWizard}
        onHide={() => setShowLinWizard(false)}
        etRef={activeETRef}
        posRef={etModePosRef}
        etModeRows={etModeRows}
      />

      <AddAnywhereModal
        show={!!addAnywhereState}
        onHide={() => {
          const resume = addAnywhereState?.resumeReview
          setAddAnywhereState(null)
          if (resume) setShowReview(true)   // continue the review where it left off
        }}
        etRef={addAnywhereState?.etRef}
        sectionKey={addAnywhereState?.sectionKey}
        excludePosRef={addAnywhereState?.excludePosRef}
        startPosRef={addAnywhereState?.startPosRef}
        initialFilters={addAnywhereState?.initialFilters}
        initialUnit={addAnywhereState?.initialUnit}
      />

      <NewETWizardModal
        show={!!newETTarget}
        onHide={() => {
          const backToReview = newETTarget?.mode === 'reviewAdd' || newETTarget?.resumeReview
          setNewETTarget(null)
          if (backToReview) { setReviewAddCtx(null); setShowReview(true) }
        }}
        posRef={newETTarget?.posRef}
        sectionKey={newETTarget?.sectionKey}
        onDone={handleNewETDone}
      />

      <ConflictModal />

      {/* In-app snapshot offer (replaces the native confirm; only shown when
          the newest snapshot is stale). */}
      <Modal show={showSnapshotPrompt} onHide={() => setShowSnapshotPrompt(false)} centered size="sm">
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: 14 }} className="d-flex align-items-center gap-2">
            <MaterialIcon name="backup_table" size={18} /> Snapshot before exporting?
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ fontSize: 13 }}>
          It's been a while since your last snapshot. A snapshot copies the DB, PS and RS
          files into a dated backup folder so you can roll back if an export goes wrong.
        </Modal.Body>
        <Modal.Footer>
          <Button variant="link" size="sm" style={{ fontSize: 12 }}
            onClick={() => { setShowSnapshotPrompt(false); doExport() }}>
            Export without snapshot
          </Button>
          <Button variant="primary" size="sm" style={{ fontSize: 12 }}
            onClick={async () => {
              setShowSnapshotPrompt(false)
              try { await handleSnapshot() } catch { /* surfaced by handleSnapshot */ }
              doExport()
            }}>
            Snapshot &amp; export
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}
