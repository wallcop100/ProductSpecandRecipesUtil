import React, { useEffect, useMemo, useState } from 'react'
import { Modal, Button, Form } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'

const lc = s => String(s ?? '').trim().toLowerCase()

/**
 * SaveTemplateModal — "this recipe, as a template". Everything is kept as it is (real
 * ElementTypes, quantities, flags); untick what should not travel. The position's own
 * wrapper is saved as "a new wrapper of this kind", so applying it never shares one.
 */
export default function SaveTemplateModal({ show, onHide, posRef, name: posName }) {
  const recipes = useStore(s => s.recipes)
  const positionUI = useStore(s => s.positionUI)
  const containerETRefs = useStore(s => s.containerETRefs)
  const saveAsTemplate = useStore(s => s.saveAsTemplate)
  // This position's Form products: saved as slots, so elsewhere they are that position's own.
  const formCaptures = useStore(s => s.formCaptures)
  const formRole = useMemo(() => new Map((formCaptures?.byPosition?.[posRef] || [])
    .map(c => [lc(c.elementTypeRef), c.role === 'lead' ? 'main product' : 'extra'])), [formCaptures, posRef])

  const rows = useMemo(() => recipes.filter(r => (r.PositionTypeRef || r.positionTypeRef) === posRef
    && (r.IsDeleted || r.isDeleted) !== 'Y'), [recipes, posRef])
  const design = rows.find(r => (r.IsDesign || r.isDesign) === 'Y')

  const [name, setName] = useState('')
  const [scope, setScope] = useState('project')
  const [tags, setTags] = useState('')
  const [skip, setSkip] = useState(() => new Set())
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!show) return
    setName(posName && posName !== posRef ? posName : (design?.ElementTypeRef || design?.elementTypeRef || posRef || ''))
    setScope('project')
    setTags((positionUI[posRef]?.tags || []).join(', '))
    setSkip(new Set()); setError(null); setSaving(false)
  }, [show])   // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = id => setSkip(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const kept = rows.length - skip.size

  async function save() {
    setSaving(true); setError(null)
    try {
      await saveAsTemplate(posRef, {
        name, scope, excludeIds: [...skip],
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      })
      onHide(true)
    } catch (e) {
      setError(e?.message || 'Could not save the template')
      setSaving(false)
    }
  }

  const line = r => {
    const ref = r.ElementTypeRef || r.elementTypeRef
    const inside = (r.ContextType || r.contextType) === 'ElementType'
    const wrapper = !inside && containerETRefs.has(lc(ref))
    const qty = r.Dim_QuantityMultiplier ?? r.dimQtyMultiplier
    return (
      <Form.Check key={r._id} type="checkbox" id={`tpl-row-${r._id}`} checked={!skip.has(r._id)}
        onChange={() => toggle(r._id)} className={inside ? 'ms-4' : ''}
        label={
          <span style={{ fontSize: 12 }}>
            <span style={{ fontFamily: 'monospace' }}>{ref}</span>
            {wrapper && <span className="text-muted"> — saved as a new {/LIN/i.test(ref) ? 'LIN' : 'DL'} wrapper each time</span>}
            {(r.IsDesign || r.isDesign) === 'Y' && !wrapper && <span className="text-muted"> · design</span>}
            {!wrapper && formRole.has(lc(ref)) && (
              <span className="text-success" title="Applied to another position, this becomes that position's own Form product">
                {' '}· each position&apos;s own Form {formRole.get(lc(ref))}
              </span>
            )}
            <span className="text-muted"> · {qty != null ? `×${qty} per length` : `qty ${r.Quantity ?? r.quantity ?? 1}`}</span>
          </span>
        } />
    )
  }
  const pos = rows.filter(r => (r.ContextType || r.contextType) === 'PositionType')
  const inside = rows.filter(r => (r.ContextType || r.contextType) === 'ElementType')

  return (
    <Modal show={show} onHide={() => onHide(false)} centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 15 }}>
          <MaterialIcon name="bookmark_add" size={16} /> Save <span style={{ fontFamily: 'monospace' }}>{posRef}</span> as a template
        </Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ fontSize: 12 }}>
        <Form.Group className="mb-2">
          <Form.Label className="small fw-semibold mb-1">Name</Form.Label>
          <Form.Control size="sm" value={name} onChange={e => setName(e.target.value)} aria-label="Template name" />
        </Form.Group>
        <Form.Group className="mb-2">
          <Form.Label className="small fw-semibold mb-1">Use it on</Form.Label>
          <div className="d-flex gap-3">
            <Form.Check type="radio" id="tpl-scope-project" label="This project" checked={scope === 'project'} onChange={() => setScope('project')} />
            <Form.Check type="radio" id="tpl-scope-global" label="Every project" checked={scope === 'global'} onChange={() => setScope('global')} />
          </div>
        </Form.Group>
        <Form.Group className="mb-2">
          <Form.Label className="small fw-semibold mb-1">
            Tags <span className="text-muted fw-normal">— positions with these tags see it first</span>
          </Form.Label>
          <Form.Control size="sm" value={tags} onChange={e => setTags(e.target.value)} placeholder="e.g. DL, Local" aria-label="Template tags" />
        </Form.Group>
        <div className="small fw-semibold mb-1">What it adds <span className="text-muted fw-normal">— untick what should not travel</span></div>
        <div className="px-2 py-1 rounded" style={{ background: '#f8f9fa', maxHeight: 260, overflowY: 'auto' }}>
          {pos.map(line)}
          {inside.map(line)}
          {rows.length === 0 && <div className="text-muted fst-italic">This position has no recipe yet.</div>}
        </div>
        {error && <div className="text-danger mt-2">{error}</div>}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="link" size="sm" className="text-muted me-auto" onClick={() => onHide(false)}>Cancel</Button>
        <Button variant="primary" size="sm" disabled={saving || kept === 0 || !name.trim()} onClick={save}>
          {saving ? 'Saving…' : `Save template (${kept} row${kept === 1 ? '' : 's'})`}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
