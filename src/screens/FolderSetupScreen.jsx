import React, { useState, useEffect } from 'react'
import {
  Container, Card, Button, Alert, Spinner, Badge, Form, ListGroup, Row, Col,
} from 'react-bootstrap'
import axios from 'axios'
import useStore from '../store/useStore'
import { evaluateTags, effectiveTags, computeTagDrift } from '../utils/tagRules'
import { FLASK_PORT } from '../utils/constants'
import { extractProjectId } from '../utils/projectId'
import ProjectConfirmModal from '../components/ProjectConfirmModal'
import ProjectManager from '../components/ProjectManager'

const API = `http://localhost:${FLASK_PORT}`

/**
 * FolderSetupScreen
 * Step 1 — pick a folder, detect files, open the project.
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

  // Project confirm modal context: { suggestedNumber, existingConfigs, preselectConfig } | null
  const [confirmCtx, setConfirmCtx] = useState(null)
  const [showManager, setShowManager] = useState(false)

  // Listen for Flask startup status from main process
  useEffect(() => {
    window.electronAPI.onFlaskStatus(({ ready }) => {
      if (!ready) {
        setFlaskError('The backend service failed to start. Try restarting the application. Check the application logs for details.')
      }
    })
  }, [])

  // On mount: try to resume last project
  useEffect(() => {
    async function tryResume() {
      try {
        const last = await window.electronAPI.db.getLastProject()
        if (last && last.folder_path) {
          setFolderPath(last.folder_path)
          setDbFilename(last.db_filename || '')
          setPsFilename(last.ps_filename || '')
          setRsFilename(last.rs_filename || '')
          // Auto-detect for this folder
          await runDetect(last.folder_path)
          // Prompt to confirm Project ID + config on startup
          await requestOpen({ folder: last.folder_path, dbFn: last.db_filename, preselect: last.config_name })
        }
      } catch {
        // No last project — fine
      }
    }
    tryResume()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSelectFolder() {
    const path = await window.electronAPI.openFolderDialog()
    if (!path) return
    setFolderPath(path)
    setDetectedFiles(null)
    setDetectError(null)
    setDbFilename('')
    setPsFilename('')
    setRsFilename('')
    await runDetect(path)
  }

  async function runDetect(path) {
    setDetecting(true)
    setDetectError(null)
    try {
      const resp = await axios.get(`${API}/detect-files`, { params: { folder: path } })
      const data = resp.data
      setDetectedFiles(data)
      setDbFilename(data.db || '')
      setPsFilename(data.ps || '')
      setRsFilename(data.rs || '')
    } catch (err) {
      setDetectError('Could not detect files: ' + (err.response?.data?.error || err.message))
    } finally {
      setDetecting(false)
    }
  }

  const allXlsx = detectedFiles?.all_xlsx || []
  const allFound = dbFilename && psFilename && rsFilename

  // Step 1 of opening: gather confirm context (suggested ID + existing configs)
  // and show the confirm modal. Accepts explicit values for the resume path,
  // where component state may not have flushed yet.
  async function requestOpen({ folder, dbFn, preselect } = {}) {
    const useFolder = folder || folderPath
    const useDbFn = dbFn || dbFilename
    if (!useFolder || !(dbFn ? true : allFound)) {
      if (!allFound && !dbFn) return
    }
    let existingConfigs = []
    try { existingConfigs = await window.electronAPI.db.getConfigsForFolder(useFolder) || [] } catch { /* none */ }
    const fromExisting = existingConfigs.find(c => c.config_name === preselect)?.project_number
    const suggestedNumber = fromExisting || extractProjectId(useDbFn)
    setConfirmCtx({ suggestedNumber, existingConfigs, preselectConfig: preselect || 'Base' })
  }

  // Step 2: actually open, with the confirmed Project ID + config name.
  async function doOpenProject({ projectNumber, configName }) {
    setConfirmCtx(null)
    if (!allFound) return
    setOpening(true)
    setOpenError(null)
    try {
      const absDbs = `${folderPath}\\${dbFilename}`
      const absPs = `${folderPath}\\${psFilename}`
      const absRs = `${folderPath}\\${rsFilename}`

      // 1. Upsert project (config) in SQLite
      const project = await window.electronAPI.db.upsertProject({
        folderPath,
        configName,
        projectNumber,
        projectLabel: null,
        dbFilename,
        psFilename,
        rsFilename,
      })
      const projectId = project?.id

      // 2. Import via Flask
      const resp = await axios.post(`${API}/import`, {
        db: absDbs, ps: absPs, rs: absRs,
      })
      const { db: db_data, ps: ps_rows, rs: rs_rows } = resp.data
      const elementTypes = db_data?.element_types ?? []
      const positionTypes = db_data?.position_types ?? []

      // 3. Load SQLite data
      const [positionUIArr, templates, slotMappings, containerETPref, etCollections, ignoredFamiliesPref, tagRulesPref, tagPalettePref, tagSnapshotsPref] = await Promise.all([
        window.electronAPI.db.getAllPositionUI(projectId),
        window.electronAPI.db.getAllTemplates(projectId),
        window.electronAPI.db.getAllSlotMappings(projectId), // already { templateId: { slotKey: ref } }
        window.electronAPI.db.getPref(projectId, 'container_ets'),
        window.electronAPI.db.getAllCollections(projectId),
        window.electronAPI.db.getPref(projectId, 'ignored_position_families'),
        window.electronAPI.db.getPref(projectId, 'tag_rules'),
        window.electronAPI.db.getPref(projectId, 'tag_palette'),
        window.electronAPI.db.getPref(projectId, 'tag_snapshots'),
      ])

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
        etCollections: etCollections ?? [],
        ignoredPositionFamilies,
        tagRules,
        tagPalette,
        tagSnapshots,
        tagDrift,
      })

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
            <span className="text-success fw-semibold">✓</span>
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
    >
      <Card style={{ width: 600, boxShadow: '0 4px 24px rgba(0,0,0,0.10)' }}>
        <Card.Body className="p-4">
          <h4 className="mb-1">Recipe Builder</h4>
          <p className="text-muted mb-4">Open a project folder containing your Excel files.</p>

          {/* Step 1: Select folder */}
          <div className="mb-4">
            <div className="d-flex gap-2 align-items-center">
              <Button variant="outline-primary" onClick={handleSelectFolder} disabled={detecting || opening}>
                Select Project Folder
              </Button>
              {detecting && <Spinner size="sm" animation="border" />}
            </div>
            {folderPath && (
              <div className="mt-2 text-muted small" style={{ wordBreak: 'break-all' }}>
                {folderPath}
              </div>
            )}
          </div>

          {flaskError && <Alert variant="danger" className="py-2"><strong>Backend unavailable:</strong> {flaskError}</Alert>}
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

          {openError && <Alert variant="danger" className="py-2">{openError}</Alert>}

          {/* Actions */}
          <div className="d-flex justify-content-between align-items-center">
            <Button variant="link" className="px-0" onClick={() => setShowManager(true)}>
              Manage projects…
            </Button>
            <Button
              variant="primary"
              onClick={() => requestOpen()}
              disabled={!allFound || opening || detecting}
            >
              {opening ? <><Spinner size="sm" animation="border" className="me-2" />Opening…</> : 'Open Project'}
            </Button>
          </div>
        </Card.Body>
      </Card>

      <ProjectConfirmModal
        show={!!confirmCtx}
        suggestedNumber={confirmCtx?.suggestedNumber}
        existingConfigs={confirmCtx?.existingConfigs || []}
        preselectConfig={confirmCtx?.preselectConfig}
        onCancel={() => setConfirmCtx(null)}
        onConfirm={doOpenProject}
      />

      <ProjectManager
        show={showManager}
        onHide={() => setShowManager(false)}
      />
    </Container>
  )
}
