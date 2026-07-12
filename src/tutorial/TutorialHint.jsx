import React, { useState, useEffect, useRef } from 'react'
import MaterialIcon from '../components/MaterialIcon'
import TutorialCard from './TutorialCard'
import { TUTORIALS } from './tutorials'
import { hasSeen, subscribeSeen } from './seen'

/**
 * TutorialHint — one line in a pane's header row: <TutorialHint id="builder-tree" />.
 *
 * First ever mount with this id unseen → the card auto-opens, once. Dismissing it (any way)
 * marks it seen, and from then on this is a quiet `?` chip — the ConceptHint idiom, the
 * app's only help-icon language — that reopens the card on demand, forever.
 *
 * THREE GUARDS keep first-run sane:
 *  - `active` (default true): a hint whose pane is mounted but not visible — the palette
 *    drawer at width 0 — must not auto-open a card about something the user cannot see.
 *    Pass the pane's own visibility. Manual `?` clicks ignore it.
 *  - a module-level mutex: several panes mount together (tree + drawer at builder load),
 *    and a fresh browser would stack their modals. Only one card may auto-open at a time.
 *  - `after` (declared in TUTORIALS): the mutex alone is first-come-first-served, which is a
 *    RACE, not an order — and on the builder the drawer was winning it, so you met the
 *    palette before the recipe it fills. A card that names `after` will not auto-open while
 *    any card it names is still unseen. It takes its turn the moment that one is dismissed,
 *    because `subscribeSeen` re-runs this effect — the two panes are on the SAME screen, so
 *    "wait for a later mount" would have meant never.
 */
let autoOpenLock = false

export default function TutorialHint({ id, size = 14, active = true }) {
  const [show, setShow] = useState(false)
  const [, bump] = useState(0)
  const fired = useRef(false)      // one auto-open per mount, once it actually happens
  const holdsLock = useRef(false)

  // Re-evaluate when any card is dismissed: this one may have been waiting for it.
  useEffect(() => subscribeSeen(() => bump(n => n + 1)), [])

  useEffect(() => {
    if (fired.current || !active) return
    const t = TUTORIALS[id]
    if (!t || hasSeen(id) || autoOpenLock) return
    // Wait our turn: something more fundamental has not been read yet.
    if ((t.after || []).some(other => !hasSeen(other))) return

    fired.current = true
    holdsLock.current = true
    autoOpenLock = true
    setShow(true)
  })

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
