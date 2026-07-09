import React from 'react'
import { Modal, Button } from 'react-bootstrap'
import MaterialIcon from './MaterialIcon'

/**
 * BulkApplyModal — confirm what a bulk apply will actually do, before it does it.
 *
 * Applying a template across many positions used to append every ingredient to
 * every target, so a half-done position collected duplicates and a quantity that
 * fell short was never noticed. The plan (see planCollectionBulk) resolves each
 * (position, ingredient) against the real recipe, and this shows the result: what
 * is added, what is topped up, what is moved, and what is already fine.
 *
 * A wrapper shared by several positions has its internals applied ONCE — editing
 * it ripples to everyone that uses it — and the preview says so, because that is
 * exactly the case where a second copy looks correct and isn't.
 */

const ACTION = {
  add:     { icon: 'add_circle',       colour: '#0f5132', verb: 'add' },
  topUp:   { icon: 'exposure_plus_1',  colour: '#856404', verb: 'top up' },
  move:    { icon: 'move_down',        colour: '#856404', verb: 'move' },
  skip:    { icon: 'check',            colour: '#6c757d', verb: 'skip' },
  blocked: { icon: 'block',            colour: '#842029', verb: 'blocked' },
}

function describe(a) {
  const where = a.section === 'position' ? 'position level' : `in ${a.container || 'the wrapper'}`
  switch (a.action) {
    case 'add':   return <>add <Ref r={a.ref} /> ×{a.need} <Dim>({where})</Dim></>
    case 'topUp': return <>raise <Ref r={a.ref} /> ×{a.have} → ×{a.need} <Dim>({where})</Dim></>
    case 'move':  return (
      <>move <Ref r={a.ref} /> <Dim>
        (from {a.foundAt?.section === 'position' ? 'position level' : `inside ${a.foundAt?.container}`} → {where})
      </Dim></>
    )
    case 'blocked': return <><Ref r={a.ref} /> <Dim>belongs inside a wrapper — this position has no design element</Dim></>
    default: return a.reason === 'sharedWrapper'
      ? <><Ref r={a.ref} /> <Dim>already planned in the shared wrapper via {a.sharedWith}</Dim></>
      : <><Ref r={a.ref} /> <Dim>already present</Dim></>
  }
}

const Ref = ({ r }) => <span style={{ fontFamily: 'monospace' }}>{r}</span>
const Dim = ({ children }) => <span className="text-muted" style={{ fontSize: 10 }}>{children}</span>

export default function BulkApplyModal({ show, onHide, plan, collectionName, onConfirm, title }) {
  if (!plan) return null

  const counts = plan.counts || {}
  const changing = (counts.add || 0) + (counts.topUp || 0) + (counts.move || 0)
  const positions = [...plan.byPosition.keys()]

  return (
    <Modal show={show} onHide={onHide} size="lg" scrollable>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 15 }}>
          {title || <>Apply “{collectionName}” to {positions.length} position{positions.length === 1 ? '' : 's'}</>}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body style={{ fontSize: 12 }}>
        {changing === 0 && (
          <div className="px-2 py-1 rounded mb-2" style={{ background: '#d1e7dd', color: '#0f5132' }}>
            <MaterialIcon name="check_circle" size={13} /> Nothing to do — every position already satisfies this template.
          </div>
        )}
        {counts.blocked > 0 && (
          <div className="px-2 py-1 rounded mb-2" style={{ background: '#f8d7da', color: '#842029', fontSize: 11 }}>
            <MaterialIcon name="block" size={12} /> {counts.blocked} ingredient{counts.blocked === 1 ? '' : 's'} cannot
            be placed: they belong inside a wrapper, and those positions have no design element. They are skipped.
          </div>
        )}

        {positions.map(posRef => {
          const actions = plan.byPosition.get(posRef)
          const acts = actions.filter(a => a.action !== 'skip')
          return (
            <div key={posRef} className="mb-2">
              <div className="fw-semibold d-flex align-items-center gap-2" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                {posRef}
                {acts.length === 0 && (
                  <span className="text-success" style={{ fontSize: 10, fontFamily: 'inherit' }}>
                    <MaterialIcon name="check" size={11} /> already complete — skipped
                  </span>
                )}
              </div>
              {actions.map((a, i) => {
                const s = ACTION[a.action] || ACTION.skip
                if (a.action === 'skip' && !a.reason) return null
                return (
                  <div key={i} className="d-flex align-items-center gap-2 ps-3 py-1"
                    style={{ opacity: a.action === 'skip' ? 0.6 : 1 }}>
                    <MaterialIcon name={s.icon} size={12} style={{ color: s.colour, flexShrink: 0 }} />
                    <span>{describe(a)}</span>
                  </div>
                )
              })}
            </div>
          )
        })}
      </Modal.Body>

      <Modal.Footer className="d-flex align-items-center">
        <span className="text-muted me-auto" style={{ fontSize: 11 }}>
          {counts.add || 0} added · {counts.topUp || 0} topped up · {counts.move || 0} moved ·{' '}
          {counts.skip || 0} skipped{counts.blocked ? ` · ${counts.blocked} blocked` : ''}
        </span>
        <Button size="sm" variant="secondary" onClick={onHide}>Cancel</Button>
        <Button size="sm" variant="primary" disabled={changing === 0} onClick={onConfirm}>
          Apply {changing} change{changing === 1 ? '' : 's'}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
