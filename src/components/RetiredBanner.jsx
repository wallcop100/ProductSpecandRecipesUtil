import React, { useEffect, useMemo, useState } from 'react'
import { Alert, Button } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import CopyButton from './CopyButton'
import { useCompanion } from '../platform/companion'

const live = r => (r.IsDeleted || r.isDeleted) !== 'Y'

/**
 * RetiredBanner — Product Spec codes their manufacturer has since retired, with what replaced
 * them. Only when the app is served beside a companion with a catalogue (`sweep`).
 *
 * The workbooks are perfectly self-consistent about a retired code — the world moved, not the
 * spec — so nothing inside the app can see this. One call per project open; dismissible for
 * the session.
 */
export default function RetiredBanner() {
  const api = useCompanion()
  const projectId = useStore(s => s.projectId)
  const psRows = useStore(s => s.psRows)
  const [found, setFound] = useState({ project: null, rows: [] })
  const [open, setOpen] = useState(false)
  const dismissKey = `rb-retired-dismissed-${projectId}`
  const [dismissed, setDismissed] = useState(false)

  const codes = useMemo(() => psRows.filter(live).map(r => ({
    code: String(r.ProductCode || r.productCode || '').trim(),
    manufacturer: String(r.Manufacturer || r.manufacturer || '').trim(),
    ref: r.ElementTypeRef || r.elementTypeRef || '',
  })).filter(c => c.code && !/^tbc$/i.test(c.code)), [psRows])

  useEffect(() => {
    try { setDismissed(sessionStorage.getItem(dismissKey) === '1') } catch { setDismissed(false) }
  }, [dismissKey])

  useEffect(() => {
    if (!api?.sweep || !projectId || !codes.length || found.project === projectId) return
    let ok = true
    api.sweep(codes.slice(0, 2000).map(({ code, manufacturer }) => ({ code, manufacturer }))).then(retired => {
      if (!ok) return
      const refOf = new Map(codes.map(c => [c.code.toUpperCase(), c.ref]))
      setFound({ project: projectId, rows: retired.map(r => ({ ...r, ref: refOf.get(String(r.code).toUpperCase()) || '' })) })
    })
    return () => { ok = false }
  }, [api, projectId, codes, found.project])

  if (dismissed || found.project !== projectId || !found.rows.length) return null
  const rows = found.rows
  return (
    <Alert variant="warning" className="mb-0 py-1 px-3 rounded-0 d-flex flex-wrap align-items-center gap-2"
      style={{ fontSize: 12 }} data-testid="retired-banner">
      <MaterialIcon name="block" size={15} />
      <span>
        <b>{rows.length}</b> code{rows.length === 1 ? '' : 's'} in this Product Spec {rows.length === 1 ? 'has' : 'have'} been
        retired by the manufacturer.
      </span>
      <Button size="sm" variant="link" className="p-0" style={{ fontSize: 12 }} onClick={() => setOpen(o => !o)}>
        {open ? 'Hide' : 'Show'}
      </Button>
      <Button size="sm" variant="link" className="p-0 ms-auto text-muted" style={{ fontSize: 12 }}
        onClick={() => { try { sessionStorage.setItem(dismissKey, '1') } catch { /* fine */ } setDismissed(true) }}>
        Dismiss
      </Button>
      {open && (
        <div className="w-100" style={{ maxHeight: 180, overflowY: 'auto' }}>
          {rows.map(r => (
            <div key={r.code} className="d-flex align-items-center gap-2" style={{ fontFamily: 'monospace', fontSize: 11 }}>
              <span>{r.ref || '—'}</span>
              <span>{r.code}</span>
              <MaterialIcon name="arrow_forward" size={11} />
              <span className="fw-semibold">{r.replacement}</span>
              <CopyButton text={r.replacement} what={`replacement ${r.replacement}`} size={10} />
              {r.retired && <span className="text-muted" style={{ fontFamily: 'system-ui' }}>since {r.retired}</span>}
            </div>
          ))}
        </div>
      )}
    </Alert>
  )
}
