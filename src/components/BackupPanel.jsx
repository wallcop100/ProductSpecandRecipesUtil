import React, { useEffect, useRef, useState } from 'react'
import { Dropdown } from 'react-bootstrap'
import MaterialIcon from './MaterialIcon'
import { savePendingNow } from '../store/useStore'
import { download } from '../platform/fs'
import { makeBackup, restoreBackup, checkBackup, hasSavedWork, describeBackup } from '../platform/backup'
import { askConfirm } from './ConfirmHost'

/**
 * BackupPanel — the start page's "your work in this browser": back all of it up to a file
 * (every project, its unexported changes, templates, tags, captures, settings) and restore
 * one. A restore replaces what this browser holds, so it says what the file contains and
 * asks first when there is something here already.
 *
 * One quiet menu: `children` are the page's other backup items (one project's settings, the
 * library), so every way of saving or bringing back work lives in the same place.
 */
export default function BackupPanel({ children }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)       // { ok, text }
  const [empty, setEmpty] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => { hasSavedWork().then(has => setEmpty(!has)) }, [])

  async function backUp() {
    setBusy(true)
    try {
      try { await savePendingNow() } catch { /* nothing open */ }
      const b = await makeBackup({ api: window.electronAPI?.db })
      download(`recipe-builder-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(b), 'application/json')
      setMsg({ ok: true, text: `Backed up ${describeBackup(b)}. The file is in your downloads.` })
    } catch (e) {
      setMsg({ ok: false, text: `Could not back up: ${e.message}` })
    } finally { setBusy(false) }
  }

  async function fromFile(e) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setBusy(true)
    try {
      const b = JSON.parse(await f.text())
      const bad = checkBackup(b)
      if (bad) { setMsg({ ok: false, text: bad }); return }
      const when = b.createdAt ? new Date(b.createdAt).toLocaleString() : 'an unknown date'
      const ask = `Restore ${describeBackup(b)} from ${when}?` + (empty ? '' : '\n\nThis REPLACES everything saved in this browser now.')
      if (!(await askConfirm(ask))) return
      await restoreBackup(b)
      setMsg({ ok: true, text: 'Restored. Reloading…' })
      setTimeout(() => window.location.reload(), 800)
    } catch (err) {
      setMsg({ ok: false, text: `Could not restore: ${err.message}` })
    } finally { setBusy(false) }
  }

  return (
    <div data-testid="backup-panel">
      <Dropdown>
        <Dropdown.Toggle variant="link" size="sm" className="p-0 text-muted" style={{ fontSize: 11 }} disabled={busy}>
          <MaterialIcon name="save" size={13} /> Backup &amp; restore
        </Dropdown.Toggle>
        <Dropdown.Menu style={{ fontSize: 12 }}>
          <Dropdown.Item onClick={backUp} data-testid="backup-btn"
            title="Everything this browser holds for the app: every project, its changes not yet exported, templates, connector templates, tags, Form captures and settings. The workbooks themselves are not in the file.">
            <MaterialIcon name="save" size={14} /> Back up all my work
          </Dropdown.Item>
          <Dropdown.Item onClick={() => fileRef.current?.click()}
            title="Replaces what this browser holds. After a restore, pick each project's folder once more.">
            <MaterialIcon name="restore" size={14} /> Restore all my work…
          </Dropdown.Item>
          {children && <Dropdown.Divider />}
          {children}
        </Dropdown.Menu>
      </Dropdown>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={fromFile} data-testid="restore-input" />
      {msg && <div className={`mt-1 ${msg.ok ? 'text-success' : 'text-danger'}`} style={{ fontSize: 11 }} data-testid="backup-msg">{msg.text}</div>}
    </div>
  )
}
