import React from 'react'
import { Modal, Button } from 'react-bootstrap'
import MaterialIcon from './MaterialIcon'

/**
 * SharedEditGuard — a wrapper's internals belong to every position that uses it.
 *
 * `ET-PROF-01` inside `ET-LIN-01` is not C01r's profile. It is the profile of the
 * assembly, and `C03r` uses the same assembly. Deleting or replacing it there changes
 * C03r too, silently, in the direction of the position you were not looking at.
 *
 * The app already knew this (wrapperUsedBy) and said nothing at the point of danger.
 * Now it names the positions, and offers the only real answer: fork the assembly first,
 * so this position owns its copy.
 *
 * Props:
 *   verb        — 'delete' | 'replace'
 *   etRef       — the row's ElementType (what you are about to change)
 *   container   — the wrapper it sits inside
 *   posRef      — the position you are standing on
 *   sharedWith  — the OTHER positions that use the wrapper (never empty; else no modal)
 *   onProceed() — do it anyway, to every position
 *   onFork()    — fork the wrapper for posRef first
 *   onCancel()
 */
const VERB = {
  delete: { title: 'Delete from a shared assembly', act: 'Deleting', proceed: 'Delete from all' },
  replace: { title: 'Replace inside a shared assembly', act: 'Replacing', proceed: 'Replace in all' },
}

export default function SharedEditGuard({
  show, verb = 'delete', etRef, container, posRef, sharedWith = [],
  onProceed, onFork, onCancel,
}) {
  const v = VERB[verb] || VERB.delete
  const others = sharedWith.join(', ')
  const all = [posRef, ...sharedWith].length

  return (
    <Modal show={show} onHide={onCancel} centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 15 }} className="d-flex align-items-center gap-2">
          <MaterialIcon name="warning" size={18} style={{ color: '#b45309' }} />
          {v.title}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body style={{ fontSize: 13 }}>
        <p className="mb-2">
          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{etRef}</span> sits inside{' '}
          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{container}</span>, which is shared
          by {all} positions.
        </p>
        <div className="px-2 py-2 rounded mb-3" style={{ background: '#fff3cd', border: '1px solid #f0e0a8', fontSize: 12 }}>
          {v.act} it here also changes{' '}
          <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{others}</span>.
        </div>
        <p className="text-muted mb-0" style={{ fontSize: 12 }}>
          A wrapper is a virtual assembly, and its contents are the assembly's — not this position's.
          If only <span style={{ fontFamily: 'monospace' }}>{posRef}</span> should change, fork the
          assembly first so it owns its own copy.
        </p>
      </Modal.Body>

      <Modal.Footer className="d-flex justify-content-between">
        <Button variant="link" size="sm" className="text-muted px-0" onClick={onCancel}>Cancel</Button>
        <div className="d-flex gap-2">
          <Button variant="outline-danger" size="sm" onClick={onProceed}>
            {v.proceed}
          </Button>
          <Button variant="primary" size="sm" className="d-inline-flex align-items-center gap-1" onClick={onFork}>
            <MaterialIcon name="call_split" size={14} /> Fork for {posRef}
          </Button>
        </div>
      </Modal.Footer>
    </Modal>
  )
}
