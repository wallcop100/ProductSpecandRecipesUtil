import React from 'react'
import { OverlayTrigger, Popover } from 'react-bootstrap'
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
  // The same popover as the Saved chip beside it (58QRQM): it opens where there is room, not upward off the toolbar.
  return (
    <OverlayTrigger placement="auto" trigger={['hover', 'focus']} overlay={
      <Popover style={{ maxWidth: 320 }}><Popover.Body style={{ fontSize: 12 }}>{companion ? 'Connected' : 'Offline: nothing is learned or shared'}</Popover.Body></Popover>
    }>
      <span className="ms-2 d-inline-flex" tabIndex={0} style={{ cursor: 'help' }} data-testid="companion-status" data-connected={companion ? 'true' : 'false'}>
        <MaterialIcon name={companion ? 'cloud' : 'cloud_off'} size={18} style={{ color: companion ? C.companion : C.muted }} />
      </span>
    </OverlayTrigger>
  )
}
