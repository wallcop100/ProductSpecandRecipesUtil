import React, { useState } from 'react'
import { Button, Form, Badge } from 'react-bootstrap'
import MaterialIcon from './MaterialIcon'
import IconButton from './IconButton'
import { ACTION_ICONS } from '../utils/entityStyle'
import { ago } from '../utils/ago'

/**
 * ProjectCard — one config of one project, and what it actually HOLDS.
 *
 * "Am I in the right one?" is the only question this page has to answer, and the honest
 * answer is the work inside: how many positions you have tagged, and how many changes are
 * sitting there unexported. That count is the difference between opening the project you
 * spent a week on and opening an empty copy of it with the same name.
 *
 * The name is `project_label`, and it is editable here. It used to be a dead column —
 * present in the schema, read by the old manager, written by nothing, and silently
 * overwritten with the folder name on every open. You told projects apart by a folder name
 * you could not change.
 */
export default function ProjectCard({ project, onOpen, onRename, onRenameConfig, onExport, onWipe, busy }) {
  const [editing, setEditing] = useState(null)   // 'name' | 'config' | null
  const [draft, setDraft] = useState('')
  const [err, setErr] = useState(null)

  const name = project.project_label || 'Unnamed project'
  const unexported = project.unexported ?? 0

  function start(what, value) {
    setErr(null)
    setDraft(value || '')
    setEditing(what)
  }

  async function commit() {
    const value = draft.trim()
    if (!value) { setEditing(null); return }
    if (editing === 'name') {
      await onRename(project, value)
    } else if (editing === 'config') {
      const res = await onRenameConfig(project, value)
      // config_name is half of UNIQUE(folder_path, config_name) — a clash is real
      if (res && res.ok === false) { setErr(res.reason === 'taken' ? 'That config name is already used here.' : 'Could not rename.'); return }
    }
    setEditing(null)
  }

  const key = e => {
    if (e.key === 'Enter') { e.preventDefault(); commit() }
    if (e.key === 'Escape') { setEditing(null); setErr(null) }
  }

  return (
    <div className="d-flex align-items-center gap-2 px-2 py-2 rounded"
      style={{ border: '1px solid #e9ecef', background: '#fff' }}
      data-debug-id="ProjectCard">

      <MaterialIcon name="folder_open" size={16} className="text-muted" />

      <div style={{ minWidth: 0, flex: 1 }}>
        {/* the name */}
        {editing === 'name' ? (
          <Form.Control size="sm" autoFocus value={draft} style={{ fontSize: 12, maxWidth: 260 }}
            onChange={e => setDraft(e.target.value)} onKeyDown={key} onBlur={commit} />
        ) : (
          <button className="btn btn-link p-0 text-start d-inline-flex align-items-center gap-1"
            style={{ fontSize: 13, fontWeight: 600, color: '#212529', textDecoration: 'none' }}
            onClick={() => start('name', project.project_label)}
            title="Rename this project">
            <span className="text-truncate">{name}</span>
            <MaterialIcon name="edit" size={12} style={{ color: '#ced4da' }} />
          </button>
        )}

        <div className="d-flex align-items-center gap-2 mt-1" style={{ fontSize: 10 }}>
          {/* the config */}
          {editing === 'config' ? (
            <Form.Control size="sm" autoFocus value={draft} style={{ fontSize: 10, width: 120 }}
              onChange={e => setDraft(e.target.value)} onKeyDown={key} onBlur={commit} />
          ) : (
            <Badge bg="light" text="dark" style={{ cursor: 'pointer', border: '1px solid #dee2e6' }}
              onClick={() => start('config', project.config_name)}
              title="Rename this config — a config is an overlay over the same workbooks">
              {project.config_name}
            </Badge>
          )}

          <span className="text-muted">{ago(project.last_opened) || 'never opened'}</span>

          {/* the trust signal */}
          {unexported > 0 ? (
            <span className="rounded px-1" style={{ background: '#fff3cd', color: '#856404' }}
              title="Changes made here that have not been exported to Excel yet">
              {unexported} unexported
            </span>
          ) : project.taggedPositions > 0 ? (
            <span className="text-muted">{project.taggedPositions} tagged</span>
          ) : (
            <span className="text-muted fst-italic">empty</span>
          )}
        </div>

        {project.db_filename && (
          <div className="text-muted text-truncate mt-1" style={{ fontSize: 10 }} title={project.db_filename}>
            {project.db_filename}
          </div>
        )}
        {err && <div className="text-danger mt-1" style={{ fontSize: 10 }}>{err}</div>}
      </div>

      <IconButton icon="download" size={15} style={{ color: '#adb5bd', padding: 0 }}
        title="Export this config as YAML" onClick={() => onExport(project)} />
      <IconButton icon={ACTION_ICONS.delete} size={15} style={{ color: '#adb5bd', padding: 0 }}
        title="Wipe this config — the Excel files are never touched" onClick={() => onWipe(project)} />

      <Button size="sm" variant="primary" style={{ fontSize: 11, flexShrink: 0 }}
        disabled={busy} onClick={() => onOpen(project)}>
        Open
      </Button>
    </div>
  )
}
