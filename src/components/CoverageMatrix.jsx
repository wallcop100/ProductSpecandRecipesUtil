import React, { useMemo, useState } from 'react'
import { Badge, Button, Form } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { collectionStatusForPosition } from '../utils/collectionStatus'
import { positionFamilyOf } from '../utils/positionFamily'
import { ACTION_ICONS } from '../utils/entityStyle'

const STATUS_SYMBOL = {
  complete: { icon: ACTION_ICONS.complete,   color: '#198754', bg: '#d1e7dd', title: 'All template refs present' },
  partial:  { icon: ACTION_ICONS.partial,    color: '#856404', bg: '#fff3cd', title: 'Some refs present, some missing' },
  missing:  { icon: ACTION_ICONS.missing,    color: '#842029', bg: '#f8d7da', title: 'Tags match but no refs present' },
  na:       { icon: ACTION_ICONS.na,         color: '#adb5bd', bg: '#f8f9fa', title: "Tags don't match (N/A)" },
}

function StatusCell({ posRef, collection, status, isSelected, onClick }) {
  const meta = STATUS_SYMBOL[status]
  return (
    <td
      onClick={() => onClick(posRef, collection.CollectionId)}
      title={`${meta.title} — click to manage`}
      style={{
        textAlign: 'center',
        background: isSelected ? '#cfe2ff' : meta.bg,
        cursor: 'pointer',
        outline: isSelected ? '2px solid #0d6efd' : undefined,
        outlineOffset: -2,
      }}
    >
      <MaterialIcon name={meta.icon} size={16} style={{ color: meta.color }} />
    </td>
  )
}

/**
 * CoverageMatrix — positions × collections grid.
 * Clicking any cell selects it (via onCellClick) so the parent can show a
 * live detail panel for granular add/remove. Column headers offer bulk apply.
 *
 * Props:
 *   selectedCell — { posRef, collectionId } | null (highlights that cell)
 *   onCellClick(posRef, collectionId)
 *   onNewCollection() — open the collection editor (create mode)
 */
