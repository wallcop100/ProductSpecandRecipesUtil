import React from 'react'
import MaterialIcon from '../../components/MaterialIcon'
import { Stage, Click, Pulse, Appear, MiniRow, Caption } from './atoms'
import { C } from '../../styles/tokens'

/**
 * ExportScene — the way out: three patch scripts you paste into Excel yourself.
 *
 * beats: 0 nothing is saved — the tool cannot write your workbooks
 *        1 the Changes tab: field-level before → after
 *        2 copy a patch script
 *        3 Excel: Automate → New Script → paste → Run (safe to run twice)
 *        4 the Resolve-first tab gates a correct patch
 */
export default function ExportScene({ beat }) {

  return (
    <>
      <Stage height={220}>
        {/* the three tabs */}
        <div className="d-flex gap-1 mb-2" style={{ fontSize: 9 }}>
          {['Changes', 'Patches', 'Resolve first'].map((t, i) => (
            <Click key={t} on={beat === 4 && i === 2}>
            <Pulse on={beat === 4 && i === 2}>
              <span className="rounded-top px-2 py-1" style={{
                background: (beat === 1 && i === 0) || ((beat === 2 || beat === 3) && i === 1) || (beat === 4 && i === 2) ? C.surface : C.subtle,
                border: `1px solid ${C.border}`, borderBottom: 'none',
                color: i === 2 ? C.attnInk : C.ink,
              }}>{t}{i === 2 ? ' (1)' : ''}</span>
            </Pulse>
            </Click>
          ))}
        </div>

        {beat === 0 && (
          <div className="rounded px-2 py-2" style={{ background: C.accentTint, border: `1px solid ${C.accentEdge}`, fontSize: 10 }}>
            <MaterialIcon name="lock" size={12} /> The workbooks are opened <strong>read-only</strong> —
            there is no code that can write them. Your edits leave as <strong>Office Script patches</strong>
            that you run in Excel yourself. So there is no Save button, and nothing to lose.
          </div>
        )}

        {beat === 1 && (
          <Appear when>
            <MiniRow>
              <span style={{ fontFamily: 'monospace', fontSize: 9, fontWeight: 600 }}>ET-LIN-TAPE-01</span>
              <span className="text-muted" style={{ fontSize: 9 }}>ProductCode:</span>
              <span style={{ fontSize: 9, color: C.dangerInk, textDecoration: 'line-through' }}>—</span>
              <MaterialIcon name="arrow_forward" size={10} style={{ color: C.faint }} />
              <span style={{ fontSize: 9, color: C.ink, fontFamily: 'monospace' }}>LL240272024</span>
            </MiniRow>
          </Appear>
        )}

        {(beat === 2 || beat === 3) && (
          <Appear when>
            {['Product Spec', 'Recipe Spec', 'ElementTypes (DB)'].map((f, i) => (
              <MiniRow key={f} active={i === 0 && beat === 2}>
                <MaterialIcon name="description" size={12} style={{ color: C.muted }} />
                <span style={{ fontSize: 10 }}>{f} patch</span>
                <span className="ms-auto">
                  <Click on={i === 0 && beat === 2}>
                    <Pulse on={i === 0 && beat === 2}>
                      <span className="rounded px-1" style={{ background: beat >= 3 && i === 0 ? C.subtle : C.surface, border: `1px solid ${C.border}`, fontSize: 9 }}>
                        {beat >= 3 && i === 0 ? 'copied ✓' : 'Copy'}
                      </span>
                    </Pulse>
                  </Click>
                </span>
              </MiniRow>
            ))}
          </Appear>
        )}
        {beat === 3 && (
          <Appear when>
            <div className="rounded px-2 py-1 mt-1" style={{ background: C.subtle, border: `1px solid ${C.border}`, fontSize: 9 }}>
              <strong>In Excel:</strong> Automate → New Script → paste → <strong>Run</strong>.
              Safe to run twice — a patch updates in place, never duplicates.
            </div>
          </Appear>
        )}

        {beat === 4 && (
          <Appear when>
            <div className="rounded px-2 py-2" style={{ background: C.attnTint, border: `1px solid ${C.attnTint}`, fontSize: 10, color: C.attnInk }}>
              <MaterialIcon name="warning" size={12} /> <strong>Resolve first</strong> lists what would make a
              patch wrong — an ElementType missing from the DesignDB master, a recipe with no spec row.
              Each has a one-click fix. Empty this tab, then export.
            </div>
          </Appear>
        )}
      </Stage>
      <Caption>
        {[
          'Nothing here is ever saved to your files. Export is how changes leave.',
          'Changes shows every pending edit, field by field, before → after.',
          'Patches: one script per workbook. Copy the ones with changes.',
          'Paste into Excel’s Automate tab and Run. Running twice is harmless.',
          'If Resolve first is lit, do it first: until then the patch would write wrong data.',
        ][beat]}
      </Caption>
    </>
  )
}
