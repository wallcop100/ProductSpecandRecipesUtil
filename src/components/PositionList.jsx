import React, { useMemo } from 'react'
import useStore from '../store/useStore'
import TagBadge from './TagBadge'

/**
 * PositionList — scrollable list of all position types.
 * Click to set active position.
 *
 * @param {string} filter - case-insensitive filter on ref / name / tags
 */
export default function PositionList({ filter = '' }) {
  const positionTypes = useStore(s => s.positionTypes)
  const positionUI = useStore(s => s.positionUI)
  const activePositionRef = useStore(s => s.activePositionRef)
  const setActivePosition = useStore(s => s.setActivePosition)
  const validationResults = useStore(s => s.validationResults)

  // Index validation issues by positionTypeRef
  const issuesByRef = useMemo(() => {
    const map = {}
    for (const issue of validationResults) {
      if (issue.ref) {
        if (!map[issue.ref]) map[issue.ref] = []
        map[issue.ref].push(issue)
      }
    }
    return map
  }, [validationResults])


  // Apply the filter: match on ref, name, or any tag.
  const q = filter.trim().toLowerCase()
  const visiblePositions = useMemo(() => {
    if (!q) return positionTypes
    return positionTypes.filter(pt => {
      const ref = pt.PositionTypeRef || ''
      const name = pt.Name || pt.name || ''
      const tags = (positionUI[ref]?.tags) || []
      return ref.toLowerCase().includes(q) ||
        name.toLowerCase().includes(q) ||
        tags.some(t => t.toLowerCase().includes(q))
    })
  }, [positionTypes, positionUI, q])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {positionTypes.length === 0 && (
          <div className="text-muted small p-3">No positions loaded.</div>
        )}
        {positionTypes.length > 0 && visiblePositions.length === 0 && (
          <div className="text-muted small p-3">No positions match “{filter}”.</div>
        )}
        {visiblePositions.map(pt => {
          const ref = pt.PositionTypeRef
          const isActive = ref === activePositionRef
          const ui = positionUI[ref] || {}
          const tags = ui.tags || []
          const issues = issuesByRef[ref] || []
          const hasError = issues.some(i => i.severity === 'error')
          const hasWarning = issues.some(i => i.severity === 'warning')

          return (
            <div
              key={ref}
              onClick={() => setActivePosition(ref)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                borderBottom: '1px solid #f0f0f0',
                background: isActive ? '#e7f1ff' : 'transparent',
                borderLeft: isActive ? '3px solid #0d6efd' : '3px solid transparent',
              }}
            >
              <div className="d-flex align-items-center gap-1">
                <span
                  className="fw-semibold"
                  style={{ fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {ref}
                </span>
                {hasError && <span title="Has errors" style={{ color: '#dc3545', fontSize: 14 }}>●</span>}
                {!hasError && hasWarning && <span title="Has warnings" style={{ color: '#ffc107', fontSize: 14 }}>●</span>}
                {!hasError && !hasWarning && issues.length === 0 && validationResults.length > 0 && (
                  <span title="OK" style={{ color: '#198754', fontSize: 14 }}>●</span>
                )}
              </div>

              {tags.length > 0 && (
                <div className="d-flex gap-1 flex-wrap mt-1">
                  {tags.slice(0, 4).map(tag => (
                    <TagBadge key={tag} tag={tag} />
                  ))}
                  {tags.length > 4 && (
                    <span className="text-muted" style={{ fontSize: 10 }}>+{tags.length - 4}</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
