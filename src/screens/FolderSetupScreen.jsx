import React, { useState, useEffect, useCallback } from 'react'
import {
  Container, Card, Button, Alert, Spinner, Badge, Form, Row, Col,
} from 'react-bootstrap'
import useStore from '../store/useStore'
import { evaluateTags, effectiveTags, computeTagDrift } from '../utils/tagRules'
import { extractProjectId } from '../utils/projectId'
import { detectFiles as detectProjectFiles, importFiles } from '../utils/backend'
import { groupProjects, adoptPlan, pickCanonical, UNASSIGNED } from '../utils/projectIdentity'
import ProjectCard from '../components/ProjectCard'
import ProjectIdPill from '../components/ProjectIdPill'
import StageBar from '../components/StageBar'
import { ConceptHint, CONCEPTS } from '../components/ConceptCard'
import MaterialIcon from '../components/MaterialIcon'
import { ACTION_ICONS } from '../utils/entityStyle'
import { CHANGELOG, LATEST } from '../changelog'

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'

const DOCS_URL =
  'https://github.com/wallcop100/ProductSpecandRecipesUtil/blob/master/docs/ARCHITECTURE.md'

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
  // detectedFiles: { db: filename|null, ps: filename|null, rs: filename|null, all_xlsx: [] }

  const [dbFilename, setDbFilename] = useState('')
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
  const [showChangelog, setShowChangelog] = useState(false)
  const [libraryMsg, setLibraryMsg] = useState(null)

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

    const db = data.db || p.db_filename || ''
    if (!db) {
      setDetectError('No DesignDB in that folder — it may have been renamed or moved.')
      return
    }
    await doOpenProject({
      projectNumber: p.project_number || extractProjectId(db),
      configName: p.config_name || 'Base',
      override: {
        folderPath: p.folder_path,
        folderName: p.project_label || '',
        files: { db, ps: data.ps || '', rs: data.rs || '' },
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
    setDbFilename(''); setPsFilename(''); setRsFilename('')

    const data = await runDetect(key)
    if (!data) return
    const configs = await prepareIdentity(key, data.db)

    // We have opened this exact folder before. Say so — opening it again is a RESUME.
    if (known && configs.length > 0) setRecognised(configs)
  }

  async function runDetect(path) {
    setDetecting(true)
    setDetectError(null)
    try {
      const data = await detectProjectFiles(path)
      setDetectedFiles(data)
      setDbFilename(data.db || '')
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
  // Only the DesignDB is required. A missing Product Spec / Recipes Spec is a new project,
  // not a broken one: they are filled by patch scripts at export.
  const dbFound = !!dbFilename

  /** Prime the Project ID + config fields for a folder. Returns its existing configs. */
  async function prepareIdentity(folder, dbFn, preselect) {
    let configs = []
    try { configs = await window.electronAPI.db.getConfigsForFolder(folder) || [] } catch { /* none */ }
    setExistingConfigs(configs)
    const pre = configs.find(c => c.config_name === preselect) || configs[0]
    setProjectNumber(pre?.project_number || extractProjectId(dbFn || '') || '')
    setConfigName(pre?.config_name || preselect || 'Base')
    return configs
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
    if (r?.ok) setLibraryMsg(`Config exported to ${r.path}`)
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
    const absDbs = override?.files?.db ?? dbFilename
    const absPs = override?.files?.ps ?? psFilename
    const absRs = override?.files?.rs ?? rsFilename
    if (!absDbs) return

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

      // 2. Parse the three workbooks in-browser
      const { db: db_data, ps: ps_rows, rs: rs_rows } = await importFiles({ db: absDbs, ps: absPs, rs: absRs })
      const elementTypes = db_data?.element_types ?? []
      const positionTypes = db_data?.position_types ?? []
      // Collections are stripped from element_types but ARE in the master list.
      const dbCollectionRefs = db_data?.collection_refs ?? []

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
      const [positionUIArr, templates, slotMappings, containerETPref, containerExcludePref, etCollections, ignoredFamiliesPref, tagRulesPref, tagPalettePref, tagSnapshotsPref, favorites, tagColorsPref, formCapturesPref, importDraftPref] = await Promise.all([
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
      for (const pt of positionTypes) {
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
      const { drift: tagDrift, newBaselines } = computeTagDrift(positionTypes, tagRules, tagSnapshots)
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
        paths: { db: absDbs, ps: absPs, rs: absRs },
        elementTypes,
        positionTypes,
        dbCollectionRefs,
        psRows: ps_rows,
        recipes: rs_rows,
        templates,
        slotMappings,
        positionUI: mergedPositionUI,
        manualContainerETs,
        manualContainerExcludeETs,
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

          {unsupported && <Alert variant="danger" className="py-2"><strong>Unsupported browser:</strong> {unsupported}</Alert>}

          {/* The wreckage of the old identity bug: one folder, several projects. */}
          {duplicates.length > 0 && !picking && duplicates.map((group, i) => (
            <Alert key={i} variant="warning" className="py-2 px-2" style={{ fontSize: 12 }}>
              <div className="fw-semibold">
                <MaterialIcon name="warning" size={14} /> One folder, opened as {group.length} separate projects
              </div>
              <div className="text-muted mt-1" style={{ fontSize: 11 }}>
                Picking a folder used to make a fresh copy of it instead of recognising it, so your
                work was split. Merging keeps every copy that holds work — as its own config —
                and discards the empty ones. The Excel files are never touched.
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
                Browsers don’t keep folder permission between visits, so reopening asks once.
              </div>
            </div>
          )}

          {/* ── First run. State-aware, not a tour. ─────────────────────────── */}
          {!hasProjects && !picking && (
            <div className="mb-3">
              <div className="px-3 py-3 rounded" style={{ background: '#f8f9fa', border: '1px dashed #ced4da' }}>
                <div className="text-center">
                  <MaterialIcon name="menu_book" size={28} style={{ color: '#adb5bd' }} />
                  <div className="fw-semibold mt-2" style={{ fontSize: 13 }}>You build the recipes. Excel keeps the files.</div>
                </div>
                <div className="text-muted mt-2" style={{ fontSize: 11, lineHeight: 1.6 }}>
                  Three Excel workbooks describe a lighting project. This tool <strong>never writes to
                  them</strong> — it reads them, you build the recipes here, and it hands you Office
                  Script patches to paste into Excel yourself.
                </div>
                <div className="mt-2" style={{ fontSize: 11 }}>
                  <div><span className="fw-semibold">DesignDB</span> <span className="text-muted">— what exists. The only file you need to start.</span></div>
                  <div><span className="fw-semibold">Product Spec</span> <span className="text-muted">— what to buy.</span></div>
                  <div><span className="fw-semibold">Recipes Spec</span> <span className="text-muted">— what goes where.</span></div>
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
              {detecting && <Spinner size="sm" animation="border" />}
              <a className="ms-auto text-muted" style={{ fontSize: 11 }}
                href={DOCS_URL} target="_blank" rel="noreferrer">
                How this works ↗
              </a>
            </div>
          )}

          {detectError && !unsupported && <Alert variant="danger" className="py-2 mt-3">{detectError}</Alert>}

          {/* ── A folder we recognise. Resume it; do not fork it. ───────────── */}
          {recognised && picking && (
            <Alert variant="info" className="py-2 px-2 mt-3" style={{ fontSize: 12 }}>
              <div className="fw-semibold">
                <MaterialIcon name={ACTION_ICONS.complete} size={14} /> You have opened this folder before.
              </div>
              <div className="text-muted mt-1" style={{ fontSize: 11 }}>
                Opening it again resumes {recognised.length === 1 ? 'it' : 'one of its configs'} —
                your tags, templates and unexported changes are still there. Choose a different config
                name below only if you want a second, separate overlay over the same workbooks.
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
                <FileStatus label="Database (DB)" filename={dbFilename} found={!!dbFilename} badge="DB — read only" />
                <FileStatus label="Product Spec (PS)" filename={psFilename} found={!!psFilename} optional />
                <FileStatus label="Recipe Spec (RS)" filename={rsFilename} found={!!rsFilename} optional />
              </Card.Body>
            </Card>
          )}

          {/* Manual file selection. A missing DesignDB is a problem; a missing PS/RS is only
              worth mentioning in case they exist under an odd name. */}
          {picking && allXlsx.length > 0 && (!dbFilename || !psFilename || !rsFilename) && (
            <Card className={`mb-3 ${dbFound ? 'border-0 bg-light' : 'border-warning'}`}>
              <Card.Body>
                <p className={`fw-semibold mb-3 ${dbFound ? 'text-muted' : 'text-warning'}`}>
                  {dbFound
                    ? 'If a Product Spec or Recipes Spec already exists under another name, point at it:'
                    : 'Some files not detected — select manually:'}
                </p>
                <Row className="g-2">
                  {!dbFilename && (
                    <Col xs={12}>
                      <Form.Group>
                        <Form.Label className="small fw-semibold">Database (DB)</Form.Label>
                        <Form.Select size="sm" value={dbFilename} onChange={e => setDbFilename(e.target.value)}>
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
                    <Form.Group>
                      <Form.Label className="small fw-semibold mb-1">
                        Configuration
                        <span className="text-muted fw-normal ms-1" style={{ fontSize: 10 }}>
                          — an overlay over the same workbooks
                        </span>
                      </Form.Label>
                      {existingConfigs.length > 0 ? (
                        <Form.Select size="sm" value={configName} onChange={e => setConfigName(e.target.value)}>
                          {!existingConfigs.some(c => c.config_name === configName) && (
                            <option value={configName}>{configName} (new)</option>
                          )}
                          {existingConfigs.map(c => (
                            <option key={c.id} value={c.config_name}>{c.config_name}</option>
                          ))}
                        </Form.Select>
                      ) : (
                        <Form.Control size="sm" value={configName} placeholder="Base"
                          onChange={e => setConfigName(e.target.value)} />
                      )}
                    </Form.Group>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          )}

          {openError && <Alert variant="danger" className="py-2">{openError}</Alert>}

          {picking && (
            <div className="d-flex justify-content-between align-items-center">
              <Button variant="link" className="px-0" style={{ fontSize: 12 }}
                onClick={() => { setDetectedFiles(null); setRecognised(null); setFolderName('') }}>
                ← Back to projects
              </Button>
              <Button variant="primary" disabled={!dbFound || opening || detecting}
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
                if (r?.ok) setLibraryMsg(`Imported: ${r.favAdded} favourite(s) added, ${r.favSkipped} already present, ${r.tplUpserted} template(s)`)
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
