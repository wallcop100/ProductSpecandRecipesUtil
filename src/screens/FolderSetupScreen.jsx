import InfoTip from '../components/InfoTip'
import React, { useState, useEffect, useCallback } from 'react'
import {
  Container, Card, Button, Alert, Spinner, Badge, Form, Row, Col,
} from 'react-bootstrap'
import useStore from '../store/useStore'
import { evaluateTags, effectiveTags, computeTagDrift, recipeTagIndex, withRecipeFields } from '../utils/tagRules'
import { extractProjectId } from '../utils/projectId'
import { detectFiles as detectProjectFiles, importFiles } from '../utils/backend'
import { harvestExemplars } from '../utils/styleLibrary'
import { harvestPatterns } from '../utils/recipePatterns'
import { groupProjects, adoptPlan, pickCanonical, UNASSIGNED, dbFilesOf, pickDbs } from '../utils/projectIdentity'
import ProjectCard from '../components/ProjectCard'
import ProjectIdPill from '../components/ProjectIdPill'
import StageBar from '../components/StageBar'
import { ConceptHint, CONCEPTS } from '../components/ConceptCard'
import MaterialIcon from '../components/MaterialIcon'
import { ACTION_ICONS } from '../utils/entityStyle'
import { CHANGELOG, LATEST } from '../changelog'
import BackupPanel from '../components/BackupPanel'

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'


/**
 * FolderSetupScreen — the landing page, and the only way into the app.
 *
 * It IS the project list. Its whole job is to get you back into the RIGHT project with
 * proof it is the right one, and to tell a newcomer what this tool is without a tour.
 *
 * `folderPath` is an opaque directory-handle id, not an absolute path — a browser never
 * exposes one. It is the project's identity key, which is why `pickDirectory` must now
 * RECOGNISE a folder it already holds (fs.js): minting a fresh id per pick meant re-picking
 * a project forked a second, empty copy of it, and your work appeared to vanish.
 */
