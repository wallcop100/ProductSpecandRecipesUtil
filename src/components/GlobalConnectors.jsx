import React, { useMemo, useState } from 'react'
import { Button } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import useConnectorGroups from './useConnectorGroups'
import { globalConnectors, suggestConnectors, recogniseCodes, SUGGESTIONS, WAGO_PAGE } from '../data/globalConnectors'
import { templateParts } from '../utils/connectorGroups'

const pill = { fontSize: 10, lineHeight: '18px', background: '#fff', border: '1px solid #dee2e6', fontFamily: 'monospace' }
const ruleFor = key => SUGGESTIONS.find(s => s.keys.includes(key))?.rule || null

/** A library entry's parts: site codes, then (dashed) the driver-side codes in the wrapper. */
export function CodePills({ parts }) {
  const row = (list, inside) => list.length > 0 && (
    <div className="d-flex flex-wrap align-items-center gap-1 mb-1">
      {list.map(p => (
        <span key={p.code} className="rounded-pill px-2" title={p.label} style={{ ...pill, ...(inside ? { borderStyle: 'dashed' } : {}) }}>
          {inside && <MaterialIcon name="inventory_2" size={10} style={{ marginRight: 2, verticalAlign: '-1px' }} />}{p.code}
        </span>
      ))}
      <span className="text-muted" style={{ fontSize: 10 }}>{inside ? 'driver side, in wrapper' : 'site side'}</span>
    </div>
  )
  return <>{row(parts.filter(p => p.side !== 'driver'), false)}{row(parts.filter(p => p.side === 'driver'), true)}</>
}

/** How many in-scope positions each library entry is suggested for. */
function useFits() {
  const groups = useConnectorGroups()
  return useMemo(() => {
    const fits = new Map()
    for (const pt of groups.scoped) {
      for (const s of suggestConnectors(groups.recOf(pt.PositionTypeRef))) fits.set(s.key, (fits.get(s.key) || 0) + 1)
    }
    return fits
  }, [groups])
}

/**
 * WagoLibrary — the company's Wago templates (Kaizen page 141527), on the Connectors
 * screen: open when the project has no templates, folded under "Add from library"
 * otherwise. Add makes the template this project's, with any ElementTypes it lacks.
 */
export function WagoLibrary() {
  const etCollections = useStore(s => s.etCollections)
  const psRows = useStore(s => s.psRows)
  const planGlobalConnector = useStore(s => s.planGlobalConnector)
  const applyGlobalConnector = useStore(s => s.applyGlobalConnector)
  const [open, setOpen] = useState(etCollections.length === 0)
  const [busy, setBusy] = useState(null)
  const fits = useFits()
  const entries = globalConnectors()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plans = useMemo(() => new Map(entries.map(e => [e.key, planGlobalConnector(e.key)])), [etCollections, psRows])

  async function add(key) {
    setBusy(key)
    try { await applyGlobalConnector(key, { rule: ruleFor(key) }) } finally { setBusy(null) }
  }

  return (
    <div className="mb-2" data-testid="wago-library">
      <div className="small text-muted px-1 d-flex align-items-center gap-1" role="button" onClick={() => setOpen(o => !o)} data-testid="wago-library-toggle">
        <MaterialIcon name={open ? 'expand_more' : 'chevron_right'} size={14} />
        {etCollections.length ? 'Add from library' : 'Start from the Wago templates'}
      </div>
      {open && entries.map(e => {
        const plan = plans.get(e.key)
        const n = fits.get(e.key) || 0
        const make = plan.parts.filter(p => p.action === 'create').length
        return (
          <div key={e.key} className="px-2 py-1 mb-1 rounded bg-white border" style={{ fontSize: 11 }} data-testid="wago-entry">
            <div className="d-flex align-items-center gap-1">
              <span className="fw-semibold" style={{ flex: 1 }}>{e.name}</span>
              {n > 0 && <span className="badge rounded-pill text-bg-light border" title="Positions this suits, from their control and driver location">fits {n}</span>}
            </div>
            {e.note && <div className="text-muted" style={{ fontSize: 10 }}>{e.note}</div>}
            <div className="mt-1"><CodePills parts={e.parts} /></div>
            {plan.collection ? (
              <div className="text-success" style={{ fontSize: 10 }} data-testid="wago-in-project">
                <MaterialIcon name="check_circle" size={11} /> In this project as <strong>{plan.collection.Name}</strong>
              </div>
            ) : (
              <div className="d-flex align-items-center gap-2">
                <Button size="sm" variant="outline-primary" className="py-0" style={{ fontSize: 10 }} disabled={busy === e.key}
                  onClick={() => add(e.key)} data-testid="wago-add">Add</Button>
                <span className="text-muted" style={{ fontSize: 10 }}>
                  {make ? `makes ${make} ElementType${make === 1 ? '' : 's'}` : 'uses ElementTypes already here'}
                </span>
              </div>
            )}
          </div>
        )
      })}
      {open && <div className="text-muted px-1" style={{ fontSize: 9 }}>From Kaizen page {WAGO_PAGE.pageId}, {WAGO_PAGE.syncedAt}</div>}
    </div>
  )
}

/**
 * WagoSuggestion — in the drawer, for a position with no template: the Wago template its
 * control and driver location suggest, with Use (the others as "or …").
 */
