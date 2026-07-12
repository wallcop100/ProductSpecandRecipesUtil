import React from 'react'
import StageBar from '../../components/StageBar'
import EntityPill from '../../components/EntityPill'
import { Stage, Click, Pulse, Appear, Caption } from './atoms'
import { DEMO_PAINT, DEMO_FORM } from '../demo-data'

/**
 * PaintScene — the import review, as it actually is.
 *
 * The first version of this drew discrete chips you tap 1/2/3 on. That is not the
 * mechanism. The real surface (CodeChips) renders the cell as CONTINUOUS TEXT, exactly as
 * typed — you must be able to read "FPS2020BG2000 (old code 021-1102)" as a sentence to
 * judge it — and you paint by picking a BRUSH from the palette and DRAGGING over the words.
 * 1/2/3 pick the brush; they do not paint. Codes then promote onto their own line
 * underneath (CaptureLines).
 *
 * And the screen is three columns: the queue + what it has learned, the field you paint,
 * and the resolve/stage panel.
 *
 *   code    green tint, bold      note   plain text      discard   grey, struck through
 *
 * beats: 0 the ①②③ and the three columns
 *        1 the Form's ref is routed by ExtRef (C01 → C01r)
 *        2 pick a brush and drag over the text
 *        3 the codes promote below; the rule applies to every row containing that token
 *        4 Stage — and what staging does NOT do
 */
const ROLE_STYLE = {
  code: { background: '#d1e7dd', color: '#0f5132', fontWeight: 700, borderRadius: 2 },
  note: { color: '#212529' },
  discard: { color: '#c7ccd1', textDecoration: 'line-through' },
  null: { color: '#212529' },
}

