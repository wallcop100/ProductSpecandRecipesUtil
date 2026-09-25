import React, { useEffect, useMemo, useState } from 'react'
import { Modal, Button, Form } from 'react-bootstrap'
import MaterialIcon from './MaterialIcon'
import { refamily } from '../utils/etSeed'

/**
 * BulkCreateETModal — every code that still needs an ElementType, proposed at once.
 *
 * Everything starts ticked: the job is weeding out the wrong ones, not building the
 * right ones by hand. Proposals are grouped by family, because a wrong family is
 * usually wrong for the whole group — change it once in the group header and every
 * ref in the group is re-numbered.
 *
 * A code that already matches an existing product is proposed as a REUSE of it.
 *
 * Props:
 *   proposals     — from proposeElementTypes (etSeed.js)
 *   families      — every family ref the project has, for the pickers
 *   elementTypes  — the project's ETs, for clash checks and re-numbering
 *   onApply(list) — the included proposals, as edited
 */

const WHY = {
  code: 'a similar code from this maker is in it',
  maker: "this maker's other products are in it",
  words: 'words in the Form match its members',
  position: "the position's design element is in it",
  you: 'you chose it',
}

export default function BulkCreateETModal({ show, onHide, proposals: initial, families = [], elementTypes = [], onApply }) {
  const [rows, setRows] = useState(initial || [])
  useEffect(() => { if (show) setRows(initial || []) }, [show, initial])

  const existing = useMemo(
    () => new Set(elementTypes.map(e => (e.ElementTypeRef || e.elementTypeRef || '').toLowerCase())),
    [elementTypes]
  )

  // A ref is bad when blank, already in the project, or used twice in this batch.
  const problems = useMemo(() => {
    const seen = new Map()
    rows.forEach((r, i) => {
      if (!r.include || r.action !== 'create') return
      const k = r.ref.trim().toLowerCase()
      seen.set(k, [...(seen.get(k) || []), i])
    })
    const out = new Map()
    rows.forEach((r, i) => {
      if (!r.include || r.action !== 'create') return
      const k = r.ref.trim().toLowerCase()
      if (!k) out.set(i, 'needs a ref')
      else if (existing.has(k)) out.set(i, 'already exists')
      else if (seen.get(k).length > 1) out.set(i, 'used twice here')
    })
    return out
  }, [rows, existing])

  const groups = useMemo(() => {
    const g = new Map()
    rows.forEach((r, i) => {
      const key = r.action === 'reuse' ? '__reuse' : (r.family || '')
      if (!g.has(key)) g.set(key, [])
      g.get(key).push(i)
    })
    return [...g.entries()].sort(([a], [b]) => (a === '__reuse') - (b === '__reuse') || a.localeCompare(b))
  }, [rows])

  const patch = (i, next) => setRows(rs => rs.map((r, k) => (k === i ? { ...r, ...next } : r)))
  const included = rows.filter(r => r.include)
  const creating = included.filter(r => r.action === 'create').length
  const reusing = included.length - creating

  const familyOptions = useMemo(() => [...new Set([...families, ...rows.map(r => r.family)].filter(Boolean))].sort(), [families, rows])

  return (
    <Modal show={show} onHide={onHide} size="xl" scrollable>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 16 }}>
          New ElementTypes for {rows.length} code{rows.length === 1 ? '' : 's'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ fontSize: 12 }}>
        <div className="text-muted mb-2" style={{ fontSize: 11 }}>
          Everything is ticked. Untick what is wrong, fix a family for a whole group in its header,
          and edit any ref, name or description in place. Names follow the DesignDB: <em>Maker - Code</em>.
        </div>

        {groups.map(([key, idxs]) => {
          const isReuse = key === '__reuse'
          const allOn = idxs.every(i => rows[i].include)
          return (
            <div key={key || '__none'} className="mb-3 border rounded">
              <div className="d-flex align-items-center gap-2 px-2 py-1" style={{ background: '#f8f9fa' }}>
                <Form.Check type="checkbox" checked={allOn} title={allOn ? 'Untick the group' : 'Tick the group'}
                  onChange={() => setRows(rs => rs.map((r, k) => (idxs.includes(k) ? { ...r, include: !allOn } : r)))} />
                {isReuse ? (
                  <span className="fw-semibold">
                    <MaterialIcon name="link" size={13} /> Already in the project — reuse the existing ElementType
                  </span>
                ) : (
                  <>
                    <span className="fw-semibold">Family</span>
                    <Form.Select size="sm" style={{ width: 240, fontSize: 12 }} value={key}
                      aria-label={`Family for ${key || 'ungrouped'}`}
                      onChange={e => setRows(rs => refamily(rs, idxs, e.target.value, elementTypes))}>
                      {!key && <option value="">— pick a family —</option>}
                      {familyOptions.map(f => <option key={f} value={f}>{f}</option>)}
                    </Form.Select>
                    {!key && <span className="text-danger" style={{ fontSize: 11 }}>No family could be guessed</span>}
                  </>
                )}
                <span className="text-muted ms-auto" style={{ fontSize: 11 }}>{idxs.length}</span>
              </div>

              <table className="table table-sm mb-0" style={{ fontSize: 11 }}>
                <tbody>
                  {idxs.map(i => {
                    const r = rows[i]
                    const bad = problems.get(i)
                    return (
                      <tr key={i} style={{ opacity: r.include ? 1 : 0.45 }} data-testid="bulk-et-row">
                        <td style={{ width: 24 }}>
                          <Form.Check type="checkbox" checked={r.include} aria-label={`Include ${r.code}`}
                            onChange={() => patch(i, { include: !r.include })} />
                        </td>
                        <td style={{ width: 190 }}>
                          <div style={{ fontFamily: 'monospace', fontWeight: 600, wordBreak: 'break-all' }}>{r.code}</div>
                          <div className="text-muted">{r.manufacturer || <em>no maker</em>}</div>
                        </td>
                        {r.action === 'reuse' ? (
                          <td colSpan={3}>
                            Use <span style={{ fontFamily: 'monospace' }}>{r.reuseRef}</span>{' '}
                            <Button variant="link" size="sm" className="p-0" style={{ fontSize: 11 }}
                              onClick={() => setRows(rs => refamily(
                                rs.map((x, k) => (k === i ? { ...x, action: 'create' } : x)), [i], r.family, elementTypes))}>
                              create a new one instead
                            </Button>
                          </td>
                        ) : (
                          <>
                            <td style={{ width: 170 }}>
                              <Form.Control size="sm" value={r.ref} aria-label={`Ref for ${r.code}`}
                                isInvalid={!!bad && r.include}
                                style={{ fontFamily: 'monospace', fontSize: 11 }}
                                onChange={e => patch(i, { ref: e.target.value })} />
                              {bad && r.include && <div className="text-danger" style={{ fontSize: 10 }}>{bad}</div>}
                              {r.why?.length > 0 && (
                                <div className="text-muted" style={{ fontSize: 9 }} title={r.why.map(w => WHY[w] || w).join('; ')}>
                                  family: {r.why.join(' + ')}
                                </div>
                              )}
                            </td>
                            <td>
                              <Form.Control size="sm" value={r.name} aria-label={`Name for ${r.code}`}
                                style={{ fontSize: 11 }} onChange={e => patch(i, { name: e.target.value })} />
                            </td>
                            <td>
                              <Form.Control size="sm" value={r.description} aria-label={`Description for ${r.code}`}
                                placeholder="description" style={{ fontSize: 11 }}
                                onChange={e => patch(i, { description: e.target.value })} />
                            </td>
                          </>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        })}
      </Modal.Body>
      <Modal.Footer>
        <span className="text-muted me-auto" style={{ fontSize: 12 }}>
          {creating} to create{reusing ? `, ${reusing} to reuse` : ''}
          {problems.size > 0 && <span className="text-danger"> · {problems.size} ref{problems.size === 1 ? '' : 's'} to fix</span>}
        </span>
        <Button variant="secondary" size="sm" onClick={onHide}>Cancel</Button>
        <Button variant="primary" size="sm" disabled={included.length === 0 || problems.size > 0}
          onClick={() => onApply(included)}>
          Apply {included.length}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
