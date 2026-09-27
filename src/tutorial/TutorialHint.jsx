import React, { useState } from 'react'
import MaterialIcon from '../components/MaterialIcon'
import TutorialCard from './TutorialCard'
import { TUTORIALS } from './tutorials'

/**
 * TutorialHint — one quiet `?` chip in a pane's header: <TutorialHint id="builder-tree" />.
 *
 * Clicking it opens the pane's tutorial card. Cards never open on their own: the short
 * "why" of each control lives in an ⓘ (InfoTip) beside it, and a card that pops up
 * uninvited is one more thing to close. `active` is accepted for older call sites and ignored.
 */
export default function TutorialHint({ id, size = 14 }) {
  const [show, setShow] = useState(false)
  if (!TUTORIALS[id]) return null
  const title = `How this pane works — ${TUTORIALS[id].title}`
  return (
    <>
      <span role="button" tabIndex={0}
        title={title} aria-label={title}
        onClick={() => setShow(true)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShow(true) } }}
        style={{ cursor: 'help', color: '#adb5bd', lineHeight: 1, display: 'inline-flex' }}>
        <MaterialIcon name="help" size={size} />
      </span>
      <TutorialCard id={id} show={show} onHide={() => setShow(false)} />
    </>
  )
}
