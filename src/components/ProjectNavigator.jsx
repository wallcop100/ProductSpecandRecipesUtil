import React, { useMemo, useState } from 'react'
import useStore from '../store/useStore'
import PositionList from './PositionList'

/**
 * ProjectNavigator — left-panel jump/filter index.
 *
 * A compact, flat way to find and jump to a position (PositionTypes mode) or a
 * container element type (ElementTypes mode); clicking one selects it and the
 * centre surface focuses on it. Shows live recipe-coverage progress.
 */
export default function ProjectNavigator() {
  const rootView = useStore(s => s.rootView)
  const positionTypes = useStore(s => s.positionTypes)
  const recipes = useStore(s => s.recipes)
  const activeETRef = useStore(s => s.activeETRef)
  const openETRecipe = useStore(s => s.openETRecipe)

  const [elFilter, setElFilter] = useState('')

  // Container ET refs (those with an internal recipe) for the Elements index
  const containerRefs = useMemo(() => {
    const refs = [...new Set(
      recipes
        .filter(r => (r.ContextType || r.contextType) === 'ElementType')
        .map(r => r.ContextRef || r.contextRef)
        .filter(Boolean)
    )]
    return refs.sort((a, b) => a.localeCompare(b))
  }, [recipes])

  // Recipe coverage: how many position types have at least one recipe row.
  const { reciped, total, coverage } = useMemo(() => {
    const recipedRefs = new Set()
    for (const r of recipes) {
      const pr = r.PositionTypeRef || r.positionTypeRef
      if (pr) recipedRefs.add(pr)
    }
    const totalCount = positionTypes.length
    const recipedCount = positionTypes.filter(
      pt => recipedRefs.has(pt.PositionTypeRef || pt.positionTypeRef)
    ).length
    return {
      reciped: recipedCount,
      total: totalCount,
      coverage: totalCount ? recipedCount / totalCount : 0,
    }
  }, [positionTypes, recipes])

  const [filter, setFilter] = useState('')

  const pct = total ? Math.round(coverage * 100) : 0

  // Elements root view: a compact container-ET jump index
  if (rootView === 'elements') {
    const q = elFilter.trim().toLowerCase()
    const visible = q ? containerRefs.filter(r => r.toLowerCase().includes(q)) : containerRefs
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <div style={{ flexShrink: 0, borderBottom: '1px solid #e9ecef' }}>
          <div className="px-2 pt-2 pb-1 text-uppercase text-muted fw-bold" style={{ fontSize: 10, letterSpacing: 0.6 }}>
            Element Types ({containerRefs.length})
          </div>
          <div className="px-2 pb-2">
            <input
              className="form-control form-control-sm"
              style={{ fontSize: 12 }}
              placeholder="Filter element types…"
              value={elFilter}
              onChange={e => setElFilter(e.target.value)}
            />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {containerRefs.length === 0 && (
            <div className="text-muted small p-3">No container element types yet.</div>
          )}
          {visible.map(ref => (
            <div
              key={ref}
              onClick={() => openETRecipe(ref)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                borderBottom: '1px solid #f0f0f0',
                fontFamily: 'monospace',
                fontSize: 12,
                background: ref === activeETRef ? '#e7f1ff' : 'transparent',
                borderLeft: ref === activeETRef ? '3px solid #0d6efd' : '3px solid transparent',
              }}
            >
              {ref}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header: coverage + filter */}
      <div style={{ flexShrink: 0, borderBottom: '1px solid #e9ecef' }}>
        <div className="d-flex align-items-center gap-1 px-2 pt-2">
          <span className="text-uppercase text-muted fw-bold" style={{ fontSize: 10, letterSpacing: 0.6 }}>
            Position Types
          </span>
          <div className="flex-grow-1" />
          <span className="text-muted" style={{ fontSize: 10 }} title="Position types with at least one recipe row">
            {reciped}/{total} reciped
          </span>
        </div>

        {/* Coverage bar */}
        <div className="px-2 pt-1">
          <div style={{ height: 3, background: '#e9ecef', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: '#198754', transition: 'width 0.2s' }} />
          </div>
        </div>

        {/* Filter */}
        <div className="px-2 py-2">
          <div className="position-relative">
            <input
              className="form-control form-control-sm"
              style={{ fontSize: 12, paddingRight: 22 }}
              placeholder="Filter positions…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
            {filter && (
              <button
                type="button"
                className="btn btn-sm p-0 position-absolute"
                style={{ right: 6, top: '50%', transform: 'translateY(-50%)', fontSize: 14, lineHeight: 1, color: '#888' }}
                onClick={() => setFilter('')}
                title="Clear filter"
              >
                ×
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <PositionList filter={filter} />
      </div>
    </div>
  )
}
