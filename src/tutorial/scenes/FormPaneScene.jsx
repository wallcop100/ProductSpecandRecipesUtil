import React from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import EntityPill from '../../components/EntityPill'
import { Stage, Cursor, Pulse, Appear, MiniRow, Caption } from './atoms'
import { DEMO_FORM } from '../demo-data'

/**
 * FormPaneScene — the Side-by-Side: what the Form asks for vs what the recipe has.
 *
 * beats: 0 the two columns and the governing idea
 *        1 tick a missing product
 *        2 choose where it lands: position level, or inside the wrapper
 *        3 it lands; coverage rises
 *        4 a pending product with no ElementType — "That's it" merges it onto one
 *          the recipe already has
 */
export default function FormPaneScene({ beat }) {
  const added = beat >= 3
  const merged = beat >= 4 // eslint-disable-line no-unused-vars -- readability of the script
  const cursorAt = { 1: { x: 200, y: 60 }, 2: { x: 250, y: 88 }, 4: { x: 296, y: 150 } }[beat]
  const [tape, diffuser] = DEMO_FORM.asks

  return (
    <>
      <Stage height={230}>
        <div className="d-flex gap-2" style={{ height: '100%' }}>
          {/* the recipe (left of the rule, things land here) */}
          <div style={{ flex: 1 }}>
            <div className="text-muted mb-1" style={{ fontSize: 9, textTransform: 'uppercase' }}>L01 recipe has</div>
            <MiniRow><EntityPill type="ElementType" label={tape.ref} /></MiniRow>
            <Appear when={added}>
              <MiniRow active style={{ borderColor: '#198754' }}>
                <EntityPill type="ElementType" label={diffuser.ref} />
                <span className="badge ms-auto" style={{ background: '#198754', fontSize: 8 }}>added inside ET-LIN-01</span>
              </MiniRow>
            </Appear>
            <Appear when={beat >= 4}>
              <MiniRow>
                <EntityPill type="ElementType" label={DEMO_FORM.pending.matches} />
                <span className="text-muted" style={{ fontSize: 9 }}>= the pending product</span>
              </MiniRow>
            </Appear>
          </div>

          {/* the Form (right of the rule, the source) */}
          <div style={{ width: 190, borderLeft: '1px solid #dee2e6', paddingLeft: 8 }}>
            <div className="text-muted mb-1" style={{ fontSize: 9, textTransform: 'uppercase' }}>
              the Form asks for
            </div>
            <MiniRow>
              <MaterialIcon name="check_circle" size={12} style={{ color: '#198754' }} />
              <span style={{ fontFamily: 'monospace', fontSize: 9 }}>{tape.code}</span>
            </MiniRow>
            <MiniRow active={beat >= 1 && beat <= 3}>
              <Pulse on={beat === 1}>
                <MaterialIcon name={added ? 'check_circle' : beat >= 1 ? 'check_box' : 'check_box_outline_blank'}
                  size={12} style={{ color: added ? '#198754' : '#0d6efd', transition: 'color .3s ease' }} />
              </Pulse>
              <span style={{ fontFamily: 'monospace', fontSize: 9 }}>{diffuser.code}</span>
            </MiniRow>
            {beat === 2 && (
              <Appear when>
                <div className="rounded px-1 py-1 mb-1" style={{ background: '#f0f4ff', border: '1px solid #c7d7f5', fontSize: 8 }}>
                  add to: <strong>inside ET-LIN-01</strong> · at position level
                </div>
              </Appear>
            )}
            {/* the pending product — the Form asked, nobody named it */}
            <div className="rounded px-1 py-1 mt-2" style={{ background: '#fdecec', border: '1px solid #f5c2c7' }}>
              <div style={{ fontSize: 8, color: '#842029', fontWeight: 600 }}>
                <MaterialIcon name="help" size={9} /> no ElementType
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 9 }}>{DEMO_FORM.pending.code}</div>
              {beat >= 4 && (
                <Appear when>
                  <div className="d-flex align-items-center gap-1 rounded px-1 mt-1" style={{ background: '#fff', fontSize: 8 }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{DEMO_FORM.pending.matches}</span>
                    <span className="rounded px-1 ms-auto" style={{ background: '#198754', color: '#fff' }}>That's it</span>
                  </div>
                </Appear>
              )}
            </div>
          </div>
        </div>
        <Cursor at={cursorAt} click={beat === 1 || beat === 4} />
      </Stage>
      <Caption>
        {[
          'The Form is the truth about WHICH products a position uses — and silent on the rest.',
          'A product the Form asks for that the recipe lacks is your work. Tick it.',
          'The Form carries no slots, so YOU say where it lands: position level, or inside the wrapper.',
          'It lands, and coverage rises. Extra rows the Form never named are fine — derived detail.',
          'A product nobody named yet is usually one you already have — "That’s it" links them.',
        ][beat]}
      </Caption>
    </>
  )
}
