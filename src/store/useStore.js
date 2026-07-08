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
// Dirty registry (see EXPORT_PLAN.md)
//
// psChanges / rsChanges hold ONE coalesced entry per dirty row, not one entry
// per edit event. Each modified-row entry carries:
//   changedFields — the fields that differ from `before` (field-level patch)
//   before        — the row's values when it FIRST became dirty (staleness base)
// Brand-new rows (never exported, _row_num == null) queue as full-row appends.
// ---------------------------------------------------------------------------

/** Canonical RS export fields (must match backend RS_FIELD_TO_EXCEL keys). */
const RS_EXPORT_FIELDS = [
  'ContextType', 'ContextRef', 'RecipeIndex', 'ElementTypeRef', 'SortOrder',
  'Quantity', 'PackQuantity', 'IsDeleted', 'IsDesign', 'IsContractItem',
  'IsTRItem', 'Dim_QuantityMultiplier', 'IsInteger',
]

const RS_FIELD_ALIASES = {
  ContextType: 'contextType', ContextRef: 'contextRef', RecipeIndex: 'recipeIndex',
  ElementTypeRef: 'elementTypeRef', SortOrder: 'sortOrder', Quantity: 'quantity',
  PackQuantity: 'packQuantity', IsDeleted: 'isDeleted', IsDesign: 'isDesign',
  IsContractItem: 'isContractItem', IsTRItem: 'isTRItem',
  Dim_QuantityMultiplier: 'dimQtyMultiplier', IsInteger: 'isInteger',
}

function rsValue(row, field) {
  if (row[field] !== undefined) return row[field]
  const alias = RS_FIELD_ALIASES[field]
  return alias !== undefined ? row[alias] : undefined
}

/** Loose equality: null == '' , 1 == '1'. */
function looseEqual(a, b) {
  const na = (a === '' || a === undefined) ? null : a
  const nb = (b === '' || b === undefined) ? null : b
  if (na === nb) return true
  if (na == null || nb == null) return false
  const fa = parseFloat(na), fb = parseFloat(nb)
  if (!Number.isNaN(fa) && !Number.isNaN(fb) && String(fa) === String(na).trim() && String(fb) === String(nb).trim()) {
    return fa === fb
  }
  return false
}

/**
 * Coalesce new RS change events into the dirty registry.
 *
 * prevRecipes = the recipes array BEFORE the mutation (used to snapshot
 * `before` the first time a row becomes dirty). Entries whose changedFields
 * become empty (edit reverted back to base) are dropped.
 */
function mergeRsChanges(prevChanges, newChanges, prevRecipes) {
  if (!newChanges || newChanges.length === 0) return prevChanges
  const byId = new Map(prevChanges.map(c => [c._id, c]))
  const prevById = new Map()
  if (prevRecipes) for (const r of prevRecipes) prevById.set(r._id, r)

  for (const change of newChanges) {
    const existing = byId.get(change._id)
    const row = change.row || {}
    const rowNum = row._row_num ?? null

    if (change.action === 'delete') {
      byId.set(change._id, {
        _id: change._id, positionTypeRef: change.positionTypeRef,
        action: 'delete', row, before: existing?.before,
      })
      continue
    }

    if (rowNum == null) {
      // Never exported — full-row append.
      byId.set(change._id, {
        _id: change._id, positionTypeRef: change.positionTypeRef,
        action: 'upsert', row,
      })
      continue
    }

    // Row exists on disk — field-level entry against a stable `before` base.
    let before = existing?.before
    if (!before) {
      const base = prevById.get(change._id)
      before = {}
      if (base) for (const f of RS_EXPORT_FIELDS) before[f] = rsValue(base, f) ?? null
    }
    const changedFields = {}
    for (const f of RS_EXPORT_FIELDS) {
      const cur = rsValue(row, f) ?? null
      if (!looseEqual(cur, before[f] ?? null)) changedFields[f] = cur
    }
    if (Object.keys(changedFields).length === 0) {
      byId.delete(change._id)   // reverted to base — no longer dirty
      continue
    }
    byId.set(change._id, {
      _id: change._id, positionTypeRef: change.positionTypeRef,
      action: 'upsert', row, changedFields, before,
    })
  }
  return [...byId.values()]
}

/**
 * Coalesce a DB catalogue change into its registry (keyed by ElementTypeRef).
 * Same shape/merge rules as PS changes: earliest `before` wins, updates merge,
 * _isNew sticky. A rename carries updates.ElementTypeRef = the new ref.
 */
