import React, { useMemo } from 'react'
import { Button } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { connectorGapsForPosition } from '../utils/collectionStatus'

/**
 * ConnectorSuggestions — reactive connector guidance for a position.
 *
 * Sourced entirely from the user's Connector Templates (the same templates the
 * matrix uses): every suggested ref is a real ref the user put in a template —
 * nothing is guessed or hardcoded.
 *
 * A gap now says WHY it is a gap, because "not there" and "in the wrong place" want
 * different fixes:
 *   missing   — add it, in the slot the template asks for
 *   misplaced — the ref is present but in the wrong context: move it, don't add a
 *               second copy (which is what a flat ref check used to leave you doing)
 *   short     — present, but under the required quantity: raise it
 *   blocked   — belongs inside a wrapper, and the position has no design element.
 *               No button: adding it would write a blank ContextRef.
 */

const STYLE = {
  missing:   { icon: 'add_circle',  action: 'Add',   variant: 'outline-primary' },
  misplaced: { icon: 'move_down',   action: 'Move',  variant: 'outline-warning' },
  short:     { icon: 'exposure_plus_1', action: 'Raise', variant: 'outline-primary' },
}

export default function ConnectorSuggestions({ posRef }) {
  const recipes = useStore(s => s.recipes)
  const etCollections = useStore(s => s.etCollections)
  const positionUI = useStore(s => s.positionUI)
  const containerETRefs = useStore(s => s.containerETRefs)
  const addRecipeRow = useStore(s => s.addRecipeRow)
  const moveRecipeRowToSection = useStore(s => s.moveRecipeRowToSection)
  const updateRecipeRow = useStore(s => s.updateRecipeRow)

  const tags = positionUI?.[posRef]?.tags || []
  const gaps = useMemo(
    () => connectorGapsForPosition(recipes, posRef, tags, etCollections, containerETRefs),
    [recipes, posRef, tags, etCollections, containerETRefs]
  )

  if (gaps.length === 0) return null

  function resolve(g) {
    if (g.blocked) return
    if (g.status === 'misplaced') moveRecipeRowToSection(posRef, g.rows[0]._id, g.section)
    else if (g.status === 'short') updateRecipeRow(posRef, g.rows[0]._id, { quantity: g.need, Quantity: g.need })
    else addRecipeRow(posRef, g.section, { elementTypeRef: g.ref, quantity: g.need })
  }

  return (
    <div className="mb-3 px-3 py-2 rounded" style={{ background: '#fff8e1', border: '1px solid #f0e0a8', fontSize: 12 }}>
      <div className="fw-semibold mb-1" style={{ fontSize: 11, color: '#92400e' }}>
        Connector suggestions
      </div>
      {gaps.map(g => {
        const s = STYLE[g.status] || STYLE.missing
        return (
          <div key={`${g.ref}|${g.section}|${g.status}`} className="d-flex align-items-center gap-2 py-1">
            <MaterialIcon name={g.blocked ? 'block' : s.icon} size={13}
              style={{ color: g.blocked ? '#842029' : '#92400e', flexShrink: 0 }} />
            <span style={{ flex: 1, color: g.blocked ? '#842029' : undefined }}>{g.label}</span>
            {g.blocked
              ? <span className="text-muted fst-italic" style={{ fontSize: 10 }}>fix the recipe first</span>
              : (
                <Button size="sm" variant={s.variant} style={{ fontSize: 11, padding: '0px 8px' }}
                  onClick={() => resolve(g)}>
                  {s.action}
                </Button>
              )}
          </div>
        )
      })}
    </div>
  )
}
