import React, { useMemo, useState } from 'react'
import { Button, Form } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import EntityPill from './EntityPill'
import { similarPositions, similarityReason } from '../utils/similarPositions'

/**
 * SimilarPositionsPanel — "what do positions like this one do?"
 *
 * The Form is silent about plenty of positions (`A02wE`), and the useful question is
 * whether it is a technical variant of one the Form DOES describe. This is the fourth
 * SOURCE in the palette drawer, alongside ElementTypes, Templates and Favourites: a
 * comparable position is just another thing you can pull rows from.
 *
 * Ranking never looks at the ref string (see similarPositions) — only at the family the
 * DB states, the tags, and the recipe overlap. And because a ranking is never the whole
 * truth, the search box reaches EVERY position, not just the suggested ones.
 */
const TOP_N = 8

export default function SimilarPositionsPanel({ posRef }) {
  const positionTypes = useStore(s => s.positionTypes)
  const recipes = useStore(s => s.recipes)
  const positionUI = useStore(s => s.positionUI)
  const copyRecipeFrom = useStore(s => s.copyRecipeFrom)
  const setActivePosition = useStore(s => s.setActivePosition)

  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)   // which candidate is expanded

  const ranked = useMemo(
    () => similarPositions(posRef, { positionTypes, recipes, positionUI }),
    [posRef, positionTypes, recipes, positionUI]
  )

  // Rows of a candidate, for the peek.
  const rowsOf = useMemo(() => {
    const m = {}
    for (const r of recipes) {
      if ((r.IsDeleted || r.isDeleted) === 'Y') continue
      const p = r.PositionTypeRef || r.positionTypeRef
      const et = r.ElementTypeRef || r.elementTypeRef
      if (!p || !et) continue
      ;(m[p] ??= []).push({
        et,
        internal: (r.ContextType || r.contextType) === 'ElementType',
      })
    }
    return m
  }, [recipes])

  if (!posRef) {
    return (
      <div className="text-muted text-center px-3 py-4" style={{ fontSize: 11 }}>
        <MaterialIcon name="group" size={26} style={{ color: '#adb5bd' }} />
        <div className="mt-2">Open a position to see what comparable ones do.</div>
      </div>
    )
  }

  const term = q.trim().toLowerCase()
  // Searching reaches every position; otherwise show the best few.
  const shown = term
    ? ranked.filter(s => s.ref.toLowerCase().includes(term))
    : ranked.slice(0, TOP_N)

  return (
    <div className="px-2 py-2">
      <div className="text-muted mb-2" style={{ fontSize: 10, lineHeight: 1.5 }}>
        Positions like <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{posRef}</span>, by the
        family the DB states, their tags and their recipes — never by how the ref is spelt.
      </div>

      <Form.Control
        size="sm"
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="Search any position…"
        style={{ fontSize: 11, marginBottom: 8 }}
      />

      {shown.length === 0 && (
        <div className="text-muted fst-italic" style={{ fontSize: 11 }}>
          {term ? 'No position matches that.' : 'No other positions to compare with.'}
        </div>
      )}

      {shown.map(s => {
        const rows = rowsOf[s.ref] || []
        const isOpen = open === s.ref
        const reason = similarityReason(s)
        return (
          <div key={s.ref} className="mb-1 rounded" style={{ border: '1px solid #e9ecef' }}>
            <div className="d-flex align-items-center gap-1 px-2 py-1">
              <button className="btn btn-link p-0" style={{ color: '#adb5bd', lineHeight: 1 }}
                onClick={() => setOpen(isOpen ? null : s.ref)}
                title={isOpen ? 'Hide its rows' : 'Show its rows'}
                aria-label={isOpen ? 'Hide its rows' : 'Show its rows'}>
                <MaterialIcon name={isOpen ? 'expand_more' : 'chevron_right'} size={16} />
              </button>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="d-flex align-items-center gap-1">
                  <EntityPill type="PositionType" label={s.ref} />
                  <span className="text-muted" style={{ fontSize: 10 }}>
                    {rows.length} row{rows.length === 1 ? '' : 's'}
                  </span>
                </div>
                {reason && (
                  <div className="text-muted text-truncate" style={{ fontSize: 10 }} title={reason}>
                    {reason}
                  </div>
                )}
              </div>
              <button className="btn btn-link p-0" style={{ color: '#adb5bd', lineHeight: 1 }}
                onClick={() => setActivePosition(s.ref)}
                title={`Open ${s.ref}`} aria-label={`Open ${s.ref}`}>
                <MaterialIcon name="open_in_new" size={14} />
              </button>
            </div>

            {isOpen && (
              <div className="px-2 pb-2" style={{ borderTop: '1px solid #f1f3f5' }}>
                {rows.length === 0 ? (
                  <div className="text-muted fst-italic pt-1" style={{ fontSize: 10 }}>
                    No recipe of its own.
                  </div>
                ) : (
                  <>
                    {rows.map((r, i) => (
                      <div key={`${r.et}-${i}`} className="d-flex align-items-center gap-1 pt-1">
                        <span style={{ fontFamily: 'monospace', fontSize: 10, flex: 1, minWidth: 0 }}
                          className="text-truncate">
                          {r.et}
                          {r.internal && <span className="text-muted"> · inside</span>}
                        </span>
                        <button className="btn btn-link p-0" style={{ color: '#198754', lineHeight: 1 }}
                          onClick={() => copyRecipeFrom(s.ref, posRef, { etRefs: [r.et] })}
                          title={`Add ${r.et} to ${posRef}`} aria-label={`Add ${r.et} to ${posRef}`}>
                          <MaterialIcon name="add" size={15} />
                        </button>
                      </div>
                    ))}
                    <Button size="sm" variant="outline-success" className="w-100 mt-2"
                      style={{ fontSize: 10 }}
                      onClick={() => copyRecipeFrom(s.ref, posRef)}
                      title={`Add every row of ${s.ref} to ${posRef} (quantities merge; nothing is removed)`}>
                      <MaterialIcon name="content_copy" size={12} /> Copy all {rows.length} into {posRef}
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}

      {!term && ranked.length > TOP_N && (
        <div className="text-muted text-center mt-1" style={{ fontSize: 10 }}>
          {ranked.length - TOP_N} more — search to reach them.
        </div>
      )}
    </div>
  )
}
