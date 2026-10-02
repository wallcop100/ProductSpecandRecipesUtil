import React, { useMemo } from 'react'
import { Button } from 'react-bootstrap'
import useStore from '../store/useStore'
import StatusChip from './StatusChip'
import { formProgress, formWorklist } from '../utils/formSpec'
import { positionPaintStatus } from '../utils/formPositions'
import { buildRefMap, targetFor } from '../utils/ptResolve'
import { positionFormDone } from '../utils/formDone'

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
export default function FormProgressChip({ onReconcile, onLoad }) {
  const recipes = useStore(s => s.recipes)
  const containerETRefs = useStore(s => s.containerETRefs)
  const formCaptures = useStore(s => s.formCaptures)
  const importDraft = useStore(s => s.importDraft)
  const positionTypes = useStore(s => s.positionTypes)
  const psRows = useStore(s => s.psRows)
  const loaded = !!importDraft?.rows?.length

  // Every position the loaded Form gives products for (X4AN58): to do, ready or added.
  // Not the ones it never mentions, nor the ones where it says n/a.
  const inForm = useMemo(() => (loaded ? positionTypes.map(p => p.PositionTypeRef).filter(ref =>
    ['todo', 'ready', 'added'].includes(positionPaintStatus(importDraft, ref, { buildRefMap, targetFor }).state)) : []),
  [loaded, importDraft, positionTypes])
  const incomplete = useMemo(() => new Set(formWorklist(recipes, formCaptures, containerETRefs)
    .filter(w => w.missing > 0 || w.pending > 0).map(w => w.posRef)), [recipes, formCaptures, containerETRefs])
  const progress = useMemo(() => formProgress(recipes, formCaptures, containerETRefs), [recipes, formCaptures, containerETRefs])

  if (!loaded) {
    // Saved per position, but no Form loaded: nothing to count against (X4AN58).
    if (!progress) return null
    return (
      <StatusChip tone="neutral" icon="description" tip="No Form is loaded: load it to see where each position stands"
        label="Form not loaded">
        {onLoad && (
          <Button size="sm" variant="link" className="p-0 ms-1" data-testid="form-load"
            style={{ fontSize: 10, color: 'inherit', textDecoration: 'underline' }} onClick={onLoad}>
            Load →
          </Button>
        )}
      </StatusChip>
    )
  }
  if (!inForm.length) return null
  // Done: saved for the position, and the recipe holds everything the Form asks for.
  // The same answer as the rail's ticks (WVYVW6).
  const todo = inForm.filter(ref => !positionFormDone(ref, { importDraft, formCaptures, recipes, psRows, containerETRefs, incomplete }))
  const total = inForm.length
  const complete = total - todo.length
  const unsaved = inForm.filter(ref => !formCaptures?.byPosition?.[ref]).length
  const done = complete === total
  const detail = [
    `${complete} of ${total} positions in the Form hold everything it specifies`,
    unsaved > 0 && `${unsaved} with a code still to give an ElementType`,
    progress?.missing > 0 && `${progress.missing} missing`,
    progress?.orphans > 0 && `${progress.orphans} dropped from the Form`,
  ].filter(Boolean).join(' · ')

  return (
    <StatusChip tone={done ? 'ok' : 'warn'} icon="description" tip={detail}
      label={`Form ${complete}/${total}`}>
      {todo.length > 0 && onReconcile && (
        <Button size="sm" variant="link" className="p-0 ms-1"
          style={{ fontSize: 10, color: 'inherit', textDecoration: 'underline' }}
          onClick={() => onReconcile(todo)}
          title="Step through every position that still needs reconciling">
          Reconcile →
        </Button>
      )}
    </StatusChip>
  )
}
