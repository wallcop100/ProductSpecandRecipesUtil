import React, { useMemo, useState } from 'react'
import { Modal, Button, Form } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { planSwap, alreadySwapped, SCOPE } from '../utils/swapPlan'

/**
 * SwapEverywhereModal — substitute one product for another, everywhere it appears.
 *
 * The row-level replace was the only swap the tool had, so changing a product across a
 * project meant one edit per position and no way to check them afterwards. This shows
 * exactly which rows change, and which positions those rows belong to, before anything
 * is written.
 *
 * The one thing it must not hide: a row inside a SHARED wrapper is one assembly. Swapping
 * it changes every position using that wrapper, whether or not you scoped the swap to
 * theirs. The plan says so, in the position list and beside the row.
 */
const SCOPE_LABEL = {
  [SCOPE.EVERYWHERE]: 'everywhere it appears',
  [SCOPE.POSITION]: 'in this position only',
}

export default function SwapEverywhereModal({ show, onHide, fromRef, posRef = null }) {
  const recipes = useStore(s => s.recipes)
  const elementTypes = useStore(s => s.elementTypes)
  const swapElementType = useStore(s => s.swapElementType)

  // Every ElementType the project knows, minus the one being replaced.
  const options = useMemo(() => {
    const refs = new Set(elementTypes.map(e => e.ElementTypeRef || e.elementTypeRef).filter(Boolean))
    refs.delete(fromRef)
    return [...refs].sort()
  }, [elementTypes, fromRef])

  const [toRef, setToRef] = useState('')
  const [scope, setScope] = useState(posRef ? SCOPE.POSITION : SCOPE.EVERYWHERE)
  const [keepFields, setKeepFields] = useState(true)

  const plan = useMemo(
    () => planSwap(recipes, fromRef, toRef, { scope, posRef }),
    [recipes, fromRef, toRef, scope, posRef]
  )
  const noop = useMemo(
    () => (toRef ? alreadySwapped(recipes, toRef, { scope, posRef }) : 0),
    [recipes, toRef, scope, posRef]
  )

  const ready = !!toRef && plan.rows.length > 0

  function apply() {
    swapElementType(fromRef, toRef, { scope, posRef, keepFields })
    onHide()
  }

  return (
    <Modal show={show} onHide={onHide} centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 15 }} className="d-flex align-items-center gap-2">
          <MaterialIcon name="swap_horiz" size={18} />
          Swap <span style={{ fontFamily: 'monospace' }}>{fromRef}</span>
        </Modal.Title>
      </Modal.Header>

      <Modal.Body style={{ maxHeight: '60vh' }}>
        <div className="mb-3">
          <Form.Label className="fw-semibold" style={{ fontSize: 11 }}>Replace it with</Form.Label>
          <Form.Control size="sm" list="swap-et-options" value={toRef} autoFocus
            onChange={e => setToRef(e.target.value.trim())}
            placeholder="Pick the replacement…" style={{ fontFamily: 'monospace', fontSize: 12 }} />
          <datalist id="swap-et-options">
            {options.map(r => <option key={r} value={r} />)}
          </datalist>
        </div>

        {posRef && (
          <div className="mb-3">
            {[SCOPE.POSITION, SCOPE.EVERYWHERE].map(s => (
              <Form.Check key={s} type="radio" name="swap-scope" id={`swap-scope-${s}`}
                checked={scope === s} onChange={() => setScope(s)}
                label={<span style={{ fontSize: 12 }}>{SCOPE_LABEL[s]}</span>} />
            ))}
          </div>
        )}

        <Form.Check type="switch" id="swap-keep-fields" className="mb-3"
          checked={keepFields} onChange={e => setKeepFields(e.target.checked)}
          label={
            <span style={{ fontSize: 12 }}>
              Keep quantity and flags
              <span className="text-muted d-block" style={{ fontSize: 10 }}>
                {keepFields
                  ? 'The same product in a different guise: quantity, IsDesign and the rest travel across.'
                  : 'Off: every swapped row resets to quantity 1 with no flags.'}
              </span>
            </span>
          } />

        {!toRef && (
          <div className="text-muted fst-italic" style={{ fontSize: 12 }}>Pick a replacement to see what changes.</div>
        )}

        {toRef && plan.rows.length === 0 && (
          <div className="px-2 py-2 rounded" style={{ background: '#f8f9fa', border: '1px solid #e9ecef', fontSize: 12 }}>
            Nothing to swap{noop > 0 && <> — {noop} row{noop === 1 ? '' : 's'} already {noop === 1 ? 'uses' : 'use'} it</>}.
          </div>
        )}

        {ready && (
          <>
            <div className="fw-semibold text-muted mb-1" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              {plan.counts.rows} row{plan.counts.rows === 1 ? '' : 's'} · {plan.counts.positions} position
              {plan.counts.positions === 1 ? '' : 's'}
            </div>

            {plan.sharedWrappers.length > 0 && (
              <div className="px-2 py-2 rounded mb-2" style={{ background: '#fff3cd', border: '1px solid #f0e0a8', fontSize: 11, color: '#856404' }}>
                <MaterialIcon name="warning" size={12} />{' '}
                {plan.sharedWrappers.map(w => (
                  <div key={w.container}>
                    <span style={{ fontFamily: 'monospace' }}>{w.container}</span> is a shared assembly —
                    swapping inside it also changes {w.sharedWith.join(', ')}.
                  </div>
                ))}
              </div>
            )}

            {plan.rows.map(r => (
              <div key={r._id} className="d-flex align-items-baseline gap-2 py-1 border-bottom" style={{ fontSize: 11 }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.posRef}</span>
                <span className="text-muted">
                  {r.container ? <>inside <span style={{ fontFamily: 'monospace' }}>{r.container}</span></> : 'position level'}
                </span>
                {r.isDesign && (
                  <span className="rounded px-1" style={{ fontSize: 9, background: '#cfe2ff', color: '#084298' }}>design</span>
                )}
                {r.sharedWith.length > 0 && (
                  <span className="text-muted ms-auto" style={{ fontSize: 9 }}>
                    also changes {r.sharedWith.join(', ')}
                  </span>
                )}
              </div>
            ))}

            {noop > 0 && (
              <div className="text-muted mt-2" style={{ fontSize: 10 }}>
                {noop} row{noop === 1 ? '' : 's'} already {noop === 1 ? 'uses' : 'use'} {toRef} and {noop === 1 ? 'is' : 'are'} left alone.
              </div>
            )}
          </>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="link" size="sm" className="text-muted" onClick={onHide}>Cancel</Button>
        <Button variant="primary" size="sm" disabled={!ready} onClick={apply}>
          Swap {plan.counts.rows || ''} row{plan.counts.rows === 1 ? '' : 's'}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
