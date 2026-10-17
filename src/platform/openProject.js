/**
 * openProject.js — open a project config: the whole sequence the start screen runs, as one
 * function, so anything that drives the app (the screen, or a headless runner) opens a project
 * the same way.
 *
 * Upserts the config, merges a config file being restored, parses the workbooks (through the
 * `importFiles` it is given — the project folder, in a browser), pulls the project's
 * configuration, reads every saved preference, works out tags and drift, loads the store, and
 * brings back unexported changes. → { projectId, project, restored } — `restored` is how many
 * unexported changes came back.
 *
 * Not here: UI state, the file watcher and navigation — the caller's business.
 */
import useStore from '../store/useStore'
import { DEFAULT_CONNECTOR_FAMILIES } from '../utils/connectorGroups'
import { evaluateTags, effectiveTags, computeTagDrift, recipeTagIndex, withRecipeFields } from '../utils/tagRules'
import { harvestExemplars } from '../utils/styleLibrary'
import { harvestPatterns } from '../utils/recipePatterns'
import { getCompanion } from './companion'
import { sweepCodes } from './retired'
import { pullConfig } from './projectConfig'
import { primeLearning } from './learning'

export async function openProject({
  projectNumber, configName, folderPath: folder, folderName: label, files, restoring = null,
  importFiles, onRestoreSkipped,
}) {
  const absDbs = files?.dbs ?? []
  const absPs = files?.ps ?? ''
  const absRs = files?.rs ?? ''
  const { loadProject } = useStore.getState()

  // 1. Upsert project (config) in SQLite
  const project = await window.electronAPI.db.upsertProject({
    folderPath: folder,
    configName,
    projectNumber,
    projectLabel: label || null,   // the folder's display name; a rename is kept (see upsertProject)
    dbFilename: absDbs,
    psFilename: absPs,
    rsFilename: absRs,
  })
  const projectId = project?.id

  // 1b. Restoring from a config YAML: merge it into this config before anything is read
  // back, so the tags, templates and unexported changes below are the restored ones.
  if (restoring && projectId != null) {
    const rep = await window.electronAPI.db.applyConfigData(projectId, restoring.data)
    if (rep?.pendingSkipped) onRestoreSkipped?.(rep.pendingSkipped, restoring.path)
  }

  // 2. Parse the three workbooks in-browser
  const { db: db_data, ps: ps_rows, rs: rs_rows } = await importFiles({ db: absDbs, ps: absPs, rs: absRs })
  const elementTypes = db_data?.element_types ?? []
  const positionTypes = db_data?.position_types ?? []
  // Physical instances (may be empty on older DesignDBs) — feeds the "no positions placed"
  // signal for retiring unused ElementTypes.
  const positions = db_data?.positions ?? []
  // Collections are stripped from element_types but ARE in the master list.
  const dbCollectionRefs = db_data?.collection_refs ?? []

  // Feed the tool-wide style library: how this project named its products' ElementTypes.
  // Best-effort and silent — it only ever helps a later import seed refs.
  try {
    const exemplars = harvestExemplars({
      elementTypes, psRows: ps_rows, source: [projectNumber, label].filter(Boolean).join(' ') || folder,
    })
    await window.electronAPI.db.recordStyleExemplars?.(exemplars)
    // …and, beside a companion, to the library other projects learn from; and ask which of
    // this spec's codes have since been replaced. Both silent; both need nothing back.
    if (projectNumber) getCompanion().then(api => api?.shareLibrary?.(projectNumber, exemplars))
    // What the project says as it opens is the baseline; only later edits are corrections.
    primeLearning(projectNumber, { elementTypes, psRows: ps_rows ?? [] })
    sweepCodes((ps_rows ?? []).filter(r => (r.IsDeleted || r.isDeleted) !== 'Y')
      .map(r => ({ code: r.ProductCode || r.productCode, manufacturer: r.Manufacturer || r.manufacturer })))
  } catch { /* the library is a convenience, never a reason not to open */ }
  // …and how it built its recipes, by kind: precedent for the next project's first recipes.
  try {
    const source = [projectNumber, label].filter(Boolean).join(' ') || folder
    await window.electronAPI.db.recordRecipePatterns?.(source,
      harvestPatterns({ recipes: rs_rows ?? [], positionTypes, elementTypes }))
  } catch { /* same: never a reason not to open */ }

  // Read any crash-surviving pending changes BEFORE loadProject resets the
  // queues (the persistence subscription would otherwise overwrite them).
  let pendingChanges = null
  try {
    const pending = await window.electronAPI.db.getPendingChanges(projectId)
    let db = []
    try {
      const raw = await window.electronAPI.db.getPref(projectId, 'pending_db_changes')
      db = raw ? JSON.parse(raw) : []
    } catch { /* none */ }
    if (pending && ((pending.ps?.length || 0) + (pending.rs?.length || 0) + (db?.length || 0)) > 0) {
      pendingChanges = { ...pending, db }
    }
  } catch { /* none */ }

  // Locally-created ElementTypes: minted here, not yet in the DesignDB workbook.
  let localElementTypes = []
  try { localElementTypes = await window.electronAPI.db.getLocalETs(projectId) || [] } catch { /* none */ }

  // The project's configuration as last saved anywhere under this project number (beside
  // a companion; silent, bounded, configuration only — see platform/projectConfig.js).
  try { await pullConfig(projectId, projectNumber) } catch { /* open with what is here */ }

  // 3. Load SQLite data
  const [positionUIArr, templates, slotMappings, containerETPref, containerExcludePref, etCollections, ignoredFamiliesPref, tagRulesPref, tagPalettePref, tagSnapshotsPref, favorites, tagColorsPref, formCapturesPref, importDraftPref, connectorPinsPref, connectorFamiliesPref, connectorExcludesPref, specCheckSkipPref] = await Promise.all([
    window.electronAPI.db.getAllPositionUI(projectId),
    window.electronAPI.db.getAllTemplates(projectId),
    window.electronAPI.db.getAllSlotMappings(projectId), // already { templateId: { slotKey: ref } }
    window.electronAPI.db.getPref(projectId, 'container_ets'),
    window.electronAPI.db.getPref(projectId, 'container_ets_exclude'),
    window.electronAPI.db.getAllCollections(projectId),
    window.electronAPI.db.getPref(projectId, 'ignored_position_families'),
    window.electronAPI.db.getPref(projectId, 'tag_rules'),
    window.electronAPI.db.getPref(projectId, 'tag_palette'),
    window.electronAPI.db.getPref(projectId, 'tag_snapshots'),
    window.electronAPI.db.getFavorites(),
    window.electronAPI.db.getPref(projectId, 'tag_colors'),
    window.electronAPI.db.getPref(projectId, 'form_captures'),
    window.electronAPI.db.getPref(projectId, 'form_import_draft'),
    window.electronAPI.db.getPref(projectId, 'connector_pins'),
    window.electronAPI.db.getPref(projectId, 'connector_families'),
    window.electronAPI.db.getPref(projectId, 'connector_excludes'),
    window.electronAPI.db.getPref(projectId, 'spec_check_skip'),
  ])

  let tagColors = {}
  try { tagColors = tagColorsPref ? JSON.parse(tagColorsPref) : {} } catch { tagColors = {} }

  // The Form's spec, captured at import. null when no Form template is attached.
  let formCaptures = null
  try { formCaptures = formCapturesPref ? JSON.parse(formCapturesPref) : null } catch { formCaptures = null }

  // An unfinished import, offered as "Resume?" on the import screen.
  let importDraft = null
  try { importDraft = importDraftPref ? JSON.parse(importDraftPref) : null } catch { importDraft = null }

  // 3b. Tag rules + palette. Seed from bundled defaults the first time a
  // config is opened, then persist so each config owns its own copy.
  let tagRules = []
  let tagPalette = []
  try { tagRules = tagRulesPref ? JSON.parse(tagRulesPref) : null } catch { tagRules = null }
  try { tagPalette = tagPalettePref ? JSON.parse(tagPalettePref) : null } catch { tagPalette = null }
  if (tagRules == null || tagPalette == null) {
    const defaults = await window.electronAPI.db.getDefaultTags()
    if (tagRules == null) {
      tagRules = (defaults.rules || []).map((r, i) => ({ id: `r${i}`, enabled: true, ...r }))
      await window.electronAPI.db.setPref(projectId, 'tag_rules', JSON.stringify(tagRules))
    }
    if (tagPalette == null) {
      tagPalette = defaults.palette || []
      await window.electronAPI.db.setPref(projectId, 'tag_palette', JSON.stringify(tagPalette))
    }
  }

  // 4. Build positionUI map keyed by ref
  const positionUIMap = {}
  for (const row of (positionUIArr || [])) {
    positionUIMap[row.position_type_ref] = row
  }

  // 5/6. Compute effective tags: rule tags ∪ per-position add − remove
  const mergedPositionUI = {}
  // Rules may read what a position's recipe holds (maker, code, ElementType, family).
  const tagIndex = recipeTagIndex({ recipes: rs_rows ?? [], psRows: ps_rows ?? [], elementTypes })
  const tagSubjects = positionTypes.map(pt => withRecipeFields(pt, tagIndex))
  for (const pt of tagSubjects) {
    const ref = pt.PositionTypeRef
    const stored = positionUIMap[ref] || {}
    const ruleTags = evaluateTags(pt, tagRules)
    const tagAdd = stored.tag_add || []
    const tagRemove = stored.tag_remove || []
    mergedPositionUI[ref] = {
      tags: effectiveTags(ruleTags, tagAdd, tagRemove),
      ruleTags,
      tagAdd,
      tagRemove,
      userNotes: stored.user_notes || null,
      ignored: !!stored.ignored,
    }
  }

  // 7. Tag drift: compare current rule output against the accepted baseline.
  // Baseline positions seen for the first time (no drift), and flag positions
  // whose rule-relevant DB data changed since the last accepted state.
  let tagSnapshots = {}
  try { tagSnapshots = tagSnapshotsPref ? JSON.parse(tagSnapshotsPref) : {} } catch { tagSnapshots = {} }
  const { drift: tagDrift, newBaselines } = computeTagDrift(tagSubjects, tagRules, tagSnapshots)
  if (Object.keys(newBaselines).length > 0) {
    tagSnapshots = { ...tagSnapshots, ...newBaselines }
    await window.electronAPI.db.setPref(projectId, 'tag_snapshots', JSON.stringify(tagSnapshots))
  }

  // 8. Load everything into the store
  let manualContainerETs = []
  try { manualContainerETs = JSON.parse(containerETPref || '[]') } catch { /* ignore */ }

  let manualContainerExcludeETs = []
  try { manualContainerExcludeETs = JSON.parse(containerExcludePref || '[]') } catch { /* ignore */ }

  let ignoredPositionFamilies = []
  try { ignoredPositionFamilies = JSON.parse(ignoredFamiliesPref || '[]') } catch { /* ignore */ }

  loadProject({
    projectId,
    projectNumber,
    configName,
    projectLabel: project?.project_label ?? null,
    folderPath: folder,
    paths: { db: absDbs[0], dbs: absDbs, ps: absPs, rs: absRs },
    elementTypes,
    positionTypes,
    positions,
    dbCollectionRefs,
    psRows: ps_rows,
    recipes: rs_rows,
    templates,
    slotMappings,
    positionUI: mergedPositionUI,
    manualContainerETs,
    manualContainerExcludeETs,
    connectorPins: (() => { try { return JSON.parse(connectorPinsPref || '{}') || {} } catch { return {} } })(),
    // Never chosen: the company family for connector parts is ticked (M9KG9A).
    connectorFamilies: (() => { try { return connectorFamiliesPref == null ? [...DEFAULT_CONNECTOR_FAMILIES] : (JSON.parse(connectorFamiliesPref) || []) } catch { return [...DEFAULT_CONNECTOR_FAMILIES] } })(),
    connectorExcludes: (() => { try { return JSON.parse(connectorExcludesPref || '{}') || {} } catch { return {} } })(),
    specCheckSkip: (() => { try { return specCheckSkipPref ? JSON.parse(specCheckSkipPref) : undefined } catch { return undefined } })(),
    etCollections: etCollections ?? [],
    favorites: favorites ?? [],
    ignoredPositionFamilies,
    tagRules,
    tagPalette,
    tagSnapshots,
    tagDrift,
    tagColors,
    formCaptures,
    importDraft,
    localElementTypes,
  })

  // 8b. Unexported changes from a previous session come back on their own: they were
  // saved as you worked (GS9LXJ). A one-click Cancel used to throw them away for good;
  // discarding is now a deliberate act on the notice the builder shows.
  // They meet the workbooks as they are now (reconcile.js): whatever a patch put in while the app
  // was closed leaves the queue here instead of being pushed back in.
  let restored = 0
  try {
    const raw = projectId != null ? await window.electronAPI.db.getPref(projectId, 'patch_batch') : null
    const batch = raw ? JSON.parse(raw) : null
    if (batch?.n) useStore.setState({ patchBatch: batch })
  } catch { /* no batch */ }
  if (pendingChanges) {
    const counts = useStore.getState().restorePendingChanges(pendingChanges)
    const sum = k => Object.values(counts).reduce((n, c) => n + c[k], 0)
    restored = sum('pending') + sum('conflicts')
    if (restored || sum('applied')) useStore.setState({ restoredNotice: { n: restored, applied: sum('applied'), at: Date.now() } })
  }

  return { projectId, project, restored }
}
