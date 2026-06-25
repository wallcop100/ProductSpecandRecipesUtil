import React, { useMemo } from 'react'
import useStore from '../store/useStore'
import TagBadge from './TagBadge'
import { TAG_GROUPS } from '../utils/constants'

/**
 * PositionList — scrollable list of all position types.
 * Click to set active position.
 */
export default function PositionList() {
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

  const tagGroupMap = useMemo(() => {
    const map = {}
    for (const [group, tags] of Object.entries(TAG_GROUPS)) {
      for (const tag of tags) {
        map[tag] = group
      }
    }
    return map
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        className="px-3 py-2 border-bottom text-uppercase text-muted fw-bold"
        style={{ fontSize: 10, letterSpacing: 0.8, flexShrink: 0 }}
      >
        Positions ({positionTypes.length})
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {positionTypes.length === 0 && (
          <div className="text-muted small p-3">No positions loaded.</div>
        )}
        {positionTypes.map(pt => {
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
                    <TagBadge key={tag} tag={tag} group={tagGroupMap[tag] || 'Special'} />
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