function mergeDbChanges(prevChanges, change) {
  return mergePsChanges(prevChanges, change)
}

/** Coalesce a PS change event into the dirty registry (keyed by ET ref). */
function mergePsChanges(prevChanges, change) {
  const idx = prevChanges.findIndex(c => c.elementTypeRef === change.elementTypeRef)
  if (idx === -1) return [...prevChanges, change]
  const existing = prevChanges[idx]
  const merged = {
    elementTypeRef: change.elementTypeRef,
    updates: { ...(existing.updates || {}), ...(change.updates || {}) },
    // earliest `before` wins — it is the base that still matches disk
    before: { ...(change.before || {}), ...(existing.before || {}) },
  }
  if (existing._isNew || change._isNew) merged._isNew = true
  const next = [...prevChanges]
  next[idx] = merged
  return next
}

/**
 * Re-apply a pending PS registry onto freshly parsed rows: overlay updates on
 * matching rows, re-inject _isNew rows that aren't on disk yet.
 */
function applyPsPending(psRows, psChanges) {
  if (!psChanges || psChanges.length === 0) return psRows
  const present = new Set(psRows.map(r => (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase()))
  const rows = psRows.map(r => {
    const ref = (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase()
    const entry = psChanges.find(c => (c.elementTypeRef || '').toLowerCase() === ref)
    return entry ? { ...r, ...entry.updates } : r
  })
  for (const c of psChanges) {
    if (!present.has((c.elementTypeRef || '').toLowerCase())) {
      rows.push({
        ElementTypeRef: c.elementTypeRef, elementTypeRef: c.elementTypeRef,
        ...c.updates, _id: uuidv4(), _row_num: null,
      })
    }
  }
  return rows
}

/**
 * Re-apply a pending RS registry onto freshly parsed rows.
 *
 * Modified rows are addressed by _row_num (every position copy of a shared
 * ET-internal row gets the pending values); never-exported rows are
 * re-injected whole.
 * ponytail: registry entry _ids are left pointing at the pre-reload rows —
 * export addresses rows by _row_num so this is harmless; re-key if a
 * post-reload edit of the same row ever needs to coalesce with its entry.
 */
function applyRsPending(recipes, rsChanges) {
  if (!rsChanges || rsChanges.length === 0) return recipes
  const byRowNum = new Map()
  for (const c of rsChanges) {
    const rn = c.row?._row_num ?? null
    if (rn != null) byRowNum.set(rn, c)
  }
  const rows = recipes.map(r => {
    const c = byRowNum.get(r._row_num ?? null)
    if (!c) return r
    if (c.action === 'delete') return { ...r, IsDeleted: 'Y', isDeleted: 'Y' }
    if (!c.changedFields) return r
    const patch = {}
    for (const [f, v] of Object.entries(c.changedFields)) {
      patch[f] = v
      const alias = RS_FIELD_ALIASES[f]
      if (alias) patch[alias] = v
    }
    return { ...r, ...patch }
  })
  for (const c of rsChanges) {
    if (c.action === 'upsert' && (c.row?._row_num ?? null) == null && c.row) {
      rows.push({ ...c.row })
    }
  }
  return rows
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
  tagColors: {},          // { [tag]: colorHex } — per-config, pref 'tag_colors'

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

  // Dirty tracking (coalesced registries — one entry per dirty row)
  psChanges: [],
  rsChanges: [],
  dbChanges: [],         // writable DesignDB ElementTypes catalogue (EXPORT_PLAN §4)

  // DesignDB writes are opt-in per project (off by default, easily enabled).
  dbWriteEnabled: false,

  // Locally-created ETs (SQLite staging) — kept to re-merge after a DB reload.
  localElementTypes: [],

  // _id of the most recently added recipe row — the card scrolls itself into view.
  lastAddedRowId: null,

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

    // Merge locally-created ETs (SQLite) that aren't yet in the imported DB.
    const dbEts = elementTypes ?? []
    const dbRefSet = new Set(dbEts.map(e => (e.ElementTypeRef || e.elementTypeRef || '').toLowerCase()))
    const localOnly = (data.localElementTypes ?? []).filter(
      e => !dbRefSet.has((e.ElementTypeRef || '').toLowerCase())
    )
    const mergedEts = [...dbEts, ...localOnly]

    const containerInfo = computeContainerInfo({
      elementTypes: mergedEts, psRows: stampedPsRows, recipes: stampedRecipes,
      manualInclude: manualRefs, manualExclude: excludeRefs,
    })

    set({
      projectId: projectId ?? null,
      projectNumber: projectNumber ?? null,
      configName: configName ?? null,
      projectLabel: projectLabel ?? null,
      folderPath: folderPath ?? null,
      paths: paths ?? { db: null, ps: null, rs: null },
      elementTypes: mergedEts,
      positionTypes: positionTypes ?? [],
      psRows: stampedPsRows,
      recipes: stampedRecipes,
      templates: [...(templates ?? []), ...CONNECTOR_TEMPLATES],
      slotMappings: slotMappings ?? {},
      positionUI: positionUI ?? {},
      tagRules: tagRules ?? [],
      tagPalette: tagPalette ?? [],
      tagColors: data.tagColors ?? {},
      tagSnapshots: tagSnapshots ?? {},
      tagDrift: tagDrift ?? {},
      etCollections: etCollections ?? [],
      favorites: favorites ?? [],
      ignoredPositionFamilies: ignoredPositionFamilies ?? [],
      containerETManualRefs: manualRefs,
      containerETExcludeRefs: excludeRefs,
      containerETRefs: containerInfo.refs,
      containerReasons: containerInfo.reasons,
      dbWriteEnabled: !!data.dbWriteEnabled,
      localElementTypes: data.localElementTypes ?? [],
      // Reset transient state
      psChanges: [],
      rsChanges: [],
      dbChanges: [],
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
        psChanges: [],
        rsChanges: [],
        dbChanges: [],
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
   * setTagColor(tag, color) — set (or clear, when color is null) a tag's colour.
   */
  async setTagColor(tag, color) {
    const { projectId, tagColors } = get()
    const next = { ...tagColors }
    if (color) next[tag] = color
    else delete next[tag]
    set({ tagColors: next })
    if (projectId != null) {
      await window.electronAPI.db.setPref(projectId, 'tag_colors', JSON.stringify(next))
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
      templateId,
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
      rsChanges: mergeRsChanges(rsChanges, newChanges, recipes),
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
      rsChanges: mergeRsChanges(rsChanges, [
        { _id: updatedRow._id, positionTypeRef: posRef, action: 'upsert', row: updatedRow },
      ], recipes),
    })

    // Persist to SQLite
    if (templateId) {
      await window.electronAPI.db.upsertSlotMapping(projectId, templateId, slotKey, entityRef)
    }
  },

  /**
   * transformToTemplate(posRef, name, scope, slotDefs)  (T-F4)
   * Turns the active position's rows into a template where each row becomes a
   * slot. slotDefs: [{ row, section, slotLabel, exact }] — user-edited labels,
   * and per row whether it stays primed (fill-later) or is fixed to the row's
   * current ElementType ("Exact Ref").
   */
  async transformToTemplate(posRef, name, scope, slotDefs) {
    const { templates, projectId, positionUI } = get()
    const suggestedTags = positionUI[posRef]?.tags || []

    const usedKeys = new Set()
    let slotCounter = 1
    const ingredients = (slotDefs || []).map((d, idx) => {
      const row = d.row || {}
      const etRef = row.elementTypeRef || row.ElementTypeRef || null
      // slotKey from the ET ref's last segment (unique-suffixed), or sequential
      let slotKey = null
      if (etRef) {
        const seg = etRef.split(/[-_]/).pop().toUpperCase()
        if (seg && seg.length <= 12 && /^[A-Z0-9]+$/.test(seg)) slotKey = seg
      }
      if (!slotKey) slotKey = `SLOT_${slotCounter++}`
      while (usedKeys.has(slotKey)) slotKey = `${slotKey}_${slotCounter++}`
      usedKeys.add(slotKey)

      const label = (d.slotLabel || '').trim() || etRef || `Slot ${idx + 1}`
      return {
        slotKey,
        // Exact Ref slots apply as normal fixed rows — the label must be the ref
        slotLabel: d.exact ? (etRef || label) : label,
        exact: !!d.exact,
        section: d.section || 'position',
        recipeIndex: row.recipeIndex ?? row.RecipeIndex ?? idx,
        isDesign: row.isDesign || row.IsDesign || null,
        isContractItem: row.isContractItem || row.IsContractItem || null,
        isTBC: row.isTBC || row.IsTBC || null,
        isPropertiesTBC: row.isPropertiesTBC || row.IsPropertiesTBC || null,
        quantity: row.quantity ?? row.Quantity ?? null,
        dimQtyMultiplier: row.dimQtyMultiplier ?? row.DimQtyMultiplier ?? row.Dim_QuantityMultiplier ?? null,
        dimQuantity: row.dimQuantity ?? row.Dim_Quantity ?? null,
        isInteger: row.isInteger ?? row.IsInteger ?? null,
        notes: row.notes || row.Notes || null,
        fixed: !!d.exact,
      }
    })

    const template = {
      id: uuidv4(),
      name,
      scope,
      applicable_tags: JSON.stringify(Array.isArray(suggestedTags) ? suggestedTags : []),
      ingredients: JSON.stringify(ingredients),
    }
    if (scope === 'project') template.projectId = projectId

    await window.electronAPI.db.upsertTemplate(template)
    set({ templates: [...templates, { ...template, applicable_tags: suggestedTags, ingredients }] })
    return template
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
      rsChanges: mergeRsChanges(rsChanges, newChanges, recipes),
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

      set({ recipes: [...recipes, ...newRows], rsChanges: mergeRsChanges(rsChanges, newChanges, recipes), lastAddedRowId: newRows[0]?._id ?? null })
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
      rsChanges: mergeRsChanges(rsChanges, [
        { _id: newRow._id, positionTypeRef: posRef, action: 'upsert', row: newRow },
      ], recipes),
      lastAddedRowId: newRow._id,
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

    set({ recipes: [...recipes, ...newRows], rsChanges: mergeRsChanges(rsChanges, newChanges, recipes) })
    get().ensurePSRow(etRef)
    return newRows[0]
  },

  /**
   * ensurePSRow(etRef)
   * Registers a newly-used element type.
   *
   * With DB writes ON, registration happens in the DB catalogue (createElementType),
   * so no PS row is fabricated — a PS row is only created when procurement data
   * is actually entered. With DB writes OFF, fall back to the legacy behaviour:
   * a PS row is how a new ET is registered (the DB sheet being read-only there),
   * container ETs defaulting to ProductCode 'N/A'.
   * Idempotent; never records its own history (callers own that).
   */
  ensurePSRow(etRef) {
    if (!etRef) return null
    const { containerETRefs, psRows, elementTypes, dbWriteEnabled } = get()
    const exists = psRows.some(
      r => (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() === etRef.toLowerCase()
    )
    if (exists) return null

    if (dbWriteEnabled) {
      // Register in the catalogue instead of the PS sheet.
      const known = elementTypes.some(
        e => (e.ElementTypeRef || e.elementTypeRef || '').toLowerCase() === etRef.toLowerCase()
      )
      if (!known) {
        const isContainer = containerETRefs.has(etRef.toLowerCase()) || looksLikeContainer(etRef)
        get().createElementType({ ref: etRef, isCollection: isContainer })
      }
      return null
    }

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
    let valid = (parts || []).filter(p => p && p.elementTypeRef && p.section)
    if (!posRef || valid.length === 0) return

    // "Inside wrapper" auto-resolves to DL vs LIN based on the wrapper present
    // on this position (T-J1) — templates store a generic internal marker, but
    // rows must land in the wrapper the position actually has.
    const designRow = get().recipes.find(r =>
      (r.PositionTypeRef || r.positionTypeRef) === posRef &&
      (r.ContextType || r.contextType) === 'PositionType' &&
      (r.IsDesign || r.isDesign) === 'Y' &&
      (r.IsDeleted || r.isDeleted) !== 'Y'
    )
    const wrapperRef = designRow ? (designRow.ElementTypeRef || designRow.elementTypeRef || '') : ''
    if (wrapperRef) {
      const internalSection = wrapperRef.toUpperCase().includes('LIN') ? 'lin_internal' : 'dl_internal'
      valid = valid.map(p =>
        (p.section === 'dl_internal' || p.section === 'lin_internal') && p.section !== internalSection
          ? { ...p, section: internalSection }
          : p
      )
    }

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
            rsChanges: mergeRsChanges(s.rsChanges, [{ _id: existing._id, positionTypeRef: posRef, action: 'upsert', row: merged }], s.recipes),
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

  /**
   * applyCollectionBulk(posRefs, collectionId)
   * Bulk-apply a collection across many positions. Free-issue (position-level)
   * ingredients are added to every position, but "inside wrapper" ingredients
   * are added only ONCE per shared wrapper — a wrapper is a universal, shared
   * definition, and the coverage read is wrapper-aware, so a single copy makes
   * every position that uses that wrapper count as covered (avoids N duplicate
   * internal rows).
   */
  applyCollectionBulk(posRefs, collectionId) {
    const { etCollections, recipes } = get()
    const collection = etCollections.find(c => c.CollectionId === collectionId)
    if (!collection || !posRefs || posRefs.length === 0) return
    const ingredients = Array.isArray(collection.Ingredients)
      ? collection.Ingredients
      : JSON.parse(collection.Ingredients || '[]')

    const toPart = ing => ({
      section: ing.section,
      elementTypeRef: ing.ElementTypeRef || ing.slotLabel || '',
      quantity: ing.quantity ?? 1,
    })
    const positionParts = ingredients.filter(i => (i.section || 'position') === 'position').map(toPart)
    const internalParts = ingredients.filter(i => (i.section || 'position') !== 'position').map(toPart)

    // The wrapper (design element) each position uses — same rule as addConnection.
    const wrapperOf = ref => {
      const d = recipes.find(r =>
        (r.PositionTypeRef || r.positionTypeRef) === ref &&
        (r.ContextType || r.contextType) === 'PositionType' &&
        (r.IsDesign || r.isDesign) === 'Y' &&
        (r.IsDeleted || r.isDeleted) !== 'Y'
      )
      return d ? (d.ElementTypeRef || d.elementTypeRef || '').toLowerCase() : ''
    }

    const handledWrappers = new Set()
    for (const posRef of posRefs) {
      const parts = [...positionParts]
      if (internalParts.length > 0) {
        const wrapper = wrapperOf(posRef)
        // Add internals only the first time we see each shared wrapper; a
        // position with no wrapper still gets its own copy.
        if (!wrapper || !handledWrappers.has(wrapper)) {
          parts.push(...internalParts)
          if (wrapper) handledWrappers.add(wrapper)
        }
      }
      if (parts.length > 0) get().addConnection(posRef, parts)
    }
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

    set({ recipes: updatedRecipes, rsChanges: mergeRsChanges(rsChanges, newChanges, recipes) })
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
      set({ recipes: updated, rsChanges: mergeRsChanges(rsChanges, newChanges, recipes) })
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
    set({ recipes: updated, rsChanges: mergeRsChanges(rsChanges, newChanges, recipes) })
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
    set({ recipes: updated, rsChanges: mergeRsChanges(rsChanges, newChanges, recipes) })
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

    set({ recipes: updatedRecipes, rsChanges: mergeRsChanges(rsChanges, newChanges, recipes) })
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
    set({ recipes: nextRecipes, rsChanges: mergeRsChanges(cleaned, newChanges, recipes) })
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
      rsChanges: mergeRsChanges(rsChanges, newChanges, recipes),
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
      rsChanges: mergeRsChanges(rsChanges, newChanges, recipes),
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
      psChanges: mergePsChanges(psChanges, { elementTypeRef, updates, before }),
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
      psChanges: mergePsChanges(psChanges, {
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
      }),
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
    set(s => ({ recipes: [...s.recipes, ...newRows], rsChanges: mergeRsChanges(s.rsChanges, newChanges, s.recipes) }))
    get().openETRecipe(trimmedRef)
  },

  /**
   * runValidation()
   * Runs validation rules and stores results.
   */
  runValidation() {
    const { elementTypes, positionTypes, psRows, recipes, positionUI, ignoredPositionFamilies, etCollections } = get()

    const dbData = { element_types: elementTypes, position_types: positionTypes }
    const results = runValidation(dbData, psRows, recipes, positionUI, { collections: etCollections })

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
   * restorePendingChanges({ ps, rs })
   * Re-applies a persisted dirty registry from a previous session onto the
   * freshly imported rows (EXPORT_PLAN §3.1).
   */
  restorePendingChanges({ ps = [], rs = [], db = [] } = {}) {
    set(s => ({
      psChanges: ps,
      rsChanges: rs,
      dbChanges: db,
      psRows: applyPsPending(s.psRows, ps),
      recipes: applyRsPending(s.recipes, rs),
      elementTypes: applyPsPending(s.elementTypes, db),
    }))
  },

  /**
   * snapshotProject()
   * Copies the three project files + the config overlay into
   * <folder>/snapshot/<date>/ (EXPORT_PLAN §6). Returns { dir }.
   */
  async snapshotProject() {
    const { folderPath, paths, projectId, configName } = get()
    if (!folderPath || !window.electronAPI?.snapshotProject) return null
    const files = [paths.db, paths.ps, paths.rs]
      .filter(Boolean)
      .map(p => p.split(/[\\/]/).pop())
    return window.electronAPI.snapshotProject({ folderPath, files, projectId, configName })
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
   * Back-compat shim — every ET now lives in the DB catalogue, so this
   * delegates to createElementType (staging-table backed, queues a DB row when
   * DB writes are enabled).
   */
  addLocalElementType(ref, name = null, family = null) {
    return get().createElementType({ ref, name, family })
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
   * file: 'ps' | 'rs' | 'db'
   * POST /import, replaces that file's rows, and discards its dirty registry +
   * undo stacks (EXPORT_PLAN §3.7): nothing stale can be re-exported or undone.
   */
  async reloadFileFromDisk(file) {
    const { paths } = get()
    set({ isLoading: true })

    try {
      const body = { db: paths.db, ps: paths.ps, rs: paths.rs }
      const response = await axios.post(`${API}/import`, body)

      if (file === 'ps') {
        const psRows = stampIds(response.data.ps ?? [])
        set({ psRows, psChanges: [], past: [], future: [], isLoading: false, fileWatchAlert: null })
      } else if (file === 'db') {
        const dbEts = response.data.db?.element_types ?? []
        const { localElementTypes = [] } = get()
        const dbRefSet = new Set(dbEts.map(e => (e.ElementTypeRef || '').toLowerCase()))
        const merged = [...dbEts, ...localElementTypes.filter(e => !dbRefSet.has((e.ElementTypeRef || '').toLowerCase()))]
        set({ elementTypes: merged, dbChanges: [], past: [], future: [], isLoading: false, fileWatchAlert: null })
      } else {
        const recipes = stampIds(response.data.rs ?? [])
        set({ recipes, rsChanges: [], past: [], future: [], isLoading: false, fileWatchAlert: null })
      }
    } catch (err) {
      set({ isLoading: false, loadError: err.message ?? String(err) })
      throw err
    }
  },

  // -------------------------------------------------------------------------
  // DesignDB catalogue (EXPORT_PLAN §4) — writable ElementTypes
  // -------------------------------------------------------------------------

  /**
   * setDbWriteEnabled(enabled) — opt-in per project; persisted as a pref.
   */
  async setDbWriteEnabled(enabled) {
    const { projectId, elementTypes, localElementTypes, dbChanges } = get()

    // Turning writes ON promotes already-staged local ETs (created while off,
    // never written to disk) into the catalogue queue — the staging table is
    // the promotion queue (EXPORT_PLAN §4).
    let nextDbChanges = dbChanges
    if (enabled) {
      const stagedRefs = new Set(localElementTypes.map(e => (e.ElementTypeRef || '').toLowerCase()))
      for (const e of elementTypes) {
        const ref = e.ElementTypeRef || e.elementTypeRef
        const key = (ref || '').toLowerCase()
        if (!ref || !stagedRefs.has(key)) continue
        if (e._row_num != null) continue                        // already on disk
        if (nextDbChanges.some(c => (c.elementTypeRef || '').toLowerCase() === key)) continue
        nextDbChanges = mergeDbChanges(nextDbChanges, {
          elementTypeRef: ref,
          updates: {
            ElementTypeRef: ref, Name: e.Name ?? null, Description: e.Description ?? null,
            Family: e.Family ?? null, IsCollection: e.IsCollection ?? null,
            SortOrder: e.SortOrder ?? get().suggestSortOrder(e.Family ?? null),
          },
          _isNew: true,
        })
      }
    }

    set({ dbWriteEnabled: !!enabled, dbChanges: nextDbChanges })
    if (projectId != null) {
      await window.electronAPI.db.setPref(projectId, 'db_write_enabled', JSON.stringify(!!enabled))
    }
  },

  /**
   * suggestSortOrder(family) — max SortOrder within a family + 1 (EXPORT_PLAN §6 answer).
   */
  suggestSortOrder(family) {
    const { elementTypes } = get()
    let max = 0
    for (const e of elementTypes) {
      if ((e.Family || e.family || null) !== (family ?? null)) continue
      const so = Number(e.SortOrder ?? e.sortOrder ?? 0)
      if (!Number.isNaN(so)) max = Math.max(max, so)
    }
    return max + 1
  },

  /**
   * createElementType({ ref, name, description, family, isCollection })
   * Every ET lives in the DB catalogue. Adds it to the in-memory list, persists
   * to the local_element_types staging table (survives restart regardless of
   * the DB-write setting), and — when DB writes are on — queues a catalogue row.
   */
  createElementType({ ref, name = null, description = null, family = null, isCollection = false } = {}) {
    const trimmed = (ref || '').trim()
    if (!trimmed) return null
    const { elementTypes, projectId, dbWriteEnabled, dbChanges } = get()
    if (elementTypes.some(e => (e.ElementTypeRef || e.elementTypeRef || '').toLowerCase() === trimmed.toLowerCase())) return null

    const sortOrder = get().suggestSortOrder(family)
    const etObj = {
      ElementTypeRef: trimmed, Name: name, Description: description,
      Family: family, IsCollection: isCollection ? 'Y' : null,
      SortOrder: sortOrder, _row_num: null,
    }

    const patch = {
      elementTypes: [...elementTypes, etObj],
      localElementTypes: [...get().localElementTypes, etObj],
    }
    if (dbWriteEnabled) {
      patch.dbChanges = mergeDbChanges(dbChanges, {
        elementTypeRef: trimmed,
        updates: {
          ElementTypeRef: trimmed, Name: name, Description: description,
          Family: family, IsCollection: isCollection ? 'Y' : null, SortOrder: sortOrder,
        },
        _isNew: true,
      })
    }
    set(patch)

    // Persist to the staging table (best-effort)
    if (projectId != null && window.electronAPI?.db?.upsertLocalET) {
      window.electronAPI.db.upsertLocalET(projectId, {
        ref: trimmed, name, description, family, isCollection,
      })?.catch?.(() => {})
    }
    return etObj
  },

  /**
   * updateElementType(ref, updates)
   * Patch catalogue fields (Name / Description / Family / SortOrder) on an
   * EXISTING element type. createElementType covers new ones; this is the only
   * way to write, say, a Description onto one already in the catalogue.
   *
   * Like every catalogue write, the DesignDB row is only queued when DB writes
   * are enabled — otherwise the change stays project-local.
   */
  updateElementType(ref, updates = {}) {
    const trimmed = (ref || '').trim()
    if (!trimmed || Object.keys(updates).length === 0) return
    const { elementTypes, dbChanges, dbWriteEnabled, projectId } = get()
    const lc = trimmed.toLowerCase()
    const hit = elementTypes.find(e => (e.ElementTypeRef || e.elementTypeRef || '').toLowerCase() === lc)
    if (!hit) return

    // Drop no-op fields so we never register a change that writes the same value.
    const changed = {}
    for (const [k, v] of Object.entries(updates)) {
      if ((hit[k] ?? null) !== (v ?? null)) changed[k] = v
    }
    if (Object.keys(changed).length === 0) return

    get()._pushHistory()

    const patch = {
      elementTypes: elementTypes.map(e =>
        (e.ElementTypeRef || e.elementTypeRef || '').toLowerCase() === lc ? { ...e, ...changed } : e
      ),
    }
    if (dbWriteEnabled) {
      const before = {}
      for (const k of Object.keys(changed)) before[k] = hit[k] ?? null
      patch.dbChanges = mergeDbChanges(dbChanges, { elementTypeRef: trimmed, updates: changed, before })
    }
    set(patch)

    // Persist to the staging table (best-effort)
    if (projectId != null && window.electronAPI?.db?.upsertLocalET) {
      const next = { ...hit, ...changed }
      window.electronAPI.db.upsertLocalET(projectId, {
        ref: trimmed,
        name: next.Name ?? null,
        description: next.Description ?? null,
        family: next.Family ?? null,
        isCollection: next.IsCollection === 'Y',
      })?.catch?.(() => {})
    }
  },

  /**
   * renameElementType(oldRef, newRef)
   * Cascades the rename through the app's own writable files — the DB catalogue
   * row, PS EntityRef, and RS EntityRef + ContextRef (container refs). Never
   * touches any other DB sheet (Positions/Elements/LinksMap); those belong to
   * the upstream pipeline and are the user's responsibility (they were warned).
   */
  renameElementType(oldRef, newRef) {
    const from = (oldRef || '').trim()
    const to = (newRef || '').trim()
    if (!from || !to || from === to) return
    const state = get()
    if (state.elementTypes.some(e => (e.ElementTypeRef || e.elementTypeRef || '').toLowerCase() === to.toLowerCase())) return

    get()._pushHistory()
    const lc = from.toLowerCase()

    // 1. elementTypes
    const elementTypes = state.elementTypes.map(e =>
      (e.ElementTypeRef || e.elementTypeRef || '').toLowerCase() === lc
        ? { ...e, ElementTypeRef: to, elementTypeRef: to } : e
    )

    // 2. DB catalogue change (rename by writing the new Ref into the row found
    //    by the old Ref)
    let dbChanges = state.dbChanges
    if (state.dbWriteEnabled) {
      dbChanges = mergeDbChanges(dbChanges, {
        elementTypeRef: from,
        updates: { ElementTypeRef: to },
        before: { ElementTypeRef: from },
      })
    }

    // 3. PS rows — the ref IS the key, so this is a keyed rename
    let psRows = state.psRows
    let psChanges = state.psChanges
    const psHit = state.psRows.find(r => (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() === lc)
    if (psHit) {
      psRows = state.psRows.map(r =>
        (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() === lc
          ? { ...r, ElementTypeRef: to, elementTypeRef: to } : r
      )
      psChanges = mergePsChanges(psChanges, {
        elementTypeRef: from,
        updates: { ElementTypeRef: to },
        before: { ElementTypeRef: from },
      })
    }

    // 4. RS rows — EntityRef and ContextRef (container refs)
    const rsNew = []
    const recipes = state.recipes.map(r => {
      const isEntity = (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() === lc
      const isContext = (r.ContextType || r.contextType) === 'ElementType' &&
                        (r.ContextRef || r.contextRef || '').toLowerCase() === lc
      if (!isEntity && !isContext) return r
      const patch = { ...r }
      if (isEntity) { patch.ElementTypeRef = to; patch.elementTypeRef = to }
      if (isContext) { patch.ContextRef = to; patch.contextRef = to }
      rsNew.push({ _id: r._id, positionTypeRef: r.PositionTypeRef || r.positionTypeRef, action: 'upsert', row: patch })
      return patch
    })
    const rsChanges = mergeRsChanges(state.rsChanges, rsNew, state.recipes)

    set({ elementTypes, dbChanges, psRows, psChanges, recipes, rsChanges })

    // Staging table rename
    const { projectId } = state
    if (projectId != null && window.electronAPI?.db?.renameLocalET) {
      window.electronAPI.db.renameLocalET(projectId, from, to)?.catch?.(() => {})
    }
  },

  /**
   * deleteElementType(ref)
   * Soft-delete in the DB catalogue (IsDeleted='Y'); exports are gospel so the
   * row is never removed. Dangling PS/RS references are left in place and get
   * surfaced by validation, per the settled decision.
   */
  deleteElementType(ref) {
    const trimmed = (ref || '').trim()
    if (!trimmed) return
    const { elementTypes, dbChanges, dbWriteEnabled, projectId } = get()
    const lc = trimmed.toLowerCase()
    const hit = elementTypes.find(e => (e.ElementTypeRef || e.elementTypeRef || '').toLowerCase() === lc)
    if (!hit) return

    get()._pushHistory()

    const nextEts = elementTypes.map(e =>
      (e.ElementTypeRef || e.elementTypeRef || '').toLowerCase() === lc
        ? { ...e, IsDeleted: 'Y' } : e
    )
    const patch = { elementTypes: nextEts }
    if (dbWriteEnabled) {
      patch.dbChanges = mergeDbChanges(dbChanges, {
        elementTypeRef: trimmed,
        updates: { IsDeleted: 'Y' },
        before: { IsDeleted: hit.IsDeleted ?? null },
      })
    }
    set(patch)

    if (projectId != null && window.electronAPI?.db?.deleteLocalET) {
      window.electronAPI.db.deleteLocalET(projectId, trimmed)?.catch?.(() => {})
    }
  },

}))

// ---------------------------------------------------------------------------
// Pending-changes persistence (EXPORT_PLAN §3.1)
// The dirty registry survives a crash: any change to psChanges/rsChanges is
// debounced into SQLite; a restore prompt on project open offers it back.
// ---------------------------------------------------------------------------

let _pendingPersistTimer = null
useStore.subscribe((state, prev) => {
  if (state.psChanges === prev.psChanges &&
      state.rsChanges === prev.rsChanges &&
      state.dbChanges === prev.dbChanges) return
  if (typeof window === 'undefined' || !window.electronAPI?.db?.setPendingChanges) return
  clearTimeout(_pendingPersistTimer)
  _pendingPersistTimer = setTimeout(() => {
    const { projectId, psChanges, rsChanges, dbChanges } = useStore.getState()
    if (projectId == null) return
    try {
      // dbChanges piggyback in the ps blob under a reserved key so no schema
      // change is needed; restore splits them back out.
      window.electronAPI.db.setPendingChanges(projectId, psChanges, rsChanges)?.catch?.(() => {})
      if (window.electronAPI.db.setPref) {
        window.electronAPI.db.setPref(projectId, 'pending_db_changes', JSON.stringify(dbChanges))?.catch?.(() => {})
      }
    } catch { /* persistence is best-effort */ }
  }, 800)
})

export default useStore
