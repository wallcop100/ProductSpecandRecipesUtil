import React, { useEffect, useState } from 'react'
import { Modal, Button } from 'react-bootstrap'

/**
 * ConfirmHost — the app's own confirm dialog, in place of the browser's (reports #32, #33).
 * `await askConfirm(text, { ok, danger })` → true / false. Mounted once in App; where it is not
 * mounted (component tests) the browser's confirm answers instead.
 */
let open = null

export function askConfirm(message, { ok = 'OK', cancel = 'Cancel', danger = false } = {}) {
  if (!open) return Promise.resolve(window.confirm(message))
  return new Promise(resolve => open({ message, ok, cancel, danger, resolve }))
}

export default function ConfirmHost() {
  const [ask, setAsk] = useState(null)
  useEffect(() => {
    // A second ask while one is open answers the first "no".
    open = next => setAsk(cur => { cur?.resolve(false); return next })
    return () => { open = null }
  }, [])
  const done = v => { ask?.resolve(v); setAsk(null) }
  return (
    <Modal show={!!ask} onHide={() => done(false)} centered size="sm" data-testid="confirm-modal" style={{ zIndex: 1070 }} backdropClassName="confirm-backdrop">
      <Modal.Body style={{ whiteSpace: 'pre-line', fontSize: 13 }}>{ask?.message}</Modal.Body>
      <Modal.Footer className="py-1">
        <Button size="sm" variant="link" className="text-muted" onClick={() => done(false)}>{ask?.cancel}</Button>
        <Button size="sm" variant={ask?.danger ? 'danger' : 'primary'} autoFocus onClick={() => done(true)}>{ask?.ok}</Button>
      </Modal.Footer>
    </Modal>
  )
}
