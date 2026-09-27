import React from 'react'
import { OverlayTrigger, Popover } from 'react-bootstrap'
import MaterialIcon from './MaterialIcon'

/**
 * InfoTip — the explanation behind an ⓘ, not on the page. Hover, focus or tap shows it;
 * the screen shows only the label and the control. Use it for the "why" and the "how";
 * keep on the page only what someone needs to act.
 */
export default function InfoTip({ children, label = 'More info', size = 13, placement = 'auto', style }) {
  const pop = (
    <Popover style={{ maxWidth: 340 }}>
      <Popover.Body style={{ fontSize: 12, lineHeight: 1.45 }}>{children}</Popover.Body>
    </Popover>
  )
  return (
    <OverlayTrigger placement={placement} trigger={['hover', 'focus', 'click']} rootClose overlay={pop}>
      <span role="button" tabIndex={0} aria-label={label}
        style={{ cursor: 'help', color: '#adb5bd', display: 'inline-flex', verticalAlign: 'middle', lineHeight: 1, ...style }}>
        <MaterialIcon name="info" size={size} />
      </span>
    </OverlayTrigger>
  )
}
