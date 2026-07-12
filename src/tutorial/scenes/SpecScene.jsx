import React from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import EntityPill from '../../components/EntityPill'
import { Stage, Click, Pulse, Appear, MiniRow, Caption } from './atoms'
import { DEMO_PS } from '../demo-data'

/**
 * SpecScene — the Product Spec: every ElementType's (Manufacturer, ProductCode).
 *
 * beats: 0 the row anatomy — identity is the PAIR, never the code alone
 *        1 the status pills are FILTERS — click Missing
 *        2 Fill next steps to the first incomplete row
 *        3 filled — the pill count moves
 *        4 the wrapper reads Ideaworks / N-A on purpose. Never "fix" it.
 */
export default function SpecScene({ beat }) {
  const filled = beat >= 3
  const missingCount = filled ? 0 : 1
  const filtering = beat === 1 || beat === 2

  const rows = DEMO_PS.filter(r => !filtering || r.status === 'missing')

  return (
    <>
      <Stage>
        {/* header: completeness + pills + fill next */}
        <div className="d-flex align-items-center gap-2 mb-2" style={{ fontSize: 9 }}>
          <span className="text-muted">{3 - missingCount}/3 complete</span>
          <Click on={beat === 1}>
          <Pulse on={beat === 1}>
            <span className="rounded-pill px-2" style={{
              background: missingCount ? '#f8d7da' : '#e9ecef',
              color: missingCount ? '#842029' : '#adb5bd',
              border: filtering ? '1px solid #842029' : '1px solid transparent',
              transition: 'background .3s ease',
            }}>Missing {missingCount}</span>
          </Pulse>
          </Click>
          <span className="rounded-pill px-2" style={{ background: '#fff3cd', color: '#856404' }}>TBC 0</span>
          <span className="ms-auto">
            <Click on={beat === 2}>
              <Pulse on={beat === 2}>
                <span className="rounded px-2 py-1" style={{ background: '#fff', border: '1px solid #0d6efd', color: '#0d6efd' }}>
                  Fill next (1)
                </span>
              </Pulse>
            </Click>
          </span>
        </div>

        {rows.map(r => {
          const isTape = r.ref === 'ET-LIN-TAPE-01'
          const isWrapper = r.status === 'wrapper'
          return (
            <MiniRow key={r.ref} active={isTape && beat >= 2 && beat <= 3}>
              <EntityPill type="ElementType" label={r.ref} />
              <MaterialIcon name="arrow_forward" size={11} style={{ color: '#ccc' }} />
              <Pulse on={(beat === 0 && r.ref === 'ET-LIN-01') || (beat === 4 && isWrapper)}>
                {isTape && !filled ? (
                  <span className="fst-italic" style={{ fontSize: 9, color: '#842029' }}>no manufacturer · no code</span>
                ) : (
                  <span className="text-muted" style={{ fontSize: 10, transition: 'color .3s ease' }}>
                    {isTape ? 'Nichia – LL240272024' : `${r.mfr} – ${r.code}`}
                  </span>
                )}
              </Pulse>
              {isWrapper && beat === 4 && (
                <span className="ms-auto rounded px-1" style={{ background: '#e7f1ff', color: '#084298', fontSize: 8 }}>
                  wrapper — N/A is deliberate
                </span>
              )}
            </MiniRow>
          )
        })}

        <Appear when={beat === 4}>
          <div className="rounded px-2 py-1 mt-1" style={{ background: '#fff3cd', border: '1px solid #f0e0a8', fontSize: 9, color: '#856404' }}>
            A wrapper is an assembly, not a product — <strong>Ideaworks / N-A</strong> is its mark.
            Writing a real code onto it can un-wrapper the assembly.
          </div>
        </Appear>
      </Stage>
      <Caption>
        {[
          'A product is (Manufacturer, Code) — the pair, never the code alone.',
          'The status pills are filters. Click Missing and only the gaps remain.',
          'Fill next jumps you to the first incomplete row, focused on the field that needs you.',
          'Filled — and the Missing pill count moves with it.',
          'Leave wrappers alone: their N/A is load-bearing.',
        ][beat]}
      </Caption>
    </>
  )
}
