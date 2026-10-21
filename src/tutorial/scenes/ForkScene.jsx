import React from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import EntityPill from '../../components/EntityPill'
import { Stage, Click, Pulse, Appear, MiniRow, Caption } from './atoms'
import { DEMO_WRAPPER } from '../demo-data'
import { C } from '../../styles/tokens'

/**
 * ForkScene — "make a variant of this position".
 *
 * C01r is the source; C03r is the empty position that gets a copy. The wrapper is the part that
 * matters: without its own copy, the two positions would still share ET-LIN-01.
 *
 * beats: 0 the recipe actions menu → Fork into new position(s)…
 *        1 pick the position(s) the copy goes into
 *        2 untick the rows the copy should not have
 *        3 give each its own copy of the wrapper
 *        4 done: C03r has its own recipe; C01r is untouched
 */
export default function ForkScene({ beat }) {
  const [a, b] = DEMO_WRAPPER.usedBy
  const rows = [
    { ref: DEMO_WRAPPER.ref, note: 'wrapper' },
    { ref: 'ET-CCR-D-300-1CH-01', note: 'driver' },
    { ref: 'ET-2Pin-LIN-Socket', note: 'connector' },
  ]
  const done = beat >= 4
  const own = beat >= 3

  const Tick = ({ on }) => <MaterialIcon name={on ? 'check_box' : 'check_box_outline_blank'} size={12} style={{ color: on ? C.accent : C.muted }} />

  return (
    <>
      <Stage height={240}>
        {beat === 0 && (
          <div className="text-center mt-2">
            <div className="d-inline-block text-start rounded px-2 py-2" style={{ background: C.surface, border: `1px solid ${C.border}`, fontSize: 10 }}>
              <div className="text-muted mb-1">Recipe actions ⋮</div>
              <Click on>
                <Pulse on>
                  <span className="rounded px-2 py-1 d-inline-flex align-items-center gap-1" style={{ background: C.accentTint, border: `1px solid ${C.accentEdge}` }}>
                    <MaterialIcon name="call_split" size={12} /> Fork into new position(s)…
                  </span>
                </Pulse>
              </Click>
            </div>
          </div>
        )}

        {beat >= 1 && beat <= 3 && (
          <Appear when>
            <div className="d-flex gap-2" style={{ fontSize: 9 }}>
              <div style={{ width: 96 }}>
                <div className="fw-semibold mb-1">Into which?</div>
                <Pulse on={beat === 1}>
                  <div className="d-flex align-items-center gap-1"><Tick on /> <EntityPill type="PositionType" label={b} /></div>
                </Pulse>
                <div className="d-flex align-items-center gap-1 mt-1"><Tick on={false} /> <span className="text-muted">A02m</span></div>
                <Pulse on={beat === 3} style={{ display: 'block' }}>
                  <div className="d-flex align-items-center gap-1 mt-2" style={{ fontSize: 8 }}>
                    <MaterialIcon name={own ? 'toggle_on' : 'toggle_off'} size={16} style={{ color: own ? C.accent : C.muted }} /> own wrapper copy
                  </div>
                </Pulse>
              </div>
              <div style={{ flex: 1 }}>
                <div className="fw-semibold mb-1">Include which rows?</div>
                {rows.map((r, i) => (
                  <Pulse key={r.ref} on={beat === 2 && i === 1}>
                    <MiniRow dim={beat >= 2 && i === 1}>
                      <Tick on={!(beat >= 2 && i === 1)} />
                      <EntityPill type="ElementType" label={r.ref} />
                      <span className="text-muted" style={{ fontSize: 8 }}>{r.note}</span>
                    </MiniRow>
                  </Pulse>
                ))}
              </div>
            </div>
          </Appear>
        )}

        {done && (
          <Appear when>
            <div className="d-flex gap-2" style={{ fontSize: 9 }}>
              <div className="rounded px-2 py-1" style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}` }}>
                <EntityPill type="PositionType" label={a} />
                <div className="mt-1"><EntityPill type="ElementType" label={DEMO_WRAPPER.ref} /></div>
                <div className="text-muted mt-1">untouched</div>
              </div>
              <div className="rounded px-2 py-1" style={{ flex: 1, background: C.accentTint, border: `1px solid ${C.accentEdge}` }}>
                <EntityPill type="PositionType" label={b} />
                <div className="mt-1"><EntityPill type="ElementType" label={DEMO_WRAPPER.forkRef} /></div>
                <div className="text-muted mt-1">its own copy · no driver</div>
              </div>
            </div>
          </Appear>
        )}
      </Stage>
      <Caption>
        {[
          `On ${a}, the recipe's ⋮ menu has Fork into new position(s)… — "make a variant of this".`,
          `Pick the position or positions the copy goes into. ${b} is empty, so nothing is lost. A position that already has a recipe is replaced, and the window says so.`,
          'Untick anything the variant should not have — the driver, a connector. It applies to every position you picked.',
          `Give each its own copy of the wrapper. Left off, ${b} would still share ${DEMO_WRAPPER.ref} with ${a}, and editing one would change both.`,
          `${b} now has its own recipe with its own wrapper (${DEMO_WRAPPER.forkRef}). ${a} is untouched, and one Undo takes the whole fork back.`,
        ][beat]}
      </Caption>
    </>
  )
}
