import React, { useMemo } from 'react'
import { Button } from 'react-bootstrap'
import useStore from '../store/useStore'
import StatusChip from './StatusChip'
import { formProgress, formWorklist } from '../utils/formSpec'
import { positionPaintStatus } from '../utils/formPositions'
import { buildRefMap, targetFor } from '../utils/ptResolve'

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
  const importDraft = useStore(s => s.importDraft)
  const positionTypes = useStore(s => s.positionTypes)

  const progress = useMemo(
    () => formProgress(recipes, formCaptures, containerETRefs),
    [recipes, formCaptures, containerETRefs]
  )
  // Positions the loaded Form gives products for that are not saved yet (a new code to
  // confirm): part of the Form, and not done (2K4TCY).
  const unsaved = useMemo(() => (importDraft?.rows?.length ? positionTypes.map(p => p.PositionTypeRef).filter(ref =>
    !formCaptures?.byPosition?.[ref] && ['todo', 'ready'].includes(positionPaintStatus(importDraft, ref, { buildRefMap, targetFor }).state)) : []),
  [importDraft, positionTypes, formCaptures])
  const worklist = useMemo(
    () => (progress || unsaved.length ? [...formWorklist(recipes, formCaptures, containerETRefs), ...unsaved.map(posRef => ({ posRef }))] : []),
    [progress, recipes, formCaptures, containerETRefs, unsaved]
  )

  // Silent with no Form attached. The prompt lives in the Side-by-Side pane, where
  // the absence is actually felt; a second button up here was just noise.
  if (!progress && !unsaved.length) return null
  const total = (progress?.total || 0) + unsaved.length
  const complete = progress?.complete || 0

  const done = complete === total
  const detail = [
    `${complete} of ${total} positions hold everything the Form specifies`,
    unsaved.length > 0 && `${unsaved.length} with a new code to confirm`,
    progress?.missing > 0 && `${progress.missing} missing`,
    progress?.orphans > 0 && `${progress.orphans} dropped from the Form`,
  ].filter(Boolean).join(' · ')

  return (
    <StatusChip tone={done ? 'ok' : 'warn'} icon="description" tip={detail}
      label={`Form ${complete}/${total}`}>
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
