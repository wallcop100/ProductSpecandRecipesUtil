import React from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import { Stage, Cursor, Pulse, Appear, MiniRow, Caption } from './atoms'

/**
 * StatusScene — "where the project stands": readiness clauses + validation-as-actions.
 *
 * beats: 0 the four done-clauses, with live counts — deliberately not a percentage
 *        1 validation lists ACTIONS that clear many issues at once, not raw issues
 *        2 the step-through fixer walks the rest one at a time
 *        3 "no recipe needed" — the honest escape for a position or family
 */
export default function StatusScene({ beat }) {
  const cursorAt = { 1: { x: 250, y: 92 }, 2: { x: 250, y: 128 }, 3: { x: 210, y: 164 } }[beat]

  const CLAUSES = [
    { text: 'Every position has a recipe (or is ignored)', ok: false, count: '2 left' },
    { text: 'Every Form product is placed', ok: true, count: '' },
    { text: 'Nothing blocks a correct patch', ok: false, count: '1' },
    { text: 'Every ElementType exists in all three documents', ok: true, count: '' },
  ]

  return (
    <>
      <Stage>
        <Pulse on={beat === 0}>
          {CLAUSES.map(c => (
            <MiniRow key={c.text}>
              <MaterialIcon name={c.ok ? 'check_circle' : 'radio_button_unchecked'} size={12}
                style={{ color: c.ok ? '#198754' : '#adb5bd' }} />
              <span style={{ fontSize: 10 }}>{c.text}</span>
              {c.count && <span className="ms-auto" style={{ fontSize: 9, color: '#997404' }}>{c.count}</span>}
            </MiniRow>
          ))}
        </Pulse>

        {beat >= 1 && (
          <Appear when>
            <MiniRow active={beat === 1}>
              <MaterialIcon name="playlist_add_check" size={12} style={{ color: '#0d6efd' }} />
              <span style={{ fontSize: 10 }}>45 ElementTypes missing from the DesignDB master</span>
              <span className="rounded px-1 ms-auto" style={{ background: '#0d6efd', color: '#fff', fontSize: 8 }}>
                Add all 45 to the patch
              </span>
            </MiniRow>
          </Appear>
        )}
        {beat >= 2 && (
          <Appear when>
            <MiniRow active={beat === 2}>
              <MaterialIcon name="checklist" size={12} style={{ color: '#6c757d' }} />
              <span style={{ fontSize: 10 }}>Step through the rest, one at a time</span>
              <span className="text-muted ms-auto" style={{ fontSize: 8 }}>issue 1 of 3 →</span>
            </MiniRow>
          </Appear>
        )}
        {beat >= 3 && (
          <Appear when>
            <div className="rounded px-2 py-1" style={{ background: '#fff', border: '1px solid #dee2e6', fontSize: 9 }}>
              <MaterialIcon name="do_not_disturb_on" size={11} style={{ color: '#ffc107' }} />{' '}
              No recipe needed? <span className="rounded px-1" style={{ border: '1px solid #dee2e6' }}>Ignore X01</span>{' '}
              <span className="rounded px-1" style={{ border: '1px solid #dee2e6' }}>Ignore family Specials…</span>
            </div>
          </Appear>
        )}

        <Cursor at={cursorAt} click={beat >= 1} />
      </Stage>
      <Caption>
        {[
          '"Am I done?" is four clauses with live counts — deliberately never a percentage.',
          'Validation shows the ACTION that clears a whole class of issues, not 45 red rows.',
          'The fixer steps through what is left, jumping you to the right place for each.',
          'Not every flag is a defect: a position that needs no recipe can say so, here.',
        ][beat]}
      </Caption>
    </>
  )
}
