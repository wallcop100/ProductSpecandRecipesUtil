import React, { useMemo } from 'react'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { sameRecipeGroups } from '../utils/recipeSignature'

/**
 * SameRecipePill — "= A05E, A07" when another position's WHOLE recipe is identical to this
 * one (A59TJK): the same ElementTypes in the same places, the same quantities. Click a ref
 * to go there.
 */
export default function SameRecipePill({ posRef }) {
  const recipes = useStore(s => s.recipes)
  const positionTypes = useStore(s => s.positionTypes)
  const setActivePosition = useStore(s => s.setActivePosition)
  const groups = useMemo(() => sameRecipeGroups(recipes, positionTypes.map(p => p.PositionTypeRef)), [recipes, positionTypes])
  const same = groups.get(posRef) || []
  if (!same.length) return null
  const shown = same.slice(0, 4)
  return (
    <span className="rounded px-2 d-inline-flex align-items-center gap-1" data-testid="same-recipe-pill"
      style={{ fontSize: 11, background: '#e7f1ff', color: '#084298' }}
      title={`The whole recipe is identical in ${same.join(', ')}`}>
      <MaterialIcon name="drag_handle" size={13} /> same recipe as
      {shown.map(p => (
        <button key={p} type="button" className="btn btn-link p-0" style={{ fontSize: 11, color: '#084298' }}
          onClick={() => setActivePosition(p)}>{p}</button>
      ))}
      {same.length > shown.length && <span>+{same.length - shown.length}</span>}
    </span>
  )
}
