import React, { useState, useMemo, useEffect } from 'react'
import {
  Button, ButtonGroup, Nav, Modal,
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
import { wrapperEditContext } from '../utils/collectionStatus'
import ProjectTreeView from '../components/ProjectTreeView'
import ElementTypeTreeView from '../components/ElementTypeTreeView'
import RecipeSection from '../components/RecipeSection'
import DuplicateETModal from '../components/DuplicateETModal'
import ConnectorWizardModal from '../components/ConnectorWizardModal'
import Breadcrumbs from '../components/Breadcrumbs'
import ProjectIdPill from '../components/ProjectIdPill'
import FormProgressChip from '../components/FormProgressChip'
import ElementPalette from '../components/ElementPalette'
import ValidationPanel from '../components/ValidationPanel'
import ReadinessPanel from '../components/ReadinessPanel'
import TagRulesModal from '../components/TagRulesModal'
import TemplatePicker from '../components/TemplatePicker'
import PasteMergeModal from '../components/PasteMergeModal'
import FavoritesPanel from '../components/FavoritesPanel'
import ReviewModal from '../components/ReviewModal'
import ValidationFixModal from '../components/ValidationFixModal'
import LinWrapperWizardModal from '../components/LinWrapperWizardModal'
import AddAnywhereModal from '../components/AddAnywhereModal'
import NewETWizardModal from '../components/NewETWizardModal'
import ChangeSummaryModal from '../components/ChangeSummaryModal'
import TransformToTemplateModal from '../components/TransformToTemplateModal'
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
export default function BuilderScreen({
  onOpenTemplateEditor, onOpenProductSpec, onOpenConnectors, onOpenTags, onOpenCodeImport, onBackToSetup,
  pendingReviewRefs, onConsumePendingReview,
}) {
  const rootView = useStore(s => s.rootView)
  const projectNumber = useStore(s => s.projectNumber)
  const configName = useStore(s => s.configName)
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
  const validationResults = useStore(s => s.validationResults)
  const closeETRecipe = useStore(s => s.closeETRecipe)
  const undo = useStore(s => s.undo)
  const redo = useStore(s => s.redo)
  const dbChanges = useStore(s => s.dbChanges)
  const focusPosition = useStore(s => s.focusPosition)

  const [showDupModal, setShowDupModal] = useState(false)
  const [showConnModal, setShowConnModal] = useState(false)
  const [showLinWizard, setShowLinWizard] = useState(false)
  const [showReview, setShowReview] = useState(false)
  const [reviewInitialRefs, setReviewInitialRefs] = useState(null)

  /** Step through the positions the Form is not yet satisfied on. */
  function startReconcile(refs) {
    if (!refs?.length) return
    setReviewInitialRefs(refs)
    setShowReview(true)
  }

  // Arriving with positions to review (e.g. from the product-code import) opens
  // ReviewModal straight into them; consume once so it doesn't reopen on its own.
  useEffect(() => {
    if (pendingReviewRefs && pendingReviewRefs.length > 0) {
      setReviewInitialRefs(pendingReviewRefs)
      setShowReview(true)
      onConsumePendingReview?.()
    }
  }, [pendingReviewRefs, onConsumePendingReview])
  const [addRowTarget, setAddRowTarget] = useState(null)      // { posRef, sectionKey }
  const [addAnywhereState, setAddAnywhereState] = useState(null) // { etRef, sectionKey, excludePosRef, startPosRef }
  const [newETTarget, setNewETTarget] = useState(null)        // { posRef, sectionKey }
  const [justAdded, setJustAdded] = useState(null)           // { etRef, posRef, sectionKey }
  const [reviewAddCtx, setReviewAddCtx] = useState(null)     // { unit, filters } for review→add priming
  const [showFixer, setShowFixer] = useState(false)
  const [rightTab, setRightTab] = useState('palette')
  const [showDeleted, setShowDeleted] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)
  const [showStatus, setShowStatus] = useState(false)          // where the project stands
  const [statusTab, setStatusTab] = useState('done')
  const [changeSummary, setChangeSummary] = useState(false)   // open the review + copy-patches modal
  const [, setActiveId] = useState(null)  // drag tracking
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)   // Transform-into-template modal (T-F4)
  const [showTags, setShowTags] = useState(false)                   // the tags modal (rules + colours)
  // Track which template (if any) was applied to each position { [posRef]: templateId }
  const [appliedTemplateId, setAppliedTemplateId] = useState({})

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  // The palette is a source you pull FROM into a recipe, so it is only useful while a
  // position is open — it opens with one, instead of hiding behind a handle nobody clicks.
  useEffect(() => { if (activePositionRef) setRightOpen(true) }, [activePositionRef])

  const canUndo = past.length > 0
  const canRedo = future.length > 0

  // Validation issues, for the toolbar's Status badge.
  const issueCount = validationResults.length
  const blockerCount = validationResults.filter(i => i.severity === 'error').length

  // Keyboard: Ctrl/Cmd+Z = undo, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y = redo
  useEffect(() => {
    function onKey(e) {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return
      const tag = (e.target?.tagName || '').toLowerCase()
      const activeTag = (document.activeElement?.tagName || '').toLowerCase()
      const editable = t => t === 'input' || t === 'textarea' || t === 'select'
      if (editable(tag) || editable(activeTag) || e.target?.isContentEditable) return
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

  function handleNewET(posRef, sectionKey, extra) {
    setNewETTarget({ posRef, sectionKey, ...(extra || {}) })
  }

  function handleNewETDone(etRef) {
    if (!newETTarget) return
    if (newETTarget.mode === 'replace') { doReplace(newETTarget, etRef); setNewETTarget(null); return }
    if (newETTarget.mode === 'reviewAdd') { setNewETTarget(null); openReviewAddAnywhere(etRef); return }
    if (newETTarget.mode === 'slot') {
      // Fill a primed template slot with the freshly created ET (T-R1)
      resolveSlot(newETTarget.posRef, newETTarget.slotKey, etRef)
      setNewETTarget(null)
      return
    }
    const { posRef, sectionKey } = newETTarget
    setNewETTarget(null)
    addRecipeRow(posRef, sectionKey, { elementTypeRef: etRef, ElementTypeRef: etRef })
    // Same as existing-pick: show the "🎉 Added" invite (skippable) instead of
    // jumping straight into the multi-add filters.
    setRightOpen(true)
    setRightTab('palette')
    setJustAdded({ etRef, posRef, sectionKey })
  }

  // ET mode: the wrapper's internals are projected onto every position that uses it,
  // so we render ONE position's copy. Which one matters — Fork repoints it. It is the
  // position you came from, never "whichever row happened to be first".
  const etModePosRef = useMemo(
    () => (activeContextType === 'ElementType' && activeETRef
      ? wrapperEditContext(recipes, activeETRef, activePositionRef)
      : null),
    [recipes, activeContextType, activeETRef, activePositionRef]
  )

  const etModeRows = useMemo(() => {
    if (activeContextType !== 'ElementType' || !activeETRef || !etModePosRef) return []
    return recipes
      .filter(r =>
        (r.ContextType || r.contextType) === 'ElementType' &&
        (r.ContextRef || r.contextRef) === activeETRef &&
        (r.PositionTypeRef || r.positionTypeRef) === etModePosRef
      )
      .sort((a, b) => ((a.RecipeIndex ?? a.recipeIndex ?? 0) - (b.RecipeIndex ?? b.recipeIndex ?? 0)))
  }, [recipes, activeContextType, activeETRef, etModePosRef])

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

  // Export is now review-and-copy: the Change Summary modal shows the per-file
  // patch scripts to copy into Excel; the tool never writes the xlsx.
  function requestExport() {
    setChangeSummary(true)
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
        {/* Silent unless a Form template is attached. "Reconcile →" steps through
            every position that still misses a Form product. */}
        <FormProgressChip onReconcile={startReconcile} />
        <IconButton variant="outline-secondary" bsSize="sm" icon="dashboard_customize"
          title="Template Editor" onClick={onOpenTemplateEditor} />
        <IconButton variant="outline-secondary" bsSize="sm" icon={ACTION_ICONS.productSpec}
          title="Product Spec" onClick={() => onOpenProductSpec()} />
        {/* The Form → product-code workflow used to be reachable only from inside the
            Product Spec screen, so nothing here said it existed. */}
        {onOpenCodeImport && (
          <IconButton variant="outline-secondary" bsSize="sm" icon="auto_fix_high"
            title="Import product codes from a Form template" onClick={onOpenCodeImport} />
        )}
        <IconButton variant="outline-secondary" bsSize="sm" icon={ACTION_ICONS.tags}
          title="Tags" onClick={() => setShowTags(true)} />

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
          title={showDeleted ? 'Hide IsDeleted rows' : 'Show IsDeleted rows'}
        />
        {/* Where the project stands. Validation and "Am I done?" were tabs in the palette
            drawer — closed by default, so nobody saw them. They are answers about the
            project, so they belong in the chrome, carrying their own count. */}
        <Button
          variant={blockerCount > 0 ? 'danger' : issueCount > 0 ? 'outline-warning' : 'outline-primary'}
          size="sm"
          className="d-inline-flex align-items-center gap-1"
          onClick={() => { runValidation(); setShowStatus(true) }}
          title="Validation and readiness — where the project stands"
        >
          <MaterialIcon name={ACTION_ICONS.validate} size={15} />
          Status
          {issueCount > 0 && (
            <span className="badge rounded-pill"
              style={{ background: blockerCount > 0 ? '#fff' : '#997404', color: blockerCount > 0 ? '#dc3545' : '#fff', fontSize: 10 }}>
              {issueCount}
            </span>
          )}
        </Button>
        <IconButton
          variant="outline-primary"
          bsSize="sm"
          icon="fact_check"
          onClick={() => setShowReview(true)}
          title="Review recipes by family / manufacturer / tag / contains…"
        />
        <IconButton
          variant="outline-secondary"
          bsSize="sm"
          icon={ACTION_ICONS.saveTemplate}
          onClick={() => setShowSaveTemplate(true)}
          disabled={!hasRecipeRows}
          title={hasRecipeRows ? 'Transform the active position into a template' : 'Select a position with rows to transform into a template'}
        />
        {/* No snapshot button: export writes nothing — it produces a patch script the
            user runs in Excel — so there is nothing to back up first. The project
            folder is opened read-only and nothing can write to it. */}
        {/* The ElementTypes patch is part of Export now — it emits all three scripts.
            A separate "Update ElementTypes" button was a second door to the same room. */}
        <Button
          variant={hasDirtyChanges ? 'primary' : 'outline-secondary'}
          size="sm"
          onClick={requestExport}
          disabled={!hasDirtyChanges}
        >
          Export changes
        </Button>
      </div>

      {/* Breadcrumb bar */}
      <div className="px-3 py-1 border-bottom bg-light" style={{ flexShrink: 0 }}>
        <Breadcrumbs />
      </div>

      {/* Main body: canvas + the palette drawer.
          There is no left drawer. It held a Navigator that was a second, flatter index of
          the very tree in the centre — same positions, same filter — so it was deleted and
          its one unique reading, recipe coverage, now sits in the tree's own header. */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>

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
              {/* Validation and "Done?" used to be tabs here. They are project answers, not
                  things you drag into a recipe — they live in the toolbar's Status button. */}
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
        onHide={() => { setShowReview(false); setReviewInitialRefs(null) }}
        onOpenProductSpec={onOpenProductSpec}
        onAddEntity={handleReviewAddEntity}
        onReplaceInReview={handleReplaceFromReview}
        initialRefs={reviewInitialRefs}
      />

      {/* Status: the two panels that used to hide in the palette drawer. Same panels,
          somewhere you can actually find them. */}
      <Modal show={showStatus} onHide={() => setShowStatus(false)} size="lg" centered scrollable>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: 15 }} className="d-flex align-items-center gap-2">
            <MaterialIcon name={ACTION_ICONS.validate} size={18} /> Where the project stands
          </Modal.Title>
        </Modal.Header>
        <Nav variant="tabs" activeKey={statusTab} onSelect={k => setStatusTab(k)} className="px-3 pt-2">
          <Nav.Item><Nav.Link eventKey="done" className="py-1 px-3 small">Am I done?</Nav.Link></Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="validation" className="py-1 px-3 small">
              Validation{issueCount > 0 ? ` (${issueCount})` : ''}
            </Nav.Link>
          </Nav.Item>
        </Nav>
        <Modal.Body>
          {statusTab === 'done' && (
            <ReadinessPanel
              onOpenValidation={() => { runValidation(); setStatusTab('validation') }}
              onOpenExport={() => { setShowStatus(false); setChangeSummary(true) }}
              onOpenPosition={ref => { setShowStatus(false); focusPosition(ref) }}
            />
          )}
          {statusTab === 'validation' && (
            <ValidationPanel
              onOpenProductSpec={ref => { setShowStatus(false); onOpenProductSpec(ref) }}
              onOpenFixer={() => { setShowStatus(false); setShowFixer(true) }}
            />
          )}
        </Modal.Body>
      </Modal>

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

      {/* Transform Active Position into a Template (T-F4) */}
      <TransformToTemplateModal
        show={showSaveTemplate}
        onHide={() => setShowSaveTemplate(false)}
        posRef={activePositionRef}
      />

      {/* Change Summary — review the pending changes and copy the per-file patch scripts */}
      <ChangeSummaryModal
        show={!!changeSummary}
        onHide={() => setChangeSummary(false)}
      />

      <TagRulesModal show={showTags} onHide={() => setShowTags(false)} />
    </div>
  )
}
