import React from 'react'
import { Button } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'

/**
 * RestoredNotice — on open, the unexported changes saved from the last session come back
 * by themselves (they are saved in this browser as you work, until Export). This says so,
 * once, and is the one place to throw them away.
 */
export default function RestoredNotice() {
  const notice = useStore(s => s.restoredNotice)
  const discard = useStore(s => s.discardPendingChanges)
  if (!notice) return null
  return (
    <div className="d-flex align-items-center gap-2 mx-3 mt-2 px-3 py-2 rounded" data-testid="restored-notice"
      style={{ background: '#d1e7dd', border: '1px solid #a3cfbb', fontSize: 12, color: '#0f5132', flexShrink: 0 }}>
      <MaterialIcon name="restore" size={16} />
      <span>
        {notice.n > 0 && <><strong>{notice.n} unexported change{notice.n === 1 ? '' : 's'} restored</strong> from your last session. </>}
        {notice.applied > 0 && <>{notice.applied} saved change{notice.applied === 1 ? ' is' : 's are'} in the workbooks now (a patch ran), so {notice.applied === 1 ? 'it' : 'they'} left the queue. </>}
        {notice.n > 0 && 'Your work is saved in this browser as you go, until the workbooks hold it.'}
      </span>
      {notice.n > 0 && <Button size="sm" variant="link" className="ms-auto p-0 text-danger" style={{ fontSize: 11 }}
        onClick={() => { if (window.confirm(`Discard all ${notice.n} unexported changes? This cannot be undone.`)) discard() }}>
        Discard them…
      </Button>}
      <Button size="sm" variant="success" style={{ fontSize: 11 }} onClick={() => useStore.setState({ restoredNotice: null })}>OK</Button>
    </div>
  )
}
