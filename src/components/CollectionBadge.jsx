import React, { useMemo } from 'react'
import useStore from '../store/useStore'
import { collectionStatusForPosition, overallCollectionStatus } from '../utils/collectionStatus'

const STATUS_STYLE = {
  complete: { bg: '#d1e7dd', color: '#0a3622', border: '#a3cfbb' },
  partial:  { bg: '#fff3cd', color: '#664d03', border: '#ffe69c' },
  missing:  { bg: '#f8d7da', color: '#58151c', border: '#f1aeb5' },
}

/**
 * CollectionBadge — small inline badge on a position card showing collection coverage.
 * Shows nothing when no collections are applicable to this position.
 */
export default function CollectionBadge({ posRef }) {
  const etCollections = useStore(s => s.etCollections)
  const positionUI    = useStore(s => s.positionUI)
  const recipes       = useStore(s => s.recipes)

  const { overall, label } = useMemo(() => {
    if (!etCollections.length) return { overall: null, label: '' }

    const tags = positionUI[posRef]?.tags ?? []
    const posRecipe = recipes.filter(r => (r.PositionTypeRef || r.positionTypeRef) === posRef)
    const statuses = collectionStatusForPosition(posRef, tags, posRecipe, etCollections)
    const overall = overallCollectionStatus(statuses)

    if (!overall) return { overall: null, label: '' }

    const relevantStatuses = statuses.filter(s => s.status !== 'na')
    if (overall === 'complete') {
      const completeNames = relevantStatuses
        .filter(s => s.status === 'complete')
        .map(s => s.collection.Name)
      return { overall, label: completeNames.slice(0, 2).join(', ') + (completeNames.length > 2 ? ` +${completeNames.length - 2}` : '') }
    }
    if (overall === 'missing') {
      const missing = relevantStatuses.filter(s => s.status === 'missing')
      return { overall, label: `Missing: ${missing.map(s => s.collection.Name).slice(0, 2).join(', ')}` }
    }
    // partial
    const partial = relevantStatuses.filter(s => s.status === 'partial')
    return { overall, label: `Partial: ${partial.map(s => s.collection.Name).slice(0, 2).join(', ')}` }
  }, [posRef, etCollections, positionUI, recipes])

  if (!overall) return null

  const style = STATUS_STYLE[overall]
  return (
    <span
      title={label}
      style={{
        fontSize: 10,
        padding: '1px 5px',
        borderRadius: 3,
        background: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
        maxWidth: 140,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        display: 'inline-block',
        verticalAlign: 'middle',
        lineHeight: '16px',
      }}
    >
      {overall === 'complete' ? '✓ ' : overall === 'missing' ? '✗ ' : '⚠ '}
      {label}
    </span>
  )
}
