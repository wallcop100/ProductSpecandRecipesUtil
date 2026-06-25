import React, { useMemo, useState, useRef } from 'react'
import { Badge, Button, Overlay, Popover } from 'react-bootstrap'
import useStore from '../store/useStore'
import { getUsedIn } from '../utils/containerUtils'

export default function ContextTreePanel() {
  const positionTypes = useStore(s => s.positionTypes)
  const recipes = useStore(s => s.recipes)
  const elementTypes = useStore(s => s.elementTypes)
  const openETRecipe = useStore(s => s.openETRecipe)
  const duplicateET = useStore(s => s.duplicateET)

  // Build the tree: PT → [ET refs used in position level]
  const tree = useMemo(() => {
    return positionTypes.map(pt => {
      const ptRef = pt.PositionTypeRef || pt.positionTypeRef
      const posRows = recipes.filter(r =>
        (r.ContextType || r.contextType) === 'PositionType' &&
        (r.ContextRef || r.contextRef) === ptRef
      )
      const etRefs = [...new Set(
        posRows
          .map(r => r.ElementTypeRef || r.elementTypeRef)
          .filter(Boolean)
      )]
      return { ptRef, name: pt.Name || pt.name || ptRef, etRefs }
    })
  }, [positionTypes, recipes])

  // For each ET ref: count unique internal items
  const internalCount = useMemo(() => {
    const counts = {}
    for (const row of recipes) {
      const ct = row.ContextType || row.contextType
      const cr = row.ContextRef || row.contextRef
      const er = row.ElementTypeRef || row.elementTypeRef
      if (ct !== 'ElementType' || !cr || !er) continue
      if (!counts[cr]) counts[cr] = new Set()
      counts[cr].add(er)
    }
    return counts // { etRef: Set<elementTypeRef> }
  }, [recipes])

  // For each ET ref: list its unique internal item objects
  const internalItems = useMemo(() => {
    const items = {}
    const etMap = new Map(elementTypes.map(et => [
      (et.ElementTypeRef || et.elementTypeRef || '').toLowerCase(),
      et,
    ]))
    for (const row of recipes) {
      const ct = row.ContextType || row.contextType
      const cr = row.ContextRef || row.contextRef
      const er = row.ElementTypeRef || row.elementTypeRef
      if (ct !== 'ElementType' || !cr || !er) continue
      if (!items[cr]) items[cr] = []
      if (!items[cr].some(x => x.ref === er)) {
        const etInfo = etMap.get(er.toLowerCase())
        items[cr].push({ ref: er, name: etInfo?.Name || etInfo?.name || null })
      }
    }
    return items
  }, [recipes, elementTypes])

  const [collapsed, setCollapsed] = useState({})

  function toggleCollapse(ptRef) {
    setCollapsed(prev => ({ ...prev, [ptRef]: !prev[ptRef] }))
  }

  if (tree.length === 0) {
    return (
      <div className="text-muted small text-center p-3">No positions loaded.</div>
    )
  }

  return (
    <div style={{ overflowY: 'auto', flex: 1 }}>
      {tree.map(({ ptRef, name, etRefs }) => {
        const isCollapsed = collapsed[ptRef]
        return (
          <div key={ptRef} style={{ borderBottom: '1px solid #f0f0f0' }}>
            {/* PT header */}
            <div
              className="d-flex align-items-center gap-1 px-2 py-1"
              style={{ cursor: 'pointer', userSelect: 'none', background: '#f8f9fa' }}
              onClick={() => toggleCollapse(ptRef)}
            >
              <span style={{ fontSize: 11, color: '#888', width: 10 }}>
                {isCollapsed ? '▶' : '▼'}
              </span>
              <span className="fw-semibold small" style={{ fontSize: 11 }}>{ptRef}</span>
              {name !== ptRef && (
                <span className="text-muted" style={{ fontSize: 10 }}>{name}</span>
              )}
              {etRefs.length === 0 && (
                <span className="text-muted" style={{ fontSize: 10, fontStyle: 'italic' }}>empty</span>
              )}
            </div>

            {/* ET entries */}
            {!isCollapsed && etRefs.map(etRef => (
              <ETEntry
                key={etRef}
                etRef={etRef}
                ptRef={ptRef}
                count={internalCount[etRef]?.size ?? 0}
                items={internalItems[etRef] || []}
                recipes={recipes}
                onEdit={() => openETRecipe(etRef)}
                onDuplicate={() => duplicateET(etRef)}
              />
            ))}

            {!isCollapsed && etRefs.length === 0 && (
              <div className="text-muted px-4 py-1" style={{ fontSize: 10, fontStyle: 'italic' }}>
                No element types
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ETEntry({ etRef, ptRef, count, items, recipes, onEdit, onDuplicate }) {
  const [showPopover, setShowPopover] = useState(false)
  const pillRef = useRef(null)

  const usedIn = useMemo(() => getUsedIn(etRef, recipes, ptRef), [etRef, recipes, ptRef])

  return (
    <div
      className="px-3 py-1"
      style={{ borderLeft: '2px solid #dee2e6', marginLeft: 14 }}
    >
      <div className="d-flex align-items-center gap-1 flex-wrap">
        <span style={{ fontSize: 11, fontFamily: 'monospace' }}>{etRef}</span>

        {/* Inner item count pill */}
        <span ref={pillRef}>
          <Badge
            bg="warning"
            text="dark"
            style={{ fontSize: 10, cursor: count > 0 ? 'pointer' : 'default' }}
            onClick={() => count > 0 && setShowPopover(v => !v)}
            title={count > 0 ? 'Click to see internal items' : 'No internal items'}
          >
            {count}
          </Badge>
        </span>

        <Overlay
          target={pillRef.current}
          show={showPopover}
          placement="right"
          rootClose
          onHide={() => setShowPopover(false)}
        >
          <Popover>
            <Popover.Header style={{ fontSize: 11 }}>Inside {etRef}</Popover.Header>
            <Popover.Body style={{ padding: '6px 10px' }}>
              {items.map(item => (
                <div key={item.ref} style={{ fontSize: 11 }}>
                  <span style={{ fontFamily: 'monospace' }}>{item.ref}</span>
                  {item.name && <span className="text-muted ms-1">{item.name}</span>}
                </div>
              ))}
              {items.length === 0 && (
                <div className="text-muted" style={{ fontSize: 11 }}>No internal items</div>
              )}
            </Popover.Body>
          </Popover>
        </Overlay>

        <Button
          variant="link"
          size="sm"
          className="p-0"
          style={{ fontSize: 10, textDecoration: 'none', color: '#0d6efd' }}
          onClick={onEdit}
        >
          Edit
        </Button>
        <Button
          variant="link"
          size="sm"
          className="p-0"
          style={{ fontSize: 10, textDecoration: 'none', color: '#6c757d' }}
          onClick={onDuplicate}
        >
          Dup
        </Button>
      </div>

      {usedIn.length > 0 && (
        <div className="text-muted" style={{ fontSize: 10, paddingLeft: 4 }}>
          Also in: {usedIn.join(', ')}
        </div>
      )}
    </div>
  )
}