export function WagoSuggestion({ posRef }) {
  const groups = useConnectorGroups()
  const etCollections = useStore(s => s.etCollections)
  const psRows = useStore(s => s.psRows)
  const planGlobalConnector = useStore(s => s.planGlobalConnector)
  const applyGlobalConnector = useStore(s => s.applyGlobalConnector)
  const [busy, setBusy] = useState(false)
  const rec = groups.recOf(posRef)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sugg = useMemo(() => suggestConnectors(rec), [rec])
  const [pick, setPick] = useState(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plan = useMemo(() => (sugg[pick] ? planGlobalConnector(sugg[pick].key) : null), [sugg, pick, etCollections, psRows])
  if (!sugg.length || !plan) return null
  const s = sugg[pick]
  const others = groups.scoped.filter(pt => pt.PositionTypeRef !== posRef
    && suggestConnectors(groups.recOf(pt.PositionTypeRef))[0]?.key === s.key).length

  async function use() {
    setBusy(true)
    try { await applyGlobalConnector(s.key, { posRefs: [posRef], rule: pick === 0 ? s.rule : null }) } finally { setBusy(false) }
  }

  return (
    <div className="p-2 rounded mb-2" style={{ background: '#eef6ff', border: '1px solid #b6d4fe' }} data-testid="wago-suggestion">
      <div className="d-flex align-items-center gap-1">
        <MaterialIcon name="auto_awesome" size={13} style={{ color: '#0d6efd' }} />
        <span style={{ flex: 1 }}>Suggested: <strong>{plan.collection?.Name || s.name}</strong></span>
        <Button size="sm" variant="primary" className="py-0" style={{ fontSize: 10 }} disabled={busy} onClick={use} data-testid="wago-use">Use</Button>
      </div>
      <div className="text-muted" style={{ fontSize: 10 }}>
        {s.why}
        {plan.collection && plan.collection.Name !== s.name ? <> · the project's {s.name}</> : null}
        {pick === 0 && others > 0 ? <> · suits {others} other position{others === 1 ? '' : 's'} too</> : null}
      </div>
      <div className="mt-1"><CodePills parts={globalConnectors().find(g => g.key === s.key).parts} /></div>
      {!plan.collection && plan.parts.some(p => p.action === 'create') && (
        <div className="text-muted" style={{ fontSize: 10 }} title={plan.parts.filter(p => p.action === 'create').map(p => p.ref).join('\n')}>
          Use adds {plan.parts.filter(p => p.action === 'create').length} ElementType{plan.parts.filter(p => p.action === 'create').length === 1 ? '' : 's'} to the Product Spec
        </div>
      )}
      {sugg.length > 1 && (
        <div className="d-flex flex-wrap align-items-center gap-1 mt-1" style={{ fontSize: 10 }}>
          <span className="text-muted">or</span>
          {sugg.map((o, i) => i !== pick && (
            <span key={o.key} role="button" className="rounded-pill px-2" style={{ ...pill, fontFamily: undefined }}
              onClick={() => setPick(i)} data-testid="wago-alt">{o.name.replace(/^Wago /, '')}</span>
          ))}
        </div>
      )}
    </div>
  )
}

/** "Wago 5-pin…" when a project template's parts are a library entry (by their Product Spec codes). */
export function wagoNameOf(collection, psRows) {
  const codeOf = new Map((psRows || []).map(r => [String(r.ElementTypeRef || r.elementTypeRef || '').toLowerCase(), r.ProductCode]))
  const codes = templateParts(collection).map(p => ({ code: codeOf.get(p.ref.toLowerCase()) || '', section: p.section }))
  if (codes.some(c => !c.code)) return null
  return recogniseCodes(codes)?.name || null
}

/** Existing project, adopted: Product Spec rows still on superseded Wago codes, with an Upgrade. */
export function WagoUpgradeBanner() {
  const psRows = useStore(s => s.psRows)
  const supersededWagoParts = useStore(s => s.supersededWagoParts)
  const upgradeSupersededWago = useStore(s => s.upgradeSupersededWago)
  const [review, setReview] = useState(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const items = useMemo(() => supersededWagoParts(), [psRows])
  if (!items.length) return null
  return (
    <div className="px-3 py-1 border-bottom" style={{ fontSize: 12, background: '#fff3cd', color: '#664d03' }} data-testid="wago-upgrade">
      <div className="d-flex align-items-center gap-2">
        <MaterialIcon name="update" size={14} />
        <span style={{ flex: 1 }}>{items.length} ElementType{items.length === 1 ? ' uses a' : 's use'} superseded Wago part{items.length === 1 ? '' : 's'}</span>
        <Button size="sm" variant="link" className="p-0" style={{ fontSize: 12 }} onClick={() => setReview(r => !r)} data-testid="wago-upgrade-review">
          {review ? 'Hide' : 'Review'}
        </Button>
        <Button size="sm" variant="warning" className="py-0" style={{ fontSize: 12 }} onClick={() => upgradeSupersededWago(items)} data-testid="wago-upgrade-all"
          title="Change the product code on each one's Product Spec row. The ElementTypes and recipes stay as they are.">Upgrade all</Button>
      </div>
      {review && (
        <div className="mt-1 mb-1" data-testid="wago-upgrade-list">
          {items.map(it => (
            <div key={it.ref} className="d-flex align-items-center gap-2" style={{ fontSize: 11 }}>
              <span style={{ fontFamily: 'monospace', minWidth: 160 }}>{it.ref}</span>
              <span style={{ fontFamily: 'monospace' }}>{it.code} → {it.to}</span>
              <Button size="sm" variant="link" className="p-0" style={{ fontSize: 11 }} onClick={() => upgradeSupersededWago([it])}>Upgrade</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

