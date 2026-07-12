import React from 'react'
import StageBar from '../../components/StageBar'
import EntityPill from '../../components/EntityPill'
import { Stage, Click, Pulse, Appear, Caption } from './atoms'
import { DEMO_PAINT, DEMO_FORM } from '../demo-data'

/**
 * PaintScene — the import review, and painting in particular.
 *
 * Two earlier versions got this wrong. The first drew discrete chips you tap 1/2/3 on; the
 * second drew the right surface but did the whole paint in ONE beat, which teaches nothing.
 * Painting is a sequence, and every step of it is load-bearing:
 *
 *   The field is CONTINUOUS TEXT, exactly as typed (CodeChips) — you must be able to read
 *   "Profile 021-1103 (new code FPS2020BG2000)" as a sentence to judge which number you want.
 *   Everything starts as a NOTE. You pick a brush and DRAG. A painted code promotes onto its
 *   own line below (CaptureLines), carrying the note beside it. Discarding the `+` teaches
 *   the tool a DELIMITER, and the delimiter segments the row so each product's note attaches
 *   to ITS code rather than the nearest one (noteOwnerOf). Once a code SHAPE is known, the
 *   rest arrive suggested — `A` accepts them.
 *
 * The demo cell is a real linear row: four products, each with a superseded code next to its
 * current one. Nothing about it is tidy, which is the point.
 *
 * beats: 0 the ①②③ and the three columns
 *        1 ExtRef routes the Form's C01 to C01r
 *        2 the cell arrives — all of it is a note; nothing is a code until you say so
 *        3 pick Code, drag the tape code → it promotes, carrying "Tape"
 *        4 the profile: the superseded 021-1103 stays a NOTE, it is context, not junk
 *        5 Discard the `+` → a learned delimiter → notes snap to their own segment
 *        6 the FPS… shape is known now, so the last two are suggested — `A` accepts
 *        7 give each captured code its ElementType
 *        8 Stage — and what staging does NOT do
 */

/** The real BRUSH values from CodeChips. */
const ROLE_STYLE = {
  code: { background: '#d1e7dd', color: '#0f5132', fontWeight: 700, borderRadius: 2 },
  note: { color: '#212529' },
  discard: { color: '#c7ccd1', textDecoration: 'line-through' },
}

const BRUSHES = [['Code', '#198754', 'code'], ['Note', '#adb5bd', 'note'], ['Discard', '#dc3545', 'discard']]

