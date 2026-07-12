import React from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import { Stage, Click, Pulse, Appear, Caption } from './atoms'
import { DEMO_PS } from '../demo-data'

/**
 * SpecScene — the Product Spec, as it actually is: a SPLIT PANEL.
 *
 * The first version drew a flat list of rows. The real screen is a browser on the LEFT
 * (By Family / By Manufacturer, a search box, and rows that are a checkbox + a coloured
 * STATUS DOT + the ref), a DRAGGABLE SPLITTER, and an EDITOR FORM on the right — which is
 * where you actually type the manufacturer and the product code.
 *
 * The dot colours are the real ones from ETSpecBrowser: complete #22c55e, partial #f59e0b,
 * missing #ef4444.
 *
 * beats: 0 the split panel, and what a row's dot means
 *        1 the status pills in the header are FILTERS
 *        2 Fill next selects the first incomplete row and focuses the field it needs
 *        3 filled — the dot goes green, the counts move
 *        4 a wrapper reads Ideaworks / N-A on purpose
 */
const DOT = { complete: '#22c55e', partial: '#f59e0b', missing: '#ef4444', wrapper: '#22c55e' }

export default function SpecScene({ beat }) {
  const filled = beat >= 3
  const filtering = beat === 1 || beat === 2
  const missingCount = filled ? 0 : 1
  const showWrapper = beat === 4

  const statusOf = r =>
    (filled && r.ref === 'ET-LIN-TAPE-01') ? 'complete' : r.status

  const selectedRef = showWrapper ? 'ET-LIN-01' : (beat >= 2 ? 'ET-LIN-TAPE-01' : 'ET-2Pin-LIN-Socket')
  const rows = DEMO_PS.filter(r => !filtering || statusOf(r) === 'missing')
  const editing = DEMO_PS.find(r => r.ref === selectedRef) || DEMO_PS[0]

  const isTape = editing.ref === 'ET-LIN-TAPE-01'
  const editMfr = isTape ? (filled ? 'Nichia' : '') : editing.mfr
  const editCode = isTape ? (filled ? 'LL240272024' : '') : editing.code

  return (
    <>
      <Stage height={250}>
        {/* header: completeness · status-pill filters · Fill next */}
        <div className="d-flex align-items-center gap-2 mb-2 pb-1"
          style={{ borderBottom: '1px solid #e9ecef', fontSize: 9 }}>
          <span className="fw-semibold">Product Spec</span>
          <span style={{ width: 50, height: 5, borderRadius: 3, background: '#e9ecef', overflow: 'hidden', display: 'inline-block' }}>
            <span style={{ display: 'block', height: '100%', width: filled ? '100%' : '67%', background: '#22c55e', transition: 'width .4s ease' }} />
          </span>
          <span className="text-muted" style={{ fontSize: 8 }}>{3 - missingCount} / 3 complete</span>

          <Click on={beat === 1}>
            <Pulse on={beat === 1}>
              <span className="rounded-pill px-2" style={{
                fontSize: 8,
                background: missingCount ? '#fee2e2' : '#e9ecef',
                color: missingCount ? '#991b1b' : '#adb5bd',
                border: filtering ? '1px solid #ef4444' : '1px solid transparent',
                transition: 'background .3s ease',
              }}>● Missing {missingCount}</span>
            </Pulse>
          </Click>
          <span className="rounded-pill px-2" style={{ fontSize: 8, background: '#fef3c7', color: '#92400e' }}>● TBC 0</span>

          <span className="ms-auto">
            <Click on={beat === 2}>
              <Pulse on={beat === 2}>
                <span className="rounded px-2 py-1" style={{ background: '#fff', border: '1px solid #0d6efd', color: '#0d6efd', fontSize: 8 }}>
                  Fill next ({missingCount})
                </span>
              </Pulse>
            </Click>
          </span>
        </div>

        {/* THE SPLIT PANEL: browser | splitter | editor */}
        <div className="d-flex" style={{ height: 152 }}>
          <div style={{ width: 148, flexShrink: 0 }}>
            <div className="d-flex mb-1" style={{ fontSize: 7 }}>
              <span className="px-1 py-1" style={{ background: '#0d6efd', color: '#fff', flex: 1, textAlign: 'center', borderRadius: '3px 0 0 3px' }}>By Family</span>
              <span className="px-1 py-1" style={{ background: '#fff', color: '#6c757d', border: '1px solid #dee2e6', flex: 1, textAlign: 'center', borderRadius: '0 3px 3px 0' }}>By Mfr</span>
            </div>
            <div className="rounded px-1 py-1 mb-1" style={{ background: '#fff', border: '1px solid #dee2e6', fontSize: 7, color: '#adb5bd' }}>
              Search…
            </div>

            {rows.map(r => {
              const st = statusOf(r)
              const isSel = r.ref === selectedRef
              return (
                <div key={r.ref} className="d-flex align-items-center gap-1 px-1" style={{
                  minHeight: 20, fontSize: 8,
                  background: isSel ? '#e8f0fe' : 'transparent',
                  borderLeft: `3px solid ${isSel ? '#4285f4' : 'transparent'}`,
                  transition: 'background .3s ease',
                }}>
                  <MaterialIcon name="check_box_outline_blank" size={9} style={{ color: '#ccc' }} />
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%', display: 'inline-block', flexShrink: 0,
                    background: DOT[st] || '#ccc', transition: 'background .4s ease',
                  }} />
                  <span className="text-truncate" style={{ flex: 1, fontWeight: 500, minWidth: 0 }}>{r.ref}</span>
                </div>
              )
            })}
          </div>

          {/* the draggable splitter */}
          <div style={{ width: 4, flexShrink: 0, background: '#dee2e6', cursor: 'col-resize' }} title="Drag to resize" />

          {/* the editor — where you actually type */}
          <div className="ps-2" style={{ flex: 1, minWidth: 0 }}>
            <div className="fw-semibold mb-1 text-truncate" style={{ fontSize: 9, fontFamily: 'monospace' }}>{editing.ref}</div>

            <div className="text-muted" style={{ fontSize: 7 }}>Manufacturer</div>
            <div className="rounded px-1 py-1 mb-1" style={{
              background: '#fff', border: `1px solid ${editMfr ? '#dee2e6' : '#ef4444'}`,
              fontSize: 8, minHeight: 16, transition: 'border-color .3s ease',
            }}>
              {editMfr || <span style={{ color: '#ef4444' }}>needed</span>}
            </div>

            <div className="text-muted" style={{ fontSize: 7 }}>Product code</div>
            <Pulse on={beat === 2 || beat === 3}>
              <div className="rounded px-1 py-1 mb-1" style={{
                background: '#fff', border: `1px solid ${editCode ? '#dee2e6' : '#ef4444'}`,
                fontSize: 8, minHeight: 16, fontFamily: 'monospace', transition: 'border-color .3s ease',
              }}>
                {editCode || <span style={{ color: '#ef4444', fontFamily: 'inherit' }}>needed</span>}
              </div>
            </Pulse>

            {showWrapper && (
              <Appear when>
                <div className="rounded px-1 py-1" style={{ background: '#fff3cd', border: '1px solid #f0e0a8', fontSize: 7, color: '#856404' }}>
                  A wrapper is an assembly, not a product. <strong>Ideaworks / N-A</strong> is its mark —
                  writing a real code here can un-wrapper the assembly.
                </div>
              </Appear>
            )}
          </div>
        </div>
      </Stage>
      <Caption>
        {[
          'A browser on the left, the editor on the right. The dot is the row’s status: green complete, amber TBC, red missing.',
          'The status pills in the header are filters. Click Missing and only the gaps remain.',
          'Fill next selects the first incomplete row and drops you in the field it needs.',
          'Type it in — the dot turns green and the counts move with it.',
          'Leave wrappers alone: their Ideaworks / N-A is load-bearing.',
        ][beat]}
      </Caption>
    </>
  )
}
