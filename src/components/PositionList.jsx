import React, { useMemo } from 'react'
import useStore from '../store/useStore'
import TagBadge from './TagBadge'
import PositionValidationBadge from './PositionValidationBadge'
import { positionFamilyOf } from '../utils/positionFamily'

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
  const ignoredPositionFamilies = useStore(s => s.ignoredPositionFamilies)

  // Apply the filter: match on ref, name, or any tag. Ignored positions/families
  // are out-of-scope and excluded from the navigator index entirely.
  const q = filter.trim().toLowerCase()
  const visiblePositions = useMemo(() => {
    const ignoredFamilies = new Set(ignoredPositionFamilies)
    const isIgnored = (pt) =>
      !!positionUI[pt.PositionTypeRef]?.ignored ||
      (ignoredFamilies.size > 0 && ignoredFamilies.has(positionFamilyOf(pt)))
    return positionTypes.filter(pt => {
      if (isIgnored(pt)) return false
      if (!q) return true
      const ref = pt.PositionTypeRef || ''
      const name = pt.Name || pt.name || ''
      const tags = (positionUI[ref]?.tags) || []
      return ref.toLowerCase().includes(q) ||
        name.toLowerCase().includes(q) ||
        tags.some(t => t.toLowerCase().includes(q))
    })
  }, [positionTypes, positionUI, ignoredPositionFamilies, q])

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
                <PositionValidationBadge posRef={ref} showOk />
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
