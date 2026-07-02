/**
 * useStore.js
 * Zustand store for Recipe Builder.
 * Manages all project state: imported Excel data, templates, slot mappings,
 * position UI, dirty tracking, validation, and file-watch alerts.
 */

import { create } from 'zustand'
import axios from 'axios'
import { v4 as uuidv4 } from 'uuid'
import { findBestTemplate, recipeToTemplate } from '../utils/templateLoader.js'
import { resolveTemplate, applyResolvedTemplate } from '../utils/slotResolver.js'
import { evaluateTags, effectiveTags, snapshotForPosition } from '../utils/tagRules.js'
import { runValidation } from '../utils/validationRules.js'
import { computeContainerInfo, looksLikeContainer, getNextAvailableRef } from '../utils/containerUtils.js'
import { positionFamilyOf } from '../utils/positionFamily.js'
import { familyOf } from '../utils/etRef.js'
import { FLASK_PORT, DIM_QTY_COMPONENTS, AUTO_CONTRACT_ITEMS } from '../utils/constants.js'
import { CONNECTOR_TEMPLATES } from '../data/connectorTemplates.js'

const API = `http://localhost:${FLASK_PORT}`

// Max number of undo snapshots retained.
const HISTORY_LIMIT = 50

// ---------------------------------------------------------------------------
// Container ET helpers
// ---------------------------------------------------------------------------

/** Collects all ET refs from elementTypes, psRows, and recipes into an array. */
export function collectAllETRefs(elementTypes = [], psRows = [], recipes = []) {
  const set = new Set()
  for (const et of elementTypes) { const r = et.ElementTypeRef || et.elementTypeRef; if (r) set.add(r) }
  for (const row of psRows)      { const r = row.ElementTypeRef || row.elementTypeRef; if (r) set.add(r) }
  for (const row of recipes)     { const r = row.ElementTypeRef || row.elementTypeRef; if (r) set.add(r) }
  return [...set]
}

// ---------------------------------------------------------------------------
// Row identity helpers
// ---------------------------------------------------------------------------

/** Stamp each raw row from Flask with a stable _id for React keying. */
function stampIds(rows) {
  if (!Array.isArray(rows)) return []
  return rows.map(row => ({ ...row, _id: uuidv4() }))
}

// ---------------------------------------------------------------------------
// Recipe grouping helper (exported for components)
// ---------------------------------------------------------------------------

/**
 * Get recipe rows for a position, grouped by section.
 *
 * @param {object[]} recipes - flat recipe rows from store
 * @param {string} posRef - PositionTypeRef
 * @returns {{ position: object[], dlInternal: object[], linInternal: object[] }}
 */
export function getRecipeForPosition(recipes, posRef) {
  const rows = recipes.filter(r => r.PositionTypeRef === posRef || r.positionTypeRef === posRef)
  return {
    position: rows.filter(r =>
      (r.ContextType || r.contextType) === 'PositionType'
    ),
    dlInternal: rows.filter(r => {
      const ct = r.ContextType || r.contextType
      const etRef = r.ElementTypeRef || r.elementTypeRef || ''
      return ct === 'ElementType' && !etRef.toUpperCase().includes('LIN')
    }),
    linInternal: rows.filter(r => {
      const ct = r.ContextType || r.contextType
      const etRef = r.ElementTypeRef || r.elementTypeRef || ''
      return ct === 'ElementType' && etRef.toUpperCase().includes('LIN')
    }),
  }
}

// ---------------------------------------------------------------------------
// Internal section helpers
// ---------------------------------------------------------------------------

/** Canonical section key → ContextType / ContextRef lookup. */
function contextForSection(section, posRef, recipes) {
  if (section === 'position') {
    return { contextType: 'PositionType', contextRef: posRef }
  }

  if (section === 'dl_internal' || section === 'lin_internal') {
    // Find the DESIGN_ELEMENT row for this position to get its ElementTypeRef
    const posRows = recipes.filter(
      r => (r.positionTypeRef || r.PositionTypeRef) === posRef &&
           (r.contextType || r.ContextType) === 'PositionType' &&
           (r.isDesign || r.IsDesign) === 'Y'
    )
    const designRow = posRows[0]
    const contextRef = designRow
      ? (designRow.elementTypeRef || designRow.ElementTypeRef || null)
      : null
    return { contextType: 'ElementType', contextRef }
  }

  return { contextType: 'PositionType', contextRef: posRef }
}

/** Renumber RecipeIndex (1-based) for an array of rows in place. */
function renumberSection(rows) {
  return rows.map((row, i) => ({ ...row, RecipeIndex: i + 1, recipeIndex: i + 1 }))
}

/** Move item in array by index; returns new array. */
function arrayMove(arr, fromIndex, toIndex) {
  const result = arr.slice()
  const [removed] = result.splice(fromIndex, 1)
  result.splice(toIndex, 0, removed)
  return result
}