export default function PaintScene({ beat }) {
  // The paint phase: beat 2 is the untouched cell, and each beat after advances it.
  const phase = beat - 2
  const brush = beat === 5 ? 'discard' : 'code'
  const painting = beat >= 2 && beat <= 7

  const roleAt = t => (t.at != null && phase >= t.at ? t.role : 'note')
  const lines = DEMO_PAINT.captures.filter(c => phase >= c.at)
  const suggested = beat === 6

  return (
    <>
      <Stage height={268}>
        <div className="mb-2">
          <StageBar current={beat >= 7 ? 2 : 1} done={beat >= 7 ? [1] : []} />
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
            {/* LEFT — the queue, and what the tool has learned from what you painted */}
            <div style={{ width: 78, flexShrink: 0 }}>
              <div className="text-muted text-uppercase fw-semibold" style={{ fontSize: 7 }}>Queue</div>
              <div className="rounded px-1 mb-1" style={{ background: '#cfe2ff', fontFamily: 'monospace', fontSize: 7 }}>
                C01r · Tape…
              </div>
              <div className="text-muted px-1" style={{ fontFamily: 'monospace', fontSize: 7 }}>C03r · Tape…</div>

              <div className="text-muted text-uppercase fw-semibold mt-2" style={{ fontSize: 7 }}>Learned</div>
              <Pulse on={beat === 5 || beat === 6}>
                <div className="rounded px-1 py-1" style={{ background: '#f8f9fa', fontSize: 7, lineHeight: 1.5 }}>
                  {phase < 1 && <span className="fst-italic text-muted">Nothing yet.</span>}
                  {phase >= 1 && <div>shape <strong style={{ color: '#0f5132' }}>LL#########</strong></div>}
                  {phase >= 2 && <div>shape <strong style={{ color: '#0f5132' }}>FPS########…</strong></div>}
                  {phase >= 3 && <div>delimiter <strong>+</strong></div>}
                  {phase >= 3 && <div>after <strong>“new code”</strong> → a code</div>}
                </div>
              </Pulse>
            </div>

            {/* CENTRE — the paint surface */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="text-muted mb-1" style={{ fontSize: 8 }}>
                Row 1 of 2 · <strong>{DEMO_PAINT.row}</strong> · {DEMO_PAINT.mfr}
              </div>

              {/* the palette: you pick a brush, THEN drag. 1/2/3 pick the brush. */}
              <Click on={beat === 3 || beat === 5}>
                <Pulse on={beat === 3 || beat === 5}>
                  <span className="d-inline-flex gap-1 mb-1">
                    {BRUSHES.map(([label, colour, role], i) => {
                      const on = painting && role === brush
                      return (
                        <span key={role} className="rounded px-1" style={{
                          fontSize: 7,
                          background: on ? colour : '#fff',
                          color: on ? '#fff' : '#6c757d',
                          border: `1px solid ${colour}`,
                          transition: 'background .3s ease, color .3s ease',
                        }}>
                          {i + 1} {label}
                        </span>
                      )
                    })}
                  </span>
                </Pulse>
              </Click>

              {/* the field: continuous text you drag over — never chips */}
              <div className="border rounded" style={{ background: '#fff' }}>
                <div className="px-2 py-2" style={{ fontSize: 9.5, lineHeight: 1.7 }}>
                  {DEMO_PAINT.tokens.map((t, i) => {
                    const role = roleAt(t)
                    const isNew = suggested && t.at === 4
                    return (
                      <span key={i} style={{
                        transition: 'background .35s ease, color .35s ease',
                        ...ROLE_STYLE[role],
                        ...(isNew ? { outline: '1px dashed #198754', outlineOffset: 1 } : null),
                      }}>
                        {t.tight ? '' : ' '}{t.text}
                      </span>
                    )
                  })}
                </div>

                {/* CaptureLines — each code promotes onto its own line, carrying its note */}
                <div className="px-2 py-1" style={{ background: '#fcfcfd', borderTop: '1px solid #e9ecef', minHeight: 58 }}>
                  {lines.length === 0 ? (
                    <div className="text-muted fst-italic" style={{ fontSize: 8 }}>nothing captured yet</div>
                  ) : lines.map(c => (
                    <Appear key={c.code} when>
                      <div className="d-flex align-items-center gap-1" style={{ fontSize: 7.5, marginBottom: 1 }}>
                        <span className="rounded px-1" style={{
                          background: '#d1e7dd', color: '#0f5132', fontFamily: 'monospace', fontWeight: 700,
                        }}>{c.code}</span>
                        <span className="text-muted text-truncate" style={{ minWidth: 0 }}>{c.note}</span>
                        {beat >= 7 && (
                          <span className="ms-auto flex-shrink-0">
                            <EntityPill type="ElementType" label={c.et} />
                          </span>
                        )}
                      </div>
                    </Appear>
                  ))}
                </div>
              </div>

              {beat === 6 && (
                <Appear when>
                  <div className="text-muted mt-1" style={{ fontSize: 7 }}>
                    <kbd style={{ fontSize: 7 }}>A</kbd> accepts the suggestions
                  </div>
                </Appear>
              )}
            </div>

            {/* RIGHT — codes and stage */}
            <div style={{ width: 70, flexShrink: 0, borderLeft: '1px solid #dee2e6', paddingLeft: 6 }}>
              <div className="text-muted text-uppercase fw-semibold" style={{ fontSize: 7 }}>Codes</div>
              <div style={{ fontSize: 7 }}>{lines.length ? `${lines.length} distinct` : '—'}</div>
              {beat >= 8 && (
                <Appear when>
                  <Click on>
                    <span className="rounded px-1 mt-1 d-inline-block" style={{ background: '#198754', color: '#fff', fontSize: 7 }}>
                      Stage {lines.length}
                    </span>
                  </Click>
                </Appear>
              )}
            </div>
          </div>
        )}

        {beat >= 8 && (
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
          'One cell, four products, each with an old code beside its new one. It stays readable as a sentence — that is how you tell them apart. Every word starts as a note.',
          'Pick the Code brush and DRAG over the tape code. It promotes onto its own line below, carrying the word beside it.',
          'Now the profile. The superseded 021-1103 stays a NOTE — a note is not junk, it rides with the code so you can still see what it replaced.',
          'Discard the “+” separators. That teaches a DELIMITER — and the row now segments, so each product’s note sticks to ITS code instead of drifting to the nearest one.',
          'The FPS… shape is known now, so the last two codes arrive suggested. Press A to take them.',
          'Four codes, four notes, each pointing at the ElementType it belongs to.',
          'Stage writes the Form template and the Product Spec rows. Recipes stay yours to build.',
        ][beat]}
      </Caption>
    </>
  )
}
