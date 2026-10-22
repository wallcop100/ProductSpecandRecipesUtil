import React, { useState } from 'react'
import { Button } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { hasUnexported } from '../utils/reconcile'
import { C } from '../styles/tokens'

/**
 * PatchSyncPanel — where an export stands against the workbooks (reconcile.js). Replaces the old
 * "file changed: reload & discard / keep my changes" banner, which decided by timestamp, watched
 * only two of the three files, and could throw work away or push applied changes back in.
 *
 * After an export (batch N) it shows, per workbook in the order to run the patches, how many of
 * the batch's changes the file does not hold yet. The app re-checks by itself when a workbook
 * changes and settles; "Check now" does it on demand. A change leaves the queue only when its
 * workbook holds it. A cell someone edited by hand in between is a conflict, settled here:
 * keep mine (exported again) or take the file's.
 */
const FILES = [
  { key: 'db', list: 'dbChanges', label: 'DesignDB', note: 'first: the master list of ElementTypes' },
  { key: 'ps', list: 'psChanges', label: 'Product Spec', note: '' },
  { key: 'rs', list: 'rsChanges', label: 'Recipe Spec', note: '' },
]
const show = v => (v == null || String(v).trim() === '' ? '(blank)' : String(v))

export default function PatchSyncPanel() {
  const batch = useStore(s => s.patchBatch)
  const sync = useStore(s => s.syncStatus)
  const lists = { dbChanges: useStore(s => s.dbChanges), psChanges: useStore(s => s.psChanges), rsChanges: useStore(s => s.rsChanges) }
  const checkFiles = useStore(s => s.checkFiles)
  const resolveConflict = useStore(s => s.resolveConflict)
  const dismissBatch = useStore(s => s.dismissBatch)
  const [hidden, setHidden] = useState(null)   // the sync.at a person closed the "all in" line on

  const conflicts = sync?.conflicts || []
  const applied = sync?.counts ? Object.values(sync.counts).reduce((n, c) => n + c.applied, 0) : 0
  const allIn = !batch && sync?.at && applied > 0 && !conflicts.length
  if (!batch && !conflicts.length && !sync?.checking && !sync?.error && !(allIn && hidden !== sync.at)) return null

  const waiting = f => lists[f.list].filter(e => batch && e.batch === batch.n && !e.conflict).length
  const newer = [...lists.psChanges, ...lists.dbChanges, ...lists.rsChanges].filter(hasUnexported).length
  const dbWaiting = batch ? waiting(FILES[0]) : 0
  const laterIn = batch && FILES.slice(1).some(f => (batch.counts?.[f.key] || 0) > 0 && waiting(f) === 0)
  const time = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div data-testid="patch-sync" style={{ position: 'sticky', top: 0, zIndex: 1050, background: allIn ? C.subtle : C.attnTint,
      borderBottom: `1px solid ${allIn ? C.border : C.attnTint}`, fontSize: 12, padding: '6px 12px' }}>
      <div className="d-flex align-items-center gap-3 flex-wrap">
        <span className="fw-semibold d-inline-flex align-items-center gap-1">
          <MaterialIcon name={allIn ? 'task_alt' : 'sync'} size={15} />
          {allIn ? `All in: the workbooks hold every exported change (${applied})`
            : batch ? `Export ${batch.n} (${time(batch.at)}): run the patches`
              : 'Workbooks'}
        </span>
        {batch && FILES.map((f, i) => {
          const n = waiting(f), total = batch.counts?.[f.key] || 0
          if (!total && !n) return null
          return (
            <span key={f.key} className="d-inline-flex align-items-center gap-1" data-testid={`sync-${f.key}`} title={f.note}>
              <span className="text-muted">{i + 1}.</span> {f.label}
              {n === 0
                ? <span style={{ color: C.ink }}><MaterialIcon name="check" size={13} /> in</span>
                : <span style={{ color: C.attnInk }}>{n} waiting</span>}
            </span>
          )
        })}
        {sync?.checking && <span className="text-muted">checking the workbooks…</span>}
        {sync?.error && <span className="text-danger">could not read a workbook ({sync.error}) — still syncing? Check again in a moment.</span>}
        {newer > 0 && batch && <span className="text-muted">{newer} newer edit{newer === 1 ? '' : 's'}: in the next export</span>}
        <span className="ms-auto d-inline-flex gap-2">
          {!allIn && <Button size="sm" variant="outline-secondary" style={{ fontSize: 11, padding: '0 8px' }} disabled={sync?.checking}
            onClick={() => checkFiles()} data-testid="sync-check">Check now</Button>}
          {batch && <Button size="sm" variant="link" className="p-0 text-muted" style={{ fontSize: 11 }} onClick={() => dismissBatch()}
            title="Not exporting after all: the changes stay queued and go in the next export" data-testid="sync-dismiss">Dismiss</Button>}
          {allIn && <Button size="sm" variant="link" className="p-0 text-success" style={{ fontSize: 11 }} onClick={() => setHidden(sync.at)}>OK</Button>}
        </span>
      </div>
      {batch && dbWaiting > 0 && laterIn && (
        <div className="mt-1" style={{ color: C.dangerInk }}>
          <MaterialIcon name="warning" size={13} /> The DesignDB patch isn't in yet, but a later one is: the Product Spec and
          recipes now name ElementTypes the DesignDB does not have. Run the DesignDB patch.
        </div>
      )}
      {batch && !sync?.checking && sync?.at && sync.at > batch.at && FILES.some(f => waiting(f) > 0) && !laterIn && (
        <div className="mt-1 text-muted">Run each patch in its workbook. This checks again by itself when a workbook changes; if it has
          not caught up, the file may still be syncing.</div>
      )}
      {conflicts.length > 0 && (
        <div className="mt-2" data-testid="sync-conflicts">
          <div className="fw-semibold" style={{ color: C.dangerInk }}>
            {conflicts.length} change{conflicts.length === 1 ? '' : 's'} where the workbook now says something else (edited there by hand?)
          </div>
          {conflicts.map(c => (
            <div key={`${c.file}|${c.key}`} className="d-flex align-items-center gap-2 py-1 border-bottom">
              <span className="font-monospace">{c.ref}</span>
              <span className="text-muted">{FILES.find(f => f.key === c.file)?.label}</span>
              <span style={{ flex: 1 }}>
                {c.fields.map(x => <span key={x.field} className="me-3">{x.field}: mine <b>{show(x.mine)}</b>, workbook <b>{show(x.file)}</b></span>)}
              </span>
              <Button size="sm" variant="outline-primary" style={{ fontSize: 11, padding: '0 8px' }} onClick={() => resolveConflict(c.file, c.key, 'mine')}>Keep mine</Button>
              <Button size="sm" variant="outline-secondary" style={{ fontSize: 11, padding: '0 8px' }} onClick={() => resolveConflict(c.file, c.key, 'file')}>Take the workbook's</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
