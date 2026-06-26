import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { Modal, Button, Badge, Spinner } from 'react-bootstrap'
import ProjectIdPill from './ProjectIdPill'

/**
 * ProjectManager — list every saved project/config, grouped by Project ID, with
 * Open · Export YAML · Wipe. Wiping deletes a config's SQLite row (cascade clears
 * its overlay data); the Excel files on disk are never touched.
 *
 * Props:
 *   show, onHide
 *   onOpen(projectRow)  — optional; lets the caller load a chosen config
 */
export default function ProjectManager({ show, onHide, onOpen }) {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(null) // id being acted on

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await window.electronAPI.db.getAllProjects()
      setProjects(rows || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { if (show) refresh() }, [show, refresh])

  // Group rows by project_number (null → "Unassigned")
  const groups = useMemo(() => {
    const map = new Map()
    for (const p of projects) {
      const key = p.project_number || 'Unassigned'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(p)
    }
    return [...map.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  }, [projects])

  async function handleExport(p) {
    setBusy(p.id)
    try {
      await window.electronAPI.db.exportConfigYAML(p.id, `${p.project_number || 'project'}-${p.config_name}`)
    } finally {
      setBusy(null)
    }
  }

  async function handleWipe(p) {
    if (!window.confirm(
      `Wipe config "${p.config_name}" (Project ${p.project_number || '—'})?\n\n` +
      `This deletes its tags, collections, slot mappings, project templates and prefs. ` +
      `The Excel files on disk are NOT affected.`
    )) return
    setBusy(p.id)
    try {
      await window.electronAPI.db.deleteProject(p.id)
      await refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 16 }}>Project manager</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {loading && <div className="text-center py-3"><Spinner animation="border" size="sm" /></div>}
        {!loading && projects.length === 0 && (
          <div className="text-muted text-center py-3">No saved projects yet.</div>
        )}
        {!loading && groups.map(([number, configs]) => (
          <div key={number} className="mb-3">
            <div className="d-flex align-items-center gap-2 mb-1">
              <ProjectIdPill number={number === 'Unassigned' ? '' : number} />
              {number === 'Unassigned' && <span className="text-muted small">Unassigned</span>}
            </div>
            <div className="ms-1">
              {configs.map(p => (
                <div key={p.id} className="d-flex align-items-center gap-2 py-2 border-bottom" style={{ fontSize: 13 }}>
                  <Badge bg="secondary">{p.config_name}</Badge>
                  <span className="text-muted text-truncate" style={{ fontSize: 11, maxWidth: 260 }} title={p.folder_path}>
                    {p.folder_path}
                  </span>
                  <div className="ms-auto d-flex gap-1">
                    {onOpen && (
                      <Button size="sm" variant="outline-primary" style={{ fontSize: 11 }}
                        disabled={busy === p.id} onClick={() => onOpen(p)}>
                        Open
                      </Button>
                    )}
                    <Button size="sm" variant="outline-secondary" style={{ fontSize: 11 }}
                      disabled={busy === p.id} onClick={() => handleExport(p)}>
                      Export YAML
                    </Button>
                    <Button size="sm" variant="outline-danger" style={{ fontSize: 11 }}
                      disabled={busy === p.id} onClick={() => handleWipe(p)}>
                      Wipe
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  )
}