export default function PaintScene({ beat }) {
  const painted = beat >= 2

  return (
    <>
      <Stage height={250}>
        <div className="mb-2">
          <StageBar current={beat >= 3 ? 2 : 1} done={beat >= 3 ? [1] : []} />
        </div>

        {beat === 1 ? (
          <Appear when>
            <div className="rounded px-2 py-2" style={{ background: '#e7f1ff', border: '1px solid #b6d4fe', fontSize: 10 }}>
              The Form says <strong>{DEMO_FORM.formRef}</strong>. The DesignDB row whose{' '}
              <strong>ExtRef</strong> claims that name is <strong>{DEMO_FORM.target}</strong> — and that is
              where the recipe lives. Never inferred from the spelling.
            </div>
          </Appear>
        ) : (
          <div className="d-flex gap-2" style={{ fontSize: 9 }}>
            {/* LEFT — the queue, and what the tool has learned */}
            <div style={{ width: 84, flexShrink: 0 }}>
              <div className="text-muted text-uppercase fw-semibold" style={{ fontSize: 7 }}>Queue (2 left)</div>
              <div className="rounded px-1 mb-1" style={{ background: '#cfe2ff', fontFamily: 'monospace', fontSize: 7 }}>
                C01 Nichia LL24…
              </div>
              <div className="text-muted px-1" style={{ fontFamily: 'monospace', fontSize: 7 }}>C03 Nichia LL24…</div>
              <div className="text-muted text-uppercase fw-semibold mt-2" style={{ fontSize: 7 }}>Learned</div>
              <Pulse on={beat === 3}>
                <div className="rounded px-1 py-1" style={{ background: '#f8f9fa', fontSize: 7 }}>
                  {painted ? (
                    <>keeping <strong style={{ color: '#0f5132' }}>1</strong> as code · <strong>1</strong> as note · discarding <strong>1</strong></>
                  ) : (
                    <span className="fst-italic text-muted">Nothing yet.</span>
                  )}
                </div>
              </Pulse>
            </div>

            {/* CENTRE — the field you paint */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="text-muted mb-1" style={{ fontSize: 8 }}>
                Row 1 of 2 · <strong>{DEMO_FORM.formRef}</strong> · Nichia
              </div>

              {/* the brush palette — you pick a colour, then drag */}
              <Click on={beat === 2}>
                <Pulse on={beat === 2}>
                  <span className="d-inline-flex gap-1 mb-1">
                    {[['Code', '#198754'], ['Note', '#adb5bd'], ['Discard', '#dc3545']].map(([l, c], i) => (
                      <span key={l} className="rounded px-1" style={{
                        fontSize: 7,
                        background: i === 0 && beat >= 2 ? c : '#fff',
                        color: i === 0 && beat >= 2 ? '#fff' : '#6c757d',
                        border: `1px solid ${c}`,
                      }}>{l}</span>
                    ))}
                  </span>
                </Pulse>
              </Click>

              {/* the field: CONTINUOUS TEXT, not chips. You drag over it. */}
              <div className="border rounded" style={{ background: '#fff' }}>
                <div className="px-2 py-2" style={{ fontSize: 10, lineHeight: 1.6 }}>
                  {DEMO_PAINT.tokens.map((t, i) => (
                    <span key={t.text} style={{
                      transition: 'background .35s ease, color .35s ease',
                      ...(painted ? ROLE_STYLE[t.role] : ROLE_STYLE.null),
                    }}>
                      {t.text}{i < DEMO_PAINT.tokens.length - 1 ? ' ' : ''}
                    </span>
                  ))}
                </div>
                {/* CaptureLines — the code promotes onto its own line below */}
                <div className="px-2 py-1" style={{ background: '#fcfcfd', borderTop: '1px solid #e9ecef' }}>
                  {painted ? (
                    <Appear when>
                      <div className="d-flex align-items-center gap-1" style={{ fontSize: 8 }}>
                        <span className="rounded px-1" style={{ background: '#d1e7dd', color: '#0f5132', fontFamily: 'monospace', fontWeight: 700 }}>
                          LL240272024
                        </span>
                        <span className="text-muted">2700K 24V</span>
                        {beat >= 3 && (
                          <span className="ms-auto">
                            <Click on={beat === 3}><EntityPill type="ElementType" label="ET-LIN-TAPE-01" /></Click>
                          </span>
                        )}
                      </div>
                    </Appear>
                  ) : (
                    <div className="text-muted fst-italic" style={{ fontSize: 8 }}>nothing captured yet</div>
                  )}
                </div>
              </div>
              <span className="rounded px-1 mt-1 d-inline-block" style={{ background: '#0d6efd', color: '#fff', fontSize: 7 }}>
                Confirm ⏎
              </span>
            </div>

            {/* RIGHT — resolve + stage */}
            <div style={{ width: 76, flexShrink: 0, borderLeft: '1px solid #dee2e6', paddingLeft: 6 }}>
              <div className="text-muted text-uppercase fw-semibold" style={{ fontSize: 7 }}>Codes</div>
              <div className="text-muted" style={{ fontSize: 7 }}>{painted ? '1 distinct' : '—'}</div>
              {beat >= 4 && (
                <Appear when>
                  <Click on>
                    <span className="rounded px-1 mt-1 d-inline-block" style={{ background: '#198754', color: '#fff', fontSize: 7 }}>
                      Stage 1 code
                    </span>
                  </Click>
                </Appear>
              )}
            </div>
          </div>
        )}

        {beat >= 4 && (
          <Appear when>
            <div className="rounded px-2 py-1 mt-1" style={{ background: '#d1e7dd', border: '1px solid #a3cfbb', fontSize: 8, color: '#0f5132' }}>
              Staged: the Form template + the Product Spec rows. <strong>No recipe row is written.</strong>
            </div>
          </Appear>
        )}
      </Stage>
      <Caption>
        {[
          'The whole workflow: ① identify codes ② assign ElementTypes ③ build recipes.',
          `The Form’s ${DEMO_FORM.formRef} is routed to ${DEMO_FORM.target} by ExtRef — never by spelling.`,
          'The cell stays readable as a sentence. Pick a brush, then DRAG over the words — 1/2/3 pick the brush.',
          'Painted codes promote onto their own line — and the rule applies to every row containing that token.',
          'Stage writes the Form template and the Product Spec. Recipes stay yours to build.',
        ][beat]}
      </Caption>
    </>
  )
}
