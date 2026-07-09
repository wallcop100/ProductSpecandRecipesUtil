import React, { useMemo } from 'react'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { formCoverage } from '../utils/formSpec'

/**
 * FormCoverageBadge — how much of the Form's spec this position actually holds.
 *
 * Silent when no Form template is attached, and silent when the Form says nothing
 * about this position: absence of a spec is not a failing grade.
 *
 * "Present" is scope-wide (position level OR inside this position's wrapper), the
 * same predicate the Side-by-Side pane uses — see formSpec.js. The Form carries no
 * slot information, so where a product sits is never held against it.
 */
export default function FormCoverageBadge({ posRef, size = 13 }) {
  const recipes = useStore(s => s.recipes)
  const containerETRefs = useStore(s => s.containerETRefs)
  const formCaptures = useStore(s => s.formCaptures)

  const formEts = formCaptures?.byPosition?.[posRef]
  const coverage = useMemo(
    () => formCoverage(recipes, posRef, formEts, containerETRefs),
    [recipes, posRef, formEts, containerETRefs]
  )
  if (!coverage) return null

  const complete = coverage.present === coverage.total
  const colour = complete ? '#198754' : '#856404'

  return (
    <span
      className="d-inline-flex align-items-center gap-1"
      style={{ fontSize: 10, color: colour, flexShrink: 0 }}
      title={complete
        ? `All ${coverage.total} products the Form specifies are in this recipe`
        : `${coverage.total - coverage.present} of ${coverage.total} products the Form specifies are missing`}
    >
      <MaterialIcon name="description" size={size - 2} />
      {coverage.present}/{coverage.total}
    </span>
  )
}
