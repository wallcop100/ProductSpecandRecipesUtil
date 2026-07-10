import React, { useMemo } from 'react'
import { Button } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { formProgress, formWorklist } from '../utils/formSpec'

/**
 * FormProgressChip — how much of the Form is reconciled, and a way into what's left.
 *
 * Reconciliation is per-position, but nothing told you WHICH positions still needed
 * it; you had to open each one and look. This answers it from anywhere, and is the
 * project-level answer to "is a Form attached at all?" — the pane's strip only shows
 * while you stand on a position the Form mentions.
 *
 * With no Form attached it is not silent — it offers to attach one. That is the
 * state where you most need to find the workflow, and the only other way in used to
 * be a button buried inside the Product Spec screen.
 *
 * Props:
 *   onReconcile(refs) — start a step-through of the incomplete positions
 *   onAttach()        — open the product-code import
 */
export default function FormProgressChip({ onReconcile, onAttach }) {
  const recipes = useStore(s => s.recipes)
  const containerETRefs = useStore(s => s.containerETRefs)
  const formCaptures = useStore(s => s.formCaptures)

  const progress = useMemo(
    () => formProgress(recipes, formCaptures, containerETRefs),
    [recipes, formCaptures, containerETRefs]
  )
  const worklist = useMemo(
    () => (progress ? formWorklist(recipes, formCaptures, containerETRefs) : []),
    [progress, recipes, formCaptures, containerETRefs]
  )

  if (!progress) {
    if (!onAttach) return null
    return (
      <Button size="sm" variant="outline-secondary" className="d-inline-flex align-items-center gap-1"
        style={{ fontSize: 11, flexShrink: 0 }} onClick={onAttach}
        title="Import product codes from a Form template, then reconcile them against your recipes">
        <MaterialIcon name="auto_fix_high" size={13} /> Attach a Form
      </Button>
    )
  }

  const done = progress.complete === progress.total
  const colour = done ? '#0f5132' : '#856404'
  const bg = done ? '#d1e7dd' : '#fff3cd'

  return (
    <span className="d-inline-flex align-items-center gap-1 rounded px-2 py-1"
      style={{ background: bg, color: colour, fontSize: 11, flexShrink: 0 }}
      title={`${progress.complete} of ${progress.total} positions hold everything the Form specifies`}>
      <MaterialIcon name="description" size={13} />
      <span>Form: {progress.complete}/{progress.total}</span>
      {progress.missing > 0 && (
        <span className="text-muted" style={{ color: 'inherit', opacity: 0.85 }}>
          · {progress.missing} missing
        </span>
      )}
      {progress.orphans > 0 && (
        <span style={{ opacity: 0.85 }}>· {progress.orphans} dropped</span>
      )}
      {worklist.length > 0 && onReconcile && (
        <Button size="sm" variant="link" className="p-0 ms-1"
          style={{ fontSize: 10, color: 'inherit', textDecoration: 'underline' }}
          onClick={() => onReconcile(worklist.map(w => w.posRef))}
          title="Step through every position that still needs reconciling">
          Reconcile →
        </Button>
      )}
    </span>
  )
}
