import React, { useMemo, useState, useEffect } from 'react'
import { Modal, Button, Form } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { CANON_FAMILIES } from '../data/etCanon'

const lc = s => String(s ?? '').trim().toLowerCase()
const refOf = e => e.ElementTypeRef || e.elementTypeRef || ''
const NO_FAMILY = ''

/**
 * ExistingETReviewModal — every ElementType in the project, grouped by family, to check
 * and tidy: Name, Description and Family are editable; the ref stays as it is (a rename
 * is a separate, cascading act). Nothing is written until Save.
 */
export default function ExistingETReviewModal({ show, onHide }) {
  const elementTypes = useStore(s => s.elementTypes)
  const psRows = useStore(s => s.psRows)
  const recipes = useStore(s => s.recipes)
  const updateElementType = useStore(s => s.updateElementType)

  const [draft, setDraft] = useState({})     // lc ref -> { Name?, Description?, Family? }
  const [filter, setFilter] = useState('')
  useEffect(() => { if (show) { setDraft({}); setFilter('') } }, [show])

  const product = useMemo(() => {
    const m = new Map()
    for (const r of psRows) {
      if ((r.IsDeleted || r.isDeleted) === 'Y') continue
      const k = lc(r.ElementTypeRef || r.elementTypeRef)
      if (k && !m.has(k)) m.set(k, [r.Manufacturer || r.manufacturer, r.ProductCode || r.productCode].filter(Boolean).join(' · '))
    }
    return m
  }, [psRows])

  const uses = useMemo(() => {
    const m = new Map()
    for (const r of recipes) {
      if ((r.IsDeleted || r.isDeleted) === 'Y') continue
      const k = lc(r.ElementTypeRef || r.elementTypeRef)
      if (!m.has(k)) m.set(k, new Set())
      m.get(k).add(r.PositionTypeRef || r.positionTypeRef)
    }
    return m
  }, [recipes])

  const value = (et, field) => {
    const d = draft[lc(refOf(et))]
    return d && field in d ? d[field] : (et[field] ?? '')
  }
  const edit = (et, field, v) => setDraft(d => ({ ...d, [lc(refOf(et))]: { ...d[lc(refOf(et))], [field]: v } }))

  // Families: the project's own plus the company's, so a move is always to a real one.
  const families = useMemo(() => [...new Set([
    ...elementTypes.map(e => e.Family || e.family).filter(Boolean),
    ...CANON_FAMILIES.map(f => f.ref),
  ])].sort(), [elementTypes])

  const q = lc(filter)
  const visible = elementTypes.filter(et => !q || [refOf(et), et.Name, et.Description, et.Family, product.get(lc(refOf(et)))]
    .some(v => lc(v).includes(q)))
  const groups = new Map()
  for (const et of visible) {
    const f = value(et, 'Family') || NO_FAMILY
    if (!groups.has(f)) groups.set(f, [])
    groups.get(f).push(et)
  }
  // No family first: that is the one that needs attention.
  const order = [...groups.keys()].sort((a, b) => (a === NO_FAMILY ? -1 : b === NO_FAMILY ? 1 : a.localeCompare(b)))

  const changes = Object.entries(draft).map(([k, d]) => {
    const et = elementTypes.find(e => lc(refOf(e)) === k)
    if (!et) return null
    const changed = {}
    for (const [f, v] of Object.entries(d)) if ((et[f] ?? '') !== v) changed[f] = v === '' ? null : v
    return Object.keys(changed).length ? [refOf(et), changed] : null
  }).filter(Boolean)

  function save() {
    for (const [ref, changed] of changes) updateElementType(ref, changed)
    onHide()
  }

  return (
    <Modal show={show} onHide={onHide} size="xl" scrollable>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 16 }}>Existing ElementTypes ({elementTypes.length})</Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ fontSize: 12 }}>
        <div className="d-flex align-items-center gap-2 mb-2">
          <Form.Control size="sm" placeholder="Filter by ref, name, family, maker or code…" value={filter}
            onChange={e => setFilter(e.target.value)} style={{ maxWidth: 360, fontSize: 12 }} aria-label="Filter ElementTypes" />
          <span className="text-muted" style={{ fontSize: 11 }}>
            Edit Name, Description or Family. Refs are not changed here.
          </span>
        </div>
        {order.map(f => (
          <div key={f || 'none'} className="mb-3" data-testid={`existing-family-${f || 'none'}`}>
            <div className="fw-semibold mb-1" style={{ fontSize: 11, color: f ? '#495057' : '#b45309' }}>
              {f ? <span style={{ fontFamily: 'monospace' }}>{f}</span> : <><MaterialIcon name="warning" size={12} /> No family</>}
              <span className="text-muted fw-normal"> · {groups.get(f).length}</span>
            </div>
            {groups.get(f).map(et => {
              const k = lc(refOf(et))
              const n = uses.get(k)?.size || 0
              return (
                <div key={k} className="d-flex align-items-center gap-2 py-1 border-bottom">
                  <div style={{ width: 190, flexShrink: 0 }}>
                    <div style={{ fontFamily: 'monospace', fontWeight: 600 }}>{refOf(et)}</div>
                    <div className="text-muted text-truncate" style={{ fontSize: 10 }}>
                      {product.get(k) || 'no product'} · {n ? `${n} position${n === 1 ? '' : 's'}` : 'unused'}
                    </div>
                  </div>
                  <Form.Control size="sm" style={{ fontSize: 11, flex: 1 }} value={value(et, 'Name')}
                    aria-label={`Name of ${refOf(et)}`} placeholder="Name" onChange={e => edit(et, 'Name', e.target.value)} />
                  <Form.Control size="sm" style={{ fontSize: 11, flex: 2 }} value={value(et, 'Description')}
                    aria-label={`Description of ${refOf(et)}`} placeholder="Description" onChange={e => edit(et, 'Description', e.target.value)} />
                  <Form.Select size="sm" style={{ fontSize: 11, width: 200, flexShrink: 0 }} value={value(et, 'Family')}
                    aria-label={`Family of ${refOf(et)}`} onChange={e => edit(et, 'Family', e.target.value)}>
                    <option value="">(no family)</option>
                    {families.map(x => <option key={x} value={x}>{x}</option>)}
                  </Form.Select>
                </div>
              )
            })}
          </div>
        ))}
        {visible.length === 0 && <div className="text-muted fst-italic">No ElementTypes match.</div>}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="link" size="sm" className="text-muted me-auto" onClick={onHide}>Cancel</Button>
        <Button variant="primary" size="sm" disabled={changes.length === 0} onClick={save}>
          Save {changes.length} change{changes.length === 1 ? '' : 's'}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
