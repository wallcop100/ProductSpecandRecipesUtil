import React, { useState, useSyncExternalStore } from 'react'
import MaterialIcon from '../components/MaterialIcon'
import TutorialCard from './TutorialCard'
import { TUTORIALS } from './tutorials'
import { hasSeen, subscribeSeen } from './seen'
import { C } from '../styles/tokens'

/**
 * TutorialHint — one quiet `?` chip in a pane's header: <TutorialHint id="builder-tree" />.
 *
 * Clicking it opens the pane's tutorial card. Cards never open on their own: the short
 * "why" of each control lives in an ⓘ (InfoTip) beside it, and a card that pops up
 * uninvited is one more thing to close. Once the card has been seen (closed by any means,
 * or "Skip all"), the chip is gone for good on this device — seen.js persists it.
 * `concept` puts that idea's card on the first page, so a pane needs no separate ConceptHint.
 */
export default function TutorialHint({ id, size = 14, concept = null }) {
  const [show, setShow] = useState(false)
  const seen = useSyncExternalStore(subscribeSeen, () => hasSeen(id))
  if (!TUTORIALS[id] || (seen && !show)) return null
  const title = `How this pane works — ${TUTORIALS[id].title}`
  return (
    <>
      <span role="button" tabIndex={0}
        title={title} aria-label={title}
        onClick={() => setShow(true)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShow(true) } }}
        style={{ cursor: 'help', color: C.faint, lineHeight: 1, display: 'inline-flex' }}>
        <MaterialIcon name="help" size={size} />
      </span>
      <TutorialCard id={id} concept={concept} show={show} onHide={() => setShow(false)} />
    </>
  )
}