export default function CoverageMatrix({ selectedCell, onCellClick, onNewCollection, onOpenPosition }) {
  const positionTypes  = useStore(s => s.positionTypes)
  const etCollections  = useStore(s => s.etCollections)
  const positionUI     = useStore(s => s.positionUI)
  const recipes        = useStore(s => s.recipes)
  const applyCollection = useStore(s => s.applyCollection)

  const ignoredPositionFamilies = useStore(s => s.ignoredPositionFamilies)

  const [incompleteOnly, setIncompleteOnly] = useState(false)

  const collections = etCollections

  // High-level scope: ignored positions (individually flagged, or in an ignored
  // family) drop out entirely — they don't appear in the matrix and don't count
  // toward totals. Family matching is handled by positionFamilyOf().
  const ignoredFamilySet = useMemo(() => new Set(ignoredPositionFamilies), [ignoredPositionFamilies])
  const scopedPositions = useMemo(() => positionTypes.filter(pt => {
    const ref = pt.PositionTypeRef
    if (positionUI[ref]?.ignored) return false
    if (ignoredFamilySet.size > 0 && ignoredFamilySet.has(positionFamilyOf(pt))) return false
    return true
  }), [positionTypes, positionUI, ignoredFamilySet])

  // Compute status for every (scoped position, collection) once.
  const statusByPos = useMemo(() => {
    const map = {}
    for (const pt of scopedPositions) {
      const posRef = pt.PositionTypeRef
      const tags = positionUI[posRef]?.tags ?? []
      const posRecipe = recipes.filter(r => (r.PositionTypeRef || r.positionTypeRef) === posRef)
      const results = collectionStatusForPosition(posRef, tags, posRecipe, collections)
      const byColl = {}
      results.forEach(r => { byColl[r.collection.CollectionId] = r.status })
      map[posRef] = byColl
    }
    return map
  }, [scopedPositions, positionUI, recipes, collections])

  const positions = useMemo(() => {
    if (!incompleteOnly) return scopedPositions
    return scopedPositions.filter(pt => {
      const byColl = statusByPos[pt.PositionTypeRef] || {}
      return Object.values(byColl).some(s => s === 'missing' || s === 'partial')
    })
  }, [scopedPositions, statusByPos, incompleteOnly])

  function handleBulkApply(collectionId, targetStatus) {
    for (const pt of scopedPositions) {
      const posRef = pt.PositionTypeRef
      const status = (statusByPos[posRef] || {})[collectionId]
      if (targetStatus === 'incomplete'
        ? (status === 'missing' || status === 'partial')
        : status === targetStatus) {
        applyCollection(posRef, collectionId)
      }
    }
  }

  if (!collections.length) {
    return (
      <div className="text-muted p-4 text-center">
        <p className="mb-3">
          No connector templates defined yet. Create one, then click a cell to add or remove its
          connectors on each position.
        </p>
        <Button variant="primary" size="sm" onClick={onNewCollection}>+ New template</Button>
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <div className="d-flex gap-3 mb-2 align-items-center">
        <Button variant="primary" size="sm" className="d-inline-flex align-items-center gap-1" onClick={onNewCollection} title="Create a new connector template">
          <MaterialIcon name={ACTION_ICONS.add} size={15} /> New template
        </Button>
        <span className="small text-muted">{positions.length} positions · click a cell to manage connectors</span>
        <div className="ms-auto">
          <Form.Check
            type="switch"
            id="matrix-incomplete-switch"
            label="Incomplete only"
            checked={incompleteOnly}
            onChange={e => setIncompleteOnly(e.target.checked)}
            style={{ fontSize: 13 }}
          />
        </div>
      </div>

      <table className="table table-sm table-bordered" style={{ fontSize: 12, minWidth: 500 }}>
        <thead className="table-light">
          <tr>
            <th style={{ minWidth: 200 }}>PositionType</th>
            <th style={{ minWidth: 80 }}>Tags</th>
            {collections.map(c => {
              const selected = selectedCell?.collectionId === c.CollectionId
              const anyMissing = positions.some(pt => (statusByPos[pt.PositionTypeRef] || {})[c.CollectionId] === 'missing')
              const anyPartial = positions.some(pt => (statusByPos[pt.PositionTypeRef] || {})[c.CollectionId] === 'partial')
              return (
                <th key={c.CollectionId}
                  style={{
                    textAlign: 'center', minWidth: 110,
                    background: selected ? '#e0f0ff' : undefined,
                  }}
                  title={`Applicable tags: ${(c.ApplicableTags || []).join(', ') || 'all'}`}
                >
                  <div>{c.Name}</div>
                  <div className="d-flex gap-1 justify-content-center mt-1">
                    <Button size="sm" variant="outline-danger" className="d-inline-flex align-items-center gap-1" style={{ fontSize: 9, padding: '0px 5px' }}
                      disabled={!anyMissing}
                      onClick={() => handleBulkApply(c.CollectionId, 'missing')}
                      title="Apply to all positions with missing status">Apply all <MaterialIcon name={ACTION_ICONS.missing} size={12} /></Button>
                    <Button size="sm" variant="outline-warning" className="d-inline-flex align-items-center gap-1" style={{ fontSize: 9, padding: '0px 5px' }}
                      disabled={!anyPartial}
                      onClick={() => handleBulkApply(c.CollectionId, 'partial')}
                      title="Fill missing refs on partial positions">Fill <MaterialIcon name={ACTION_ICONS.partial} size={12} /></Button>
                  </div>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {positions.map(pt => {
            const posRef = pt.PositionTypeRef
            const tags = positionUI[posRef]?.tags ?? []
            return (
              <tr key={posRef}>
                <td style={{ fontFamily: 'monospace', fontSize: 11 }}>
                  <span
                    onClick={() => onOpenPosition?.(posRef)}
                    title="Open this PositionType in the builder"
                    className="d-inline-flex align-items-center gap-1"
                    style={{ color: '#0d6efd', cursor: 'pointer' }}
                  >
                    {posRef} <MaterialIcon name={ACTION_ICONS.external} size={13} />
                  </span>
                </td>
                <td>
                  {tags.map(t => (
                    <Badge key={t} bg="secondary" className="me-1" style={{ fontSize: 10 }}>{t}</Badge>
                  ))}
                </td>
                {collections.map(c => (
                  <StatusCell
                    key={c.CollectionId}
                    posRef={posRef}
                    collection={c}
                    status={(statusByPos[posRef] || {})[c.CollectionId] || 'na'}
                    isSelected={selectedCell?.posRef === posRef && selectedCell?.collectionId === c.CollectionId}
                    onClick={onCellClick}
                  />
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>

      <div className="d-flex gap-3 mt-2" style={{ fontSize: 11 }}>
        {Object.entries(STATUS_SYMBOL).map(([k, v]) => (
          <span key={k} style={{ color: v.color }}>
            <strong>{v.symbol}</strong> {v.title}
          </span>
        ))}
      </div>
    </div>
  )
}
