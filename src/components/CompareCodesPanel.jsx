import React from 'react'
import { Button } from 'react-bootstrap'
import MaterialIcon from './MaterialIcon'
import { clusterSimilar, hasNoteCollision } from '../utils/productCodes'

/**
 * CompareCodesPanel — the holistic view.
 *
 * Whether a note distinguishes a code enough to need its own ref is only knowable
 * by comparing similar codes side by side. This clusters codes standing in a prefix
 * relation, and flags the case the user cares about: the SAME code captured with
 * DIFFERENT notes. Those block staging until resolved — one click promotes the note
 * into the code, making the ProductCode genuinely distinct so it can take its own ET.
 *
 * Props:
 *   entries       — resolved distinct entries: { text, variants, positionTypes,
 *                   manufacturers, rowRefs, status, etRef }
 *   knownPTs      — Set of PositionTypeRefs the project knows (others get a "?")
 *   onCreateET(entry)   — entry carries `suggestedRef` to prefill the new ET
 *   onReuse(entry, ref) — assign an existing ElementType instead of creating one
 *   onPromote(entry, variant)
 *   onJump(entry)   — click the code to jump back to the row that produced it
 *
 * Each entry may carry `reuse: [{ ref, kind, score, matchedCode }]` and
 * `suggestedRef` (see etRefSuggest); a `sharedDL` flag surfaces shared point sources.
 */

const BG = { green: '#d1e7dd', amber: '#fff3cd', blue: '#cfe2ff', grey: '#f1f3f5' }
const FG = { green: '#0f5132', amber: '#856404', blue: '#084298', grey: '#495057' }

function PositionTypes({ pts, knownPTs }) {
  if (!pts.length) return null
  return (
    <div className="text-muted" style={{ fontSize: 10 }}>
      used by{' '}
      {pts.map((pt, i) => {
        const known = !knownPTs || knownPTs.has(pt)
        return (
          <span key={pt} title={known ? '' : 'Not a PositionType in this project'}
            style={{ fontFamily: 'monospace', color: known ? '#6c757d' : '#b45309' }}>
            {pt}{known ? '' : '?'}{i < pts.length - 1 ? ', ' : ''}
          </span>
        )
      })}
    </div>
  )
}

export default function CompareCodesPanel({ entries, knownPTs, onCreateET, onReuse, onPromote, onJump }) {
  if (!entries.length) {
    return <div className="text-muted fst-italic" style={{ fontSize: 11 }}>Confirm a row to collect its codes.</div>
  }
  const clusters = clusterSimilar(entries)

  return (
    <div>
      {clusters.map((cluster, ci) => (
        <div key={ci} className={cluster.length > 1 ? 'mb-3 p-2 rounded' : 'mb-2'}
          style={cluster.length > 1 ? { background: '#f8f9fa', border: '1px solid #e9ecef' } : undefined}>
          {cluster.length > 1 && (
            <div className="text-muted mb-1" style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              {cluster.length} similar codes — compare before deciding
            </div>
          )}

          {cluster.map(e => {
            const collision = hasNoteCollision(e)
            return (
              <div key={e.text} className="py-1 border-bottom" style={{ fontSize: 11 }}>
                <div className="d-flex align-items-center gap-1">
                  <span onClick={() => onJump?.(e)}
                    title="Jump back to the row this came from, to adjust it"
                    className="pc-jump"
                    style={{ fontFamily: 'monospace', fontWeight: 600, cursor: 'pointer', textDecorationThickness: 1 }}
                    onMouseEnter={ev => { ev.currentTarget.style.textDecoration = 'underline' }}
                    onMouseLeave={ev => { ev.currentTarget.style.textDecoration = 'none' }}>
                    {e.text}
                  </span>
                  <span className="rounded px-1" style={{ background: BG[e.status], color: FG[e.status], fontSize: 10 }}>
                    {e.status}
                  </span>
                  {collision && (
                    <span className="text-warning d-inline-flex align-items-center" title="Same code, different notes">
                      <MaterialIcon name="warning" size={12} />
                    </span>
                  )}
                  <span className="text-muted ms-auto">{e.rowRefs.length} row{e.rowRefs.length === 1 ? '' : 's'}</span>
                </div>

                <PositionTypes pts={e.positionTypes} knownPTs={knownPTs} />
                {e.manufacturers.length > 1 && (
                  <div className="text-warning" style={{ fontSize: 10 }}>
                    <MaterialIcon name="warning" size={10} /> {e.manufacturers.join(' / ')}
                  </div>
                )}

                {/* Variants: the same code carrying different notes. */}
                {collision && (
                  <div className="mt-1 ps-2" style={{ borderLeft: '2px solid #ffc107' }}>
                    <div style={{ fontSize: 10, color: '#856404' }}>
                      {e.variants.length} variants — does a note make one of these a different product?
                    </div>
                    {e.variants.map((v, vi) => (
                      <div key={vi} className="d-flex align-items-center gap-1 py-1">
                        <span style={{ fontSize: 10, fontStyle: v.note ? 'normal' : 'italic' }}>
                          {v.note || '(no note)'}
                        </span>
                        <span className="text-muted" style={{ fontSize: 9, fontFamily: 'monospace' }}>
                          {v.positionTypes.join(', ')}
                        </span>
                        {v.note && (
                          <Button size="sm" variant="outline-warning" className="ms-auto"
                            style={{ fontSize: 9, padding: '0 5px' }}
                            title="Make this note part of the code, so it earns its own ref"
                            onClick={() => onPromote(e, v)}>
                            Promote into code
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Reuse: existing ETs this code might already be. One click assigns
                    the existing ref — the dedup win, no new ET minted. */}
                {!e.etRef && !collision && (e.reuse?.length > 0) && (
                  <div className="mt-1">
                    {e.reuse.map(c => (
                      <div key={c.ref} className="d-flex align-items-center gap-1 py-1" style={{ fontSize: 10 }}>
                        <MaterialIcon name={c.kind === 'same' ? 'link' : 'call_split'} size={12}
                          style={{ color: c.kind === 'same' ? '#198754' : '#b45309' }} />
                        <span style={{ fontFamily: 'monospace' }}>{c.ref}</span>
                        <span className="text-muted">
                          {c.kind === 'same' ? 'looks the same' : 'variant'} · {Math.round(c.score * 100)}%
                        </span>
                        <Button size="sm" variant="outline-success" className="ms-auto"
                          style={{ fontSize: 9, padding: '0 5px' }}
                          title={`Reuse ${c.ref}${c.matchedCode ? ` (${c.matchedCode})` : ''} instead of creating a new ElementType`}
                          onClick={() => onReuse(e, c.ref)}>
                          Use
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="d-flex align-items-center gap-1 mt-1">
                  {e.etRef
                    ? <span className="text-success" style={{ fontFamily: 'monospace' }}>
                        <MaterialIcon name="check" size={11} /> {e.etRef}
                      </span>
                    : collision
                      ? <span className="text-muted fst-italic" style={{ fontSize: 10 }}>resolve the variants first</span>
                      : <Button size="sm" variant="outline-primary" style={{ fontSize: 10, padding: '0 6px' }}
                          onClick={() => onCreateET(e)}
                          title={e.suggestedRef ? `Create ${e.suggestedRef}` : 'Create a new ElementType'}>
                          Create {e.suggestedRef || 'ET'}
                        </Button>}
                  {!collision && e.variants[0]?.note && (
                    <span className="text-muted text-truncate" style={{ fontSize: 10, maxWidth: 150 }}
                      title={e.variants[0].note}>
                      note: {e.variants[0].note}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
