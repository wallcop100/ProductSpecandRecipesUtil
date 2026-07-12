import React, { useState, useEffect, useRef } from 'react'
import MaterialIcon from '../components/MaterialIcon'
import TutorialCard from './TutorialCard'
import { TUTORIALS } from './tutorials'
import { hasSeen } from './seen'

/**
 * TutorialHint — one line in a pane's header row: <TutorialHint id="builder-tree" />.
 *
 * First ever mount with this id unseen → the card auto-opens, once. Dismissing it (any way)
 * marks it seen, and from then on this is a quiet `?` chip — the ConceptHint idiom, the
 * app's only help-icon language — that reopens the card on demand, forever.
 *
 * TWO GUARDS keep first-run sane:
 *  - `active` (default true): a hint whose pane is mounted but not visible — the palette
 *    drawer at width 0 — must not auto-open a card about something the user cannot see.
 *    Pass the pane's own visibility. Manual `?` clicks ignore it.
 *  - a module-level mutex: several panes mount together (tree + drawer at builder load),
 *    and a fresh browser would stack their modals. Only one card may auto-open at a time;
 *    the others stay unseen and take their turn on a later mount of their pane.
 */
let autoOpenLock = false

export default function TutorialHint({ id, size = 14, active = true }) {
  const [show, setShow] = useState(false)
  const fired = useRef(false)      // one auto-open attempt per mount
  const holdsLock = useRef(false)

  useEffect(() => {
    if (fired.current || !active) return
    if (TUTORIALS[id] && !hasSeen(id) && !autoOpenLock) {
      fired.current = true
      holdsLock.current = true
      autoOpenLock = true
      setShow(true)
    }
  }, [active, id])

  // Never leak the lock — an unmount mid-show (screen navigation) must free it.
  useEffect(() => () => { if (holdsLock.current) { autoOpenLock = false; holdsLock.current = false } }, [])

  if (!TUTORIALS[id]) return null
  const title = `How this pane works — ${TUTORIALS[id].title}`

  function hide() {
    setShow(false)
    if (holdsLock.current) { autoOpenLock = false; holdsLock.current = false }
  }

  return (
    <>
      <span role="button" tabIndex={0}
        title={title} aria-label={title}
        onClick={() => setShow(true)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShow(true) } }}
        style={{ cursor: 'help', color: '#adb5bd', lineHeight: 1, display: 'inline-flex' }}>
        <MaterialIcon name="help" size={size} />
      </span>
      <TutorialCard id={id} show={show} onHide={hide} />
    </>
  )
}
