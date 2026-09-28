import React, { useMemo, useState, useEffect } from 'react'
import { Modal, Button, Form } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { CANON_FAMILIES } from '../data/etCanon'
import { planFamilyMove } from '../utils/etSeed'

const lc = s => String(s ?? '').trim().toLowerCase()
const refOf = e => e.ElementTypeRef || e.elementTypeRef || ''
const NO_FAMILY = ''

/**
 * ExistingETReviewModal — every ElementType in the project, grouped by family, to check
 * and tidy: Name, Description and Family are editable; the ref stays as it is (a rename
 * is a separate, cascading act). Nothing is written until Save.
 *
 * "Move to family" is that cascading act: tick ElementTypes, pick a family, and they move
 * now — renumbered into it (ET-PS-03 → ET-PS-MOUNTING-FRAME-01) through the Product Spec
 * and Recipes, the family row created if the project lacks it. Reversed by moving back.
 */
export default function ExistingETReviewModal({ show, onHide, tabs = null, animation = true }) {
  const elementTypes = useStore(s => s.elementTypes)
  const psRows = useStore(s => s.psRows)
  const recipes = useStore(s => s.recipes)
  const updateElementType = useStore(s => s.updateElementType)
  const moveElementTypesToFamily = useStore(s => s.moveElementTypesToFamily)

  const [draft, setDraft] = useState({})     // lc ref -> { Name?, Description?, Family? }
  const [filter, setFilter] = useState('')
  const [picked, setPicked] = useState(() => new Set())   // lc refs ticked for a move
  const [moveTo, setMoveTo] = useState('')
  const [renumber, setRenumber] = useState(true)
  const [moved, setMoved] = useState(null)                 // last move, for the confirmation line
  useEffect(() => { if (show) { setDraft({}); setFilter(''); setPicked(new Set()); setMoveTo(''); setMoved(null) } }, [show])
  const togglePick = k => setPicked(p => { const n = new Set(p); if (n.has(k)) n.delete(k); else n.add(k); return n })

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

  const pickedRefs = elementTypes.filter(e => picked.has(lc(refOf(e)))).map(refOf)
  const plan = moveTo && pickedRefs.length ? planFamilyMove(pickedRefs, moveTo, elementTypes, { renumber }) : null
  const inDb = elementTypes.filter(e => picked.has(lc(refOf(e))) && e._row_num != null).length

  function move() {
    // Pending edits are keyed by ref, which the move may change: save them first.
    for (const [ref, changed] of changes) updateElementType(ref, changed)
    setDraft({})
    const done = moveElementTypesToFamily(pickedRefs, moveTo, { renumber })
    setMoved({ family: moveTo, moves: done })
    setPicked(new Set())
  }

  function save() {
    for (const [ref, changed] of changes) updateElementType(ref, changed)
    onHide()
  }

  return (
    <Modal animation={animation} show={show} onHide={onHide} size="xl" scrollable>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 16 }}>Existing ElementTypes ({elementTypes.length})</Modal.Title>
        {tabs}
      </Modal.Header>
      <Modal.Body style={{ fontSize: 12 }}>
        <div className="d-flex align-items-center gap-2 mb-2">
          <Form.Control size="sm" placeholder="Filter by ref, name, family, maker or code…" value={filter}
            onChange={e => setFilter(e.target.value)} style={{ maxWidth: 360, fontSize: 12 }} aria-label="Filter ElementTypes" />
          <span className="text-muted" style={{ fontSize: 11 }}>
            Edit Name, Description or Family. To move ElementTypes and renumber their refs, tick them.
          </span>
        </div>
        {picked.size > 0 && (
          <div className="d-flex align-items-center gap-2 flex-wrap mb-2 px-2 py-2 rounded" data-testid="move-bar"
            style={{ background: '#e7f1ff', border: '1px solid #b6d4fe', position: 'sticky', top: 0, zIndex: 2 }}>
            <strong>Move {picked.size} to family</strong>
            <Form.Select size="sm" aria-label="Move to family" value={moveTo} onChange={e => setMoveTo(e.target.value)}
              style={{ fontSize: 11, width: 240 }}>
              <option value="">pick a family…</option>
              {families.map(x => <option key={x} value={x}>{x}</option>)}
            </Form.Select>
            <Form.Check type="checkbox" id="move-renumber" label="Renumber refs into it" checked={renumber}
              onChange={() => setRenumber(v => !v)} style={{ fontSize: 11 }} />
            <Button size="sm" variant="primary" disabled={!moveTo} onClick={move} style={{ fontSize: 11 }}>Move</Button>
            <Button size="sm" variant="link" className="text-muted p-0" onClick={() => setPicked(new Set())} style={{ fontSize: 11 }}>Clear</Button>
            {plan && (
              <div className="w-100 text-muted" style={{ fontSize: 11 }}>
                {plan.moves.filter(m => m.to !== m.from).map(m => (
                  <span key={m.from} className="me-3" style={{ fontFamily: 'monospace' }}>{m.from} → {m.to}</span>
                ))}
                {plan.newFamilies.length > 0 && <div>Creates family {plan.newFamilies.map(f => f.ref).join(', ')}.</div>}
                {renumber && inDb > 0 && (
                  <div style={{ color: '#856404' }}>
                    <MaterialIcon name="warning" size={12} /> {inDb} {inDb === 1 ? 'is' : 'are'} already in the DesignDB: the new ref is written to
                    the ElementTypes, Product Spec and Recipes sheets, not to other sheets that may use the old one.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {moved && picked.size === 0 && (
          <div className="mb-2 px-2 py-1 rounded" data-testid="move-done" style={{ background: '#d1e7dd', color: '#0f5132', fontSize: 11 }}>
            <MaterialIcon name="check_circle" size={12} /> Moved {moved.moves.length} to {moved.family}
            {moved.moves.some(m => m.to !== m.from) && <>: {moved.moves.filter(m => m.to !== m.from).map(m => `${m.from} → ${m.to}`).join(', ')}</>}. To reverse it, move them back.
          </div>
        )}
        {order.map(f => (
          <div key={f || 'none'} className="mb-3" data-testid={`existing-family-${f || 'none'}`}>
            <div className="fw-semibold mb-1 d-flex align-items-center gap-2" style={{ fontSize: 11, color: f ? '#495057' : '#b45309' }}>
              <Form.Check type="checkbox" aria-label={`Select all in ${f || 'no family'}`}
                checked={groups.get(f).every(et => picked.has(lc(refOf(et))))}
                onChange={e => setPicked(p => { const n = new Set(p); for (const et of groups.get(f)) { if (e.target.checked) n.add(lc(refOf(et))); else n.delete(lc(refOf(et))) } return n })} />
              {f ? <span style={{ fontFamily: 'monospace' }}>{f}</span> : <><MaterialIcon name="warning" size={12} /> No family</>}
              <span className="text-muted fw-normal"> · {groups.get(f).length}</span>
            </div>
            {groups.get(f).map(et => {
              const k = lc(refOf(et))
              const n = uses.get(k)?.size || 0
              return (
                <div key={k} className="d-flex align-items-center gap-2 py-1 border-bottom">
                  <Form.Check type="checkbox" checked={picked.has(k)} onChange={() => togglePick(k)}
                    aria-label={`Select ${refOf(et)}`} />
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
