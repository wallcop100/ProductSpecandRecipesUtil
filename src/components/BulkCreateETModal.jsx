import React, { useEffect, useMemo, useState } from 'react'
import { Modal, Button, Form } from 'react-bootstrap'
import MaterialIcon from './MaterialIcon'
import { refamily, ACCESSORIES } from '../utils/etSeed'

/**
 * BulkCreateETModal — every code that still needs an ElementType, proposed at once.
 *
 * Everything starts ticked: the job is weeding out the wrong ones, not building the
 * right ones by hand. Proposals are grouped by family, because a wrong family is usually
 * wrong for the whole group — change it once in the group header and every ref in it is
 * re-numbered.
 *
 * A family that does not exist yet (named after the PositionType parent, see etSeed.js)
 * is created with its members: its header shows the ref and description it will get, both
 * editable, and it can be unticked. A code no rule could place sits in "Needs a family",
 * and blocks Apply until it has one or is unticked.
 *
 * Props:
 *   proposals, newFamilies — from proposeElementTypes (etSeed.js)
 *   families      — every family ref the project already has
 *   elementTypes  — the project's ETs, for clash checks and re-numbering
 *   onApply({ families, items }) — the ticked new families and proposals, as edited
 */

const WHY = {
  stem: 'same product line',
  style: r => `styled like ${r.styledOn?.ref}${r.styledOn?.source ? ` (${r.styledOn.source})` : ''}`,
  design: "position's design element",
  parent: p => `position parent ${p}`,
  extra: 'extra code in its cell',
  you: 'you chose it',
}
const whyText = r => (r.why === 'parent' ? WHY.parent(r.parent) : r.why === 'style' ? WHY.style(r) : WHY[r.why] || '')
const NONE = '__none'
const REUSE = '__reuse'
const SKIP = '__skip'