/** Get the section string a row belongs to (based on its ContextType / ElementTypeRef). */
function sectionOfRow(row) {
  const ct = row.contextType || row.ContextType
  if (ct === 'PositionType') return 'position'
  const etRef = (row.elementTypeRef || row.ElementTypeRef || '').toUpperCase()
  return etRef.includes('LIN') ? 'lin_internal' : 'dl_internal'
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const useStore = create((set, get) => ({
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  // Project
  projectId: null,
  projectNumber: null,
  configName: null,
  projectLabel: null,
  folderPath: null,
  paths: { db: null, ps: null, rs: null },

  // Imported Excel data
  elementTypes: [],
  positionTypes: [],
  psRows: [],
  recipes: [],

  // Templates + slots (from SQLite)
  templates: [],
  slotMappings: {},      // { templateId: { slotKey: entityRef } }

  // Virtual ElementType Collections (from SQLite et_collections)
  etCollections: [],

  // PositionType families flagged as ignored (persisted as project pref).
  // Ignored families drop out of the connector matrix and high-level totals.
  ignoredPositionFamilies: [],

  // Position UI (from SQLite)
  // { [positionTypeRef]: { tags (effective), ruleTags, tagAdd, tagRemove, userNotes, ignored } }
  positionUI: {},

  // Tag system (config-scoped). Rules derive tags from PositionType columns;
  // palette is the free-form suggestion list. Both persisted as project prefs.
  tagRules: [],
  tagPalette: [],

  // Drift tracking: tagSnapshots is the accepted baseline (pref 'tag_snapshots');
  // tagDrift is the in-memory set of positions whose rule data changed on reimport.
  tagSnapshots: {},      // { [ref]: { ruleTags, fields } }
  tagDrift: {},          // { [ref]: { tagsBefore, tagsAfter, changedFields } }

  // Container ("wrapper") ElementTypes — multi-signal soft match + manual overrides
  containerETRefs: new Set(),        // Set<string> of lowercased ET refs (derived)
  containerETManualRefs: [],         // string[] manual INCLUDE — pref 'container_ets'
  containerETExcludeRefs: [],        // string[] manual EXCLUDE — pref 'container_ets_exclude'
  containerReasons: {},              // { [lowerRef]: { score, hints, forced, isContainer } }

  // Copy / paste of recipe rows (in-app clipboard, not the OS clipboard)
  selectedRowIds: [],                // recipe row _ids currently selected for copy
  rowClipboard: null,                // { parts: [{section, elementTypeRef, quantity}], label, count }
  pendingPaste: null,                // { posRef, forceSection } while the merge-vs-separate prompt is open
  favorites: [],                     // cross-project user library: [{ id, kind, ref, label, data }]

  // UI state
  rootView: 'positions',               // 'positions' | 'elements' — top-level browse mode
  activePositionRef: null,
  activeContextType: 'PositionType',  // 'PositionType' | 'ElementType'
  activeETRef: null,                   // ET ref being edited in canvas
  showContextTree: false,
  activeTab: 'recipes',
  validationResults: [],
  fileWatchAlert: null,

  // Dirty tracking
  psChanges: [],
  rsChanges: [],

  // Undo/redo history — snapshots of { recipes, psRows, rsChanges, psChanges }
  past: [],
  future: [],

  // Loading state
  isLoading: false,
  loadError: null,

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  /**
   * loadProject(data)
   * Sets all project data in one shot. Called from FolderSetupScreen after import.
   *
   * data: { projectId, folderPath, paths, elementTypes, positionTypes, psRows, recipes,
   *          templates, slotMappings, positionUI, etCollections }
   */
  loadProject(data) {
    const {
      projectId,
      projectNumber,
      configName,
      projectLabel,
      folderPath,
      paths,
      elementTypes,
      positionTypes,
      psRows,
      recipes,
      templates,
      slotMappings,
      positionUI,
      manualContainerETs,
      manualContainerExcludeETs,
      etCollections,
      favorites,
      ignoredPositionFamilies,
      tagRules,
      tagPalette,
      tagSnapshots,
      tagDrift,
    } = data

    const stampedPsRows = stampIds(psRows ?? [])
    const stampedRecipes = stampIds(recipes ?? [])
    const manualRefs = manualContainerETs ?? []
    const excludeRefs = manualContainerExcludeETs ?? []
    const containerInfo = computeContainerInfo({
      elementTypes: elementTypes ?? [], psRows: stampedPsRows, recipes: stampedRecipes,
      manualInclude: manualRefs, manualExclude: excludeRefs,
    })

    set({
      projectId: projectId ?? null,
      projectNumber: projectNumber ?? null,
      configName: configName ?? null,
      projectLabel: projectLabel ?? null,
      folderPath: folderPath ?? null,
      paths: paths ?? { db: null, ps: null, rs: null },
      elementTypes: elementTypes ?? [],
      positionTypes: positionTypes ?? [],
      psRows: stampedPsRows,
      recipes: stampedRecipes,
      templates: [...(templates ?? []), ...CONNECTOR_TEMPLATES],
      slotMappings: slotMappings ?? {},
      positionUI: positionUI ?? {},
      tagRules: tagRules ?? [],
      tagPalette: tagPalette ?? [],
      tagSnapshots: tagSnapshots ?? {},
      tagDrift: tagDrift ?? {},
      etCollections: etCollections ?? [],
      favorites: favorites ?? [],
      ignoredPositionFamilies: ignoredPositionFamilies ?? [],
      containerETManualRefs: manualRefs,
      containerETExcludeRefs: excludeRefs,
      containerETRefs: containerInfo.refs,
      containerReasons: containerInfo.reasons,
      // Reset transient state
      psChanges: [],
      rsChanges: [],
      past: [],
      future: [],
      validationResults: [],
      fileWatchAlert: null,
      activePositionRef: null,
      activeContextType: 'PositionType',
      activeETRef: null,
      showContextTree: false,
      loadError: null,
    })
  },

  /**
   * importFromFlask(paths)
   * paths: { db, ps, rs } absolute paths
   * POST /import → db_data + ps_rows + rs_rows
   * Derives tags for all position types, merges with existing positionUI from SQLite.
   * Returns parsed data for the caller.
   */
  async importFromFlask(paths) {
    set({ isLoading: true, loadError: null })
    try {
      const response = await axios.post(`${API}/import`, { db: paths.db, ps: paths.ps, rs: paths.rs })
      const { db: db_data, ps: ps_rows, rs: rs_rows } = response.data

      const elementTypes = db_data?.element_types ?? []
      const positionTypes = db_data?.position_types ?? []

      // Re-evaluate rule tags against the (possibly changed) position data,
      // preserving each position's add/remove exceptions.
      const { tagRules } = get()
      const existingPositionUI = get().positionUI
      const mergedPositionUI = { ...existingPositionUI }

      for (const pt of positionTypes) {
        const ref = pt.PositionTypeRef
        const existing = existingPositionUI[ref] || {}
        const ruleTags = evaluateTags(pt, tagRules)
        mergedPositionUI[ref] = {
          ...existing,
          ruleTags,
          tagAdd: existing.tagAdd || [],
          tagRemove: existing.tagRemove || [],
          tags: effectiveTags(ruleTags, existing.tagAdd || [], existing.tagRemove || []),
          userNotes: existing.userNotes ?? null,
        }
      }

      const stampedPsRows = stampIds(ps_rows ?? [])
      const stampedRecipes = stampIds(rs_rows ?? [])

      const { containerETManualRefs, containerETExcludeRefs } = get()
      const containerInfo = computeContainerInfo({
        elementTypes, psRows: stampedPsRows, recipes: stampedRecipes,
        manualInclude: containerETManualRefs, manualExclude: containerETExcludeRefs,
      })
      set({
        elementTypes,
        positionTypes,
        psRows: stampedPsRows,
        recipes: stampedRecipes,
        positionUI: mergedPositionUI,
        containerETRefs: containerInfo.refs,
        containerReasons: containerInfo.reasons,
        paths,
        past: [],
        future: [],
        isLoading: false,
      })

      return {
        elementTypes,
        positionTypes,
        psRows: stampedPsRows,
        recipes: stampedRecipes,
        positionUI: mergedPositionUI,
      }
    } catch (err) {
      set({ isLoading: false, loadError: err.message ?? String(err) })
      throw err
    }
  },

  /**
   * _pushHistory()
   * Snapshots the current editable data onto the undo stack and clears redo.
   * Called at the start of every recipe/PS-mutating action.
   */
  _pushHistory() {
    const { recipes, psRows, rsChanges, psChanges, past } = get()
    const snapshot = { recipes, psRows, rsChanges, psChanges }
    const nextPast = [...past, snapshot]
    if (nextPast.length > HISTORY_LIMIT) nextPast.shift()
    set({ past: nextPast, future: [] })
  },

  /**
   * undo() — restore the previous snapshot, pushing the current state onto redo.
   */
  undo() {
    const { past, future, recipes, psRows, rsChanges, psChanges } = get()
    if (past.length === 0) return
    const previous = past[past.length - 1]
    const current = { recipes, psRows, rsChanges, psChanges }
    set({
      ...previous,
      past: past.slice(0, -1),
      future: [...future, current],
    })
  },

  /**
   * redo() — re-apply the next snapshot, pushing the current state onto undo.
   */
  redo() {
    const { past, future, recipes, psRows, rsChanges, psChanges } = get()
    if (future.length === 0) return
    const next = future[future.length - 1]
    const current = { recipes, psRows, rsChanges, psChanges }
    set({
      ...next,
      past: [...past, current],
      future: future.slice(0, -1),
    })
  },

  /**
   * setActivePosition(ref)
   */
  setActivePosition(ref) {
    set({ activePositionRef: ref })
  },

  /**
   * focusPosition(ref)
   * Navigate the main surface to a position: switch to the PositionTypes view,
   * exit any ET-internal editor, and select the position. Used by validation
   * "Go fix" links so the jump works from any current view.
   */
  focusPosition(ref) {
    if (!ref) return
    set({
      rootView: 'positions',
      activeContextType: 'PositionType',
      activeETRef: null,
      activePositionRef: ref,
    })
  },

  /**
   * setActiveTab(tab)
   */
  setActiveTab(tab) {
    set({ activeTab: tab })
  },

  /**
   * updatePositionUI(positionTypeRef, updates)
   * Merges updates into positionUI[positionTypeRef], recomputes effective tags
   * from rule tags + add/remove exceptions, and persists to SQLite.
   */
  async updatePositionUI(positionTypeRef, updates) {
    const { positionUI, positionTypes, tagRules, projectId } = get()
    const existing = positionUI[positionTypeRef] || {}
    const merged = { ...existing, ...updates }

    // Keep rule tags + effective tags consistent.
    const pt = positionTypes.find(p => p.PositionTypeRef === positionTypeRef)
    const ruleTags = pt ? evaluateTags(pt, tagRules) : (merged.ruleTags || [])
    merged.ruleTags = ruleTags
    merged.tagAdd = merged.tagAdd || []
    merged.tagRemove = merged.tagRemove || []
    merged.tags = effectiveTags(ruleTags, merged.tagAdd, merged.tagRemove)

    set({ positionUI: { ...positionUI, [positionTypeRef]: merged } })

    await window.electronAPI.db.upsertPositionUI(projectId, positionTypeRef, {
      tags: merged.tags,
      tagAdd: merged.tagAdd,
      tagRemove: merged.tagRemove,
      userNotes: merged.userNotes || '',
      ignored: !!merged.ignored,
    })
  },

  /**
   * togglePositionTag(positionTypeRef, tag)
   * Adds/removes a tag on one position as an exception relative to its rule tags.
   */
  async togglePositionTag(positionTypeRef, tag) {
    const ui = get().positionUI[positionTypeRef] || {}
    const ruleTags = ui.ruleTags || []
    const add = new Set(ui.tagAdd || [])
    const remove = new Set(ui.tagRemove || [])
    const isOn = (ui.tags || []).includes(tag)

    if (isOn) {
      add.delete(tag)
      if (ruleTags.includes(tag)) remove.add(tag)   // override a rule tag off
    } else {
      remove.delete(tag)
      if (!ruleTags.includes(tag)) add.add(tag)      // manual addition
    }
    await get().updatePositionUI(positionTypeRef, { tagAdd: [...add], tagRemove: [...remove] })
  },

  /**
   * recomputeAllTags()
   * Re-evaluates rule tags for every position (call after rules change) and
   * refreshes effective tags. Does not persist per-position rows (rule tags are
   * derived; only exceptions are stored), but updates in-memory state.
   */
  recomputeAllTags() {
    const { positionTypes, tagRules, positionUI } = get()
    const next = { ...positionUI }
    for (const pt of positionTypes) {
      const ref = pt.PositionTypeRef
      const ui = next[ref] || {}
      const ruleTags = evaluateTags(pt, tagRules)
      next[ref] = {
        ...ui,
        ruleTags,
        tagAdd: ui.tagAdd || [],
        tagRemove: ui.tagRemove || [],
        tags: effectiveTags(ruleTags, ui.tagAdd || [], ui.tagRemove || []),
      }
    }
    set({ positionUI: next })
  },

  /**
   * setTagRules(rules) — replace the rule set, recompute all tags, persist pref.
   * Editing rules is intentional, so we re-baseline drift snapshots (the new
   * rule output becomes the accepted state) and clear any outstanding drift.
   */
  async setTagRules(rules) {
    const { projectId, positionTypes } = get()
    set({ tagRules: rules })
    get().recomputeAllTags()

    const tagSnapshots = {}
    for (const pt of positionTypes) {
      tagSnapshots[pt.PositionTypeRef] = snapshotForPosition(pt, rules)
    }
    set({ tagSnapshots, tagDrift: {} })

    if (projectId != null) {
      await window.electronAPI.db.setPref(projectId, 'tag_rules', JSON.stringify(rules))
      await window.electronAPI.db.setPref(projectId, 'tag_snapshots', JSON.stringify(tagSnapshots))
    }
  },

  /**
   * acceptTagDrift(ref) — acknowledge a position's changed tags: re-baseline its
   * snapshot to the current state and clear its drift flag.
   */
  async acceptTagDrift(ref) {
    const { projectId, positionTypes, tagRules, tagSnapshots, tagDrift } = get()
    const pt = positionTypes.find(p => p.PositionTypeRef === ref)
    if (!pt) return
    const nextSnapshots = { ...tagSnapshots, [ref]: snapshotForPosition(pt, tagRules) }
    const nextDrift = { ...tagDrift }
    delete nextDrift[ref]
    set({ tagSnapshots: nextSnapshots, tagDrift: nextDrift })
    if (projectId != null) {
      await window.electronAPI.db.setPref(projectId, 'tag_snapshots', JSON.stringify(nextSnapshots))
    }
  },

  /**
   * acceptAllTagDrift() — re-baseline every drifted position at once.
   */
  async acceptAllTagDrift() {
    const { projectId, positionTypes, tagRules, tagSnapshots, tagDrift } = get()
    const nextSnapshots = { ...tagSnapshots }
    for (const ref of Object.keys(tagDrift)) {
      const pt = positionTypes.find(p => p.PositionTypeRef === ref)
      if (pt) nextSnapshots[ref] = snapshotForPosition(pt, tagRules)
    }
    set({ tagSnapshots: nextSnapshots, tagDrift: {} })
    if (projectId != null) {
      await window.electronAPI.db.setPref(projectId, 'tag_snapshots', JSON.stringify(nextSnapshots))
    }
  },

  /**
   * setTagPalette(palette) — replace the suggestion palette, persist pref.
   */
  async setTagPalette(palette) {
    const { projectId } = get()
    set({ tagPalette: palette })
    if (projectId != null) {
      await window.electronAPI.db.setPref(projectId, 'tag_palette', JSON.stringify(palette))
    }
  },

  /**
   * applyTemplate(posRef, templateId)
   * Resolves the template against current slot mappings and replaces all
   * recipe rows for this position with the newly produced rows.
   */
  applyTemplate(posRef, templateId) {
    const { templates, slotMappings, elementTypes, recipes, rsChanges } = get()

    const template = templates.find(t => t.id === templateId)
    if (!template) return

    get()._pushHistory()

    const mappings = slotMappings[templateId] || {}
    const elementTypeRefs = elementTypes.map(et => et.ElementTypeRef)

    const resolvedIngredients = resolveTemplate(template, mappings, elementTypeRefs)
    const newRows = applyResolvedTemplate(resolvedIngredients, posRef).map(row => ({
      ...row,
      _id: uuidv4(),
    }))

    // Replace existing rows for this posRef
    const otherRows = recipes.filter(
      r => (r.PositionTypeRef || r.positionTypeRef) !== posRef
    )
    const updatedRecipes = [...otherRows, ...newRows]

    // Mark all new rows as changed
    const newChanges = newRows.map(row => ({
      _id: row._id,
      positionTypeRef: posRef,
      action: 'upsert',
      row,
    }))

    set({
      recipes: updatedRecipes,
      rsChanges: [...rsChanges, ...newChanges],
    })
  },

  /**
   * resolveSlot(posRef, slotKey, entityRef)
   * Updates the recipe row for this slotKey, persists the slot mapping to SQLite,
   * and updates slotMappings in the store.
   */
  async resolveSlot(posRef, slotKey, entityRef) {
    const { recipes, slotMappings, rsChanges, projectId } = get()

    // Find the recipe row for this posRef + slotKey
    const rowIndex = recipes.findIndex(
      r => (r.positionTypeRef || r.PositionTypeRef) === posRef &&
           r.slotKey === slotKey
    )

    if (rowIndex === -1) return

    get()._pushHistory()

    const oldRow = recipes[rowIndex]
    const updatedRow = {
      ...oldRow,
      elementTypeRef: entityRef,
      ElementTypeRef: entityRef,
      resolved: true,
    }

    const updatedRecipes = recipes.slice()
    updatedRecipes[rowIndex] = updatedRow

    // Find the templateId for this row (derived from the template that produced this slot)
    // We need to find which template owns this slotKey for this position.
    // Walk slotMappings to find which template covers this posRef.
    // Convention: the templateId is stored on the row as `templateId` if set during applyTemplate;
    // as a fallback we search all templates for the one containing this slotKey.
    const { templates } = get()
    let templateId = oldRow.templateId || null
    if (!templateId) {
      for (const tpl of templates) {
        const ingredients = Array.isArray(tpl.ingredients) ? tpl.ingredients : []
        if (ingredients.some(ing => ing.slotKey === slotKey)) {
          templateId = tpl.id
          break
        }
      }
    }

    // Update slotMappings in store
    const updatedSlotMappings = { ...slotMappings }
    if (templateId) {
      updatedSlotMappings[templateId] = {
        ...(updatedSlotMappings[templateId] || {}),
        [slotKey]: entityRef,
      }
    }

    set({
      recipes: updatedRecipes,
      slotMappings: updatedSlotMappings,
      rsChanges: [
        ...rsChanges,
        { _id: updatedRow._id, positionTypeRef: posRef, action: 'upsert', row: updatedRow },
      ],
    })

    // Persist to SQLite
    if (templateId) {
      await window.electronAPI.db.upsertSlotMapping(projectId, templateId, slotKey, entityRef)
    }
  },

  /**
   * saveAsTemplate(posRef, name, scope)
   * Converts the current recipe for posRef into a template definition and persists it.
   */
  async saveAsTemplate(posRef, name, scope) {
    const { recipes, templates, projectId, positionUI } = get()

    const grouped = getRecipeForPosition(recipes, posRef)
    const suggestedTags = positionUI[posRef]?.tags || []
    const template = recipeToTemplate(grouped, name, scope, suggestedTags)

    if (scope === 'project') {
      template.projectId = projectId
    }

    await window.electronAPI.db.upsertTemplate(template)

    set({ templates: [...templates, template] })

    return template
  },

  /**
   * saveWrapperAsTemplate(components, name, { scope, archetype })
   * Persists a LIN wrapper's component set as a Linear-tagged template.
   * components: [{ role, etRef, dimQtyMultiplier?, quantity?, isInteger? }]
   */
  async saveWrapperAsTemplate(components, name, { scope = 'global', archetype } = {}) {
    const { templates, projectId } = get()
    const tags = ['Linear']
    if (archetype) tags.push(archetype)

    const ingredients = components.map((c, idx) => ({
      slotKey:          c.role               || `SLOT_${idx + 1}`,
      slotLabel:        c.etRef              || c.role || `Slot ${idx + 1}`,
      section:          'lin_internal',
      quantity:         c.quantity           ?? null,
      dimQtyMultiplier: c.dimQtyMultiplier   ?? null,
      isInteger:        c.isInteger          ?? null,
    }))

    const template = {
      id:              uuidv4(),
      name,
      scope,
      applicable_tags: JSON.stringify(tags),
      ingredients:     JSON.stringify(ingredients),
    }
    if (scope === 'project') template.projectId = projectId

    await window.electronAPI.db.upsertTemplate(template)
    set({ templates: [...templates, template] })
    return template
  },

  /**
   * updateTemplate(template)
   * Updates a template in the store and persists to SQLite.
   */
  async updateTemplate(template) {
    const { templates } = get()
    const updatedTemplates = templates.map(t => t.id === template.id ? template : t)

    set({ templates: updatedTemplates })

    await window.electronAPI.db.upsertTemplate(template)
  },

  /**
   * deleteTemplate(id)
   * Removes a template from the store and SQLite.
   */
  async deleteTemplate(id) {
    const { templates } = get()
    set({ templates: templates.filter(t => t.id !== id) })
    await window.electronAPI.db.deleteTemplate(id)
  },

  /**
   * reapplyTemplate(posRef, templateId)
   * Like applyTemplate but preserves existing resolved ET refs for matching slotKeys.
   * New slots become unresolved placeholders.
   */
  reapplyTemplate(posRef, templateId) {
    const { templates, slotMappings, elementTypes, recipes, rsChanges } = get()

    const template = templates.find(t => t.id === templateId)
    if (!template) return

    get()._pushHistory()

    // Gather existing slot resolutions from current recipe rows for this position
    const existingRows = recipes.filter(
      r => (r.PositionTypeRef || r.positionTypeRef) === posRef
    )
    const existingResolutions = {}
    for (const row of existingRows) {
      if (row.slotKey && row.resolved && (row.elementTypeRef || row.ElementTypeRef)) {
        existingResolutions[row.slotKey] = row.elementTypeRef || row.ElementTypeRef
      }
    }

    // Merge: stored slot mappings + any already-resolved rows (rows win for this position)
    const storedMappings = slotMappings[templateId] || {}
    const mergedMappings = { ...storedMappings, ...existingResolutions }

    const elementTypeRefs = elementTypes.map(et => et.ElementTypeRef)
    const resolvedIngredients = resolveTemplate(template, mergedMappings, elementTypeRefs)
    const newRows = applyResolvedTemplate(resolvedIngredients, posRef).map(row => ({
      ...row,
      _id: uuidv4(),
    }))

    const otherRows = recipes.filter(
      r => (r.PositionTypeRef || r.positionTypeRef) !== posRef
    )
    const updatedRecipes = [...otherRows, ...newRows]

    const newChanges = newRows.map(row => ({
      _id: row._id,
      positionTypeRef: posRef,
      action: 'upsert',
      row,
    }))

    set({
      recipes: updatedRecipes,
      rsChanges: [...rsChanges, ...newChanges],
    })
  },

  /**
   * addRecipeRow(posRef, section, ingredientData)
   * Adds a new recipe row from a palette drop.
   */
  addRecipeRow(posRef, section, ingredientData, { recordHistory = true } = {}) {
    const { recipes, rsChanges, activeContextType, activeETRef } = get()

    if (recordHistory) get()._pushHistory()

    // === ET MODE: add rows for all positions that use this ET ===
    if (activeContextType === 'ElementType' && activeETRef) {
      const etRef = ingredientData.elementTypeRef || ingredientData.ElementTypeRef || null
      const etToken = etRef ? etRef.toUpperCase() : ''
      const isDimComponent = DIM_QTY_COMPONENTS.some(t => etToken.includes(t))
      const isAutoContract = AUTO_CONTRACT_ITEMS.some(t => etToken.includes(t))

      // Find all positions that have rows for this ET's internal recipe
      const existingETRows = recipes.filter(r =>
        (r.ContextType || r.contextType) === 'ElementType' &&
        (r.ContextRef || r.contextRef) === activeETRef
      )
      const allPosRefs = [...new Set(existingETRows.map(r => r.PositionTypeRef || r.positionTypeRef).filter(Boolean))]
      if (allPosRefs.length === 0) allPosRefs.push(posRef)

      // Max RecipeIndex from the primary position's ET rows
      const primaryRows = existingETRows.filter(r => (r.PositionTypeRef || r.positionTypeRef) === allPosRefs[0])
      const maxIndex = primaryRows.reduce((max, r) => Math.max(max, r.RecipeIndex ?? r.recipeIndex ?? 0), 0)

      const newRows = allPosRefs.map(pRef => ({
        positionTypeRef: pRef, PositionTypeRef: pRef,
        contextType: 'ElementType', ContextType: 'ElementType',
        contextRef: activeETRef, ContextRef: activeETRef,
        recipeIndex: maxIndex + 1, RecipeIndex: maxIndex + 1,
        elementTypeRef: etRef, ElementTypeRef: etRef,
        quantity: etToken.includes('CAP') ? 2 : (ingredientData.quantity ?? 1),
        Quantity: etToken.includes('CAP') ? 2 : (ingredientData.quantity ?? 1),
        dimQtyMultiplier: isDimComponent ? 1 : (ingredientData.dimQtyMultiplier ?? null),
        Dim_QuantityMultiplier: isDimComponent ? 1 : (ingredientData.dimQtyMultiplier ?? null),
        dimQuantity: ingredientData.dimQuantity ?? null, Dim_Quantity: ingredientData.dimQuantity ?? null,
        isInteger: ingredientData.isInteger ?? null, IsInteger: ingredientData.isInteger ?? null,
        isDesign: null, IsDesign: null,
        isContractItem: isAutoContract ? 'Y' : (ingredientData.isContractItem ?? null),
        IsContractItem: isAutoContract ? 'Y' : (ingredientData.isContractItem ?? null),
        isTBC: ingredientData.isTBC ?? null, IsTBC: ingredientData.isTBC ?? null,
        isPropertiesTBC: ingredientData.isPropertiesTBC ?? null, IsPropertiesTBC: ingredientData.isPropertiesTBC ?? null,
        notes: ingredientData.notes ?? null, Notes: ingredientData.notes ?? null,
        slotKey: null, resolved: true,
        _id: uuidv4(),
      }))

      const newChanges = newRows.map(row => ({
        _id: row._id, positionTypeRef: row.PositionTypeRef, action: 'upsert', row,
      }))

      set({ recipes: [...recipes, ...newRows], rsChanges: [...rsChanges, ...newChanges] })
      return newRows[0]
    }
    // === END ET MODE ===

    const sectionRows = recipes.filter(r => {
      const ptRef = r.positionTypeRef || r.PositionTypeRef
      return ptRef === posRef && sectionOfRow(r) === section
    })

    const maxIndex = sectionRows.reduce(
      (max, r) => Math.max(max, r.RecipeIndex ?? r.recipeIndex ?? 0),
      0
    )

    const etRef = ingredientData.elementTypeRef || ingredientData.ElementTypeRef || null
    const etToken = etRef ? etRef.toUpperCase() : ''

    // Auto-derived fields
    const isDimComponent = DIM_QTY_COMPONENTS.some(token => etToken.includes(token))
    const isAutoContract = AUTO_CONTRACT_ITEMS.some(token => etToken.includes(token))

    const { contextType, contextRef } = contextForSection(section, posRef, recipes)

    const newRow = {
      positionTypeRef: posRef,
      PositionTypeRef: posRef,
      contextType,
      contextRef,
      ContextType: contextType,
      ContextRef: contextRef,
      recipeIndex: maxIndex + 1,
      RecipeIndex: maxIndex + 1,
      elementTypeRef: etRef,
      ElementTypeRef: etRef,
      quantity: etToken.includes('CAP') ? 2 : (ingredientData.quantity ?? 1),
      Quantity: etToken.includes('CAP') ? 2 : (ingredientData.quantity ?? 1),
      dimQtyMultiplier: isDimComponent ? 1 : (ingredientData.dimQtyMultiplier ?? null),
      Dim_QuantityMultiplier: isDimComponent ? 1 : (ingredientData.dimQtyMultiplier ?? null),
      dimQuantity: ingredientData.dimQuantity ?? null,
      Dim_Quantity: ingredientData.dimQuantity ?? null,
      isInteger: ingredientData.isInteger ?? null,
      IsInteger: ingredientData.isInteger ?? null,
      isDesign: ingredientData.isDesign ?? null,
      IsDesign: ingredientData.isDesign ?? null,
      isContractItem: isAutoContract ? 'Y' : (ingredientData.isContractItem ?? null),
      IsContractItem: isAutoContract ? 'Y' : (ingredientData.isContractItem ?? null),
      isTBC: ingredientData.isTBC ?? null,
      IsTBC: ingredientData.isTBC ?? null,
      isPropertiesTBC: ingredientData.isPropertiesTBC ?? null,
      IsPropertiesTBC: ingredientData.isPropertiesTBC ?? null,
      notes: ingredientData.notes ?? null,
      Notes: ingredientData.notes ?? null,
      slotKey: ingredientData.slotKey ?? null,
      resolved: true,
      _id: uuidv4(),
    }

    set({
      recipes: [...recipes, newRow],
      rsChanges: [
        ...rsChanges,
        { _id: newRow._id, positionTypeRef: posRef, action: 'upsert', row: newRow },
      ],
    })

    // Register the assigned element type in the Product Spec if it isn't already.
    if (etRef) get().ensurePSRow(etRef)

    return newRow
  },

  /**
   * addToElementTypeRecipe(containerETRef, etRef, ingredientData)
   * Adds a row into a container ET's internal recipe WITHOUT needing to be in
   * ET mode — mirrors the ET-mode branch of addRecipeRow but takes the container
   * ref as a parameter, so the review/step-through modal can add to any container.
   * Inserts across every position that shares the container's internal recipe.
   * ponytail: mirrors addRecipeRow's ET branch; kept separate to avoid touching
   * the in-ET-mode path and its tests.
   */
  addToElementTypeRecipe(containerETRef, etRef, ingredientData = {}, { recordHistory = true } = {}) {
    if (!containerETRef || !etRef) return null
    const { recipes, rsChanges } = get()
    if (recordHistory) get()._pushHistory()

    const etToken = etRef.toUpperCase()
    const isDimComponent = DIM_QTY_COMPONENTS.some(t => etToken.includes(t))
    const isAutoContract = AUTO_CONTRACT_ITEMS.some(t => etToken.includes(t))

    const existingETRows = recipes.filter(r =>
      (r.ContextType || r.contextType) === 'ElementType' &&
      (r.ContextRef || r.contextRef) === containerETRef
    )
    const allPosRefs = [...new Set(existingETRows.map(r => r.PositionTypeRef || r.positionTypeRef).filter(Boolean))]
    if (allPosRefs.length === 0) return null   // not a materialised container

    const primaryRows = existingETRows.filter(r => (r.PositionTypeRef || r.positionTypeRef) === allPosRefs[0])
    const maxIndex = primaryRows.reduce((max, r) => Math.max(max, r.RecipeIndex ?? r.recipeIndex ?? 0), 0)

    const newRows = allPosRefs.map(pRef => ({
      positionTypeRef: pRef, PositionTypeRef: pRef,
      contextType: 'ElementType', ContextType: 'ElementType',
      contextRef: containerETRef, ContextRef: containerETRef,
      recipeIndex: maxIndex + 1, RecipeIndex: maxIndex + 1,
      elementTypeRef: etRef, ElementTypeRef: etRef,
      quantity: etToken.includes('CAP') ? 2 : (ingredientData.quantity ?? 1),
      Quantity: etToken.includes('CAP') ? 2 : (ingredientData.quantity ?? 1),
      dimQtyMultiplier: isDimComponent ? 1 : (ingredientData.dimQtyMultiplier ?? null),
      Dim_QuantityMultiplier: isDimComponent ? 1 : (ingredientData.dimQtyMultiplier ?? null),
      dimQuantity: ingredientData.dimQuantity ?? null, Dim_Quantity: ingredientData.dimQuantity ?? null,
      isInteger: ingredientData.isInteger ?? null, IsInteger: ingredientData.isInteger ?? null,
      isDesign: null, IsDesign: null,
      isContractItem: isAutoContract ? 'Y' : (ingredientData.isContractItem ?? null),
      IsContractItem: isAutoContract ? 'Y' : (ingredientData.isContractItem ?? null),
      isTBC: ingredientData.isTBC ?? null, IsTBC: ingredientData.isTBC ?? null,
      isPropertiesTBC: ingredientData.isPropertiesTBC ?? null, IsPropertiesTBC: ingredientData.isPropertiesTBC ?? null,
      notes: ingredientData.notes ?? null, Notes: ingredientData.notes ?? null,
      slotKey: null, resolved: true,
      _id: uuidv4(),
    }))

    const newChanges = newRows.map(row => ({
      _id: row._id, positionTypeRef: row.PositionTypeRef, action: 'upsert', row,
    }))

    set({ recipes: [...recipes, ...newRows], rsChanges: [...rsChanges, ...newChanges] })
    get().ensurePSRow(etRef)
    return newRows[0]
  },

  /**
   * ensurePSRow(etRef)
   * Make sure a Product Spec row exists for etRef (the DB ElementTypes sheet is
   * read-only, so a PS row is how a newly-assigned element type is registered).
   * Container ETs default to ProductCode 'N/A'; others are left blank for fill-in.
   * Idempotent; never records its own history (callers own that).
   */
  ensurePSRow(etRef) {
    if (!etRef) return null
    const { containerETRefs, psRows } = get()
    const exists = psRows.some(
      r => (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() === etRef.toLowerCase()
    )
    if (exists) return null
    const isContainer = containerETRefs.has(etRef.toLowerCase()) || looksLikeContainer(etRef)
    const defaults = isContainer ? { Manufacturer: '', ProductCode: 'N/A' } : {}
    return get().addPSRow(etRef, defaults, { recordHistory: false })
  },

  /**
   * addConnection(posRef, parts)
   * Insert a set of recipe rows (a wired connection) in one undoable step.
   * parts: [{ section: 'position'|'dl_internal'|'lin_internal', elementTypeRef }]
   * Skips parts with no elementTypeRef. PS rows are auto-registered via addRecipeRow.
   */
  addConnection(posRef, parts, { merge = false } = {}) {
    const valid = (parts || []).filter(p => p && p.elementTypeRef && p.section)
    if (!posRef || valid.length === 0) return
    get()._pushHistory()
    for (const part of valid) {
      // When merging, fold a duplicate (same section + ET) into the existing
      // row by summing quantities instead of appending a new row.
      if (merge) {
        const existing = get().recipes.find(r =>
          (r.PositionTypeRef || r.positionTypeRef) === posRef &&
          sectionOfRow(r) === part.section &&
          (r.IsDeleted || r.isDeleted) !== 'Y' &&
          (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() === part.elementTypeRef.toLowerCase()
        )
        if (existing) {
          const addQty = part.quantity != null ? Number(part.quantity) : 1
          const curQty = Number(existing.Quantity ?? existing.quantity ?? 1)
          const total = curQty + addQty
          const merged = { ...existing, quantity: total, Quantity: total }
          set(s => ({
            recipes: s.recipes.map(r => r._id === existing._id ? merged : r),
            rsChanges: [...s.rsChanges, { _id: existing._id, positionTypeRef: posRef, action: 'upsert', row: merged }],
          }))
          continue
        }
      }
      const ingredient = { elementTypeRef: part.elementTypeRef }
      if (part.quantity != null) ingredient.quantity = part.quantity
      if (part.dimQtyMultiplier != null) ingredient.dimQtyMultiplier = part.dimQtyMultiplier
      if (part.isInteger != null) ingredient.isInteger = part.isInteger
      get().addRecipeRow(posRef, part.section, ingredient, { recordHistory: false })
    }
  },

  // ---------------------------------------------------------------------------
  // Copy / paste of recipe rows
  // ---------------------------------------------------------------------------

  toggleRowSelection(rowId) {
    if (!rowId) return
    set(s => ({
      selectedRowIds: s.selectedRowIds.includes(rowId)
        ? s.selectedRowIds.filter(id => id !== rowId)
        : [...s.selectedRowIds, rowId],
    }))
  },

  clearRowSelection() { set({ selectedRowIds: [] }) },

  /** Build clipboard parts from a set of recipe rows. */
  _rowsToParts(rows) {
    return rows
      .filter(r => (r.IsDeleted || r.isDeleted) !== 'Y')
      .map(r => ({
        section: sectionOfRow(r),
        elementTypeRef: r.ElementTypeRef || r.elementTypeRef,
        quantity: r.Quantity ?? r.quantity ?? null,
      }))
      .filter(p => p.elementTypeRef)
  },

  /** Copy specific rows (by _id) into the clipboard. */
  copyRows(rowIds) {
    const ids = rowIds || []
    if (ids.length === 0) return null
    const { recipes } = get()
    const rows = recipes.filter(r => ids.includes(r._id))
    const parts = get()._rowsToParts(rows)
    if (parts.length === 0) return null
    const clip = { parts, count: parts.length, label: `${parts.length} row${parts.length === 1 ? '' : 's'}` }
    set({ rowClipboard: clip })
    return clip
  },

  /** Copy the currently-selected rows into the clipboard. */
  copySelectedRows() {
    return get().copyRows(get().selectedRowIds)
  },

  /** Copy a whole position's recipe (all sections) into the clipboard. */
  copyPositionRecipe(posRef) {
    const { recipes } = get()
    const rows = recipes.filter(r => (r.PositionTypeRef || r.positionTypeRef) === posRef)
    const parts = get()._rowsToParts(rows)
    if (parts.length === 0) return null
    const clip = { parts, count: parts.length, label: `recipe of ${posRef} (${parts.length} row${parts.length === 1 ? '' : 's'})` }
    set({ rowClipboard: clip })
    return clip
  },

  /**
   * pasteClipboard(posRef, forceSection?)
   * Appends the clipboard's rows to a position (additive, one undo step).
   * forceSection overrides every part's section (e.g. "paste into this section").
   * Returns the number of rows pasted.
   */
  pasteClipboard(posRef, forceSection = null, { merge = false } = {}) {
    const { rowClipboard } = get()
    if (!rowClipboard || !posRef) return 0
    const parts = forceSection
      ? rowClipboard.parts.map(p => ({ ...p, section: forceSection }))
      : rowClipboard.parts
    get().addConnection(posRef, parts, { merge })
    return parts.length
  },

  // ---------------------------------------------------------------------------
  // Paste prompt: when a paste would duplicate rows already present, ask the
  // user whether to merge quantities or keep separate rows.
  // ---------------------------------------------------------------------------

  /** Count clipboard parts that already exist (same section + ET) in a position. */
  pasteDuplicateCount(posRef, forceSection = null) {
    const { rowClipboard, recipes } = get()
    if (!rowClipboard || !posRef) return 0
    const parts = forceSection
      ? rowClipboard.parts.map(p => ({ ...p, section: forceSection }))
      : rowClipboard.parts
    let dups = 0
    for (const p of parts) {
      const hit = recipes.some(r =>
        (r.PositionTypeRef || r.positionTypeRef) === posRef &&
        sectionOfRow(r) === p.section &&
        (r.IsDeleted || r.isDeleted) !== 'Y' &&
        (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() === (p.elementTypeRef || '').toLowerCase()
      )
      if (hit) dups++
    }
    return dups
  },

  /**
   * requestPaste(posRef, forceSection?)
   * Pastes immediately when nothing would duplicate; otherwise opens the
   * merge-vs-separate prompt (pendingPaste) for the UI to resolve.
   * Returns the number of rows pasted, or null when a prompt was opened.
   */
  requestPaste(posRef, forceSection = null) {
    if (!posRef || !get().rowClipboard) return 0
    if (get().pasteDuplicateCount(posRef, forceSection) > 0) {
      set({ pendingPaste: { posRef, forceSection } })
      return null
    }
    return get().pasteClipboard(posRef, forceSection)
  },

  /** Resolve the pending paste. mode: 'merge' | 'separate'. */
  confirmPaste(mode) {
    const pending = get().pendingPaste
    set({ pendingPaste: null })
    if (!pending) return 0
    return get().pasteClipboard(pending.posRef, pending.forceSection, { merge: mode === 'merge' })
  },

  cancelPaste() { set({ pendingPaste: null }) },

  // ---------------------------------------------------------------------------
  // Favourites — cross-project user library (tags + elements w/ spec).
  // Favourite templates reuse the existing global-scope template mechanism.
  // ---------------------------------------------------------------------------

  isFavorite(kind, ref) {
    if (!ref) return false
    return get().favorites.some(f => f.kind === kind && (f.ref || '').toLowerCase() === ref.toLowerCase())
  },

  /** Add a favourite (deduped by kind + ref). data holds e.g. an element's spec. */
  async addFavorite({ kind, ref = null, label = null, data = {} }) {
    const dup = ref && get().favorites.find(f =>
      f.kind === kind && (f.ref || '').toLowerCase() === ref.toLowerCase()
    )
    if (dup) return dup
    const fav = { id: uuidv4(), kind, ref, label: label ?? ref, data }
    const saved = await window.electronAPI.db.upsertFavorite(fav)
    set(s => ({ favorites: [...s.favorites, saved || fav] }))
    return saved || fav
  },

  async removeFavorite(id) {
    set(s => ({ favorites: s.favorites.filter(f => f.id !== id) }))
    await window.electronAPI.db.deleteFavorite(id)
  },

  /** Favourite an element type, snapshotting its current product spec. */
  async favoriteElement(etRef) {
    if (!etRef) return
    if (get().isFavorite('element', etRef)) {
      const existing = get().favorites.find(f => f.kind === 'element' && (f.ref || '').toLowerCase() === etRef.toLowerCase())
      if (existing) return get().removeFavorite(existing.id)
      return
    }
    const { psRows, elementTypes } = get()
    const psRow = psRows.find(r => (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() === etRef.toLowerCase())
    const etObj = elementTypes.find(e => (e.ElementTypeRef || e.elementTypeRef || '').toLowerCase() === etRef.toLowerCase())
    const data = {
      Manufacturer: psRow?.Manufacturer || psRow?.manufacturer || '',
      ProductCode: psRow?.ProductCode || psRow?.productCode || '',
      ComponentDescription: psRow?.ComponentDescription || psRow?.componentDescription || '',
      family: familyOf(etRef, etObj) || null,
    }
    return get().addFavorite({ kind: 'element', ref: etRef, label: etRef, data })
  },

  /** Draw a favourite element into a position, seeding its spec if the target has none. */
  drawFavoriteElement(posRef, fav, section = 'position') {
    if (!posRef || !fav?.ref) return
    get().addRecipeRow(posRef, section, { elementTypeRef: fav.ref, ElementTypeRef: fav.ref })
    const psRow = get().psRows.find(r => (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() === fav.ref.toLowerCase())
    const hasSpec = psRow && (psRow.ProductCode || psRow.productCode) && (psRow.Manufacturer || psRow.manufacturer)
    if (!hasSpec && fav.data) {
      const upd = {}
      if (fav.data.Manufacturer) upd.Manufacturer = fav.data.Manufacturer
      if (fav.data.ProductCode) upd.ProductCode = fav.data.ProductCode
      if (fav.data.ComponentDescription) upd.ComponentDescription = fav.data.ComponentDescription
      if (Object.keys(upd).length) get().updatePSRow(fav.ref, upd)
    }
  },

  /**
   * applyConnectorTemplate(posRef, templateId)
   * Additively inserts connector rows into an existing recipe.
   * Uses addConnection so each ingredient goes to its declared section.
   * Never replaces existing rows.
   */
  applyConnectorTemplate(posRef, templateId) {
    const { templates } = get()
    const template = templates.find(t => t.id === templateId)
    if (!template || !posRef) return

    const ingredients = Array.isArray(template.ingredients)
      ? template.ingredients
      : JSON.parse(template.ingredients || '[]')

    const parts = ingredients.map(ing => ({
      section: ing.section,
      elementTypeRef: ing.slotLabel,
      quantity: ing.quantity ?? 1,
    }))

    get().addConnection(posRef, parts)
  },

  // ---------------------------------------------------------------------------
  // ET Collection actions
  // ---------------------------------------------------------------------------

  async createCollection(name, ingredients, applicableTags, excludedTags) {
    const { projectId } = get()
    if (!projectId) return null
    const CollectionId = uuidv4()
    const collection = {
      CollectionId,
      Name: name,
      ApplicableTags: applicableTags ?? [],
      ExcludedTags:   excludedTags   ?? [],
      Ingredients: ingredients ?? [],
    }
    const saved = await window.electronAPI.db.upsertCollection(projectId, collection)
    set(s => ({ etCollections: [...s.etCollections, saved] }))
    return saved
  },

  async updateCollection(collectionId, updates) {
    const { projectId, etCollections } = get()
    const existing = etCollections.find(c => c.CollectionId === collectionId)
    if (!existing || !projectId) return
    const merged = { ...existing, ...updates }
    const saved = await window.electronAPI.db.upsertCollection(projectId, merged)
    set(s => ({ etCollections: s.etCollections.map(c => c.CollectionId === collectionId ? saved : c) }))
  },

  async deleteCollection(collectionId) {
    await window.electronAPI.db.deleteCollection(collectionId)
    set(s => ({ etCollections: s.etCollections.filter(c => c.CollectionId !== collectionId) }))
  },

  applyCollection(posRef, collectionId) {
    const { etCollections } = get()
    const collection = etCollections.find(c => c.CollectionId === collectionId)
    if (!collection || !posRef) return
    const ingredients = Array.isArray(collection.Ingredients)
      ? collection.Ingredients
      : JSON.parse(collection.Ingredients || '[]')
    const parts = ingredients.map(ing => ({
      section: ing.section,
      elementTypeRef: ing.ElementTypeRef || ing.slotLabel || '',
      quantity: ing.quantity ?? 1,
    }))
    get().addConnection(posRef, parts)
  },

  swapCollection(posRef, fromCollectionId, toCollectionId) {
    const { etCollections, recipes, rsChanges } = get()
    const fromColl = etCollections.find(c => c.CollectionId === fromCollectionId)
    const toColl   = etCollections.find(c => c.CollectionId === toCollectionId)
    if (!fromColl || !toColl || !posRef) return

    const fromIngredients = Array.isArray(fromColl.Ingredients)
      ? fromColl.Ingredients
      : JSON.parse(fromColl.Ingredients || '[]')
    const refsToRemove = new Set(
      fromIngredients.map(i => (i.ElementTypeRef || i.slotLabel || '').toLowerCase())
    )

    get()._pushHistory()

    const newChanges = []
    const updatedRecipes = recipes.map(row => {
      const ptRef = row.PositionTypeRef || row.positionTypeRef
      if (ptRef !== posRef) return row
      const etRef = (row.ElementTypeRef || row.elementTypeRef || '').toLowerCase()
      if (refsToRemove.has(etRef)) {
        const updated = { ...row, IsDeleted: 'Y', isDeleted: 'Y' }
        newChanges.push({ _id: row._id, positionTypeRef: posRef, action: 'upsert', row: updated })
        return updated
      }
      return row
    })

    set({ recipes: updatedRecipes, rsChanges: [...rsChanges, ...newChanges] })
    get().applyCollection(posRef, toCollectionId)
  },

  /**
   * addCollectionRef(posRef, ref, section, quantity)
   * Add a single ingredient ref to a position. If a soft-deleted row for the same
   * ref already exists on this position, revive it instead of creating a duplicate.
   */
  addCollectionRef(posRef, ref, section = 'position', quantity = 1) {
    if (!posRef || !ref) return
    const { recipes, rsChanges } = get()
    const target = ref.toLowerCase()
    const revivable = recipes.find(row =>
      (row.PositionTypeRef || row.positionTypeRef) === posRef &&
      (row.ElementTypeRef || row.elementTypeRef || '').toLowerCase() === target &&
      (row.IsDeleted || row.isDeleted) === 'Y'
    )
    if (revivable) {
      get()._pushHistory()
      const newChanges = []
      const updated = recipes.map(row => {
        if (row._id !== revivable._id) return row
        const u = { ...row, IsDeleted: 'N', isDeleted: 'N' }
        newChanges.push({ _id: row._id, positionTypeRef: posRef, action: 'upsert', row: u })
        return u
      })
      set({ recipes: updated, rsChanges: [...rsChanges, ...newChanges] })
      return
    }
    get().addConnection(posRef, [{ section, elementTypeRef: ref, quantity }])
  },

  /**
   * removeCollectionRef(posRef, ref)
   * Soft-delete every active position-level row matching `ref` on this position.
   */
  removeCollectionRef(posRef, ref) {
    if (!posRef || !ref) return
    const { recipes, rsChanges } = get()
    const target = ref.toLowerCase()
    get()._pushHistory()
    const newChanges = []
    const updated = recipes.map(row => {
      const pr = row.PositionTypeRef || row.positionTypeRef
      if (pr !== posRef) return row
      const rRef = (row.ElementTypeRef || row.elementTypeRef || '').toLowerCase()
      const isDel = (row.IsDeleted || row.isDeleted) === 'Y'
      if (rRef === target && !isDel) {
        const u = { ...row, IsDeleted: 'Y', isDeleted: 'Y' }
        newChanges.push({ _id: row._id, positionTypeRef: posRef, action: 'upsert', row: u })
        return u
      }
      return row
    })
    set({ recipes: updated, rsChanges: [...rsChanges, ...newChanges] })
  },

  /**
   * removeCollection(posRef, collectionId)
   * Soft-delete all of a collection's ingredient refs from a position in one step.
   */
  removeCollection(posRef, collectionId) {
    const { etCollections, recipes, rsChanges } = get()
    const collection = etCollections.find(c => c.CollectionId === collectionId)
    if (!collection || !posRef) return
    const ings = Array.isArray(collection.Ingredients)
      ? collection.Ingredients
      : JSON.parse(collection.Ingredients || '[]')
    const refSet = new Set(
      ings.map(i => (i.ElementTypeRef || i.slotLabel || '').toLowerCase()).filter(Boolean)
    )
    if (refSet.size === 0) return
    get()._pushHistory()
    const newChanges = []
    const updated = recipes.map(row => {
      const pr = row.PositionTypeRef || row.positionTypeRef
      if (pr !== posRef) return row
      const rRef = (row.ElementTypeRef || row.elementTypeRef || '').toLowerCase()
      const isDel = (row.IsDeleted || row.isDeleted) === 'Y'
      if (refSet.has(rRef) && !isDel) {
        const u = { ...row, IsDeleted: 'Y', isDeleted: 'Y' }
        newChanges.push({ _id: row._id, positionTypeRef: posRef, action: 'upsert', row: u })
        return u
      }
      return row
    })
    set({ recipes: updated, rsChanges: [...rsChanges, ...newChanges] })
  },

  /**
   * updateRecipeRow(posRef, rowId, updates)
   * Updates a specific recipe row identified by _id.
   * In ET mode, propagates to all position copies of that row.
   */
  updateRecipeRow(posRef, rowId, updates) {
    const { recipes, rsChanges, activeContextType, activeETRef } = get()

    get()._pushHistory()

    let updatedRecipes = recipes.map(row => {
      if (row._id !== rowId) return row
      return { ...row, ...updates }
    })

    const primaryRow = updatedRecipes.find(r => r._id === rowId)
    const newChanges = [{ _id: rowId, positionTypeRef: posRef, action: 'upsert', row: primaryRow }]

    // Propagate to all position copies in ET mode
    if (activeContextType === 'ElementType' && activeETRef && primaryRow) {
      const primaryIndex = primaryRow.RecipeIndex ?? primaryRow.recipeIndex
      const primaryPosRef = primaryRow.PositionTypeRef ?? primaryRow.positionTypeRef
      updatedRecipes = updatedRecipes.map(row => {
        if (row._id === rowId) return row
        const ct = row.ContextType || row.contextType
        const cr = row.ContextRef || row.contextRef
        const ri = row.RecipeIndex ?? row.recipeIndex
        const pr = row.PositionTypeRef ?? row.positionTypeRef
        if (ct === 'ElementType' && cr === activeETRef && ri === primaryIndex && pr !== primaryPosRef) {
          const updated = { ...row, ...updates }
          newChanges.push({ _id: row._id, positionTypeRef: pr, action: 'upsert', row: updated })
          return updated
        }
        return row
      })
    }

    set({ recipes: updatedRecipes, rsChanges: [...rsChanges, ...newChanges] })
  },

  /**
   * removeRecipeRow(posRef, rowId)
   * Removes a recipe row by _id.
   * In ET mode, propagates removal to all position copies.
   */
  removeRecipeRow(posRef, rowId) {
    const { recipes, rsChanges, activeContextType, activeETRef } = get()

    const removedRow = recipes.find(r => r._id === rowId)
    if (!removedRow) return

    get()._pushHistory()

    // Which rows this delete affects: the target + its ET-mode position copies
    const affected = [removedRow]
    if (activeContextType === 'ElementType' && activeETRef) {
      const primaryIndex = removedRow.RecipeIndex ?? removedRow.recipeIndex
      const primaryPosRef = removedRow.PositionTypeRef ?? removedRow.positionTypeRef
      for (const row of recipes) {
        if (row._id === rowId) continue
        const ct = row.ContextType || row.contextType
        const cr = row.ContextRef || row.contextRef
        const ri = row.RecipeIndex ?? row.recipeIndex
        const pr = row.PositionTypeRef ?? row.positionTypeRef
        if (ct === 'ElementType' && cr === activeETRef && ri === primaryIndex && pr !== primaryPosRef) {
          affected.push(row)
        }
      }
    }

    // New rows (never synced to the source file) are hard-removed; rows that
    // exist in the file are soft-deleted (IsDeleted=Y) so the change syncs out.
    const hardIds = new Set()
    const softIds = new Set()
    for (const row of affected) {
      if (row._row_num == null) hardIds.add(row._id)
      else softIds.add(row._id)
    }

    const newChanges = []
    let nextRecipes = recipes
      .filter(r => !hardIds.has(r._id))
      .map(r => {
        if (!softIds.has(r._id)) return r
        const u = { ...r, IsDeleted: 'Y', isDeleted: 'Y' }
        newChanges.push({ _id: r._id, positionTypeRef: r.PositionTypeRef || r.positionTypeRef || posRef, action: 'upsert', row: u })
        return u
      })

    // Drop any queued changes for hard-removed rows so export won't recreate them
    const cleaned = rsChanges.filter(c => !hardIds.has(c._id))
    set({ recipes: nextRecipes, rsChanges: [...cleaned, ...newChanges] })
  },

  /**
   * restoreRecipeRow(posRef, rowId) — revive a soft-deleted row (IsDeleted=N).
   */
  restoreRecipeRow(posRef, rowId) {
    get().updateRecipeRow(posRef, rowId, { IsDeleted: 'N', isDeleted: 'N' })
  },

  /**
   * reorderIngredients(posRef, section, oldIndex, newIndex)
   * Reorders rows within a section and renumbers RecipeIndex 1..n.
   */
  reorderIngredients(posRef, section, oldIndex, newIndex) {
    const { recipes, rsChanges } = get()

    get()._pushHistory()

    // Separate section rows from the rest
    const sectionRows = recipes.filter(
      r => (r.positionTypeRef || r.PositionTypeRef) === posRef &&
           sectionOfRow(r) === section
    )
    const otherRows = recipes.filter(
      r => !((r.positionTypeRef || r.PositionTypeRef) === posRef &&
             sectionOfRow(r) === section)
    )

    const reordered = renumberSection(arrayMove(sectionRows, oldIndex, newIndex))

    const newChanges = reordered.map(row => ({
      _id: row._id,
      positionTypeRef: posRef,
      action: 'upsert',
      row,
    }))

    set({
      recipes: [...otherRows, ...reordered],
      rsChanges: [...rsChanges, ...newChanges],
    })
  },

  /**
   * moveIngredientAcrossSections(posRef, rowId, targetSection)
   * Moves a row to a different section, updating ContextType + ContextRef,
   * and re-sequences both source and destination sections.
   */
  moveIngredientAcrossSections(posRef, rowId, targetSection) {
    const { recipes, rsChanges } = get()

    const rowToMove = recipes.find(r => r._id === rowId)
    if (!rowToMove) return

    const sourceSection = sectionOfRow(rowToMove)
    if (sourceSection === targetSection) return

    get()._pushHistory()

    const { contextType, contextRef } = contextForSection(targetSection, posRef, recipes)

    const movedRow = {
      ...rowToMove,
      contextType,
      contextRef,
      ContextType: contextType,
      ContextRef: contextRef,
    }

    // Build updated flat list with moved row placed at end of targetSection
    const allOtherRows = recipes.filter(r => r._id !== rowId)

    // Re-number source section
    const sourceRows = renumberSection(
      allOtherRows.filter(
        r => (r.positionTypeRef || r.PositionTypeRef) === posRef &&
             sectionOfRow(r) === sourceSection
      )
    )

    // Re-number target section (append moved row at end)
    const targetRows = renumberSection([
      ...allOtherRows.filter(
        r => (r.positionTypeRef || r.PositionTypeRef) === posRef &&
             sectionOfRow(r) === targetSection
      ),
      movedRow,
    ])

    // All rows not in source or target section for this posRef
    const unchangedRows = allOtherRows.filter(r => {
      const ptRef = r.positionTypeRef || r.PositionTypeRef
      if (ptRef !== posRef) return true
      const sec = sectionOfRow(r)
      return sec !== sourceSection && sec !== targetSection
    })

    // All rows for other positions
    const otherPosRows = recipes.filter(
      r => (r.positionTypeRef || r.PositionTypeRef) !== posRef
    )

    const updatedRecipes = [...otherPosRows, ...unchangedRows, ...sourceRows, ...targetRows]

    const changedRows = [...sourceRows, ...targetRows]
    const newChanges = changedRows.map(row => ({
      _id: row._id,
      positionTypeRef: posRef,
      action: 'upsert',
      row,
    }))

    set({
      recipes: updatedRecipes,
      rsChanges: [...rsChanges, ...newChanges],
    })
  },

  /**
   * updatePSRow(elementTypeRef, updates)
   * Updates a PS row and records it in psChanges (with before/after for change log).
   */
  updatePSRow(elementTypeRef, updates) {
    const { psRows, psChanges, containerETManualRefs, containerETExcludeRefs, elementTypes, recipes } = get()

    get()._pushHistory()

    const existingRow = psRows.find(r => (r.ElementTypeRef || r.elementTypeRef) === elementTypeRef)
    const before = {}
    for (const key of Object.keys(updates)) {
      before[key] = existingRow ? (existingRow[key] ?? null) : null
    }

    // Upsert: an ET used in a recipe may have no PS row yet (never added to the
    // spec sheet). Create one so the edit actually persists instead of no-opping.
    const basePsRows = existingRow ? psRows : [...psRows, {
      ElementTypeRef: elementTypeRef,
      elementTypeRef,
      ProductCode: null, Manufacturer: null, ComponentDescription: null,
      InternalNotesText: null, IsTBC: null, IsDeleted: null, IsPropertiesTBC: null,
      _id: uuidv4(), _row_num: null,
    }]

    const updatedPsRows = basePsRows.map(row => {
      const ref = row.ElementTypeRef || row.elementTypeRef
      if (ref !== elementTypeRef) return row
      return { ...row, ...updates }
    })

    const containerInfo = computeContainerInfo({
      elementTypes, psRows: updatedPsRows, recipes,
      manualInclude: containerETManualRefs, manualExclude: containerETExcludeRefs,
    })
    set({
      psRows: updatedPsRows,
      containerETRefs: containerInfo.refs,
      containerReasons: containerInfo.reasons,
      psChanges: [
        ...psChanges,
        { elementTypeRef, updates, before },
      ],
    })
  },

  /**
   * deletePSRow(elementTypeRef)
   * New (unsynced) rows are hard-removed and their queued changes purged; rows
   * that exist in the source spec are soft-deleted (IsDeleted=Y).
   */
  deletePSRow(elementTypeRef) {
    const { psRows, psChanges, containerETManualRefs, containerETExcludeRefs, elementTypes, recipes } = get()
    const row = psRows.find(r => (r.ElementTypeRef || r.elementTypeRef) === elementTypeRef)
    if (!row) return
    if (row._row_num == null) {
      get()._pushHistory()
      const newPsRows = psRows.filter(r => r._id !== row._id)
      const containerInfo = computeContainerInfo({
        elementTypes, psRows: newPsRows, recipes,
        manualInclude: containerETManualRefs, manualExclude: containerETExcludeRefs,
      })
      set({
        psRows: newPsRows,
        containerETRefs: containerInfo.refs,
        containerReasons: containerInfo.reasons,
        psChanges: psChanges.filter(c => c.elementTypeRef !== elementTypeRef),
      })
    } else {
      get().updatePSRow(elementTypeRef, { IsDeleted: 'Y' })
    }
  },

  /**
   * addPSRow(elementTypeRef)
   * Creates a new blank PS row and queues it for export (appended to Excel).
   */
  addPSRow(elementTypeRef, defaults = {}, { recordHistory = true } = {}) {
    const { psRows, psChanges, containerETManualRefs, containerETExcludeRefs, elementTypes, recipes } = get()

    const trimmed = (elementTypeRef || '').trim()
    if (!trimmed) return null

    const alreadyExists = psRows.some(
      r => (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() === trimmed.toLowerCase()
    )
    if (alreadyExists) return null

    if (recordHistory) get()._pushHistory()

    const newRow = {
      ElementTypeRef: trimmed,
      elementTypeRef: trimmed,
      ProductCode: defaults.ProductCode ?? null,
      Manufacturer: defaults.Manufacturer ?? null,
      ComponentDescription: defaults.ComponentDescription ?? null,
      InternalNotesText: null,
      IsTBC: defaults.IsTBC ?? null,
      IsDeleted: null,
      IsPropertiesTBC: defaults.IsPropertiesTBC ?? null,
      _id: uuidv4(),
      _row_num: null,
    }

    const newPsRows = [...psRows, newRow]
    const containerInfo = computeContainerInfo({
      elementTypes, psRows: newPsRows, recipes,
      manualInclude: containerETManualRefs, manualExclude: containerETExcludeRefs,
    })
    set({
      psRows: newPsRows,
      containerETRefs: containerInfo.refs,
      containerReasons: containerInfo.reasons,
      psChanges: [
        ...psChanges,
        {
          elementTypeRef: trimmed,
          updates: {
            ElementTypeRef: trimmed,
            ProductCode: newRow.ProductCode,
            Manufacturer: newRow.Manufacturer,
            ComponentDescription: newRow.ComponentDescription,
            IsTBC: newRow.IsTBC,
            IsPropertiesTBC: newRow.IsPropertiesTBC,
          },
          _isNew: true,
        },
      ],
    })

    return newRow
  },

  /**
   * toggleContainerET(etRef)
   * Flips an ET's wrapper status via manual include/exclude overrides (which win
   * over the auto soft-match), so users can fix both false positives and false
   * negatives. Persists both override lists to project_prefs.
   */
  async toggleContainerET(etRef) {
    if (!etRef) return
    const { projectId, psRows, containerETRefs, containerETManualRefs, containerETExcludeRefs, elementTypes, recipes } = get()
    const key = etRef.toLowerCase()
    const isContainer = containerETRefs.has(key)

    // Start from current overrides, clearing any existing override for this ref.
    let include = containerETManualRefs.filter(r => r.toLowerCase() !== key)
    let exclude = containerETExcludeRefs.filter(r => r.toLowerCase() !== key)

    // Auto verdict without any override for this ref, to decide which list (if
    // any) we need to flip the effective state.
    const auto = computeContainerInfo({
      elementTypes, psRows, recipes, manualInclude: include, manualExclude: exclude,
    }).refs.has(key)

    if (isContainer) {
      // Turning OFF: only need an explicit exclude if auto would still say yes.
      if (auto) exclude = [...exclude, etRef]
    } else {
      // Turning ON: only need an explicit include if auto would still say no.
      if (!auto) include = [...include, etRef]
    }

    const containerInfo = computeContainerInfo({
      elementTypes, psRows, recipes, manualInclude: include, manualExclude: exclude,
    })
    set({
      containerETManualRefs: include,
      containerETExcludeRefs: exclude,
      containerETRefs: containerInfo.refs,
      containerReasons: containerInfo.reasons,
    })

    if (projectId) {
      await window.electronAPI.db.setPref(projectId, 'container_ets', JSON.stringify(include))
      await window.electronAPI.db.setPref(projectId, 'container_ets_exclude', JSON.stringify(exclude))
    }
  },

  /**
   * setShowContextTree(v)
   */
  setShowContextTree(v) {
    set({ showContextTree: v })
  },

  /**
   * setRootView(view)
   * view: 'positions' | 'elements'. Switching away from an open ET editor
   * closes it so the chosen root view is shown cleanly.
   */
  setRootView(view) {
    set({ rootView: view, activeContextType: 'PositionType', activeETRef: null })
  },

  /**
   * openETRecipe(etRef)
   * Switches the canvas to show/edit the internal recipe of an ElementType.
   */
  openETRecipe(etRef) {
    set({ activeContextType: 'ElementType', activeETRef: etRef })
  },

  /**
   * closeETRecipe()
   * Returns canvas to normal position-recipe mode.
   */
  closeETRecipe() {
    set({ activeContextType: 'PositionType', activeETRef: null })
  },

  /**
   * suggestNextETRef(etRef)
   * Returns the next available sequential ref for etRef, considering both
   * element types and refs already used as recipe ContextRefs. Pure helper for
   * the Duplicate ET modal — does not mutate state.
   */
  suggestNextETRef(etRef) {
    const { recipes, elementTypes } = get()
    const recipeETRefs = [...new Set(
      recipes
        .filter(r => (r.ContextType || r.contextType) === 'ElementType')
        .map(r => r.ContextRef || r.contextRef)
        .filter(Boolean)
    )]
    const allKnownETs = [...elementTypes, ...recipeETRefs.map(ref => ({ ElementTypeRef: ref }))]
    return getNextAvailableRef(etRef, allKnownETs)
  },

  /**
   * duplicateET(etRef, newRef, posRef)
   * Forks the source ET's internal recipe under newRef for a SINGLE position
   * (posRef) — the position the user is working on. Other positions that use
   * the source ET are untouched. Opens the new ET for editing.
   */
  duplicateET(etRef, newRef, posRef) {
    const { recipes, activePositionRef } = get()
    const targetPos = posRef || activePositionRef
    const trimmedRef = (newRef || '').trim()
    if (!etRef || !trimmedRef || !targetPos) return

    // Collect unique internal rows for the source ET (deduplicate across position copies)
    const allETRows = recipes.filter(r =>
      (r.ContextType || r.contextType) === 'ElementType' &&
      (r.ContextRef || r.contextRef) === etRef
    )
    const seen = new Set()
    const uniqueRows = allETRows.filter(r => {
      const key = `${r.ElementTypeRef || r.elementTypeRef}-${r.RecipeIndex ?? r.recipeIndex}`
      if (seen.has(key)) return false
      seen.add(key); return true
    })

    const newRows = uniqueRows.map(row => ({
      ...row,
      ContextRef: trimmedRef, contextRef: trimmedRef,
      PositionTypeRef: targetPos, positionTypeRef: targetPos,
      _id: uuidv4(),
    }))

    const newChanges = newRows.map(row => ({
      _id: row._id, positionTypeRef: row.PositionTypeRef, action: 'upsert', row,
    }))

    get()._pushHistory()
    set(s => ({ recipes: [...s.recipes, ...newRows], rsChanges: [...s.rsChanges, ...newChanges] }))
    get().openETRecipe(trimmedRef)
  },

  /**
   * runValidation()
   * Runs validation rules and stores results.
   */
  runValidation() {
    const { elementTypes, positionTypes, psRows, recipes, positionUI, ignoredPositionFamilies } = get()

    const dbData = { element_types: elementTypes, position_types: positionTypes }
    const results = runValidation(dbData, psRows, recipes, positionUI)

    // Ignored positions/families are out-of-scope — drop their issues so they
    // don't count toward validation totals.
    const ignoredFamilies = new Set(ignoredPositionFamilies)
    const isIgnored = (ref) => {
      if (!ref) return false
      if (positionUI[ref]?.ignored) return true
      const pt = positionTypes.find(p => p.PositionTypeRef === ref)
      return pt ? ignoredFamilies.has(positionFamilyOf(pt)) : false
    }
    const filtered = results.filter(i => !isIgnored(i.ref))

    set({ validationResults: filtered })

    return filtered
  },

  /**
   * exportChanges()
   * POSTs psChanges and rsChanges to Flask /patch, then clears them.
   */
  async exportChanges() {
    const { psChanges, rsChanges, paths } = get()

    const requests = []

    if (psChanges.length > 0) {
      requests.push(
        axios.post(`${API}/patch`, {
          target: 'ps',
          filepath: paths.ps,
          changes: psChanges,
        })
      )
    }

    if (rsChanges.length > 0) {
      requests.push(
        axios.post(`${API}/patch`, {
          target: 'rs',
          filepath: paths.rs,
          changes: rsChanges,
        })
      )
    }

    await Promise.all(requests)

    set({ psChanges: [], rsChanges: [] })
  },

  /**
   * setFileWatchAlert(alert)
   * alert: { file: 'ps'|'rs', path } or null
   */
  setFileWatchAlert(alert) {
    set({ fileWatchAlert: alert })
  },

  /**
   * dismissFileWatchAlert()
   */
  dismissFileWatchAlert() {
    set({ fileWatchAlert: null })
  },

  /**
   * addLocalElementType(ref, name?, family?)
   * Adds an ET to the in-memory elementTypes list (local only until next import/export).
   */
  addLocalElementType(ref, name = null, family = null) {
    const trimmed = (ref || '').trim()
    if (!trimmed) return
    const { elementTypes } = get()
    if (elementTypes.some(e => (e.ElementTypeRef || e.elementTypeRef || '').toLowerCase() === trimmed.toLowerCase())) return
    set(s => ({
      elementTypes: [...s.elementTypes, { ElementTypeRef: trimmed, Name: name, Family: family }],
    }))
  },

  /**
   * toggleIgnorePosition(posRef)
   * Toggles the _ignore flag on positionUI[posRef] and persists to SQLite.
   */
  async toggleIgnorePosition(posRef) {
    const current = get().positionUI[posRef] || {}
    await get().updatePositionUI(posRef, { ignored: !current.ignored })
  },

  /**
   * toggleIgnorePositionFamily(family)
   * Toggles whether a PositionType family is flagged as ignored, and persists
   * the list to the project_prefs table as JSON under 'ignored_position_families'.
   */
  async toggleIgnorePositionFamily(family) {
    if (!family) return
    const { ignoredPositionFamilies, projectId } = get()
    const next = ignoredPositionFamilies.includes(family)
      ? ignoredPositionFamilies.filter(f => f !== family)
      : [...ignoredPositionFamilies, family]
    set({ ignoredPositionFamilies: next })
    if (projectId != null) {
      await window.electronAPI.db.setPref(projectId, 'ignored_position_families', JSON.stringify(next))
    }
  },

  /**
   * reloadFileFromDisk(file)
   * file: 'ps' | 'rs'
   * POST /import for just that file, merges into store, clears alert.
   */
  async reloadFileFromDisk(file) {
    const { paths } = get()
    set({ isLoading: true })

    try {
      const filePath = file === 'ps' ? paths.ps : paths.rs
      const body = { db: paths.db, ps: paths.ps, rs: paths.rs }
      const response = await axios.post(`${API}/import`, body)

      if (file === 'ps') {
        const psRows = stampIds(response.data.ps ?? [])
        set({ psRows, isLoading: false, fileWatchAlert: null })
      } else {
        const recipes = stampIds(response.data.rs ?? [])
        set({ recipes, isLoading: false, fileWatchAlert: null })
      }
    } catch (err) {
      set({ isLoading: false, loadError: err.message ?? String(err) })
      throw err
    }
  },
}))

export default useStore
