import React from 'react'
import MaterialIcon from './MaterialIcon'
import { useCompanion } from '../platform/companion'
import { C } from '../styles/tokens'

/**
 * CompanionStatus — a cloud beside undo: purple when the companion answered, grey and struck
 * through when it did not (e.g. the failover is serving this build without it). Hidden on the
 * GitHub Pages release, which never has one.
 * shortcut: probed once at load (getCompanion), so a companion lost mid-session still shows purple; poll if that matters.
 */
export default function CompanionStatus() {
  const companion = useCompanion()
  if (typeof location !== 'undefined' && location.hostname.endsWith('github.io')) return null
  return (
    <span className="ms-2 d-inline-flex" data-testid="companion-status" data-connected={companion ? 'true' : 'false'}>
      <MaterialIcon name={companion ? 'cloud' : 'cloud_off'} size={18} style={{ color: companion ? C.companion : C.muted }}
        title={companion ? 'Connected' : 'Offline: nothing is learned or shared'} />
    </span>
  )
}
