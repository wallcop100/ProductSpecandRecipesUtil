import React, { useMemo, useState, useEffect } from 'react'
import { Modal, Button, Form } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import EntityPill from './EntityPill'
import { positionRecipeWithWrapperInternals } from '../utils/collectionStatus'

/**
 * ForkPositionModal — make one or more independent copies of a position's recipe.
 *
 * The painful task this replaces: copy a recipe into a new position, fork its wrapper by hand
 * so edits don't leak back, then delete the rows the variant shouldn't have — repeated once
 * per variant. Here it is one action: pick the target position type(s), keep the wrapper toggle
 * on so each fork gets its own private copy, and untick the rows to drop. See forkPosition.
 *
 * Driven by `show` + `sourceRef`.
 */
const lc = s => String(s || '').toLowerCase()
const idOf = r => r._id
const etOf = r => r.ElementTypeRef || r.elementTypeRef || ''
const crefOf = r => r.ContextRef || r.contextRef || ''
const isInternal = r => (r.ContextType || r.contextType) === 'ElementType'

export default function ForkPositionModal({ show, sourceRef, onHide }) {
  const positionTypes = useStore(s => s.positionTypes)
  const recipes = useStore(s => s.recipes)
  const forkPosition = useStore(s => s.forkPosition)

  const sourceRows = useMemo(
    () => (show && sourceRef
      ? positionRecipeWithWrapperInternals(recipes, sourceRef).combined
          .filter(r => (r.IsDeleted || r.isDeleted) !== 'Y')
      : []),
    [show, sourceRef, recipes]
  )

  // Group the rows: position level, then one group per wrapper (its internals).
  const groups = useMemo(() => {
    const posLevel = sourceRows.filter(r => !isInternal(r))
    const byContainer = new Map()
    for (const r of sourceRows) {
      if (!isInternal(r)) continue
      const k = crefOf(r)
      if (!byContainer.has(k)) byContainer.set(k, [])
      byContainer.get(k).push(r)
    }
    return { posLevel, byContainer }
  }, [sourceRows])

  // Which position-level rows are wrappers (something is filed inside them) → their internals
  // cascade when you untick the wrapper.
  const childrenOf = useMemo(() => {
    const map = new Map()   // wrapper-row _id -> [internal ids]
    for (const r of groups.posLevel) {
      const kids = groups.byContainer.get(etOf(r))
      if (kids) map.set(idOf(r), kids.map(idOf))
    }
    return map
  }, [groups])

  const [targets, setTargets] = useState(() => new Set())
  const [forkWrapper, setForkWrapper] = useState(true)
  const [excluded, setExcluded] = useState(() => new Set())

  // Reset each time it opens for a new source.
  useEffect(() => { if (show) { setTargets(new Set()); setForkWrapper(true); setExcluded(new Set()) } }, [show, sourceRef])

  const targetOptions = useMemo(() => {
    const rowCount = {}
    for (const r of recipes) {
      if ((r.IsDeleted || r.isDeleted) === 'Y') continue
      const p = r.PositionTypeRef || r.positionTypeRef
      if (p) rowCount[p] = (rowCount[p] || 0) + 1
    }
    return positionTypes
      .map(pt => pt.PositionTypeRef || pt.positionTypeRef)
      .filter(ref => ref && ref !== sourceRef)
      .map(ref => ({ ref, rows: rowCount[ref] || 0 }))
      .sort((a, b) => (a.rows - b.rows) || a.ref.localeCompare(b.ref))   // empties first
  }, [positionTypes, recipes, sourceRef])

  const wrapperRefs = useMemo(() => [...groups.byContainer.keys()], [groups])
  const includedCount = sourceRows.length - excluded.size
  const overwrites = targetOptions.filter(t => targets.has(t.ref) && t.rows > 0)

  function toggleTarget(ref) {
    setTargets(prev => { const n = new Set(prev); n.has(ref) ? n.delete(ref) : n.add(ref); return n })
  }

  // Toggling a row toggles its children too (untick a wrapper → untick what's inside it).
  function toggleRow(id) {
    setExcluded(prev => {
      const n = new Set(prev)
      const kids = childrenOf.get(id) || []
      const willExclude = !n.has(id)
      for (const k of [id, ...kids]) willExclude ? n.add(k) : n.delete(k)
      return n
    })
  }

  function confirm() {
    if (overwrites.length > 0) {
      const list = overwrites.map(t => `${t.ref} (${t.rows} row${t.rows === 1 ? '' : 's'})`).join(', ')
      if (!window.confirm(`This will replace the existing recipe on: ${list}.\n\nContinue?`)) return
    }
    forkPosition(sourceRef, [...targets], { forkWrapper, excludeRowIds: [...excluded] })
    onHide()
  }

  const Row = ({ r, indent }) => {
    const on = !excluded.has(idOf(r))
    const wrapper = childrenOf.has(idOf(r))
    return (
      <Form.Check type="checkbox" id={`fork-row-${idOf(r)}`} checked={on} onChange={() => toggleRow(idOf(r))}
        style={{ fontSize: 11, marginLeft: indent ? 18 : 0 }}
        label={
          <span className="d-inline-flex align-items-center gap-1">
            <span style={{ fontFamily: 'monospace' }}>{etOf(r)}</span>
            {r.IsDesign === 'Y' && <span className="badge bg-primary" style={{ fontSize: 8 }}>design</span>}
            {wrapper && <span className="text-muted" style={{ fontSize: 9 }}>wrapper</span>}
          </span>
        } />
    )
  }

  return (
    <Modal show={show} onHide={onHide} size="lg" centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 15 }} className="d-flex align-items-center gap-2">
          <MaterialIcon name="call_split" size={18} /> Fork <EntityPill type="PositionType" label={sourceRef} />
        </Modal.Title>
      </Modal.Header>

      <Modal.Body style={{ fontSize: 12 }}>
        <div className="d-flex gap-3">
          {/* Targets */}
          <div style={{ width: 220, flexShrink: 0 }}>
            <div className="fw-semibold mb-1">Into which position(s)?</div>
            <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #e9ecef', borderRadius: 6, padding: 8 }}>
              {targetOptions.length === 0 && (
                <div className="text-muted fst-italic">No other position types.</div>
              )}
              {targetOptions.map(t => (
                <Form.Check key={t.ref} type="checkbox" id={`fork-t-${t.ref}`}
                  checked={targets.has(t.ref)} onChange={() => toggleTarget(t.ref)}
                  style={{ fontSize: 11 }}
                  label={
                    <span className="d-inline-flex align-items-center gap-1">
                      <span style={{ fontFamily: 'monospace' }}>{t.ref}</span>
                      <span className="text-muted" style={{ fontSize: 9 }}>
                        {t.rows === 0 ? 'empty' : `${t.rows} rows`}
                      </span>
                    </span>
                  } />
              ))}
            </div>
            <Form.Check type="switch" id="fork-wrapper" className="mt-2"
              checked={forkWrapper} onChange={e => setForkWrapper(e.target.checked)}
              label={<span style={{ fontSize: 11 }}>Give each its own copy of the wrapper</span>} />
            {forkWrapper && wrapperRefs.length > 0 && (
              <div className="text-muted mt-1" style={{ fontSize: 10 }}>
                A private, auto-named copy of {wrapperRefs.map(w => (
                  <span key={w} style={{ fontFamily: 'monospace' }}>{w} </span>
                ))} per position.
              </div>
            )}
          </div>

          {/* Trim */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="fw-semibold mb-1">Include which rows?</div>
            <div className="text-muted mb-2" style={{ fontSize: 10 }}>
              Untick anything the fork should not have — the driver, connectors, whatever. Applies to
              every target you picked.
            </div>
            {groups.posLevel.length > 0 && (
              <>
                <div className="text-uppercase text-muted fw-semibold" style={{ fontSize: 9, letterSpacing: '.04em' }}>
                  Position level
                </div>
                {groups.posLevel.map(r => {
                  const kids = groups.byContainer.get(etOf(r))
                  return (
                    <React.Fragment key={idOf(r)}>
                      <Row r={r} />
                      {kids && kids.map(k => <Row key={idOf(k)} r={k} indent />)}
                    </React.Fragment>
                  )
                })}
              </>
            )}
            {/* Internals whose container is NOT a position-level row here (shared, stored elsewhere) */}
            {[...groups.byContainer.entries()]
              .filter(([cref]) => !groups.posLevel.some(r => lc(etOf(r)) === lc(cref)))
              .map(([cref, kids]) => (
                <div key={cref} className="mt-1">
                  <div className="text-uppercase text-muted fw-semibold" style={{ fontSize: 9 }}>Inside {cref}</div>
                  {kids.map(k => <Row key={idOf(k)} r={k} indent />)}
                </div>
              ))}
          </div>
        </div>
      </Modal.Body>

      <Modal.Footer className="d-flex align-items-center">
        <span className="text-muted me-auto" style={{ fontSize: 11 }}>
          {targets.size} position{targets.size === 1 ? '' : 's'} · {includedCount} row{includedCount === 1 ? '' : 's'} each
          {overwrites.length > 0 && <span style={{ color: '#997404' }}> · {overwrites.length} will be overwritten</span>}
        </span>
        <Button size="sm" variant="secondary" onClick={onHide}>Cancel</Button>
        <Button size="sm" variant="primary" disabled={targets.size === 0 || includedCount === 0} onClick={confirm}>
          Fork into {targets.size || ''}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
