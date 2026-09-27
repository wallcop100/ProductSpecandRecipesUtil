import React, { useMemo, useState } from 'react'
import { Button } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { positionRecipeWithWrapperInternals } from '../utils/collectionStatus'
import { roleOf, QTY_CONFIRM_ROLES } from '../utils/recipePatterns'

const pretty = role => role.toLowerCase().replace(/-/g, ' ')

/**
 * TeachBar — "you are setting up a group", pinned above the builder while its first position
 * is being checked. It says what is still empty on that position, and it is the way back:
 * "Use it for the other N" saves it for the group and returns to Recipes from the Form with
 * the rest ready to preview; "Back to the list" returns without saving.
 */
export default function TeachBar({ onReturn }) {
  const teaching = useStore(s => s.teaching)
  const recipes = useStore(s => s.recipes)
  const activePositionRef = useStore(s => s.activePositionRef)
  const setActivePosition = useStore(s => s.setActivePosition)
  const teachGroup = useStore(s => s.teachGroup)
  const stopTeaching = useStore(s => s.stopTeaching)
  const [saving, setSaving] = useState(false)

  // What the proposal left empty and this position still lacks, by role.
  const stillEmpty = useMemo(() => {
    if (!teaching) return []
    const have = new Set(positionRecipeWithWrapperInternals(recipes, teaching.posRef).combined
      .filter(r => (r.IsDeleted || r.isDeleted) !== 'Y')
      .map(r => roleOf(r.ElementTypeRef || r.elementTypeRef)))
    return (teaching.missing || []).filter(role => !have.has(role))
  }, [teaching, recipes])

  // Quantities that depend on the job and have not been confirmed yet (they pulse below).
  const qtyPending = useMemo(() => {
    if (!teaching) return []
    const done = new Set(teaching.qtyConfirmed || [])
    return [...new Set(positionRecipeWithWrapperInternals(recipes, teaching.posRef).combined
      .filter(r => (r.IsDeleted || r.isDeleted) !== 'Y')
      .map(r => r.ElementTypeRef || r.elementTypeRef)
      .filter(ref => ref && QTY_CONFIRM_ROLES.has(roleOf(ref)) && !done.has(ref.toLowerCase())))]
  }, [teaching, recipes])

  if (!teaching) return null
  const here = activePositionRef === teaching.posRef
  const n = teaching.others.length

  async function useIt() {
    setSaving(true)
    try {
      const key = teaching.groupKey
      const refs = teaching.refs
      await teachGroup(teaching)
      onReturn?.({ refs, focus: key })
    } finally { setSaving(false) }
  }

  return (
    <div className="d-flex align-items-center gap-2 flex-wrap mx-3 mt-2 px-3 py-2 rounded" data-testid="teach-bar"
      style={{ background: '#fff3cd', border: '1px solid #ffe69c', fontSize: 12, color: '#664d03', flexShrink: 0 }}>
      <MaterialIcon name="school" size={16} />
      <span>
        <strong>Setting up “{teaching.label}”</strong> on <span style={{ fontFamily: 'monospace' }}>{teaching.posRef}</span>.{' '}
        {here
          ? (stillEmpty.length
              ? <>Still empty: {stillEmpty.map(pretty).join(', ')}. Add them below, or leave them out if this group doesn&apos;t need them.</>
              : <>Nothing left empty. Check it reads right, then use it for the other {n}.</>)
          : <>You&apos;re on another position.</>}
        {here && qtyPending.length > 0 && (
          <> <strong>Confirm quantities</strong> (they may need adjusting for this job): {qtyPending.join(', ')}.</>
        )}
      </span>
      <div className="ms-auto d-flex gap-2">
        {!here && (
          <Button size="sm" variant="outline-dark" style={{ fontSize: 11 }} onClick={() => setActivePosition(teaching.posRef)}>
            Back to {teaching.posRef}
          </Button>
        )}
        {n > 0 && (
          <Button size="sm" variant="primary" style={{ fontSize: 11 }} disabled={saving || qtyPending.length > 0} onClick={useIt}
            title={qtyPending.length ? `Confirm the quantities first: ${qtyPending.join(', ')}` : undefined}>
            Use {teaching.posRef} for the other {n}
          </Button>
        )}
        <Button size="sm" variant="outline-secondary" style={{ fontSize: 11 }}
          onClick={() => onReturn?.({ refs: teaching.refs, focus: teaching.groupKey })}>
          Back to the list
        </Button>
        <Button size="sm" variant="link" className="text-muted p-0" style={{ fontSize: 11 }} title="Stop setting up this group"
          onClick={stopTeaching}>
          <MaterialIcon name="close" size={14} />
        </Button>
      </div>
    </div>
  )
}
