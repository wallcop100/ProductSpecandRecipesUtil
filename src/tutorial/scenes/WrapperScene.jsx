import React from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import EntityPill from '../../components/EntityPill'
import { Stage, Click, Pulse, Appear, MiniRow, Caption } from './atoms'
import { DEMO_WRAPPER } from '../demo-data'
import { C } from '../../styles/tokens'

/**
 * WrapperScene — an assembly is SHARED.
 *
 * This is the real story from the source data: ET-LIN-01 is used by both C01r and C03r, and
 * ET-LIN-02 exists as its fork — same profile, diffuser and plug, a different tape.
 *
 * beats: 0 two positions, one wrapper
 *        1 open its internals
 *        2 add something inside
 *        3 both positions changed — that is what shared means
 *        4 Fork: C01r gets ET-LIN-02; C03r keeps the original
 */
export default function WrapperScene({ beat }) {
  const opened = beat >= 1
  const added = beat >= 2
  const forked = beat >= 4
  const [a, b] = DEMO_WRAPPER.usedBy

  const PosChip = ({ posRef, wrapperRef, pulse }) => (
    <Pulse on={pulse} style={{ flex: 1 }}>
      <div className="d-flex align-items-center gap-1 rounded px-2 py-1"
        style={{ background: C.surface, border: `1px solid ${C.border}`, fontSize: 9 }}>
        <EntityPill type="PositionType" label={posRef} />
        <span className="text-muted">uses</span>
        <EntityPill type="ElementType" label={wrapperRef} />
      </div>
    </Pulse>
  )

  return (
    <>
      <Stage height={240}>
        <div className="d-flex gap-2 mb-2">
          <PosChip posRef={a} wrapperRef={forked ? DEMO_WRAPPER.forkRef : DEMO_WRAPPER.ref} pulse={beat === 3 || beat === 4} />
          <PosChip posRef={b} wrapperRef={DEMO_WRAPPER.ref} pulse={beat === 3} />
        </div>

        {!opened && (
          <div className="text-center mt-3">
            <Click on>
              <Pulse on>
                <span className="rounded px-2 py-1" style={{ background: C.surface, border: `1px solid ${C.accent}`, color: C.accent, fontSize: 10 }}>
                  Edit internals →
                </span>
              </Pulse>
            </Click>
          </div>
        )}

        {opened && (
          <Appear when>
            <div className="rounded px-2 py-2" style={{ background: C.accentTint, border: `1px solid ${C.accentEdge}` }}>
              <div className="d-flex align-items-center gap-1 mb-1" style={{ fontSize: 9 }}>
                <MaterialIcon name="inventory_2" size={12} style={{ color: '#bf6018' }} />
                <span className="fw-semibold">Editing ET: {forked ? DEMO_WRAPPER.forkRef : DEMO_WRAPPER.ref}</span>
                {beat === 3 && (
                  <span className="ms-auto rounded px-1" style={{ background: C.attnTint, color: C.attnInk, fontSize: 8, border: `1px solid ${C.attn}` }}>
                    <MaterialIcon name="warning" size={9} /> Edits apply to 2 positions: {a}, {b}
                  </span>
                )}
                {beat === 4 && (
                  <span className="ms-auto">
                    <Click on>
                      <span className="rounded px-1" style={{ background: C.subtle, color: C.ink, fontSize: 8 }}>
                        <MaterialIcon name="call_split" size={9} /> forked for {a}
                      </span>
                    </Click>
                  </span>
                )}
              </div>

              {(forked ? DEMO_WRAPPER.forkInternals : DEMO_WRAPPER.internals).map(it => (
                <MiniRow key={it.ref} style={{ background: C.surface }}
                  active={forked && it.ref === 'ET-LIN-TAPE-02'}>
                  <EntityPill type="ElementType" label={it.ref} />
                  <span className="text-muted" style={{ fontSize: 8 }}>{it.desc}</span>
                </MiniRow>
              ))}

              {added && !forked && (
                <Appear when>
                  <MiniRow active style={{ borderColor: C.border }}>
                    <EntityPill type="ElementType" label="ET-LIN-CLIP-01" />
                    <span className="text-muted" style={{ fontSize: 8 }}>Retention clip</span>
                    <span className="badge ms-auto" style={{ background: C.muted, fontSize: 7 }}>New</span>
                  </MiniRow>
                </Appear>
              )}
            </div>
          </Appear>
        )}
      </Stage>
      <Caption>
        {[
          `${a} and ${b} both use ${DEMO_WRAPPER.ref}. One assembly, appearing in two recipes.`,
          'Edit internals opens the assembly itself: its tape, profile, diffuser and plug.',
          'Add a clip inside it…',
          '…and BOTH positions now contain it. The header names who you are about to change.',
          `Fork gives ${a} its own copy (${DEMO_WRAPPER.forkRef}) — a different tape. ${b} keeps the original, untouched.`,
        ][beat]}
      </Caption>
    </>
  )
}
