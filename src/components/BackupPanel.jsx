import React, { useEffect, useRef, useState } from 'react'
import { Button } from 'react-bootstrap'
import MaterialIcon from './MaterialIcon'
import InfoTip from './InfoTip'
import { savePendingNow } from '../store/useStore'
import { download } from '../platform/fs'
import { makeBackup, restoreBackup, checkBackup, hasSavedWork, describeBackup } from '../platform/backup'

/**
 * BackupPanel — the start page's "your work in this browser": back all of it up to a file
 * (every project, its unexported changes, templates, tags, captures, settings) and restore
 * one. A restore replaces what this browser holds, so it says what the file contains and
 * asks first when there is something here already.
 */
export default function BackupPanel() {
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
      if (!window.confirm(ask)) return
      await restoreBackup(b)
      setMsg({ ok: true, text: 'Restored. Reloading…' })
      setTimeout(() => window.location.reload(), 800)
    } catch (err) {
      setMsg({ ok: false, text: `Could not restore: ${err.message}` })
    } finally { setBusy(false) }
  }

  return (
    <div className="mb-3" data-testid="backup-panel">
      <div className="d-flex align-items-center gap-2 text-muted" style={{ fontSize: 11 }}>
        <MaterialIcon name="save" size={13} /> Your work in this browser:
        <Button variant="link" size="sm" className="p-0" style={{ fontSize: 11 }} onClick={backUp} disabled={busy} data-testid="backup-btn">Back up to a file</Button>·
        <Button variant="link" size="sm" className="p-0" style={{ fontSize: 11 }} onClick={() => fileRef.current?.click()} disabled={busy}>Restore from a file…</Button>
        <InfoTip size={11}>
          Everything this browser holds for the app: every project you have opened, its changes not yet
          exported to the workbooks, templates, connector templates, tags, Form captures and settings.
          After a restore, pick each project&apos;s folder once more. The workbooks themselves are not in the file.
        </InfoTip>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={fromFile} data-testid="restore-input" />
      </div>
      {msg && <div className={`mt-1 ${msg.ok ? 'text-success' : 'text-danger'}`} style={{ fontSize: 11 }} data-testid="backup-msg">{msg.text}</div>}
    </div>
  )
}
