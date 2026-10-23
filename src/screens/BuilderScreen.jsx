import React, { useState, useMemo, useEffect } from 'react'
import {
  Button, ButtonGroup, Dropdown, Modal, Form,
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
import ElementTypesWindow from '../components/ElementTypesWindow'
import Breadcrumbs from '../components/Breadcrumbs'
import ProjectIdPill from '../components/ProjectIdPill'
import FormProgressChip from '../components/FormProgressChip'
import ElementPalette from '../components/ElementPalette'
import SimilarPositionsPanel from '../components/SimilarPositionsPanel'
import TutorialHint from '../tutorial/TutorialHint'
import TagRulesModal from '../components/TagRulesModal'
import FormSpecPane from '../components/FormSpecPane'
import SurfaceSwitch from '../components/SurfaceSwitch'
import ConnectorsPane from '../components/ConnectorsPane'
import ConnectorAutoJoin from '../components/ConnectorAutoJoin'
import { connectorGapsForPosition } from '../utils/collectionStatus'
import { membership } from '../utils/connectorGroups'
import TemplatesPane from '../components/TemplatesPane'
import useTemplateMatches, { useHintsOff, hintOff } from '../components/useTemplateMatches'
import PasteMergeModal from '../components/PasteMergeModal'
import ReviewModal from '../components/ReviewModal'
import FormRecipesModal from '../components/FormRecipesModal'
import FormAutoSaveAll from '../components/FormAutoSaveAll'
import FormFileWatch from '../components/FormFileWatch'
import RecipeStylesWindow from '../components/RecipeStylesWindow'
import TeachBar from '../components/TeachBar'
import ValidationFixModal from '../components/ValidationFixModal'
import { SaveIndicator } from '../components/SaveStatus'
import LinWrapperWizardModal from '../components/LinWrapperWizardModal'
import AddAnywhereModal from '../components/AddAnywhereModal'
import NewETWizardModal from '../components/NewETWizardModal'
import ChangeSummaryModal from '../components/ChangeSummaryModal'
import SaveTemplateModal from '../components/SaveTemplateModal'
import IconButton from '../components/IconButton'
import MaterialIcon from '../components/MaterialIcon'
import { ACTION_ICONS, ICONS } from '../utils/entityStyle'
import { C } from '../styles/tokens'
import { askConfirm } from '../components/ConfirmHost'

/**
 * BuilderScreen — three-column layout.
 *
 * The centre is the project tree outliner (the primary editing surface): every
 * position on one scannable, collapsible surface, edited inline. The left
 * column is a compact jump/filter index; the right column holds the palette and
 * supporting tabs. Drilling into a container element's internal recipe swaps the
 * centre for a focused ET editor.
 */
// The right drawer: wide enough for the Form spec pane (K3LGUL).
const DRAWER_W = 340

export default function BuilderScreen({
  onOpenTemplateEditor, onOpenProductSpec, onOpenConnectors, onOpenTags, onOpenCodeImport, onBackToSetup,
  pendingReviewRefs, onConsumePendingReview, importLoop = null, onNextFromImport, onEndImportLoop,
}) {
  const rootView = useStore(s => s.rootView)
  const projectNumber = useStore(s => s.projectNumber)
  const configName = useStore(s => s.configName)
  const projectId = useStore(s => s.projectId)
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
  const pendingPaletteTab = useStore(s => s.pendingPaletteTab)
  const consumePendingPaletteTab = useStore(s => s.consumePendingPaletteTab)
  const closeETRecipe = useStore(s => s.closeETRecipe)
  const undo = useStore(s => s.undo)
  const redo = useStore(s => s.redo)

  const [showDupModal, setShowDupModal] = useState(false)
  const [showLinWizard, setShowLinWizard] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)

  /** A backup file of this setup: files, tags, templates and unexported work. */
  async function saveBackup() {
    const r = await window.electronAPI?.db?.exportConfigYAML?.(projectId, `${projectNumber || 'project'}-${configName || 'Base'}`)
    const toast = useStore.getState().toast
    if (r?.ok) toast(`Backup saved to ${r.path}`)
    else if (r?.error) toast(`Could not save the backup: ${r.error}`, { ok: false })
    return !!r?.ok
  }
  const [showReview, setShowReview] = useState(false)
  const [reviewInitialRefs, setReviewInitialRefs] = useState(null)

  /** Step through the positions the Form is not yet satisfied on. */
  function startReconcile(refs) {
    if (!refs?.length) return
    setReviewInitialRefs(refs)
    setShowReview(true)
  }

  // Arriving with positions to review (e.g. from the product-code import): first offer to
  // build them all from the Form, then ReviewModal walks through them. Consume once so it
  // doesn't reopen on its own.
  const formCaptures = useStore(s => s.formCaptures)
  const [formBuild, setFormBuild] = useState(null)   // { refs, thenReview }
  const [showStyles, setShowStyles] = useState(false)
  useEffect(() => {
    if (pendingReviewRefs && pendingReviewRefs.length > 0) {
      setReviewInitialRefs(pendingReviewRefs)
      // Straight to the positions: "Build recipes from the Form" is under ⋯, never pushed (CWF8ZQ).
      setShowReview(true)
      onConsumePendingReview?.()
    }
  }, [pendingReviewRefs, onConsumePendingReview])   // eslint-disable-line react-hooks/exhaustive-deps
  // What to do next on a new project: import the Form first, then build what it imported.
  const [hideNextStep, setHideNextStep] = useState(false)
  const nextStep = useMemo(() => {
    if (hideNextStep) return null
    const live = recipes.filter(r => (r.IsDeleted || r.isDeleted) !== 'Y')
    const imported = Object.keys(formCaptures?.byPosition || {}).filter(p => formCaptures.byPosition[p]?.length)
    if (live.length === 0 && imported.length === 0 && onOpenCodeImport) {
      return { icon: 'auto_fix_high', title: 'New project? Start with the Form.',
        text: 'Import its product codes: they fill the Product Spec and ElementTypes, then the recipes build from them.',
        action: 'Import the Form', go: onOpenCodeImport }
    }
    const withRecipe = new Set(live.map(r => r.PositionTypeRef || r.positionTypeRef))
    const unbuilt = imported.filter(p => !withRecipe.has(p))
    if (unbuilt.length > 0) {
      // Position by position, from the Form spec pane. The bulk build stays under ⋯.
      return { icon: 'auto_awesome', title: `${unbuilt.length} position${unbuilt.length === 1 ? '' : 's'} from the Form ha${unbuilt.length === 1 ? 's' : 've'} no recipe yet.`,
        text: 'Open each one: its Form spec pane adds what the Form asks for.',
        action: `Open ${unbuilt[0]}`, go: () => useStore.getState().setActivePosition(unbuilt[0]) }
    }
    return null
  }, [hideNextStep, recipes, formCaptures, onOpenCodeImport])
  const closeFormBuild = () => { const then = formBuild?.thenReview; setFormBuild(null); if (then) setShowReview(true) }
  const [addRowTarget, setAddRowTarget] = useState(null)      // { posRef, sectionKey }
  const [addAnywhereState, setAddAnywhereState] = useState(null) // { etRef, sectionKey, excludePosRef, startPosRef }
  const [newETTarget, setNewETTarget] = useState(null)        // { posRef, sectionKey }
  const [justAdded, setJustAdded] = useState(null)           // { etRef, posRef, sectionKey }
  const [reviewAddCtx, setReviewAddCtx] = useState(null)     // { unit, filters } for review→add priming
  const [showFixer, setShowFixer] = useState(false)
  // The drawer's tab and open state live in the store, so a banner can open it at a tab.
  const rightTab = useStore(s => s.drawerTab)
  const setRightTab = useStore(s => s.setDrawerTab)
  const [addQuery, setAddQuery] = useState('')
  const showDeleted = useStore(s => s.showDeleted)
  const rightOpen = useStore(s => s.drawerOpen)
  const setDrawerOpen = useStore(s => s.setDrawerOpen)
  const setRightOpen = v => setDrawerOpen(typeof v === 'function' ? v(useStore.getState().drawerOpen) : v)
  const [changeSummary, setChangeSummary] = useState(false)   // open the review + copy-patches modal
  const [, setActiveId] = useState(null)  // drag tracking
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)   // Transform-into-template modal (T-F4)
  const [showRetire, setShowRetire] = useState(false)               // Clean up unused ElementTypes
  const [showTags, setShowTags] = useState(false)                   // the tags modal (rules + colours)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  // The palette starts closed and stays as you leave it (2NNZGY); it opens when something
  // asks for it (a palette tab, adding a row) or from its handle.

  // The Form pane is nested too deep to reach this state, so it asks via the store.
  useEffect(() => {
    if (!pendingPaletteTab) return
    setRightOpen(true)
    setRightTab(pendingPaletteTab)
    consumePendingPaletteTab()
  }, [pendingPaletteTab, consumePendingPaletteTab])

  // Find (src/help) asks for a window by name (uiRequest); the kinds are listed in help/uiRequests.js.
  const uiRequest = useStore(s => s.uiRequest)
  useEffect(() => {
    if (!uiRequest) return
    const { kind, args = {} } = uiRequest
    useStore.getState().consumeUiRequest()
    const open = {
      export: () => setChangeSummary(true),
      status: () => setChangeSummary(true),   // "where the project stands" is the export checklist now
      review: () => setShowReview(true),
      formBuild: () => setFormBuild({ refs: [], thenReview: false }),
      styles: () => setShowStyles(true),
      saveTemplate: () => setShowSaveTemplate(true),
      tags: () => setShowTags(true),
      etWindow: () => setShowRetire('existing'),
      retireUnused: () => setShowRetire('unused'),
      linWizard: () => setShowLinWizard(true),
      dupET: () => setShowDupModal(true),
      backup: () => saveBackup(),
      fixer: () => setShowFixer(true),
      elementsView: () => setRootView('elements'),
      positionsView: () => setRootView('positions'),
      drawer: () => { setRightOpen(true); setRightTab(args.tab || 'palette') },
    }[kind]
    open?.()
  }, [uiRequest])   // eslint-disable-line react-hooks/exhaustive-deps

  const canUndo = past.length > 0
  const canRedo = future.length > 0

  // Ctrl/Cmd+Z / Shift+Z / Y are app-wide: see UndoShortcut (App.jsx).

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
  // The position the drawer's Form spec is for: the one open in the centre.
  const allPositionTypes = useStore(s => s.positionTypes)
  const etCollections = useStore(s => s.etCollections)
  const containerETRefs = useStore(s => s.containerETRefs)
  const drawerPos = rootView === 'positions' && allPositionTypes.some(p => p.PositionTypeRef === activePositionRef) ? activePositionRef : null
  // Connector gaps on the open position: a dot on the drawer's Connectors tab.
  const connectorPins = useStore(s => s.connectorPins)
  const connectorExcludes = useStore(s => s.connectorExcludes)
  const connectorGaps = useMemo(() => {
    if (!drawerPos) return 0
    const recOf = useStore.getState()._templateRecOf()
    const member = membership([drawerPos], etCollections, connectorPins, recOf, connectorExcludes).get(drawerPos)
    return connectorGapsForPosition(recipes, drawerPos, recOf(drawerPos), etCollections, containerETRefs, member).length
  }, [drawerPos, recipes, etCollections, containerETRefs, connectorPins, connectorExcludes])
  // Dot on the Templates tab: the open position is empty and a template fits it (unless its hint was dismissed).
  const hintsOff = useHintsOff()
  const drawerMatches = useTemplateMatches(drawerPos ? [drawerPos] : [])
  const templateHint = !!drawerPos && !hintOff(hintsOff, drawerPos) && !recipes.some(r => (r.PositionTypeRef || r.positionTypeRef) === drawerPos && (r.IsDeleted || r.isDeleted) !== 'Y')
    && (drawerMatches.get(drawerPos)?.matches.length || 0) > 0
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
        {/* First, as on the Product Spec's header, so it does not move between them (ZMRK2Y). */}
        <SurfaceSwitch active={rootView === 'positions' ? 'recipes' : null} className=""
          onRecipes={() => setRootView('positions')} onProductSpec={() => onOpenProductSpec()} />
        {projectNumber && (
          <ProjectIdPill number={projectNumber} configName={configName} size="sm" className="me-1" />
        )}
        <SaveIndicator />
        {/* Silent unless a Form template is attached. "Reconcile →" steps through
            every position that still misses a Form product. */}
        <FormProgressChip onReconcile={startReconcile} onLoad={onOpenCodeImport} />
        <FormAutoSaveAll />
        <FormFileWatch />
        <ConnectorAutoJoin />

        {/* Recipes (the tree, 96KPJ5) and the Product Spec (XZ3UBB): the two surfaces you move
            between. Browsing by ElementType and the Form import are in ⋮; Connectors in the drawer. */}

        <ButtonGroup size="sm" className="ms-2">
          <IconButton variant="outline-secondary" icon={ACTION_ICONS.undo}
            onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" />
          <IconButton variant="outline-secondary" icon={ACTION_ICONS.redo}
            onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" />
        </ButtonGroup>

        <div className="flex-grow-1" />
        {/* The once-in-a-while ones. They were four more icons competing with Export for
            your eye, and none of them is something you reach for twice in an hour. */}
        <Dropdown align="end">
          <Dropdown.Toggle as={IconButton} bsSize="sm" variant="outline-secondary"
            icon={ACTION_ICONS.more} title="More" />
          <Dropdown.Menu style={{ fontSize: 12 }}>
            <Dropdown.Header>Recipes</Dropdown.Header>
            <Dropdown.Item onClick={() => setShowReview(true)}>
              <MaterialIcon name="fact_check" size={14} /> Review recipes…
            </Dropdown.Item>
            <Dropdown.Item onClick={() => setFormBuild({ refs: [], thenReview: false })} disabled={!Object.keys(formCaptures?.byPosition || {}).length}>
              <MaterialIcon name="auto_awesome" size={14} /> Build recipes from the Form…
            </Dropdown.Item>
            {onOpenCodeImport && (
              <Dropdown.Item onClick={onOpenCodeImport}>
                <MaterialIcon name="auto_fix_high" size={14} /> Import product codes from a Form template
              </Dropdown.Item>
            )}
            <Dropdown.Item onClick={() => setShowStyles(true)}>
              <MaterialIcon name="style" size={14} /> Recipe styles…
            </Dropdown.Item>
            <Dropdown.Divider />
            <Dropdown.Header>Templates and tags</Dropdown.Header>
            <Dropdown.Item onClick={() => setShowSaveTemplate(true)} disabled={!hasRecipeRows}>
              <MaterialIcon name={ACTION_ICONS.saveTemplate} size={14} /> Save this position as a template
            </Dropdown.Item>
            <Dropdown.Item onClick={onOpenTemplateEditor}>
              <MaterialIcon name="dashboard_customize" size={14} /> Manage templates
            </Dropdown.Item>
            <Dropdown.Item onClick={() => setShowTags(true)}>
              <MaterialIcon name={ACTION_ICONS.tags} size={14} /> Tags
            </Dropdown.Item>
            <Dropdown.Divider />
            <Dropdown.Header>ElementTypes</Dropdown.Header>
            <Dropdown.Item onClick={() => setRootView('elements')} active={rootView === 'elements'}>
              <MaterialIcon name={ICONS.element} size={14} /> Browse ElementTypes
            </Dropdown.Item>
            <Dropdown.Item onClick={() => setShowRetire('existing')}>
              <MaterialIcon name="category" size={14} /> ElementTypes…
            </Dropdown.Item>
            <Dropdown.Item onClick={() => setShowRetire('unused')}>
              <MaterialIcon name="cleaning_services" size={14} /> Clean up unused ElementTypes…
            </Dropdown.Item>
            <Dropdown.Divider />
            <Dropdown.Header>Project</Dropdown.Header>
            <Dropdown.Item onClick={saveBackup}>
              <MaterialIcon name="save_alt" size={14} /> Save project settings (.config.yaml)…
            </Dropdown.Item>
            {psChanges.length + rsChanges.length > 0 && (
              <Dropdown.Item className="text-danger" onClick={async () => {
                const n = psChanges.length + rsChanges.length
                if (await askConfirm(`Discard all ${n} unexported changes? This cannot be undone.`, { ok: 'Discard', danger: true })) useStore.getState().discardPendingChanges()
              }}>
                <MaterialIcon name="delete_sweep" size={14} /> Discard unexported changes…
              </Dropdown.Item>
            )}
            {/* Not a "back": it closes the project. Says so, and asks first. */}
            <Dropdown.Item onClick={() => setConfirmClose(true)} title="Close project — back to choosing a project">
              <MaterialIcon name="logout" size={14} /> Close project…
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
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
            right: rightOpen ? DRAWER_W : 0,
            top: '50%',
            transform: 'translateY(-50%)',
            transition: 'right 0.2s ease',
            zIndex: 10,
            background: C.subtle,
            border: `1px solid ${C.border}`,
            borderRight: 'none',
            borderRadius: '4px 0 0 4px',
            padding: '8px 4px',
            cursor: 'pointer',
            lineHeight: 1,
            fontSize: 13,
            color: C.muted,
          }}
        >
          <MaterialIcon name={rightOpen ? 'chevron_right' : 'chevron_left'} size={16} />
        </button>

        {/* Centre: project tree outliner (or ET internal editor) */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} data-debug-id="BuilderScreen/Centre (main surface)">
          <TeachBar onReturn={({ refs, focus }) => setFormBuild({ refs, focus, thenReview: false })} />
          {inETMode ? (
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
              {/* ET mode header */}
              <div
                className="d-flex align-items-center gap-2 mb-3 px-3 py-2 rounded"
                style={{ background: C.accentTint, border: `1px solid ${C.accentEdge}`, fontSize: 12, flexShrink: 0 }}
              >
                <IconButton variant="outline-secondary" bsSize="sm" style={{ fontSize: 11 }}
                  icon={ACTION_ICONS.back} title="Back to tree" onClick={closeETRecipe} />
                <span className="fw-semibold">Editing ET: {activeETRef}</span>
                <TutorialHint id="wrapper-internals" />
                {etModeUsedIn.length > 0 ? (
                  <span
                    className="badge"
                    style={{ background: C.attnTint, color: C.attnInk, border: `1px solid ${C.attn}`, fontSize: 11 }}
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
                    variant="outline-secondary"
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
            <>
            {importLoop && (
              <div className="d-flex align-items-center gap-2 mx-3 mt-1 text-muted" data-testid="import-loop"
                style={{ fontSize: 12, flexShrink: 0 }}>
                <span>From the Form import: {importLoop.refs.join(', ')} added to the Product Spec. Build {importLoop.refs.length === 1 ? 'its recipe' : 'their recipes'}, then carry on.</span>
                <Button size="sm" variant="link" className="ms-auto p-0 text-nowrap" style={{ fontSize: 11 }} onClick={onNextFromImport}>
                  Next position →
                </Button>
                <IconButton variant="link" bsSize="sm" icon="close" title="Hide" onClick={onEndImportLoop} />
              </div>
            )}
            {nextStep && (
              <div className="d-flex align-items-center gap-2 mx-3 mt-2 px-3 py-2 rounded" data-testid="next-step"
                style={{ background: C.accentTint, border: `1px solid ${C.accentEdge}`, fontSize: 12, color: C.accentInk, flexShrink: 0 }}>
                <MaterialIcon name={nextStep.icon} size={16} />
                <span><strong>{nextStep.title}</strong> <span className="text-muted">{nextStep.text}</span></span>
                <Button size="sm" variant="primary" className="ms-auto text-nowrap" style={{ fontSize: 11 }} onClick={nextStep.go}>
                  {nextStep.action}
                </Button>
                <IconButton variant="link" bsSize="sm" icon="close" title="Hide" onClick={() => setHideNextStep(true)} />
              </div>
            )}
            {/* No onOpenConnectors: the Connectors screen opens from the drawer's pane only. */}
            <ProjectTreeView
              onOpenProductSpec={onOpenProductSpec}
              showDeleted={showDeleted}
              onAddRow={handleAddRow}
              onNewET={handleNewET}
              onReplace={handleReplace}
            />
            </>
          )}
        </div>

        {/* Right drawer: tabbed palette */}
        <div
          data-debug-id="BuilderScreen/RightDrawer"
          style={{
            width: rightOpen ? DRAWER_W : 0,
            flexShrink: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            background: C.surface,
            borderLeft: rightOpen ? `1px solid ${C.border}` : 'none',
            transition: 'width 0.2s ease',
          }}
        >
          {/* The drawer: this position's Form spec first (K3LGUL), then the ways to add rows —
              ElementTypes and positions like this one — under one search box. */}
          <div style={{ flexShrink: 0, borderBottom: `1px solid ${C.border}` }} className="px-2 pt-2 pb-1">
            <div className="d-flex align-items-center gap-1">
              <ButtonGroup size="sm" className="flex-grow-1" aria-label="Show">
                {[
                  ['form', 'description', 'Form spec'],
                  ['connectors', 'cable', 'Connectors'],
                  ['palette', 'category', 'ElementTypes'],
                  ['similar', 'compare_arrows', 'Positions like this one'],
                  ['templates', 'dashboard_customize', 'Templates'],
                ].map(([k, icon, label]) => (
                  <Button key={k} variant={rightTab === k ? 'primary' : 'outline-secondary'} title={label} aria-label={label}
                    data-testid={`drawer-tab-${k}`} onClick={() => setRightTab(k)} style={{ padding: '1px 4px', position: 'relative' }}>
                    <MaterialIcon name={icon} size={15} />
                    {k === 'templates' && templateHint && (
                      <span data-testid="template-hint-dot" style={{ position: 'absolute', top: 2, right: 6, width: 7, height: 7, borderRadius: '50%', background: C.attn }} />
                    )}
                    {k === 'connectors' && connectorGaps > 0 && (
                      <span data-testid="connector-gap-dot" style={{ position: 'absolute', top: 2, right: 6, width: 7, height: 7, borderRadius: '50%', background: C.attn }} />
                    )}
                  </Button>
                ))}
              </ButtonGroup>
              <TutorialHint id="palette" />
              <button className="btn btn-link p-0" style={{ color: C.muted, lineHeight: 1 }} onClick={() => setRightOpen(false)} title="Close palette" aria-label="Close palette"><MaterialIcon name="close" size={18} /></button>
            </div>
            {!['form', 'connectors', 'templates'].includes(rightTab) && (
              <Form.Control size="sm" className="mt-1" value={addQuery} onChange={e => setAddQuery(e.target.value)}
                placeholder="Search to add…" aria-label="Search to add" style={{ fontSize: 12 }} />
            )}
          </div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {rightTab === 'form' && (drawerPos
              ? <FormSpecPane posRef={drawerPos} inDrawer />
              : <div className="text-muted fst-italic p-3" style={{ fontSize: 11 }} data-testid="drawer-form-hint">Open a position to see what the Form asks for.</div>)}
            {rightTab === 'connectors' && (drawerPos
              ? <ConnectorsPane posRef={drawerPos} onOpenConnectors={onOpenConnectors} />
              : <div className="text-muted fst-italic p-3" style={{ fontSize: 11 }}>
                  Open a position to see its connectors.
                  {onOpenConnectors && <Button variant="link" size="sm" className="p-0 d-block fst-normal" style={{ fontSize: 11 }}
                    onClick={() => onOpenConnectors(null)}>Templates and the coverage matrix →</Button>}
                </div>)}
            {rightTab === 'palette' && (
              <ElementPalette
                pickTarget={addRowTarget}
                onPickET={handlePickET}
                onPickETMulti={handlePickETMulti}
                onCancelPick={handleCancelPick}
                onNewET={handleNewET}
                justAdded={justAdded}
                onAddToMultiple={handleAddToMultiple}
                query={addQuery}
              />
            )}
            {rightTab === 'similar' && <SimilarPositionsPanel posRef={activePositionRef} query={addQuery} />}
            {rightTab === 'templates' && (drawerPos
              ? <TemplatesPane posRef={drawerPos} />
              : <div className="text-muted fst-italic p-3" style={{ fontSize: 11 }}>Open a position to see the templates that fit it.</div>)}
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

      <PasteMergeModal />

      <ElementTypesWindow show={!!showRetire} view={showRetire === 'unused' ? 'unused' : 'existing'} onHide={() => setShowRetire(false)} />

      <RecipeStylesWindow show={showStyles} onHide={() => setShowStyles(false)} />
      <FormRecipesModal show={formBuild != null} posRefs={formBuild?.refs || []} focusGroup={formBuild?.focus || null} onHide={closeFormBuild}
        onOpenPosition={p => { setFormBuild(null); useStore.getState().setActivePosition(p) }} />
      <ReviewModal
        show={showReview}
        onHide={() => { setShowReview(false); setReviewInitialRefs(null) }}
        onOpenProductSpec={onOpenProductSpec}
        onAddEntity={handleReviewAddEntity}
        onReplaceInReview={handleReplaceFromReview}
        initialRefs={reviewInitialRefs}
      />

      <Modal show={confirmClose} onHide={() => setConfirmClose(false)} centered size="sm">
        <Modal.Header closeButton><Modal.Title style={{ fontSize: 15 }}>Close this project?</Modal.Title></Modal.Header>
        <Modal.Body style={{ fontSize: 12 }}>
          You go back to choosing a project.
          {hasDirtyChanges
            ? <> Your {psChanges.length + rsChanges.length} unexported change{psChanges.length + rsChanges.length === 1 ? ' is' : 's are'} kept
                in this browser and offered back when you reopen it — but they are not in the workbooks until you export.</>
            : <> Nothing is waiting to export.</>}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="link" size="sm" className="text-muted" onClick={() => setConfirmClose(false)}>Stay</Button>
          {hasDirtyChanges && (
            <Button variant="outline-primary" size="sm" onClick={() => { setConfirmClose(false); requestExport() }}>Export first</Button>
          )}
          <Button variant="outline-secondary" size="sm" onClick={saveBackup}
            title="A .config.yaml you can restore this project's settings from on another machine">Save project settings</Button>
          <Button variant="danger" size="sm" onClick={() => { setConfirmClose(false); onBackToSetup() }}>Close project</Button>
        </Modal.Footer>
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

      {/* Save the active position's recipe as a template — the same window as the
          recipe header's bookmark button. */}
      <SaveTemplateModal
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

