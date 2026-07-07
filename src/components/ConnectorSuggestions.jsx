import React, { useMemo } from 'react'
import { Button } from 'react-bootstrap'
import useStore from '../store/useStore'
import { connectorGapsForPosition } from '../utils/collectionStatus'

/**
 * ConnectorSuggestions — reactive connector guidance for a position.
 *
 * Sourced entirely from the user's Connector Templates (the same templates the
 * matrix uses): every suggested ref is a real ref the user put in a template —
 * nothing is guessed or hardcoded. When a position has started a connector
 * template but not completed it, the still-absent ingredients are offered with
 * a one-click Add.
 */
export default function ConnectorSuggestions({ posRef }) {
  const recipes = useStore(s => s.recipes)
  const etCollections = useStore(s => s.etCollections)
  const positionUI = useStore(s => s.positionUI)
  const addRecipeRow = useStore(s => s.addRecipeRow)

  const tags = positionUI?.[posRef]?.tags || []
  const gaps = useMemo(
    () => connectorGapsForPosition(recipes, posRef, tags, etCollections),
    [recipes, posRef, tags, etCollections]
  )

  if (gaps.length === 0) return null

  return (
    <div className="mb-3 px-3 py-2 rounded" style={{ background: '#fff8e1', border: '1px solid #f0e0a8', fontSize: 12 }}>
      <div className="fw-semibold mb-1" style={{ fontSize: 11, color: '#92400e' }}>
        Connector suggestions
      </div>
      {gaps.map(g => (
        <div key={g.ref + g.section} className="d-flex align-items-center gap-2 py-1">
          <span style={{ flex: 1 }}>{g.label}</span>
          <Button
            size="sm"
            variant="outline-primary"
            style={{ fontSize: 11, padding: '0px 8px' }}
            onClick={() => addRecipeRow(posRef, g.section, { elementTypeRef: g.ref })}
          >
            Add
          </Button>
        </div>
      ))}
    </div>
  )
}
