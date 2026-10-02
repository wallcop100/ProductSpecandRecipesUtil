import React, { useEffect, useRef, useState } from 'react'
import { Button } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import ProductCodeImportScreen from '../screens/ProductCodeImportScreen'
import { fileMeta } from '../utils/backend'

const POLL_MS = 4000

/**
 * FormFileWatch — the loaded Form is the app's saved copy; this notices when the Form FILE
 * has changed since (on opening, then every few seconds) and offers to refresh from it.
 * Refresh runs Import's own refreshFromFile, hidden: unchanged rows keep what you did, the
 * copy before becomes the comparison. When the browser needs a click to read the file
 * again, it offers that click instead.
 */
export default function FormFileWatch() {
  const importDraft = useStore(s => s.importDraft)
  const projectId = useStore(s => s.projectId)
  const [hit, setHit] = useState(null)          // { token, name, lastModified } when newer
  const [needsAccess, setNeedsAccess] = useState(null)   // file name, when a click is needed
  const [refreshing, setRefreshing] = useState(null)     // token
  const [done, setDone] = useState(null)        // message after a refresh
  const dismissed = useRef(null)                // lastModified you said "not now" to
  const token = useRef(null)
  const savedAt = importDraft?.source?.lastModified || 0
  const savedName = importDraft?.source?.name || null
  const loaded = !!importDraft?.rows?.length

  useEffect(() => {
    if (!loaded || refreshing) return
    let live = true
    const check = async () => {
      try {
        if (!token.current) {
          const r = await window.electronAPI?.reopenFormFile?.(projectId, { ask: false })
          if (!live || !r) return
          if (savedName && r.name !== savedName) return       // a different file is remembered
          if (!r.token) { setNeedsAccess(r.name); return }
          token.current = r.token
          setNeedsAccess(null)
        }
        const meta = await fileMeta(token.current)
        if (!live) return
        if (!meta) { token.current = null; return }
        setHit(meta.lastModified > savedAt && meta.lastModified !== dismissed.current ? { token: token.current, ...meta } : null)
      } catch { /* not readable now: try again next time */ }
    }
    check()
    const t = setInterval(check, POLL_MS)
    return () => { live = false; clearInterval(t) }
  }, [loaded, savedAt, savedName, projectId, refreshing])

  async function giveAccess() {
    const r = await window.electronAPI?.reopenFormFile?.(projectId, { ask: true })
    if (r?.token) { token.current = r.token; setNeedsAccess(null) }
  }

  if (!loaded) return null
  const bar = { fontSize: 11, background: '#fff3cd', border: '1px solid #ffe69c', color: '#664d03' }
  return (
    <>
      {hit && !refreshing && (
        <div className="d-flex align-items-center gap-2 px-2 py-1 rounded" style={bar} data-testid="form-file-changed">
          <MaterialIcon name="sync_problem" size={14} />
          <span className="text-truncate" title={hit.name}>The Form file <strong>{hit.name}</strong> has changed</span>
          <Button size="sm" variant="warning" className="py-0" style={{ fontSize: 11 }} data-testid="form-refresh"
            onClick={() => { setDone(null); setRefreshing(hit.token) }}>Refresh</Button>
          <Button size="sm" variant="link" className="p-0 text-muted" style={{ fontSize: 11 }}
            onClick={() => { dismissed.current = hit.lastModified; setHit(null) }}>Not now</Button>
        </div>
      )}
      {!hit && needsAccess && (
        <Button size="sm" variant="link" className="p-0 text-muted" style={{ fontSize: 10 }} data-testid="form-file-access"
          onClick={giveAccess} title="The browser needs a click before the Form file can be read again">
          <MaterialIcon name="sync" size={12} /> Check {needsAccess} for changes
        </Button>
      )}
      {refreshing && (
        <>
          <span className="text-muted" style={{ fontSize: 11 }}><MaterialIcon name="sync" size={12} /> Refreshing the Form…</span>
          <div style={{ display: 'none' }} data-testid="form-refreshing">
            <ProductCodeImportScreen onBack={() => {}} embedded={{
              refresh: refreshing,
              onRefreshed: (n, err) => {
                setRefreshing(null); setHit(null)
                setDone(err ? `Could not refresh: ${err.message || err}` : n ? `Form refreshed: ${n} Form ref${n === 1 ? '' : 's'} changed` : 'Form refreshed: nothing changed')
              },
            }} />
          </div>
        </>
      )}
      {done && !refreshing && (
        <span className="text-muted" style={{ fontSize: 11 }} data-testid="form-refreshed">
          {done}{' '}
          <Button size="sm" variant="link" className="p-0" style={{ fontSize: 11 }} onClick={() => setDone(null)}>ok</Button>
        </span>
      )}
    </>
  )
}
