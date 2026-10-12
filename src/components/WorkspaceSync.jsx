import React, { useEffect, useState } from 'react'
import { Button, Form } from 'react-bootstrap'
import MaterialIcon from './MaterialIcon'
import InfoTip from './InfoTip'
import CopyButton from './CopyButton'
import { useCompanion } from '../platform/companion'
import { describeBackup } from '../platform/backup'
import * as ws from '../platform/workspace'

/**
 * WorkspaceSync — the start page's "keep my work on this server", shown only when the app
 * is served next to a companion that offers workspaces (see platform/workspace.js).
 *
 * Every choice that replaces work says so and asks first. A conflict stops auto-sync and
 * waits for a person: whichever copy loses is gone.
 */
export default function WorkspaceSync() {
  const api = useCompanion()
  const [status, setStatus] = useState(ws.currentStatus())
  const [cur, setCur] = useState(ws.current())
  const [link, setLink] = useState(ws.linkedKey())
  const [linked, setLinked] = useState(null)     // what the opened link holds

  useEffect(() => ws.subscribe((s, st) => { setStatus(s); setCur(st ? { ...st } : null) }), [])
  useEffect(() => {
    if (!api?.workspaces || !link) return
    ws.peek(link).then(setLinked)
  }, [api, link])

  if (!api?.workspaces) return null

  async function loadFrom(key, what) {
    if (!window.confirm(`Load ${what}?\n\nThis REPLACES everything saved in this browser now.`)) return
    if (await ws.pull(key)) {
      ws.dismissLink()
      setTimeout(() => window.location.reload(), 500)
    }
  }

  const when = status.at ? new Date(status.at).toLocaleTimeString() : null
  const line = {
    saving: 'Saving…', loading: 'Loading…',
    idle: when ? `Saved to the server at ${when}` : 'Connected',
    conflict: 'This workspace was saved from somewhere else since this browser last synced.',
    error: `Not synced: ${status.error}`,
  }[status.phase]

  return (
    <div className="mb-3" data-testid="workspace-sync" style={{ fontSize: 11 }}>
      {link && (
        <div className="alert alert-info py-1 px-2 mb-2" data-testid="workspace-link">
          <MaterialIcon name="link" size={13} /> You opened a workspace link
          {linked ? <> holding {describeBackup(linked)}.</> : '.'}{' '}
          <Button size="sm" variant="primary" style={{ fontSize: 11, padding: '0 6px' }}
            disabled={!linked} onClick={() => loadFrom(link, 'the linked workspace')}>Load it here</Button>{' '}
          <Button size="sm" variant="link" style={{ fontSize: 11, padding: 0 }}
            onClick={() => { ws.dismissLink(); setLink(null) }}>Ignore</Button>
        </div>
      )}

      {!cur ? (
        <div className="d-flex align-items-center gap-2 text-muted">
          <Button variant="outline-primary" size="sm" style={{ fontSize: 12 }} onClick={() => ws.create()}
            data-testid="workspace-create">
            <MaterialIcon name="cloud_upload" size={14} /> Keep my work on this server
          </Button>
          <InfoTip size={11}>
            Saves everything a backup holds to this server, again after every change, under a private
            link. Open the link in another browser to carry on there. Anyone with the link can see and
            change the work, so share it only with people who should.
          </InfoTip>
        </div>
      ) : (
        <>
          <div className={`d-flex align-items-center gap-2 flex-wrap ${status.phase === 'error' ? 'text-danger' : 'text-muted'}`}>
            <MaterialIcon name={status.phase === 'conflict' ? 'sync_problem' : 'cloud_done'} size={14} />
            <span data-testid="workspace-status">{line}</span>
            <span className="ms-auto d-inline-flex align-items-center gap-1">
              Link <CopyButton text={ws.shareLink(cur.key)} what="workspace link" size={11} />
            </span>
          </div>
          {status.phase === 'conflict' ? (
            <div className="d-flex gap-2 mt-1">
              <Button size="sm" variant="outline-danger" style={{ fontSize: 11 }}
                onClick={() => window.confirm('Overwrite the server copy with this browser\'s work?') && ws.push({ force: true })}>
                Keep this browser&apos;s copy
              </Button>
              <Button size="sm" variant="outline-primary" style={{ fontSize: 11 }}
                onClick={() => loadFrom(cur.key, 'the server\'s copy')}>Load the server&apos;s copy</Button>
            </div>
          ) : (
            <div className="d-flex align-items-center gap-2 mt-1">
              <Form.Check type="switch" id="workspace-auto" label="Save after every change"
                checked={!!cur.auto} onChange={e => ws.setAuto(e.target.checked)} />
              <Button size="sm" variant="link" style={{ fontSize: 11, padding: 0 }} onClick={() => ws.push()}>Save now</Button>
              <Button size="sm" variant="link" style={{ fontSize: 11, padding: 0 }}
                onClick={() => loadFrom(cur.key, 'the server\'s copy')}>Load server copy</Button>
              <Button size="sm" variant="link" className="text-muted" style={{ fontSize: 11, padding: 0 }}
                onClick={() => window.confirm('Stop syncing this browser? The server copy stays, reachable by its link.') && ws.disconnect()}>
                Stop syncing here
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
