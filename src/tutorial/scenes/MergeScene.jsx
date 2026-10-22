import React from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import { Stage, Click, Pulse, Appear, Caption } from './atoms'
import { C } from '../../styles/tokens'

/**
 * MergeScene — two ElementTypes that are one product become one.
 *
 * beats: 0 tick both, the bulk bar offers Merge…
 *        1 choose what survives (or a new ref)
 *        2 the second confirm: what is placed in the DesignDB would be orphaned
 */
const REFS = ['ET-LIN-CAP-06', 'ET-LIN-CAP-07']

export default function MergeScene({ beat }) {
  return (
    <>
      <Stage height={200}>
        <div className="d-flex align-items-center gap-2 mb-2 px-2 py-1 rounded" style={{ background: C.accentTint, fontSize: 9 }}>
          <strong>2 selected</strong>
          <Click on={beat === 0}>
            <Pulse on={beat === 0}>
              <span className="rounded px-2" style={{ border: `1px solid ${C.accent}`, color: C.accent, background: C.surface, fontSize: 8 }}>Merge…</span>
            </Pulse>
          </Click>
        </div>
        {REFS.map(r => (
          <div key={r} className="d-flex align-items-center gap-1 px-1" style={{ fontSize: 8, minHeight: 18 }}>
            <MaterialIcon name="check_box" size={10} style={{ color: C.accent }} />
            <span style={{ fontWeight: 500 }}>{r}</span>
            <span className="text-muted ms-auto">LEDFlex · FPSC0808ECG</span>
          </div>
        ))}
        {beat === 1 && (
          <Appear when>
            <div className="rounded p-2 mt-2" style={{ background: C.surface, border: `1px solid ${C.border}`, fontSize: 8 }}>
              Merge into <Click on><Pulse on><span className="rounded px-1" style={{ border: `1px solid ${C.border}` }}>ET-LIN-CAP-06 ▾</span></Pulse></Click>
              <div className="text-muted mt-1">or into a new ref</div>
            </div>
          </Appear>
        )}
        {beat === 2 && (
          <Appear when>
            <div className="rounded p-2 mt-2" style={{ background: C.dangerTint, border: `1px solid ${C.danger}`, fontSize: 8, color: C.dangerInk }}>
              Anything placed with ET-LIN-CAP-07 in the DesignDB will be orphaned. Are you sure?
              <div className="mt-1"><Click on><span className="rounded px-2" style={{ background: C.danger, color: C.surface }}>Merge</span></Click></div>
            </div>
          </Appear>
        )}
      </Stage>
      <Caption>
        {[
          'Tick ElementTypes with the same maker and code. Merge… appears.',
          'Pick the one to keep, or give the merged ElementType a new ref. Every recipe row follows; rows that land together add up.',
          'The DesignDB is not loaded here, so you confirm that nothing placed there is left pointing at the old ref.',
        ][beat]}
      </Caption>
    </>
  )
}
