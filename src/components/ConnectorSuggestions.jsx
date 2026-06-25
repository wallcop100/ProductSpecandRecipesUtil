import React, { useMemo } from 'react'
import { Button } from 'react-bootstrap'
import useStore, { getRecipeForPosition } from '../store/useStore'
import { connectorGaps } from '../utils/connectors'

/**
 * ConnectorSuggestions — reactive connector guidance for a position.
 *
 * Uses connectorGaps() to pair sockets and plugs symmetrically: every socket
 * needs its plug (in the DL when the socket is free-issued at position) AND
 * every plug needs its socket (at position level). Strain reliefs are shown as
 * a soft, optional hint — they are connector-product specific and not always
 * required, so they never count toward "complete". Each gap has a one-click Add.
 */
export default function ConnectorSuggestions({ posRef }) {
  const recipes = useStore(s => s.recipes)
  const addRecipeRow = useStore(s => s.addRecipeRow)

  const grouped = useMemo(() => getRecipeForPosition(recipes, posRef), [recipes, posRef])
  const gaps = useMemo(() => connectorGaps(grouped), [grouped])

  // Any connectors present at all? (no panel if the recipe has none)
  const hasConnectors = useMemo(() => {
    const all = [...grouped.position, ...grouped.dlInternal, ...grouped.linInternal]
    return all.some(r => {
      const ref = (r.elementTypeRef || r.ElementTypeRef || '').toUpperCase()
      return ref.includes('SOCKET') || ref.includes('PLUG') || ref.split('-').includes('SOCK')
    })
  }, [grouped])

  if (!hasConnectors) return null

  const required = gaps.filter(g => !g.optional)
  const optional = gaps.filter(g => g.optional)

  if (required.length === 0 && optional.length === 0) {
    return (
      <div className="mb-3 px-3 py-2 rounded" style={{ background: '#e8f4e8', border: '1px solid #cfe8cf', fontSize: 12 }}>
        ✓ Connectors paired — every socket has its plug and vice versa.
      </div>
    )
  }

  return (
    <div className="mb-3 px-3 py-2 rounded" style={{ background: '#fff8e1', border: '1px solid #f0e0a8', fontSize: 12 }}>
      <div className="fw-semibold mb-1" style={{ fontSize: 11, color: '#92400e' }}>
        Connector suggestions
      </div>
      {required.map(g => (
        <div key={g.kind + g.ref + g.section} className="d-flex align-items-center gap-2 py-1">
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
      {optional.map(g => (
        <div key={g.kind + g.ref + g.section} className="d-flex align-items-center gap-2 py-1 text-muted">
          <span style={{ flex: 1, fontSize: 11 }}>
            {g.label} <span className="fst-italic">(optional)</span>
          </span>
          <Button
            size="sm"
            variant="outline-secondary"
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
