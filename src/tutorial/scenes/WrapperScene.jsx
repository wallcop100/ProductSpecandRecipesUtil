import React from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import EntityPill from '../../components/EntityPill'
import { Stage, Cursor, Pulse, Appear, MiniRow, Caption } from './atoms'
import { DEMO_WRAPPER } from '../demo-data'

/**
 * WrapperScene — the idea that bites hardest: an assembly is SHARED.
 *
 * beats: 0 two positions both use ET-LIN-01
 *        1 open its internals — tape, profile, diffuser
 *        2 add a clip inside…
 *        3 …and BOTH positions change. That is what shared means.
 *        4 Fork: L01 gets its own copy; L02 stops being affected
 */
export default function WrapperScene({ beat }) {
  const forked = beat >= 4
  const added = beat >= 2
  const cursorAt = { 1: { x: 150, y: 66 }, 2: { x: 210, y: 128 }, 4: { x: 300, y: 34 } }[beat]

  const Position = ({ posRef, wrapperRef, pulse }) => (
    <Pulse on={pulse} style={{ flex: 1 }}>
      <div className="rounded px-2 py-1" style={{ background: '#fff', border: '1px solid #e9ecef', fontSize: 10 }}>
        <EntityPill type="PositionType" label={posRef} />
        <span className="text-muted mx-1">uses</span>
        <EntityPill type="ElementType" label={wrapperRef} />
      </div>
    </Pulse>
  )

  return (
    <>
      <Stage>
        <div className="d-flex gap-2 mb-2">
          <Position posRef="L01" wrapperRef={forked ? DEMO_WRAPPER.forkRef : DEMO_WRAPPER.ref} pulse={beat === 3 || beat === 4} />
          <Position posRef="L02" wrapperRef={DEMO_WRAPPER.ref} pulse={beat === 3} />
        </div>

        {/* the wrapper's internal recipe */}
        {beat >= 1 && (
          <Appear when>
            <div className="rounded px-2 py-2" style={{ background: '#f0f4ff', border: '1px solid #c7d7f5' }}>
              <div className="d-flex align-items-center gap-1 mb-1" style={{ fontSize: 10 }}>
                <MaterialIcon name="inventory_2" size={12} style={{ color: '#bf6018' }} />
                <span className="fw-semibold">Inside {forked ? DEMO_WRAPPER.forkRef : DEMO_WRAPPER.ref}</span>
                {beat >= 3 && !forked && (
                  <span className="ms-auto rounded px-1" style={{ background: '#fff3cd', color: '#856404', fontSize: 9 }}>
                    <MaterialIcon name="warning" size={10} /> shared with L01, L02
                  </span>
                )}
                {beat >= 4 && (
                  <span className="ms-auto rounded px-1" style={{ background: '#d1e7dd', color: '#0f5132', fontSize: 9 }}>
                    <MaterialIcon name="call_split" size={10} /> forked for L01
                  </span>
                )}
              </div>
              {DEMO_WRAPPER.internals.map(it => (
                <MiniRow key={it.ref} style={{ background: '#fff' }}>
                  <EntityPill type="ElementType" label={it.ref} />
                  <span className="text-muted">{it.name}</span>
                </MiniRow>
              ))}
              <Appear when={added}>
                <MiniRow active style={{ borderColor: '#198754' }}>
                  <EntityPill type="ElementType" label="ET-CLIP-01" />
                  <span className="text-muted">Retention clip</span>
                  <span className="ms-auto badge" style={{ background: '#198754', fontSize: 8 }}>New</span>
                </MiniRow>
              </Appear>
            </div>
          </Appear>
        )}

        <Cursor at={cursorAt} click={beat === 2 || beat === 4} />
      </Stage>
      <Caption>
        {[
          'L01 and L02 both use the wrapper ET-LIN-01 — one assembly, two positions.',
          'Edit internals opens the assembly: the tape, profile and diffuser inside it.',
          'Add a clip inside the wrapper…',
          '…and BOTH positions now contain it. An assembly is shared; edits ripple.',
          'Fork gives L01 its own copy (ET-LIN-02). L02 keeps the original, unaffected.',
        ][beat]}
      </Caption>
    </>
  )
}
