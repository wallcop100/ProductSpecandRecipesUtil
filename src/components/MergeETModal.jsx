import React, { useMemo, useState, useEffect } from 'react'
import { Modal, Button, Form } from 'react-bootstrap'
import useStore, { collectAllETRefs } from '../store/useStore'
import { planMerge } from '../utils/mergePlan'
import MaterialIcon from './MaterialIcon'
import TutorialHint from '../tutorial/TutorialHint'

/**
 * MergeETModal — ticked ElementTypes that are one product (same maker + code) become one.
 *
 * "Merge into <ref>" keeps an existing ref; "Merge into a new ref" renames the survivor.
 * mergePlan says what changes and what blocks. The DesignDB's Elements and cables are not
 * loaded here, so we cannot tell whether the dropped refs are placed there: a second
 * confirm always says they would be orphaned.
 */
export default function MergeETModal({ show, refs, onClose, onMerged }) {
  const recipes = useStore(s => s.recipes)
  const psRows = useStore(s => s.psRows)
  const elementTypes = useStore(s => s.elementTypes)
  const mergeElementTypes = useStore(s => s.mergeElementTypes)

  const [mode, setMode] = useState('into')
  const [keep, setKeep] = useState('')
  const [newRef, setNewRef] = useState('')
  const [sure, setSure] = useState(false)

  useEffect(() => { if (show) { setMode('into'); setKeep(refs[0] || ''); setNewRef(''); setSure(false) } }, [show]) // eslint-disable-line react-hooks/exhaustive-deps

  const known = useMemo(() => new Set(collectAllETRefs(elementTypes, psRows, recipes).map(r => r.toLowerCase())), [elementTypes, psRows, recipes])
  const drops = refs.filter(r => r !== keep)
  const plan = useMemo(() => (show && keep ? planMerge({ recipes, psRows }, keep, drops) : null), [show, keep, recipes, psRows]) // eslint-disable-line react-hooks/exhaustive-deps
  const name = newRef.trim()
  const nameBad = mode === 'new' && (!name || known.has(name.toLowerCase()))
  const ok = !!plan?.ok && !nameBad

  function go() {
    mergeElementTypes(keep, drops, { newRef: mode === 'new' ? name : '' })
    setSure(false)
    onMerged?.(mode === 'new' ? name : keep)
    onClose()
  }

  return (
    <>
      <Modal show={show && !sure} onHide={onClose} centered>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: 15 }} className="d-flex align-items-center gap-2">
            <MaterialIcon name="merge" size={18} /> Merge {refs.length} ElementTypes
            <TutorialHint id="merge-ets" />
          </Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ fontSize: 12 }}>
          <Form.Check type="radio" id="merge-into" name="merge-mode" checked={mode === 'into'} onChange={() => setMode('into')}
            label="Merge into one of them" />
          {mode === 'into' && (
            <Form.Select size="sm" className="my-2" value={keep} onChange={e => setKeep(e.target.value)}>
              {refs.map(r => <option key={r}>{r}</option>)}
            </Form.Select>
          )}
          <Form.Check type="radio" id="merge-new" name="merge-mode" checked={mode === 'new'} onChange={() => setMode('new')}
            label="Merge into a new ref" />
          {mode === 'new' && (
            <>
              <Form.Select size="sm" className="mt-2" value={keep} onChange={e => setKeep(e.target.value)} aria-label="Start from">
                {refs.map(r => <option key={r}>{r}</option>)}
              </Form.Select>
              <Form.Control size="sm" className="my-2" placeholder="New ref" value={newRef} isInvalid={!!name && nameBad}
                onChange={e => setNewRef(e.target.value)} />
              {!!name && nameBad && <div className="text-danger mb-2">That ref already exists.</div>}
            </>
          )}

          {plan?.ok && (
            <div className="text-muted mt-2">
              {drops.join(', ')} → {mode === 'new' && name ? name : keep}: {plan.rewrites.length} row{plan.rewrites.length === 1 ? '' : 's'} on {plan.positions} position{plan.positions === 1 ? '' : 's'}
              {plan.collapses.length > 0 && `, ${plan.collapses.length} combined`}.
            </div>
          )}
          {plan?.collapses.map(c => (
            <div key={c.keepId} className="text-muted">Combined {c.where}: quantity {c.quantity}.</div>
          ))}
          {plan && !plan.ok && plan.blocked.map((b, i) => (
            <div key={i} className="text-danger d-flex gap-1 mt-1">
              <MaterialIcon name="block" size={14} /> <span><strong>{b.ref}</strong> — {b.detail}</span>
            </div>
          ))}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" disabled={!ok} onClick={() => setSure(true)}>Merge…</Button>
        </Modal.Footer>
      </Modal>

      <Modal show={show && sure} onHide={() => setSure(false)} centered size="sm">
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: 15 }} className="text-danger">Orphan anything placed?</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ fontSize: 12 }}>
          {drops.join(', ')} will be deleted. This tool can't see the DesignDB's Elements and cables:
          any placed with {drops.length === 1 ? 'it' : 'them'} will be orphaned and a designer must repoint them to {mode === 'new' && name ? name : keep}. Are you sure?
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" size="sm" onClick={() => setSure(false)}>Back</Button>
          <Button variant="danger" size="sm" onClick={go}>Merge</Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}
