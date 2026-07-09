import React from 'react'
import { Button } from 'react-bootstrap'
import MaterialIcon from './MaterialIcon'
import { hasNoteCollision } from '../utils/productCodes'

/**
 * CompareCodesPanel — the distinct codes, and where each one is going.
 *
 * Duplicates and near-misses no longer live here: they are adjudicated in
 * NeedsResolving, above, where the codes can be seen side by side. What remains is
 * a flat list — one line per distinct code — whose only outstanding question is
 * "which ElementType?".
 *
 * Props:
 *   entries       — resolved distinct entries: { text, variants, positionTypes,
 *                   manufacturers, rowRefs, status, etRef }
 *   knownPTs      — Set of PositionTypeRefs the project knows (others get a "?")
 *   ptTarget(pt)  — the PositionType a form ref resolves to (see ptResolve); shown
 *                   when it differs, so a redirect is never invisible
 *   onCreateET(entry)   — entry carries `suggestedRef` to prefill the new ET
 *   onReuse(entry, ref) — assign an existing ElementType instead of creating one
 *   onJump(entry)       — click the code to jump back to the row that produced it
 */

const BG = { green: '#d1e7dd', amber: '#fff3cd', blue: '#cfe2ff', grey: '#f1f3f5' }
const FG = { green: '#0f5132', amber: '#856404', blue: '#084298', grey: '#495057' }

function PositionTypes({ pts, knownPTs, ptTarget }) {
  if (!pts.length) return null
  return (
    <div className="text-muted" style={{ fontSize: 10 }}>
      used by{' '}
      {pts.map((pt, i) => {
        const target = ptTarget?.(pt)
        const known = target || !knownPTs || knownPTs.has(pt)
        const redirected = target && target !== pt
        return (
          <span key={pt}
            title={!known ? 'Not a PositionType in this project — nothing will be prefilled'
              : redirected ? `Recipe goes to ${target} (the DesignDB's ExtRef says so)` : ''}
            style={{ fontFamily: 'monospace', color: known ? '#6c757d' : '#b45309' }}>
            {pt}{known ? '' : '?'}
            {redirected && <span style={{ color: '#084298' }}>→{target}</span>}
            {i < pts.length - 1 ? ', ' : ''}
          </span>
        )
      })}
    </div>
  )
}

export default function CompareCodesPanel({ entries, knownPTs, ptTarget, onCreateET, onReuse, onJump }) {
  if (!entries.length) {
    return <div className="text-muted fst-italic" style={{ fontSize: 11 }}>Confirm a row to collect its codes.</div>
  }

  return (
    <div>
      {entries.map(e => {
        const blocked = hasNoteCollision(e)
        return (
          <div key={e.text} className="py-1 border-bottom" style={{ fontSize: 11, opacity: blocked ? 0.5 : 1 }}>
            <div className="d-flex align-items-center gap-1">
              <span onClick={() => onJump?.(e)}
                title="Jump back to the row this came from, to adjust it"
                className="pc-jump"
                style={{ fontFamily: 'monospace', fontWeight: 600, cursor: 'pointer' }}
                onMouseEnter={ev => { ev.currentTarget.style.textDecoration = 'underline' }}
                onMouseLeave={ev => { ev.currentTarget.style.textDecoration = 'none' }}>
                {e.text}
              </span>
              <span className="rounded px-1" style={{ background: BG[e.status], color: FG[e.status], fontSize: 10 }}>
                {e.status}
              </span>
              <span className="text-muted ms-auto">{e.rowRefs.length} row{e.rowRefs.length === 1 ? '' : 's'}</span>
            </div>

            <PositionTypes pts={e.positionTypes} knownPTs={knownPTs} ptTarget={ptTarget} />
            {e.manufacturers.length > 1 && (
              <div className="text-warning" style={{ fontSize: 10 }}>
                <MaterialIcon name="warning" size={10} /> {e.manufacturers.join(' / ')}
              </div>
            )}

            {/* Reuse: existing ETs this code might already be. One click assigns
                the existing ref — the dedup win, no new ET minted. */}
            {!e.etRef && !blocked && (e.reuse?.length > 0) && (
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
                : blocked
                  ? <span className="text-muted fst-italic" style={{ fontSize: 10 }}>resolve above first</span>
                  : <Button size="sm" variant="outline-primary" style={{ fontSize: 10, padding: '0 6px' }}
                      onClick={() => onCreateET(e)}
                      title={e.suggestedRef ? `Create ${e.suggestedRef}` : 'Create a new ElementType'}>
                      Create {e.suggestedRef || 'ET'}
                    </Button>}
              {!blocked && e.variants[0]?.note && (
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
  )
}
