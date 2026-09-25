import React, { useEffect, useState } from 'react'
import { Toast, ToastContainer } from 'react-bootstrap'
import useStore, { savePendingNow } from '../store/useStore'
import MaterialIcon from './MaterialIcon'

const unexported = s => s.psChanges.length + s.rsChanges.length + (s.dbChanges?.length || 0)
const time = t => (t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')

/**
 * Work is saved as you go — to this browser, not to the workbooks. The cloud says which,
 * so nobody has to wonder; the workbooks only change on Export.
 */
export function SaveIndicator() {
  const status = useStore(s => s.saveStatus)
  const savedAt = useStore(s => s.savedAt)
  const n = useStore(unexported)
  const { icon, color, label } = {
    saving: { icon: 'cloud_sync', color: '#6c757d', label: 'Saving…' },
    error: { icon: 'cloud_off', color: '#dc3545', label: 'Not saved' },
  }[status] || { icon: 'cloud_done', color: '#198754', label: 'Saved' }
  const tip = status === 'error'
    ? 'Could not save to this browser. Export now so the work is not lost.'
    : `${label}${savedAt && status === 'saved' ? ` at ${time(savedAt)}` : ''} in this browser — safe to close.`
      + (n ? ` ${n} change${n === 1 ? '' : 's'} not yet exported to the workbooks.` : '')
  return (
    <span data-testid="save-indicator" title={tip} aria-label={tip}
      className="d-inline-flex align-items-center gap-1" style={{ color, fontSize: 11 }}>
      <MaterialIcon name={icon} size={16} /> {label}
    </span>
  )
}

/** Ctrl/Cmd+S: save now, and say plainly what that did and did not do. */
export function SaveShortcut() {
  const [toast, setToast] = useState(null)
  useEffect(() => {
    const onKey = async e => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return
      e.preventDefault()   // not the browser's "Save page as…"
      const ok = await savePendingNow()
      const n = unexported(useStore.getState())
      setToast(ok || useStore.getState().projectId == null
        ? { ok: true, text: useStore.getState().projectId == null
            ? 'Nothing to save yet — open a project first.'
            : `Saved in this browser.${n ? ` ${n} change${n === 1 ? '' : 's'} still to export to the workbooks.` : ' Nothing waiting to export.'}` }
        : { ok: false, text: 'Could not save to this browser. Export now so the work is not lost.' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <ToastContainer position="bottom-end" className="p-3" style={{ zIndex: 2000, position: 'fixed' }}>
      <Toast show={!!toast} onClose={() => setToast(null)} delay={3500} autohide bg={toast?.ok === false ? 'danger' : 'light'}>
        <Toast.Body className="d-flex align-items-center gap-2" style={{ fontSize: 12 }} data-testid="save-toast">
          <MaterialIcon name={toast?.ok === false ? 'cloud_off' : 'cloud_done'} size={16} /> {toast?.text}
        </Toast.Body>
      </Toast>
    </ToastContainer>
  )
}
