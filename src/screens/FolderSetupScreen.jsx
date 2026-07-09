import React, { useState, useEffect } from 'react'
import {
  Container, Card, Button, Alert, Spinner, Badge, Form, ListGroup, Row, Col,
} from 'react-bootstrap'
import useStore from '../store/useStore'
import { evaluateTags, effectiveTags, computeTagDrift } from '../utils/tagRules'
import { extractProjectId } from '../utils/projectId'
import { detectFiles as detectProjectFiles, importFiles } from '../utils/backend'
import ProjectConfirmModal from '../components/ProjectConfirmModal'
import ProjectManager from '../components/ProjectManager'
import MaterialIcon from '../components/MaterialIcon'
import { ACTION_ICONS } from '../utils/entityStyle'

/**
 * FolderSetupScreen
 * Step 1 — pick a folder, detect files, open the project.
 *
 * `folderPath` is an opaque directory-handle id, not an absolute path — a browser
 * never exposes one. It is the project's stable identity key; the folder's
 * display name comes from the handle.
 */
export default function FolderSetupScreen({ onProjectLoaded }) {
  const loadProject = useStore(s => s.loadProject)
  const importFromFlask = useStore(s => s.importFromFlask)

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
  const [flaskError, setFlaskError] = useState(null)
  const [folderName, setFolderName] = useState('')
  const [resumeProject, setResumeProject] = useState(null)

  // Project identity — shown inline; the ProjectConfirmModal stays reachable
  // behind the "Advanced / edit identity" link for the rare edit case.
  const [projectNumber, setProjectNumber] = useState('')
  const [configName, setConfigName] = useState('Base')
  const [existingConfigs, setExistingConfigs] = useState([])
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showManager, setShowManager] = useState(false)
  const [appVersion, setAppVersion] = useState('')
  const [libraryMsg, setLibraryMsg] = useState(null)

  useEffect(() => {
    window.electronAPI.getAppVersion?.().then(v => setAppVersion(v || '')).catch(() => {})
  }, [])

  // Folder access is a Chromium-only API. Say so up front rather than failing at
  // the picker with an opaque error.
  useEffect(() => {
    if (window.electronAPI.isFolderAccessSupported?.() === false) {
      setFlaskError('This browser cannot open a project folder. The File System Access API is required — please use Chrome or Edge.')
    }
  }, [])

  // On mount: remember the last project, but do NOT touch its folder yet. The
  // File System Access API never persists a permission grant, so reading it
  // requires a user gesture — the user clicks "Reopen" below.
  useEffect(() => {
    async function tryResume() {
      try {
        const last = await window.electronAPI.db.getLastProject()
        if (last && last.folder_path) {
          setFolderPath(last.folder_path)
          setFolderName(last.project_label || (await window.electronAPI.getFolderName?.(last.folder_path)) || '')
          setDbFilename(last.db_filename || '')
          setPsFilename(last.ps_filename || '')
          setRsFilename(last.rs_filename || '')
          setResumeProject(last)
        }
      } catch {
        // No last project — fine
      }
    }
    tryResume()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Re-grant access to the remembered folder, then detect as usual. */
  async function handleResume() {
    const last = resumeProject
    if (!last) return
    setDetectError(null)
    const granted = await window.electronAPI.requestFolderAccess?.(last.folder_path)
    if (!granted) {
      setDetectError('Access to that folder was not granted. Choose it again.')
      setResumeProject(null)
      return
    }
    setResumeProject(null)
    const data = await runDetect(last.folder_path)
    if (data) await prepareIdentity(last.folder_path, last.db_filename, last.config_name)
  }

  async function handleSelectFolder() {
    let path
    try {
      path = await window.electronAPI.openFolderDialog()
    } catch (err) {
      setDetectError(err.message)
      return
    }
    if (!path) return
    setFolderPath(path)
    setFolderName((await window.electronAPI.getFolderName?.(path)) || '')
    setResumeProject(null)
    setDetectedFiles(null)
    setDetectError(null)
    setDbFilename('')
    setPsFilename('')
    setRsFilename('')
    const data = await runDetect(path)
    if (data) await prepareIdentity(path, data.db)
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
  const allFound = dbFilename && psFilename && rsFilename

  // Prime the inline Project ID + config fields for a folder (suggested number
  // from the DB filename, configs from SQLite).
  async function prepareIdentity(folder, dbFn, preselect) {
    let configs = []
    try { configs = await window.electronAPI.db.getConfigsForFolder(folder) || [] } catch { /* none */ }
    setExistingConfigs(configs)
    const pre = configs.find(c => c.config_name === preselect) || configs[0]
    const suggestedNumber = pre?.project_number || extractProjectId(dbFn || '')
    setProjectNumber(suggestedNumber || '')
    setConfigName(pre?.config_name || preselect || 'Base')
  }

  // Actually open, with the confirmed Project ID + config name.
  async function doOpenProject({ projectNumber, configName }) {
    setShowAdvanced(false)
    if (!allFound) return
    setOpening(true)
    setOpenError(null)
    try {
      // Files are addressed by name inside the project folder's handle.
      const absDbs = dbFilename
      const absPs = psFilename
      const absRs = rsFilename

      // 1. Upsert project (config) in SQLite
      const project = await window.electronAPI.db.upsertProject({
        folderPath,
        configName,
        projectNumber,
        projectLabel: folderName || null,   // the folder's display name; folderPath is an id
        dbFilename,
        psFilename,
        rsFilename,
      })
      const projectId = project?.id

      // 2. Parse the three workbooks in-browser
      const { db: db_data, ps: ps_rows, rs: rs_rows } = await importFiles({ db: absDbs, ps: absPs, rs: absRs })
      const elementTypes = db_data?.element_types ?? []
      const positionTypes = db_data?.position_types ?? []

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

      // DB-write setting + locally-created ETs (EXPORT_PLAN §4)
      let dbWriteEnabled = false
      try {
        const raw = await window.electronAPI.db.getPref(projectId, 'db_write_enabled')
        dbWriteEnabled = raw ? JSON.parse(raw) : false
      } catch { /* default off */ }
      let localElementTypes = []
      try { localElementTypes = await window.electronAPI.db.getLocalETs(projectId) || [] } catch { /* none */ }

      // 3. Load SQLite data
      const [positionUIArr, templates, slotMappings, containerETPref, containerExcludePref, etCollections, ignoredFamiliesPref, tagRulesPref, tagPalettePref, tagSnapshotsPref, favorites, tagColorsPref, formCapturesPref] = await Promise.all([
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
      ])

      let tagColors = {}
      try { tagColors = tagColorsPref ? JSON.parse(tagColorsPref) : {} } catch { tagColors = {} }

      // The Form's spec, captured at import. null when no Form template is attached.
      let formCaptures = null
      try { formCaptures = formCapturesPref ? JSON.parse(formCapturesPref) : null } catch { formCaptures = null }

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
        folderPath,
        paths: { db: absDbs, ps: absPs, rs: absRs },
        elementTypes,
        positionTypes,
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
        dbWriteEnabled,
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
      await window.electronAPI.startWatcher({ folderPath, psFilename, rsFilename })

      onProjectLoaded()
    } catch (err) {
      setOpenError('Failed to open project: ' + (err.response?.data?.error || err.message))
    } finally {
      setOpening(false)
    }
  }

  function FileStatus({ label, filename, found, badge }) {
    return (
      <div className="d-flex align-items-center gap-2 mb-2">
        <span style={{ width: 140, fontWeight: 500 }}>{label}</span>
        {found ? (
          <>
            <MaterialIcon name={ACTION_ICONS.complete} size={16} className="text-success" title="Found" />
            <span className="text-muted small">{filename}</span>
            {badge && <Badge bg="secondary">{badge}</Badge>}
          </>
        ) : (
          <span className="text-danger small">not found</span>
        )}
      </div>
    )
  }

  return (
    <Container
      className="d-flex align-items-center justify-content-center"
      style={{ minHeight: '100vh', padding: '2rem' }}
      data-debug-id="FolderSetupScreen"
    >
      <Card style={{ width: 600, boxShadow: '0 4px 24px rgba(0,0,0,0.10)' }}>
        <Card.Body className="p-4">
          <h4 className="mb-1">Recipe Builder</h4>
          <p className="text-muted mb-4">Open a project folder containing your Excel files.</p>

          {/* Step 1: Select folder */}
          <div className="mb-4">
            <div className="d-flex gap-2 align-items-center flex-wrap">
              <Button variant="outline-primary" onClick={handleSelectFolder} disabled={detecting || opening}>
                Select Project Folder
              </Button>
              {resumeProject && (
                <Button variant="primary" onClick={handleResume} disabled={detecting || opening}
                  title="The browser must ask again for permission to read this folder">
                  <MaterialIcon name="folder_open" size={15} /> Reopen “{folderName || 'last project'}”
                </Button>
              )}
              {detecting && <Spinner size="sm" animation="border" />}
            </div>
            {folderName && !resumeProject && (
              <div className="mt-2 text-muted small" style={{ wordBreak: 'break-all' }}>
                {folderName}
              </div>
            )}
            {resumeProject && (
              <div className="mt-2 text-muted" style={{ fontSize: 11 }}>
                Your last project is remembered. Browsers don’t keep folder permission between visits,
                so reopening needs one click.
              </div>
            )}
          </div>

          {flaskError && <Alert variant="danger" className="py-2"><strong>Unsupported browser:</strong> {flaskError}</Alert>}
          {detectError && !flaskError && <Alert variant="danger" className="py-2">{detectError}</Alert>}

          {/* Step 2: File detection */}
          {detectedFiles && !detecting && (
            <Card className="mb-4 bg-light border-0">
              <Card.Body className="py-3">
                <FileStatus
                  label="Database (DB)"
                  filename={dbFilename}
                  found={!!dbFilename}
                  badge="DB — read only"
                />
                <FileStatus label="Product Spec (PS)" filename={psFilename} found={!!psFilename} />
                <FileStatus label="Recipe Spec (RS)" filename={rsFilename} found={!!rsFilename} />
              </Card.Body>
            </Card>
          )}

          {/* Manual file selection for any missing files */}
          {detectedFiles && allXlsx.length > 0 && (!dbFilename || !psFilename || !rsFilename) && (
            <Card className="mb-4 border-warning">
              <Card.Body>
                <p className="text-warning fw-semibold mb-3">Some files not detected — select manually:</p>
                <Row className="g-2">
                  {!dbFilename && (
                    <Col xs={12}>
                      <Form.Group>
                        <Form.Label className="small fw-semibold">Database (DB)</Form.Label>
                        <Form.Select
                          size="sm"
                          value={dbFilename}
                          onChange={e => setDbFilename(e.target.value)}
                        >
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
                        <Form.Select
                          size="sm"
                          value={psFilename}
                          onChange={e => setPsFilename(e.target.value)}
                        >
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
                        <Form.Select
                          size="sm"
                          value={rsFilename}
                          onChange={e => setRsFilename(e.target.value)}
                        >
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

          {/* Project identity — inline for the normal flow (T-O1) */}
          {detectedFiles && !detecting && (
            <Card className="mb-4 bg-light border-0">
              <Card.Body className="py-3">
                <Row className="g-2 align-items-end">
                  <Col xs={4}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold mb-1">Project ID</Form.Label>
                      <Form.Control
                        size="sm"
                        value={projectNumber}
                        onChange={e => setProjectNumber(e.target.value)}
                        placeholder="e.g. 4521"
                      />
                    </Form.Group>
                  </Col>
                  <Col xs={5}>
                    <Form.Group>
                      <Form.Label className="small fw-semibold mb-1">Configuration</Form.Label>
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
                        <Form.Control
                          size="sm"
                          value={configName}
                          onChange={e => setConfigName(e.target.value)}
                          placeholder="Base"
                        />
                      )}
                    </Form.Group>
                  </Col>
                  <Col xs={3} className="text-end">
                    <Button variant="link" size="sm" className="p-0" style={{ fontSize: 12 }}
                      onClick={() => setShowAdvanced(true)}>
                      Advanced / edit identity
                    </Button>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          )}

          {openError && <Alert variant="danger" className="py-2">{openError}</Alert>}

          {/* Actions */}
          <div className="d-flex justify-content-between align-items-center">
            <Button variant="link" className="px-0" onClick={() => setShowManager(true)}>
              Manage projects…
            </Button>
            <Button
              variant="primary"
              onClick={() => doOpenProject({ projectNumber: projectNumber.trim(), configName: configName.trim() || 'Base' })}
              disabled={!allFound || opening || detecting}
            >
              {opening ? <><Spinner size="sm" animation="border" className="me-2" />Opening…</> : 'Open Project'}
            </Button>
          </div>

          {/* Version + library + update check */}
          <div className="d-flex align-items-center gap-3 mt-3 pt-2 border-top">
            <span className="text-muted small">{appVersion ? `v${appVersion}` : ''}</span>
            <Button
              variant="link" size="sm" className="p-0"
              title="Export your favourites + global templates to a YAML file"
              onClick={async () => {
                const r = await window.electronAPI.libraryExportYaml?.()
                if (r?.ok) setLibraryMsg(`Library exported to ${r.path}`)
              }}
            >
              Export my library
            </Button>
            <Button
              variant="link" size="sm" className="p-0"
              title="Merge a library YAML into your favourites + global templates"
              onClick={async () => {
                const r = await window.electronAPI.libraryImportYaml?.()
                if (r?.ok) setLibraryMsg(`Imported: ${r.favAdded} favourite(s) added, ${r.favSkipped} already present, ${r.tplUpserted} template(s)`)
                else if (r?.error) setLibraryMsg(`Import failed: ${r.error}`)
              }}
            >
              Import library
            </Button>
            <Button
              variant="link" size="sm" className="p-0 ms-auto"
              onClick={() => window.electronAPI.updater?.checkNow?.()}
            >
              Check for updates
            </Button>
          </div>
          {libraryMsg && <div className="text-muted small mt-1">{libraryMsg}</div>}
        </Card.Body>
      </Card>

      {/* Advanced identity editing — updates the inline fields, doesn't open */}
      <ProjectConfirmModal
        show={showAdvanced}
        suggestedNumber={projectNumber}
        existingConfigs={existingConfigs}
        preselectConfig={configName}
        onCancel={() => setShowAdvanced(false)}
        onConfirm={({ projectNumber: pn, configName: cn }) => {
          setProjectNumber(pn)
          setConfigName(cn)
          setShowAdvanced(false)
        }}
      />

      <ProjectManager
        show={showManager}
        onHide={() => setShowManager(false)}
      />
    </Container>
  )
}