export default function BulkCreateETModal({
  show, onHide, proposals: initial, newFamilies: initialFamilies, families = [], elementTypes = [], onApply,
}) {
  const [rows, setRows] = useState(initial || [])
  const [fams, setFams] = useState(initialFamilies || [])
  useEffect(() => {
    if (show) { setRows(initial || []); setFams(initialFamilies || []) }
  }, [show, initial, initialFamilies])

  const existing = useMemo(
    () => new Set(elementTypes.map(e => (e.ElementTypeRef || e.elementTypeRef || '').toLowerCase())),
    [elementTypes]
  )
  const famByRef = useMemo(() => new Map(fams.map((f, i) => [f.ref, i])), [fams])
  const creating = r => r.include && r.action === 'create'

  // A ref is bad when blank, already in the project, used twice here, or its family is unticked.
  const problems = useMemo(() => {
    const count = new Map()
    rows.forEach(r => { if (creating(r)) { const k = r.ref.trim().toLowerCase(); count.set(k, (count.get(k) || 0) + 1) } })
    const out = new Map()
    rows.forEach((r, i) => {
      if (!creating(r)) return
      const k = r.ref.trim().toLowerCase()
      const fi = famByRef.get(r.family)
      if (!r.family) out.set(i, 'needs a family')
      else if (fi !== undefined && !fams[fi].include) out.set(i, 'its new family is unticked')
      else if (!k) out.set(i, 'needs a ref')
      else if (existing.has(k)) out.set(i, 'already exists')
      else if (count.get(k) > 1) out.set(i, 'used twice here')
    })
    return out
  }, [rows, fams, famByRef, existing])

  const groups = useMemo(() => {
    const g = new Map()
    rows.forEach((r, i) => {
      const key = r.action === 'reuse' ? REUSE : r.action === 'skip' ? SKIP : (r.family || NONE)
      if (!g.has(key)) g.set(key, [])
      g.get(key).push(i)
    })
    const rank = k => (k === NONE ? 0 : k === REUSE ? 3 : k === SKIP ? 4 : k === ACCESSORIES ? 2 : 1)
    return [...g.entries()].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
  }, [rows])

  const patch = (i, next) => setRows(rs => rs.map((r, k) => (k === i ? { ...r, ...next } : r)))
  const included = rows.filter(r => r.include && r.action !== 'skip')
  const nCreate = included.filter(r => r.action === 'create').length
  const usedFams = new Set(rows.filter(creating).map(r => r.family))
  const famsToCreate = fams.filter(f => f.include && usedFams.has(f.ref))

  const familyOptions = useMemo(
    () => [...new Set([...families, ...fams.map(f => f.ref), ...rows.map(r => r.family)].filter(Boolean))].sort(),
    [families, fams, rows]
  )

  /** Rename a proposed new family: its members follow and are renumbered. */
  function renameFamily(fi, idxs, ref) {
    const old = fams[fi].ref
    setFams(fs => fs.map((f, k) => (k === fi ? { ...f, ref } : f)))
    setRows(rs => refamily(rs, idxs.filter(i => rs[i].family === old), ref, elementTypes))
  }

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
          and edit any ref, name or description in place. A luminaire's family is named after its
          PositionType's parent; the other codes in the same cell go to accessories.
        </div>

        {groups.map(([key, idxs]) => {
          const special = key === REUSE || key === SKIP
          const fi = famByRef.get(key)
          const isNew = fi !== undefined
          const allOn = idxs.every(i => rows[i].include)
          return (
            <div key={key} className="mb-3 border rounded" data-testid={`group-${key}`}
              style={key === NONE ? { borderColor: '#f1aeb5' } : undefined}>
              <div className="d-flex align-items-center gap-2 px-2 py-1 flex-wrap"
                style={{ background: key === NONE ? '#f8d7da' : '#f8f9fa' }}>
                {key !== SKIP && (
                  <Form.Check type="checkbox" checked={allOn} aria-label={allOn ? 'Untick the group' : 'Tick the group'}
                    onChange={() => setRows(rs => rs.map((r, k) => (idxs.includes(k) ? { ...r, include: !allOn } : r)))} />
                )}
                {key === REUSE ? (
                  <span className="fw-semibold"><MaterialIcon name="link" size={13} /> Already in the project — reuse the existing ElementType</span>
                ) : key === SKIP ? (
                  <span className="text-muted">Not product codes (N/A, TBC) — nothing to create</span>
                ) : key === NONE ? (
                  <span className="fw-semibold" style={{ color: '#842029' }}>
                    <MaterialIcon name="help" size={13} /> Needs a family — no rule could place these
                    (usually a PositionType missing from the DesignDB)
                  </span>
                ) : isNew ? (
                  <>
                    <span className="rounded px-1" style={{ background: '#cfe2ff', color: '#084298', fontSize: 10 }}>new family</span>
                    <Form.Check type="checkbox" checked={fams[fi].include} label="create"
                      aria-label={`Create family ${key}`} className="small"
                      onChange={() => setFams(fs => fs.map((f, k) => (k === fi ? { ...f, include: !f.include } : f)))} />
                    <Form.Control size="sm" value={fams[fi].ref} aria-label={`Family ref ${key}`}
                      style={{ width: 260, fontFamily: 'monospace', fontSize: 11 }}
                      onChange={e => renameFamily(fi, idxs, e.target.value)} />
                    <Form.Control size="sm" value={fams[fi].description} aria-label={`Family description ${key}`}
                      style={{ width: 240, fontSize: 11 }} placeholder="description"
                      onChange={e => setFams(fs => fs.map((f, k) => (k === fi ? { ...f, description: e.target.value } : f)))} />
                  </>
                ) : (
                  <span className="fw-semibold" style={{ fontFamily: 'monospace' }}>{key}</span>
                )}
                {!special && (
                  <Form.Select size="sm" style={{ width: 190, fontSize: 11 }} value=""
                    aria-label={`Move ${key === NONE ? 'unplaced codes' : key} to family`}
                    onChange={e => e.target.value && setRows(rs => refamily(rs, idxs, e.target.value, elementTypes))}>
                    <option value="">move all to…</option>
                    {familyOptions.filter(f => f !== key).map(f => <option key={f} value={f}>{f}</option>)}
                  </Form.Select>
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
                          {r.action !== 'skip' && (
                            <Form.Check type="checkbox" checked={r.include} aria-label={`Include ${r.code}`}
                              onChange={() => patch(i, { include: !r.include })} />
                          )}
                        </td>
                        <td style={{ width: 200 }}>
                          <div style={{ fontFamily: 'monospace', fontWeight: 600, wordBreak: 'break-all' }}>{r.code}</div>
                          <div className="text-muted">{r.manufacturer || <em>no maker</em>}</div>
                        </td>
                        {r.action === 'skip' ? (
                          <td colSpan={3} className="text-muted">skipped</td>
                        ) : r.action === 'reuse' ? (
                          <td colSpan={3}>
                            Use <span style={{ fontFamily: 'monospace' }}>{r.reuseRef}</span>{' '}
                            <Button variant="link" size="sm" className="p-0" style={{ fontSize: 11 }}
                              onClick={() => patch(i, { action: 'create' })}>
                              create a new one instead
                            </Button>
                          </td>
                        ) : (
                          <>
                            <td style={{ width: 240 }}>
                              <Form.Control size="sm" value={r.ref} aria-label={`Ref for ${r.code}`}
                                isInvalid={!!bad && r.include} placeholder={r.family ? '' : 'pick a family above'}
                                style={{ fontFamily: 'monospace', fontSize: 11 }}
                                onChange={e => patch(i, { ref: e.target.value })} />
                              {bad && r.include && <div className="text-danger" style={{ fontSize: 10 }}>{bad}</div>}
                              {!bad && r.checkRef && (
                                <div style={{ fontSize: 10, color: '#856404' }}
                                  title="Part of the example's ref could not be confirmed from this code or the Form, or equally close examples disagree">
                                  <MaterialIcon name="warning" size={10} /> check ref
                                  {r.alternatives?.length > 0 && <> — or {r.alternatives.join(', ')}</>}
                                </div>
                              )}
                              {whyText(r) && (
                                <div className="text-muted" style={{ fontSize: 9 }}>
                                  {whyText(r)}{r.spread > 1 ? ` · used under ${r.spread} families` : ''}
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
          {famsToCreate.length > 0 && `${famsToCreate.length} new famil${famsToCreate.length === 1 ? 'y' : 'ies'}, `}
          {nCreate} to create{included.length > nCreate ? `, ${included.length - nCreate} to reuse` : ''}
          {problems.size > 0 && <span className="text-danger"> · {problems.size} to fix</span>}
        </span>
        <Button variant="secondary" size="sm" onClick={onHide}>Cancel</Button>
        <Button variant="primary" size="sm" disabled={included.length === 0 || problems.size > 0}
          onClick={() => onApply({ families: famsToCreate, items: included })}>
          Apply {included.length}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