export default function FolderSetupScreen({ onProjectLoaded }) {
  const loadProject = useStore(s => s.loadProject)

  const [folderPath, setFolderPath] = useState('')
  const [detectedFiles, setDetectedFiles] = useState(null)
  // detectedFiles: { db: filename|null, dbs: [filename], ps: filename|null, rs: filename|null, all_xlsx: [] }

  // The DesignDB(s) this config reads. Several when a project is split across workbooks
  // (one per building) that share one Product Spec and Recipes Spec.
  const [dbFilenames, setDbFilenames] = useState([])
  const [psFilename, setPsFilename] = useState('')
  const [rsFilename, setRsFilename] = useState('')

  const [detecting, setDetecting] = useState(false)
  const [detectError, setDetectError] = useState(null)
  const [opening, setOpening] = useState(false)
  const [openError, setOpenError] = useState(null)
  const [unsupported, setUnsupported] = useState(null)
  const [folderName, setFolderName] = useState('')

  // Every project + what it HOLDS (unexported changes, tagged positions). This page used to
  // show 5 recents and a modal "manager" whose Open button was never even wired up.
  const [summaries, setSummaries] = useState([])
  const [duplicates, setDuplicates] = useState([])     // [[folderKey, folderKey], …]
  const [recognised, setRecognised] = useState(null)   // configs of a folder we already had

  const [projectNumber, setProjectNumber] = useState('')
  const [configName, setConfigName] = useState('Base')
  const [existingConfigs, setExistingConfigs] = useState([])
  const [addingSetup, setAddingSetup] = useState(false)
  // A config YAML being restored: { data, path }. Applied to the config as it opens.
  const [restore, setRestore] = useState(null)
  // A backup read on the landing page, waiting for its folder to be opened.
  const [pendingRestore, setPendingRestore] = useState(null)
  const [showChangelog, setShowChangelog] = useState(false)
  const [libraryMsg, setLibraryMsg] = useState(null)
  const [styleSummary, setStyleSummary] = useState(null)

  // Folder access is a Chromium-only API. Say so up front rather than failing at the picker.
  useEffect(() => {
    if (window.electronAPI.isFolderAccessSupported?.() === false) {
      setUnsupported('This browser cannot open a project folder. The File System Access API is required — please use Chrome or Edge.')
    }
  }, [])

  /**
   * On mount: list the projects and what is in them — but do NOT touch any folder. The File
   * System Access API never persists a permission grant, so reading one needs a user gesture.
   */
  const refresh = useCallback(async () => {
    try {
      setSummaries(await window.electronAPI.db.getProjectSummaries?.() || [])
    } catch { /* first run: nothing saved */ }
    try {
      setDuplicates(await window.electronAPI.findDuplicateFolders?.() || [])
    } catch { /* no handles, or a browser that cannot compare them */ }
    try {
      setStyleSummary(await window.electronAPI.db.getStyleSummary?.() || null)
    } catch { /* no library yet */ }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const groups = groupProjects(summaries)
  const hasProjects = summaries.length > 0

  // --- opening ---------------------------------------------------------------

  /**
   * Open a saved project. `requestFolderAccess` MUST be the first await: Chrome only honours
   * a permission request inside the user gesture that triggered it, and any earlier await
   * ends that gesture. Do not reorder this.
   */
  async function handleOpenSaved(p) {
    setDetectError(null)
    const granted = await window.electronAPI.requestFolderAccess?.(p.folder_path)
    if (!granted) {
      setDetectError(`Access to “${p.project_label || 'that folder'}” was not granted. Choose it again.`)
      return
    }
    setFolderPath(p.folder_path)
    setFolderName(p.project_label || '')

    const data = await runDetect(p.folder_path)
    if (!data) return

    // The config's OWN DesignDB list, not whatever sorts first in the folder.
    // A saved name counts as present if the folder lists it at all — detection can fail to
    // classify a workbook that is really there. A folder that lists nothing tells us
    // nothing, so the saved names are tried as they are.
    const saved = dbFilesOf(p)
    const listed = [...new Set([...(data.dbs || []), ...(data.all_xlsx || [])])]
    const { use, missing } = saved.length && listed.length
      ? pickDbs(saved, listed)
      : { use: saved.length ? saved : (data.dbs?.length ? data.dbs : (data.db ? [data.db] : [])), missing: [] }
    const dbs = use
    if (dbs.length === 0) {
      setDetectError(saved.length
        ? `This config's DesignDB${saved.length > 1 ? 's are' : ' is'} not in that folder: ${saved.join(', ')}. It may have been renamed or moved.`
        : 'No DesignDB in that folder — it may have been renamed or moved.')
      return
    }
    if (missing.length && !window.confirm(
      `This config also reads ${missing.join(', ')}, which is no longer in the folder.\n\n` +
      `Open with ${dbs.join(', ')} only? Positions placed only in the missing file will look unused.`
    )) return
    await doOpenProject({
      projectNumber: p.project_number || extractProjectId(dbs[0]),
      configName: p.config_name || 'Base',
      override: {
        folderPath: p.folder_path,
        folderName: p.project_label || '',
        files: { dbs, ps: data.ps || '', rs: data.rs || '' },
      },
    })
  }

  /**
   * Pick a folder. If we RECOGNISE it, we resume it — we do not fork a second copy of it.
   */
  async function handleSelectFolder() {
    let picked
    try {
      picked = await window.electronAPI.openFolderDialog()
    } catch (err) {
      setDetectError(err.message)
      return
    }
    if (!picked) return

    const { key, name, known } = picked
    setFolderPath(key)
    setFolderName(name || (await window.electronAPI.getFolderName?.(key)) || '')
    setDetectedFiles(null)
    setDetectError(null)
    setRecognised(null)
    setDbFilenames([]); setPsFilename(''); setRsFilename('')
    setRestore(null)
    setAddingSetup(false)

    const data = await runDetect(key)
    if (!data) return
    const configs = await prepareIdentity(key, data.db, pendingRestore?.data?.project?.config_name, data.dbs)
    if (pendingRestore) { applyRestoreData(pendingRestore.data, pendingRestore.path, data); setPendingRestore(null) }

    // We have opened this exact folder before. Say so — opening it again is a RESUME.
    if (known && configs.length > 0) setRecognised(configs)
  }

  async function runDetect(path) {
    setDetecting(true)
    setDetectError(null)
    try {
      const data = await detectProjectFiles(path)
      setDetectedFiles(data)
      setDbFilenames(data.dbs?.length ? data.dbs : (data.db ? [data.db] : []))
      setPsFilename(data.ps || '')
      setRsFilename(data.rs || '')
      return data
    } catch (err) {
      setDetectError('Could not detect files: ' + err.message)
      return null
    } finally {
      setDetecting(false)
    }
  }

  const allXlsx = detectedFiles?.all_xlsx || []
  const detectedDbs = detectedFiles?.dbs || []
  // Only the DesignDB is required. A missing Product Spec / Recipes Spec is a new project,
  // not a broken one: they are filled by patch scripts at export.
  const dbFound = dbFilenames.length > 0
  // A new setup needs a name of its own; an empty or taken one would silently resume another.
  const setupNameProblem = !addingSetup ? null
    : !configName.trim() ? 'Name the new setup'
    : existingConfigs.some(c => c.config_name.toLowerCase() === configName.trim().toLowerCase()) ? 'That setup already exists'
    : null

  /** Prime the Project ID + config fields for a folder. Returns its existing configs. */
  async function prepareIdentity(folder, dbFn, preselect, detected = []) {
    let configs = []
    try { configs = await window.electronAPI.db.getConfigsForFolder(folder) || [] } catch { /* none */ }
    setExistingConfigs(configs)
    const pre = configs.find(c => c.config_name === preselect) || configs[0]
    setProjectNumber(pre?.project_number || extractProjectId(dbFn || '') || '')
    setConfigName(pre?.config_name || preselect || 'Base')
    if (pre && detected.length) setDbFilenames(pickDbs(dbFilesOf(pre), detected).use)
    return configs
  }

  /** Switching config re-ticks the DesignDBs that config was saved with. */
  function chooseConfig(name) {
    setConfigName(name)
    const c = existingConfigs.find(x => x.config_name === name)
    if (c && detectedDbs.length) setDbFilenames(pickDbs(dbFilesOf(c), detectedDbs).use)
  }

  function toggleDb(name) {
    setDbFilenames(prev => prev.includes(name)
      ? prev.filter(f => f !== name)
      // keep folder order, so the first-listed DB (which wins a ref clash) is stable
      : detectedDbs.filter(f => f === name || prev.includes(f)))
  }

  /**
   * Restore from a backup (config YAML). It names the setup, the project number and which
   * workbooks it pairs — so it fills the form in; nothing is written until Open.
   * `detected` is the folder's detection result (passed in: state may not have caught up).
   */
  function applyRestoreData(data, path, detected) {
    const files = data.files || {}
    const wantDbs = files.design_dbs || []
    const { use, missing } = pickDbs(wantDbs, detected?.dbs || [])
    if (wantDbs.length) setDbFilenames(use)
    const xlsx = detected?.all_xlsx || []
    const has = f => f && xlsx.includes(f)
    if (has(files.product_spec)) setPsFilename(files.product_spec)
    if (has(files.recipes_spec)) setRsFilename(files.recipes_spec)
    if (data.project?.project_number) setProjectNumber(String(data.project.project_number))
    if (data.project?.config_name) setConfigName(data.project.config_name)
    const absent = [
      ...missing,
      ...[files.product_spec, files.recipes_spec].filter(f => f && !has(f)),
    ]
    setRestore({ data, path, absent })
    setOpenError(null)
  }

  /** Restore, with a folder already open. `readConfigYAML` must be the first await. */
  async function handleRestorePick() {
    const r = await window.electronAPI.db.readConfigYAML?.()
    if (!r?.ok) {
      if (r?.error) setOpenError(`Could not read that backup: ${r.error}`)
      return
    }
    applyRestoreData(r.data, r.path, detectedFiles)
  }

  /**
   * Restore from the landing page, before any folder is open: read the backup first, then
   * ask for its folder (a browser cannot find a folder by name), then fill everything in.
   */
  async function handleRestoreFirst() {
    const r = await window.electronAPI.db.readConfigYAML?.()
    if (!r?.ok) {
      if (r?.error) setDetectError(`Could not read that backup: ${r.error}`)
      return
    }
    setPendingRestore({ data: r.data, path: r.path })
    setDetectError(null)
  }

  // --- managing (this page IS the manager now) --------------------------------

  async function handleRename(p, label) {
    await window.electronAPI.db.renameProject?.(p.id, label)
    await refresh()
  }

  async function handleRenameConfig(p, name) {
    const res = await window.electronAPI.db.renameConfig?.(p.id, name)
    await refresh()
    return res
  }

  async function handleExport(p) {
    const r = await window.electronAPI.db.exportConfigYAML?.(
      p.id, `${p.project_number || 'project'}-${p.config_name}`
    )
    if (r?.ok) setLibraryMsg(`Backup saved to ${r.path}`)
  }

  async function handleWipe(p) {
    const name = p.project_label || p.folder_path
    if (!window.confirm(
      `Wipe “${name}” (${p.config_name})?\n\n` +
      'Its tags, templates and unexported changes are deleted. The Excel files are never touched.'
    )) return
    await window.electronAPI.db.deleteProject?.(p.id)
    await refresh()
  }

  /**
   * Collapse a set of project rows that turned out to be the same physical folder.
   *
   * A re-key, never an overlay merge: every overlay table hangs off `project_id`, which does
   * not change, so a stray's tags and unexported changes follow it and it simply becomes
   * another config of the one project. See adoptPlan.
   */
  async function handleMergeDuplicates(group) {
    const rows = summaries.filter(s => group.includes(s.folder_path))
    const canonical = pickCanonical(rows)
    if (!canonical) return

    const plan = adoptPlan(canonical, rows.filter(r => r.id !== canonical.id))
    const kept = plan.filter(a => a.action === 'rekey').length
    const dropped = plan.filter(a => a.action === 'delete').length
    if (!window.confirm(
      `Merge into “${canonical.project_label || 'this project'}”?\n\n` +
      (kept ? `${kept} copy with work in it becomes another config — nothing is lost.\n` : '') +
      (dropped ? `${dropped} empty copy is discarded.\n` : '') +
      '\nThe Excel files are never touched.'
    )) return

    for (const a of plan) {
      if (a.action === 'delete') {
        await window.electronAPI.db.deleteProject?.(a.id)
      } else {
        await window.electronAPI.db.adoptDuplicateProject?.(a.id, canonical.folder_path, a.configName)
      }
    }
    // Drop the now-unused handles so the folder stops looking duplicated.
    for (const key of group) {
      if (key !== canonical.folder_path) await window.electronAPI.forgetFolder?.(key)
    }
    await refresh()
  }

  /**
   * Actually open, with the confirmed Project ID + config name.
   *
   * `override` exists because a one-click open has to detect and open in the same tick, and
   * the filenames `runDetect` just set are not readable from state yet.
   */
  async function doOpenProject({ projectNumber, configName, override }) {
    const folder = override?.folderPath ?? folderPath
    const label = override?.folderName ?? folderName

    // Files are addressed by name inside the project folder's handle. Only the
    // DesignDB is required — see importFiles.
    const absDbs = override?.files?.dbs ?? dbFilenames
    const absPs = override?.files?.ps ?? psFilename
    const absRs = override?.files?.rs ?? rsFilename
    if (!absDbs.length) return
    const restoring = override ? null : restore

    setOpening(true)
    setOpenError(null)
    try {
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
        if (rep?.pendingSkipped) {
          window.alert(
            `This config already has unexported changes, so the ${rep.pendingSkipped} in ` +
            `${restoring.path} were not restored. Everything else was.`
          )
        }
        setRestore(null)
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
        await window.electronAPI.db.recordStyleExemplars?.(harvestExemplars({
          elementTypes, psRows: ps_rows, source: [projectNumber, label].filter(Boolean).join(' ') || folder,
        }))
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
        connectorFamilies: (() => { try { return JSON.parse(connectorFamiliesPref || '[]') || [] } catch { return [] } })(),
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

      // 8b. Offer to restore unexported changes from a previous session
      // (EXPORT_PLAN §3.1). Declining discards them permanently.
      if (pendingChanges) {
        const n = (pendingChanges.ps?.length || 0) + (pendingChanges.rs?.length || 0) + (pendingChanges.db?.length || 0)
        if (window.confirm(`You have ${n} unexported change${n === 1 ? '' : 's'} from a previous session.\n\nRestore them?`)) {
          useStore.getState().restorePendingChanges(pendingChanges)
        } else {
          try {
            await window.electronAPI.db.clearPendingChanges(projectId)
            await window.electronAPI.db.setPref(projectId, 'pending_db_changes', '[]')
          } catch { /* best-effort */ }
        }
      }

      // 9. Start file watcher
      await window.electronAPI.startWatcher({ folderPath: folder, psFilename: absPs, rsFilename: absRs })

      onProjectLoaded()
    } catch (err) {
      setOpenError('Failed to open project: ' + (err.response?.data?.error || err.message))
    } finally {
      setOpening(false)
    }
  }

  /** `optional` files are absent on a new project. That is a fact, not an error. */
  function FileStatus({ label, filename, found, badge, optional }) {
    return (
      <div className="d-flex align-items-center gap-2 mb-2">
        <span style={{ width: 140, fontWeight: 500 }}>{label}</span>
        {found ? (
          <>
            <MaterialIcon name={ACTION_ICONS.complete} size={16} className="text-success" title="Found" />
            <span className="text-muted small">{filename}</span>
            {badge && <Badge bg="secondary">{badge}</Badge>}
          </>
        ) : optional ? (
          <span className="small" style={{ color: '#856404' }}>
            <MaterialIcon name="add_circle" size={14} /> not found — starts empty, and your export
            patches it in
          </span>
        ) : (
          <span className="text-danger small">not found</span>
        )}
      </div>
    )
  }

  const picking = !!detectedFiles && !opening

  return (
    <Container className="d-flex justify-content-center" style={{ padding: '2rem 1rem' }}
      data-debug-id="FolderSetupScreen">
      <Card style={{ width: 640, boxShadow: '0 4px 24px rgba(0,0,0,0.10)' }}>
        <Card.Body className="p-4">

          <div className="d-flex align-items-baseline gap-2">
            <h4 className="mb-1">Recipe Builder</h4>
            <button className="btn btn-link p-0 ms-auto text-muted" style={{ fontSize: 11 }}
              onClick={() => setShowChangelog(v => !v)} title="What changed recently">
              v{APP_VERSION} · what’s new {showChangelog ? '▴' : '▾'}
            </button>
          </div>
          {/* One line proves at a glance whether a new build has loaded past a stale cache. */}
          <div className="text-muted mb-2" style={{ fontSize: 11 }}>{LATEST.date} · {LATEST.note}</div>
          {showChangelog && (
            <div className="mb-3 px-2 py-2 rounded" style={{ background: '#f8f9fa', border: '1px solid #e9ecef', maxHeight: 180, overflowY: 'auto' }}>
              {CHANGELOG.map((c, i) => (
                <div key={i} className="text-muted" style={{ fontSize: 10, lineHeight: 1.6 }}>
                  <span className="fw-semibold">{c.date}</span> · {c.note}
                </div>
              ))}
            </div>
          )}

          <BackupPanel />

          {unsupported && <Alert variant="danger" className="py-2"><strong>Unsupported browser:</strong> {unsupported}</Alert>}

          {/* The wreckage of the old identity bug: one folder, several projects. */}
          {duplicates.length > 0 && !picking && duplicates.map((group, i) => (
            <Alert key={i} variant="warning" className="py-2 px-2" style={{ fontSize: 12 }}>
              <div className="fw-semibold">
                <MaterialIcon name="warning" size={14} /> One folder, opened as {group.length} separate projects{' '}
                <InfoTip label="Why this happened">
                  Picking a folder used to make a fresh copy of it instead of recognising it, so your
                  work was split. Merging keeps every copy that holds work, as its own setup, and
                  discards the empty ones. The Excel files are never touched.
                </InfoTip>
              </div>
              <Button size="sm" variant="warning" className="mt-2" style={{ fontSize: 11 }}
                onClick={() => handleMergeDuplicates(group)}>
                Merge into one project
              </Button>
            </Alert>
          ))}

          {/* ── The project list. This page IS the manager. ─────────────────── */}
          {hasProjects && !picking && (
            <div className="mb-3">
              {groups.map(g => (
                <div key={g.number} className="mb-3">
                  <div className="d-flex align-items-center gap-2 mb-1">
                    {g.number === UNASSIGNED
                      ? <span className="text-muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>No project number</span>
                      : <ProjectIdPill number={g.number} size="md" />}
                    <span className="text-muted" style={{ fontSize: 10 }}>
                      {g.projects.length} config{g.projects.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="d-flex flex-column gap-1">
                    {g.projects.map(p => (
                      <ProjectCard
                        key={p.id}
                        project={p}
                        busy={opening || detecting}
                        onOpen={handleOpenSaved}
                        onRename={handleRename}
                        onRenameConfig={handleRenameConfig}
                        onExport={handleExport}
                        onWipe={handleWipe}
                      />
                    ))}
                  </div>
                </div>
              ))}
              <div className="text-muted" style={{ fontSize: 10 }}>
                <InfoTip size={11} label="Why it asks for access">
                  Browsers don’t keep folder permission between visits, so reopening a project asks once.
                </InfoTip>
              </div>
            </div>
          )}

          {/* ── First run. State-aware, not a tour. ─────────────────────────── */}
          {!hasProjects && !picking && (
            <div className="mb-3">
              <div className="px-3 py-3 rounded" style={{ background: '#f8f9fa', border: '1px dashed #ced4da' }}>
                <div className="text-center">
                  <MaterialIcon name="menu_book" size={28} style={{ color: '#adb5bd' }} />
                  <div className="fw-semibold mt-2" style={{ fontSize: 13 }}>
                    You build the recipes. Excel keeps the files.{' '}
                    <InfoTip label="How it works">
                      Three Excel workbooks describe a lighting project. This tool <strong>never writes
                      to them</strong>: it reads them, you build the recipes here, and it hands you Office
                      Script patches to paste into Excel yourself.
                    </InfoTip>
                  </div>
                </div>
                <div className="mt-2 d-flex justify-content-center gap-3" style={{ fontSize: 11 }}>
                  <span title="What exists. The only file you need to start."><MaterialIcon name="storage" size={13} /> DesignDB</span>
                  <span title="What to buy."><MaterialIcon name="shopping_cart" size={13} /> Product Spec</span>
                  <span title="What goes where."><MaterialIcon name="account_tree" size={13} /> Recipes Spec</span>
                </div>
              </div>

              <div className="mt-3">
                <StageBar current={1} />
              </div>

              <div className="d-flex align-items-center gap-2 mt-3 text-muted" style={{ fontSize: 11 }}>
                <span>The ideas that bite:</span>
                <span className="d-inline-flex align-items-center gap-1">
                  nothing is saved <ConceptHint concept={CONCEPTS.READONLY} size={12} title="Why is there no Save button?" />
                </span>
                <span className="d-inline-flex align-items-center gap-1">
                  ExtRef <ConceptHint concept={CONCEPTS.EXTREF} size={12} title="Why does the Form say C01 when the recipe lives on C01r?" />
                </span>
                <span className="d-inline-flex align-items-center gap-1">
                  wrappers <ConceptHint concept={CONCEPTS.WRAPPER} size={12} title="What is a wrapper, and why is it shared?" />
                </span>
                <span className="d-inline-flex align-items-center gap-1">
                  intent vs fact <ConceptHint concept={CONCEPTS.INTENT} size={12} title="The Form asks. The recipe has." />
                </span>
              </div>
            </div>
          )}

          {/* ── Pick a folder ───────────────────────────────────────────────── */}
          {!picking && (
            <div className="d-flex gap-2 align-items-center flex-wrap">
              <Button variant={hasProjects ? 'outline-primary' : 'primary'}
                disabled={detecting || opening || !!unsupported}
                onClick={handleSelectFolder}>
                <MaterialIcon name="folder_open" size={15} />{' '}
                {hasProjects ? 'Open a folder…' : 'Open the folder with your DesignDB →'}
              </Button>
              <Button variant="link" size="sm" className="px-1" style={{ fontSize: 12 }}
                disabled={detecting || opening || !!unsupported} onClick={handleRestoreFirst}
                title="A backup (.config.yaml) holds a project's file choice, tags, templates and unexported work — for another machine or cleared browser storage">
                <MaterialIcon name="settings_backup_restore" size={14} /> Restore from backup…
              </Button>
              {detecting && <Spinner size="sm" animation="border" />}
              <span className="ms-auto text-muted d-inline-flex align-items-center gap-1" style={{ fontSize: 11 }}>
                How this works
                <InfoTip label="How this works">
                  <strong>1.</strong> Open the folder holding the project&apos;s DesignDB, Product Spec and Recipes workbooks.{' '}
                  <strong>2.</strong> Import the Form&apos;s product codes, then build recipes from it in the builder.{' '}
                  <strong>3.</strong> Your work is kept in this browser until you <em>Export changes</em>: that gives
                  patch scripts to run on the workbooks. Nothing here ever writes to them directly.
                </InfoTip>
              </span>
            </div>
          )}

          {pendingRestore && !picking && (
            <Alert variant="info" className="py-2 px-2 mt-3" style={{ fontSize: 12 }} data-testid="pending-restore">
              <div className="fw-semibold">
                <MaterialIcon name="settings_backup_restore" size={14} /> Backup of {pendingRestore.data.project?.project_number || 'a project'}
                {pendingRestore.data.project?.config_name ? ` · ${pendingRestore.data.project.config_name}` : ''} read.
              </div>
              <div className="text-muted mt-1" style={{ fontSize: 11 }}>
                Now open its folder{pendingRestore.data.project?.project_label ? <> (<strong>{pendingRestore.data.project.project_label}</strong>)</> : ''} —
                the files, Project ID and setup are filled in from the backup.
              </div>
              <div className="d-flex gap-2 mt-2">
                <Button size="sm" variant="primary" onClick={handleSelectFolder}>
                  <MaterialIcon name="folder_open" size={14} /> Open its folder…
                </Button>
                <Button size="sm" variant="link" className="text-muted" onClick={() => setPendingRestore(null)}>Cancel</Button>
              </div>
            </Alert>
          )}

          {detectError && !unsupported && <Alert variant="danger" className="py-2 mt-3">{detectError}</Alert>}

          {/* ── A folder we recognise. Resume it; do not fork it. ───────────── */}
          {recognised && picking && (
            <Alert variant="info" className="py-2 px-2 mt-3" style={{ fontSize: 12 }}>
              <div className="fw-semibold">
                <MaterialIcon name={ACTION_ICONS.complete} size={14} /> You have opened this folder before.
              </div>
              <div className="text-muted mt-1" style={{ fontSize: 11 }}>
                Opening it again resumes {recognised.length === 1 ? 'it' : 'one of its setups'} —
                your tags, templates and unexported changes are still there.
              </div>
            </Alert>
          )}

          {folderName && picking && (
            <div className="mt-3 text-muted small" style={{ wordBreak: 'break-all' }}>{folderName}</div>
          )}

          {/* Step 2: File detection */}
          {picking && (
            <Card className="my-3 bg-light border-0">
              <Card.Body className="py-3">
                {detectedDbs.length > 1 ? (
                  <div className="mb-2">
                    <div className="d-flex align-items-center gap-2">
                      <span style={{ width: 140, fontWeight: 500 }}>Database (DB)</span>
                      <span className="text-muted small">{detectedDbs.length} found — tick each one this config covers</span>
                      <Badge bg="secondary">DB — read only</Badge>
                    </div>
                    <div className="ms-1 mt-1" data-testid="db-picker">
                      {detectedDbs.map(f => (
                        <Form.Check key={f} id={`db-${f}`} type="checkbox" className="small"
                          label={f} checked={dbFilenames.includes(f)} onChange={() => toggleDb(f)} />
                      ))}
                    </div>
                    <div className="text-muted mt-1" style={{ fontSize: 10 }}>
                      Ticked DesignDBs are read as one project: a position placed in any of them
                      counts as used. They share the Product Spec and Recipes Spec below.
                    </div>
                  </div>
                ) : (
                  <FileStatus label="Database (DB)" filename={dbFilenames[0]} found={dbFound} badge="DB — read only" />
                )}
                <FileStatus label="Product Spec (PS)" filename={psFilename} found={!!psFilename} optional />
                <FileStatus label="Recipe Spec (RS)" filename={rsFilename} found={!!rsFilename} optional />
              </Card.Body>
            </Card>
          )}

          {/* Manual file selection. A missing DesignDB is a problem; a missing PS/RS is only
              worth mentioning in case they exist under an odd name. */}
          {picking && allXlsx.length > 0 && (!dbFound || !psFilename || !rsFilename) && (
            <Card className={`mb-3 ${dbFound ? 'border-0 bg-light' : 'border-warning'}`}>
              <Card.Body>
                <p className={`fw-semibold mb-3 ${dbFound ? 'text-muted' : 'text-warning'}`}>
                  {dbFound
                    ? 'If a Product Spec or Recipes Spec already exists under another name, point at it:'
                    : 'Some files not detected — select manually:'}
                </p>
                <Row className="g-2">
                  {!dbFound && detectedDbs.length <= 1 && (
                    <Col xs={12}>
                      <Form.Group>
                        <Form.Label className="small fw-semibold">Database (DB)</Form.Label>
                        <Form.Select size="sm" value={dbFilenames[0] || ''}
                          onChange={e => setDbFilenames(e.target.value ? [e.target.value] : [])}>
                          <option value="">— select file —</option>
                          {allXlsx.map(f => <option key={f} value={f}>{f}</option>)}
                        </Form.Select>
                      </Form.Group>
                    </Col>
                  )}
                  {!psFilename && (
                    <Col xs={12}>
                      <Form.Group>
                        <Form.Label className="small fw-semibold">Product Spec (PS)</Form.Label>
                        <Form.Select size="sm" value={psFilename} onChange={e => setPsFilename(e.target.value)}>
                          <option value="">— select file —</option>
                          {allXlsx.map(f => <option key={f} value={f}>{f}</option>)}
                        </Form.Select>
                      </Form.Group>
                    </Col>
                  )}
                  {!rsFilename && (
                    <Col xs={12}>
                      <Form.Group>
                        <Form.Label className="small fw-semibold">Recipe Spec (RS)</Form.Label>
                        <Form.Select size="sm" value={rsFilename} onChange={e => setRsFilename(e.target.value)}>
                          <option value="">— select file —</option>
                          {allXlsx.map(f => <option key={f} value={f}>{f}</option>)}
                        </Form.Select>
                      </Form.Group>
                    </Col>
                  )}
                </Row>
              </Card.Body>
            </Card>
          )}

          {/* Project identity */}
          {picking && (
            <Card className="mb-3 bg-light border-0">
              <Card.Body className="py-3">
                <Row className="g-2 align-items-end">
                  <Col xs={5}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold mb-1">Project ID</Form.Label>
                      <Form.Control size="sm" value={projectNumber} placeholder="e.g. 4521"
                        onChange={e => setProjectNumber(e.target.value)} />
                    </Form.Group>
                  </Col>
                  <Col xs={7}>
                    {/* A SETUP is its own choice of workbooks, tags, templates and unexported
                        work over this folder — e.g. Main House and Guest House sharing one
                        Product Spec. Most folders have one, so it only shows when it matters. */}
                    {addingSetup || existingConfigs.length > 1 ? (
                      <Form.Group>
                        <Form.Label className="small fw-semibold mb-1">
                          Setup
                          <span className="text-muted fw-normal ms-1" style={{ fontSize: 10 }}>
                            — its own workbooks, tags and unexported work
                          </span>
                        </Form.Label>
                        {addingSetup ? (
                          <Form.Control size="sm" value={configName} placeholder="e.g. Guest House" autoFocus
                            aria-label="New setup name" onChange={e => setConfigName(e.target.value)} />
                        ) : (
                          <Form.Select size="sm" value={configName} aria-label="Setup" onChange={e => chooseConfig(e.target.value)}>
                            {existingConfigs.map(c => (
                              <option key={c.id} value={c.config_name}>{c.config_name}</option>
                            ))}
                          </Form.Select>
                        )}
                      </Form.Group>
                    ) : (
                      <div className="small text-muted pb-1" data-testid="single-setup">
                        {existingConfigs.length === 1 ? <>Resumes <strong>{configName}</strong>. </> : null}
                        <Button variant="link" size="sm" className="p-0 align-baseline" style={{ fontSize: 11 }}
                          title="A second setup over the same folder: its own DesignDB choice, tags, templates and unexported work"
                          onClick={() => { setAddingSetup(true); setConfigName('') }}>
                          + New setup of this folder
                        </Button>
                      </div>
                    )}
                    {addingSetup && (
                      <Button variant="link" size="sm" className="p-0" style={{ fontSize: 11 }}
                        onClick={() => { setAddingSetup(false); chooseConfig(existingConfigs[0]?.config_name || 'Base') }}>
                        Cancel new setup
                      </Button>
                    )}
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          )}

          {picking && (
            restore ? (
              <Alert variant="info" className="py-2 px-2" style={{ fontSize: 12 }}>
                <div className="fw-semibold">
                  <MaterialIcon name="settings_backup_restore" size={14} /> Restoring from {restore.path}
                </div>
                <div className="text-muted mt-1" style={{ fontSize: 11 }}>
                  Files, Project ID and setup are filled in from it. Its tags, templates and
                  unexported changes are merged into this setup when you open it.
                </div>
                {restore.absent.length > 0 && (
                  <div className="text-danger mt-1" style={{ fontSize: 11 }}>
                    Not in this folder: {restore.absent.join(', ')}
                  </div>
                )}
                <Button variant="link" size="sm" className="p-0 mt-1" style={{ fontSize: 11 }}
                  onClick={() => setRestore(null)}>
                  Don’t restore
                </Button>
              </Alert>
            ) : (
              <div className="mb-3">
                <Button variant="link" size="sm" className="p-0" style={{ fontSize: 11 }}
                  title="Recover a setup from a backup you saved earlier (another machine, or cleared browser storage)"
                  onClick={handleRestorePick}>
                  <MaterialIcon name="settings_backup_restore" size={13} /> Restore from backup…
                </Button>
              </div>
            )
          )}

          {openError && <Alert variant="danger" className="py-2">{openError}</Alert>}

          {picking && (
            <div className="d-flex justify-content-between align-items-center">
              <Button variant="link" className="px-0" style={{ fontSize: 12 }}
                onClick={() => { setDetectedFiles(null); setRecognised(null); setFolderName(''); setRestore(null) }}>
                ← Back to projects
              </Button>
              <Button variant="primary" disabled={!dbFound || opening || detecting || setupNameProblem}
                title={setupNameProblem || undefined}
                onClick={() => doOpenProject({ projectNumber: projectNumber.trim(), configName: configName.trim() || 'Base' })}>
                {opening ? <><Spinner size="sm" animation="border" className="me-2" />Opening…</> : 'Open Project'}
              </Button>
            </div>
          )}

          {/* Library — favourites + global templates, shared across every project. */}
          <div className="d-flex align-items-center gap-3 mt-3 pt-2 border-top">
            <Button variant="link" size="sm" className="p-0" style={{ fontSize: 11 }}
              title="Export your favourites + global templates to a YAML file"
              onClick={async () => {
                const r = await window.electronAPI.libraryExportYaml?.()
                if (r?.ok) setLibraryMsg(`Library exported to ${r.path}`)
              }}>
              Export my library
            </Button>
            <Button variant="link" size="sm" className="p-0" style={{ fontSize: 11 }}
              title="Merge a library YAML into your favourites + global templates"
              onClick={async () => {
                const r = await window.electronAPI.libraryImportYaml?.()
                if (r?.ok) {
                  setLibraryMsg(`Imported: ${r.favAdded} favourite(s) added, ${r.favSkipped} already present, ${r.tplUpserted} template(s), ${r.stylesAdded ?? 0} style example(s)`)
                  refresh()
                }
                else if (r?.error) setLibraryMsg(`Import failed: ${r.error}`)
              }}>
              Import library
            </Button>
          </div>
          {libraryMsg && <div className="text-muted small mt-1">{libraryMsg}</div>}
        </Card.Body>
      </Card>
    </Container>
  )
}
