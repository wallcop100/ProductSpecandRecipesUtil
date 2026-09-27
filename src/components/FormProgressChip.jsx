import React, { useMemo } from 'react'
import { Button } from 'react-bootstrap'
import useStore from '../store/useStore'
import StatusChip from './StatusChip'
import { formProgress, formWorklist } from '../utils/formSpec'

/**
 * FormProgressChip — how much of the Form is reconciled, and a way into what's left.
 *
 * Reconciliation is per-position, but nothing told you WHICH positions still needed
 * it; you had to open each one and look. This answers it from anywhere, and is the
 * project-level answer to "is a Form attached at all?" — the pane's strip only shows
 * while you stand on a position the Form mentions.
 *
 * Silent when no Form is attached: the Side-by-Side pane carries that prompt, and
 * the toolbar keeps a discreet way in.
 *
 * Props:
 *   onReconcile(refs) — start a step-through of the incomplete positions
 */
export default function FormProgressChip({ onReconcile }) {
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

  // Silent with no Form attached. The prompt lives in the Side-by-Side pane, where
  // the absence is actually felt; a second button up here was just noise.
  if (!progress) return null

  const done = progress.complete === progress.total
  const detail = [
    `${progress.complete} of ${progress.total} positions hold everything the Form specifies`,
    progress.missing > 0 && `${progress.missing} missing`,
    progress.orphans > 0 && `${progress.orphans} dropped from the Form`,
  ].filter(Boolean).join(' · ')

  return (
    <StatusChip tone={done ? 'ok' : 'warn'} icon="description" tip={detail}
      label={`Form ${progress.complete}/${progress.total}`}>
      {worklist.length > 0 && onReconcile && (
        <Button size="sm" variant="link" className="p-0 ms-1"
          style={{ fontSize: 10, color: 'inherit', textDecoration: 'underline' }}
          onClick={() => onReconcile(worklist.map(w => w.posRef))}
          title="Step through every position that still needs reconciling">
          Reconcile →
        </Button>
      )}
    </StatusChip>
  )
}
