import React, { useState, useEffect } from 'react'
import {
  Container, Card, Button, Alert, Spinner, Badge, Form, ListGroup, Row, Col,
} from 'react-bootstrap'
import axios from 'axios'
import useStore from '../store/useStore'
import { deriveTagsForAll } from '../utils/tagEngine'
import { FLASK_PORT } from '../utils/constants'

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

  async function handleOpenProject() {
    if (!allFound) return
    setOpening(true)
    setOpenError(null)
    try {
      const absDbs = `${folderPath}\\${dbFilename}`
      const absPs = `${folderPath}\\${psFilename}`
      const absRs = `${folderPath}\\${rsFilename}`

      // 1. Upsert project in SQLite
      const project = await window.electronAPI.db.upsertProject({
        folderPath,
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
      const [positionUIArr, templates, slotMappings, containerETPref] = await Promise.all([
        window.electronAPI.db.getAllPositionUI(projectId),
        window.electronAPI.db.getAllTemplates(projectId),
        window.electronAPI.db.getAllSlotMappings(projectId), // already { templateId: { slotKey: ref } }
        window.electronAPI.db.getPref(projectId, 'container_ets'),
      ])

      // 4. Build positionUI map keyed by ref
      const positionUIMap = {}
      for (const row of (positionUIArr || [])) {
        positionUIMap[row.position_type_ref] = row
      }

      // 5. Derive tags
      const derivedTags = deriveTagsForAll(positionTypes)

      // 6. Merge derived tags with SQLite stored tags (SQLite wins for manual overrides)
      const mergedPositionUI = {}
      for (const pt of positionTypes) {
        const ref = pt.PositionTypeRef
        const derived = derivedTags[ref] || { tags: [], confidence: 'low', source: {} }
        const stored = positionUIMap[ref] || {}
        const isManual = stored.tag_source === 'manual'
        mergedPositionUI[ref] = {
          tags: isManual ? (stored.tags || []) : derived.tags,
          tagSource: isManual ? 'manual' : 'derived',
          tagConfidence: isManual ? stored.tag_confidence : derived.confidence,
          userNotes: stored.user_notes || null,
          derivedTags: derived.tags,
          derivedConfidence: derived.confidence,
          derivedSource: derived.source,
        }
      }

      // 8. Load everything into the store
      let manualContainerETs = []
      try { manualContainerETs = JSON.parse(containerETPref || '[]') } catch { /* ignore */ }

      loadProject({
        projectId,
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

          {detectError && <Alert variant="danger" className="py-2">{detectError}</Alert>}

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

          {/* Open Project button */}
          <div className="d-flex justify-content-end">
            <Button
              variant="primary"
              onClick={handleOpenProject}
              disabled={!allFound || opening || detecting}
            >
              {opening ? <><Spinner size="sm" animation="border" className="me-2" />Opening…</> : 'Open Project'}
            </Button>
          </div>
        </Card.Body>
      </Card>
    </Container>
  )
}
