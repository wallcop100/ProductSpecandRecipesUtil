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
import { deriveTagsForAll } from '../utils/tagEngine.js'
import { runValidation } from '../utils/validationRules.js'
import { buildContainerETSet, looksLikeContainer, getNextAvailableRef } from '../utils/containerUtils.js'
import { FLASK_PORT, DIM_QTY_COMPONENTS, AUTO_CONTRACT_ITEMS } from '../utils/constants.js'

const API = `http://localhost:${FLASK_PORT}`

// ---------------------------------------------------------------------------
// Container ET helpers
// ---------------------------------------------------------------------------

/** Collects all ET refs from elementTypes, psRows, and recipes into an array. */
function collectAllETRefs(elementTypes = [], psRows = [], recipes = []) {
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

  // Position UI (from SQLite)
  positionUI: {},        // { [positionTypeRef]: { tags, tagSource, tagConfidence, userNotes } }

  // Container ElementTypes — auto-detected from naming convention + manual overrides
  containerETRefs: new Set(),        // Set<string> of lowercased ET refs (derived)
  containerETManualRefs: [],         // string[] — persisted to SQLite project_prefs

  // UI state
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
   *          templates, slotMappings, positionUI }
   */
  loadProject(data) {
    const {
      projectId,
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
    } = data

    const stampedPsRows = stampIds(psRows ?? [])
    const manualRefs = manualContainerETs ?? []

    set({
      projectId: projectId ?? null,
      folderPath: folderPath ?? null,
      paths: paths ?? { db: null, ps: null, rs: null },
      elementTypes: elementTypes ?? [],
      positionTypes: positionTypes ?? [],
      psRows: stampedPsRows,
      recipes: stampIds(recipes ?? []),
      templates: templates ?? [],
      slotMappings: slotMappings ?? {},
      positionUI: positionUI ?? {},
      containerETManualRefs: manualRefs,
      containerETRefs: buildContainerETSet(stampedPsRows, manualRefs, collectAllETRefs(elementTypes, stampedPsRows, stampIds(recipes ?? []))),
      // Reset transient state
      psChanges: [],
      rsChanges: [],
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

      // Derive tags for all position types
      const derivedTags = deriveTagsForAll(positionTypes)

      // Merge with existing positionUI: SQLite manual tags override derived
      const existingPositionUI = get().positionUI
      const mergedPositionUI = { ...existingPositionUI }

      for (const pt of positionTypes) {
        const ref = pt.PositionTypeRef
        const derived = derivedTags[ref] || { tags: [], confidence: 'low', source: {} }

        const existing = existingPositionUI[ref] || {}
        // If tagSource is 'manual', keep existing tags; otherwise use derived
        const isManual = existing.tagSource === 'manual'

        mergedPositionUI[ref] = {
          tags: isManual ? (existing.tags || []) : derived.tags,
          tagSource: isManual ? 'manual' : 'derived',
          tagConfidence: isManual ? (existing.tagConfidence ?? null) : derived.confidence,
          userNotes: existing.userNotes ?? null,
        }
      }

      const stampedPsRows = stampIds(ps_rows ?? [])
      const stampedRecipes = stampIds(rs_rows ?? [])

      const { containerETManualRefs } = get()
      set({
        elementTypes,
        positionTypes,
        psRows: stampedPsRows,
        recipes: stampedRecipes,
        positionUI: mergedPositionUI,
        containerETRefs: buildContainerETSet(stampedPsRows, containerETManualRefs, collectAllETRefs(elementTypes, stampedPsRows, stampedRecipes)),
        paths,
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
   * setActivePosition(ref)
   */
  setActivePosition(ref) {
    set({ activePositionRef: ref })
  },

  /**
   * setActiveTab(tab)
   */
  setActiveTab(tab) {
    set({ activeTab: tab })
  },

  /**
   * updatePositionUI(positionTypeRef, updates)
   * Merges updates into positionUI[positionTypeRef] and persists to SQLite.
   */
  async updatePositionUI(positionTypeRef, updates) {
    const current = get().positionUI
    const existing = current[positionTypeRef] || {}
    const merged = { ...existing, ...updates }

    set({
      positionUI: {
        ...current,
        [positionTypeRef]: merged,
      },
    })

    await window.electronAPI.db.upsertPositionUI(get().projectId, positionTypeRef, merged)
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
  addRecipeRow(posRef, section, ingredientData) {
    const { recipes, rsChanges, activeContextType, activeETRef } = get()

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

    // Auto-create PS row with N/A defaults for container ETs
    if (etRef) {
      const { containerETRefs, psRows: currentPsRows } = get()
      const isContainer = containerETRefs.has(etRef.toLowerCase()) || looksLikeContainer(etRef)
      const hasPsRow = currentPsRows.some(
        r => (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() === etRef.toLowerCase()
      )
      if (isContainer && !hasPsRow) {
        get().addPSRow(etRef, { Manufacturer: '', ProductCode: 'N/A' })
      }
    }

    return newRow
  },

  /**
   * updateRecipeRow(posRef, rowId, updates)
   * Updates a specific recipe row identified by _id.
   * In ET mode, propagates to all position copies of that row.
   */
  updateRecipeRow(posRef, rowId, updates) {
    const { recipes, rsChanges, activeContextType, activeETRef } = get()

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
    let filteredRecipes = recipes.filter(r => r._id !== rowId)
    const newChanges = [{ _id: rowId, positionTypeRef: posRef, action: 'delete' }]

    // Propagate removal to all position copies in ET mode
    if (activeContextType === 'ElementType' && activeETRef && removedRow) {
      const primaryIndex = removedRow.RecipeIndex ?? removedRow.recipeIndex
      const primaryPosRef = removedRow.PositionTypeRef ?? removedRow.positionTypeRef
      const toRemove = new Set()
      for (const row of filteredRecipes) {
        const ct = row.ContextType || row.contextType
        const cr = row.ContextRef || row.contextRef
        const ri = row.RecipeIndex ?? row.recipeIndex
        const pr = row.PositionTypeRef ?? row.positionTypeRef
        if (ct === 'ElementType' && cr === activeETRef && ri === primaryIndex && pr !== primaryPosRef) {
          toRemove.add(row._id)
          newChanges.push({ _id: row._id, positionTypeRef: pr, action: 'delete' })
        }
      }
      if (toRemove.size > 0) filteredRecipes = filteredRecipes.filter(r => !toRemove.has(r._id))
    }

    set({ recipes: filteredRecipes, rsChanges: [...rsChanges, ...newChanges] })
  },

  /**
   * reorderIngredients(posRef, section, oldIndex, newIndex)
   * Reorders rows within a section and renumbers RecipeIndex 1..n.
   */
  reorderIngredients(posRef, section, oldIndex, newIndex) {
    const { recipes, rsChanges } = get()

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
   * Updates a PS row and records it in psChanges.
   */
  updatePSRow(elementTypeRef, updates) {
    const { psRows, psChanges, containerETManualRefs, elementTypes, recipes } = get()

    const updatedPsRows = psRows.map(row => {
      const ref = row.ElementTypeRef || row.elementTypeRef
      if (ref !== elementTypeRef) return row
      return { ...row, ...updates }
    })

    set({
      psRows: updatedPsRows,
      containerETRefs: buildContainerETSet(updatedPsRows, containerETManualRefs, collectAllETRefs(elementTypes, updatedPsRows, recipes)),
      psChanges: [
        ...psChanges,
        { elementTypeRef, updates },
      ],
    })
  },

  /**
   * addPSRow(elementTypeRef)
   * Creates a new blank PS row and queues it for export (appended to Excel).
   */
  addPSRow(elementTypeRef, defaults = {}) {
    const { psRows, psChanges, containerETManualRefs, elementTypes, recipes } = get()

    const trimmed = (elementTypeRef || '').trim()
    if (!trimmed) return null

    const alreadyExists = psRows.some(
      r => (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() === trimmed.toLowerCase()
    )
    if (alreadyExists) return null

    const newRow = {
      ElementTypeRef: trimmed,
      elementTypeRef: trimmed,
      ProductCode: defaults.ProductCode ?? null,
      Manufacturer: defaults.Manufacturer ?? null,
      ComponentDescription: null,
      InternalNotesText: null,
      IsTBC: null,
      IsDeleted: null,
      IsPropertiesTBC: null,
      _id: uuidv4(),
      _row_num: null,
    }

    const newPsRows = [...psRows, newRow]
    set({
      psRows: newPsRows,
      containerETRefs: buildContainerETSet(newPsRows, containerETManualRefs, collectAllETRefs(elementTypes, newPsRows, recipes)),
      psChanges: [
        ...psChanges,
        {
          elementTypeRef: trimmed,
          updates: {
            ElementTypeRef: trimmed,
            ProductCode: defaults.ProductCode ?? null,
            Manufacturer: defaults.Manufacturer ?? null,
            ComponentDescription: null,
          },
          _isNew: true,
        },
      ],
    })

    return newRow
  },

  /**
   * toggleContainerET(etRef)
   * Manually marks/unmarks an ET as a container. Persists to SQLite project_prefs.
   */
  async toggleContainerET(etRef) {
    if (!etRef) return
    const { projectId, psRows, containerETManualRefs, elementTypes, recipes } = get()
    const key = etRef.toLowerCase()
    const idx = containerETManualRefs.findIndex(r => r.toLowerCase() === key)
    const newManual = idx >= 0
      ? containerETManualRefs.filter((_, i) => i !== idx)
      : [...containerETManualRefs, etRef]

    set({
      containerETManualRefs: newManual,
      containerETRefs: buildContainerETSet(psRows, newManual, collectAllETRefs(elementTypes, psRows, recipes)),
    })

    if (projectId) {
      await window.electronAPI.db.setPref(projectId, 'container_ets', JSON.stringify(newManual))
    }
  },

  /**
   * setShowContextTree(v)
   */
  setShowContextTree(v) {
    set({ showContextTree: v })
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
   * duplicateET(etRef)
   * Creates a copy of an ET's internal recipe under the next sequential ref,
   * replicating rows for all positions that use the source ET.
   */
  duplicateET(etRef) {
    const { recipes, elementTypes, activePositionRef, rsChanges } = get()

    // Build a combined list so we don't suggest a ref that already exists as a ContextRef
    const recipeETRefs = [...new Set(
      recipes
        .filter(r => (r.ContextType || r.contextType) === 'ElementType')
        .map(r => r.ContextRef || r.contextRef)
        .filter(Boolean)
    )]
    const allKnownETs = [...elementTypes, ...recipeETRefs.map(ref => ({ ElementTypeRef: ref }))]
    const nextRef = getNextAvailableRef(etRef, allKnownETs)
    if (!nextRef) return

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

    // Positions to create copies for
    const sourcePosRefs = [...new Set(allETRows.map(r => r.PositionTypeRef || r.positionTypeRef).filter(Boolean))]
    if (sourcePosRefs.length === 0 && activePositionRef) sourcePosRefs.push(activePositionRef)

    const newRows = []
    for (const pRef of sourcePosRefs) {
      for (const row of uniqueRows) {
        newRows.push({
          ...row,
          ContextRef: nextRef, contextRef: nextRef,
          PositionTypeRef: pRef, positionTypeRef: pRef,
          _id: uuidv4(),
        })
      }
    }

    const newChanges = newRows.map(row => ({
      _id: row._id, positionTypeRef: row.PositionTypeRef, action: 'upsert', row,
    }))

    set(s => ({ recipes: [...s.recipes, ...newRows], rsChanges: [...s.rsChanges, ...newChanges] }))
    get().openETRecipe(nextRef)
  },

  /**
   * runValidation()
   * Runs validation rules and stores results.
   */
  runValidation() {
    const { elementTypes, positionTypes, psRows, recipes, positionUI } = get()

    const dbData = { element_types: elementTypes, position_types: positionTypes }
    const results = runValidation(dbData, psRows, recipes, positionUI)

    set({ validationResults: results })

    return results
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
