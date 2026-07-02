import React from 'react'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'

/**
 * Breadcrumbs — shows and navigates the current location.
 *
 * Examples:
 *   Positions
 *   Positions › PT-001
 *   Positions › PT-001 › ET-DL-01 (internals)
 *   Elements
 *   Elements › ET-DL-01
 */
export default function Breadcrumbs() {
  const rootView = useStore(s => s.rootView)
  const activePositionRef = useStore(s => s.activePositionRef)
  const activeETRef = useStore(s => s.activeETRef)
  const activeContextType = useStore(s => s.activeContextType)
  const setRootView = useStore(s => s.setRootView)
  const setActivePosition = useStore(s => s.setActivePosition)
  const closeETRecipe = useStore(s => s.closeETRecipe)

  const inETMode = activeContextType === 'ElementType' && !!activeETRef
  const crumbs = []

  const rootLabel = rootView === 'elements' ? 'Elements' : 'Positions'
  crumbs.push({
    label: rootLabel,
    onClick: () => { setRootView(rootView); setActivePosition(null) },
  })

  if (rootView === 'positions') {
    if (activePositionRef) {
      crumbs.push({
        label: activePositionRef,
        onClick: inETMode ? () => closeETRecipe() : null,
      })
    }
    if (inETMode) {
      crumbs.push({ label: `${activeETRef} (internals)`, onClick: null })
    }
  } else {
    if (inETMode) {
      crumbs.push({ label: activeETRef, onClick: null })
    }
  }

  return (
    <div className="d-flex align-items-center gap-1" style={{ fontSize: 12 }}>
      {crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1
        return (
          <React.Fragment key={i}>
            {i > 0 && <MaterialIcon name="chevron_right" size={16} className="text-muted" />}
            {c.onClick && !isLast ? (
              <button
                type="button"
                className="btn btn-link p-0"
                style={{ fontSize: 12, textDecoration: 'none' }}
                onClick={c.onClick}
              >
                {c.label}
              </button>
            ) : (
              <span className={isLast ? 'fw-semibold' : 'text-muted'}>{c.label}</span>
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
