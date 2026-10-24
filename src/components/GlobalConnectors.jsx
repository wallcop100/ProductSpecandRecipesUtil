import React, { useMemo, useState } from 'react'
import { Button, Dropdown } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import useConnectorGroups from './useConnectorGroups'
import { globalConnectors, suggestConnectors, recogniseCodes, SUGGESTIONS, WAGO_PAGE, WAGO_TEMPLATES, WAGO_COMBOS } from '../data/globalConnectors'
import { templateParts } from '../utils/connectorGroups'
import { C } from '../styles/tokens'
import { useCompanion } from '../platform/companion'
import { shareOutcomes } from '../platform/outcomes'
import { levelOf, saidOf, mayAsk, noteAsked } from '../utils/certainty'
import ConfirmSuggestionModal from './ConfirmSuggestionModal'
import { Dots } from './RecipeSuggestions'
import { NotRightModal, sendNote } from './Corrections'

const pill = { fontSize: 10, lineHeight: '18px', background: C.surface, border: `1px solid ${C.border}`, fontFamily: 'monospace' }
const ruleFor = key => [...WAGO_COMBOS, ...WAGO_TEMPLATES].find(e => e.key === key)?.rule || SUGGESTIONS.find(s => s.keys.includes(key))?.rule || null

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
  useStore(s => s.library?.connectors)
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
 * WagoLibrary — the company's Wago templates (company wiki), on the Connectors
 * screen: open when the project has no templates, folded under "Add from library"
 * otherwise. Add makes the template this project's, with any ElementTypes it lacks.
 */
export function WagoLibrary() {
  useStore(s => s.library?.connectors)
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
      {open && <div className="text-muted px-1" style={{ fontSize: 9 }}>Synced {WAGO_PAGE.syncedAt}</div>}
    </div>
  )
}

/**
 * WagoSuggestion — in the drawer, for a position with no template: the Wago template its
 * control and driver location suggest, with Use (the others as "or …"). When several fit,
 * the one more of this project's positions are built like leads; with no such lead they are
 * offered side by side (#66). A rule two sets share is never put on either's template.
 */
export function WagoSuggestion({ posRef, inRecipe = false }) {
  const served = useStore(s => s.library?.connectors)
  const groups = useConnectorGroups()
  const etCollections = useStore(s => s.etCollections)
  const psRows = useStore(s => s.psRows)
  const planGlobalConnector = useStore(s => s.planGlobalConnector)
  const applyGlobalConnector = useStore(s => s.applyGlobalConnector)
  const [busy, setBusy] = useState(false)
  const rec = groups.recOf(posRef)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const all = useMemo(() => suggestConnectors(rec), [rec])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plans = useMemo(() => all.map(o => planGlobalConnector(o.key)), [all, etCollections, psRows])
  const sugg = all.filter((_, i) => plans[i])
  const planOf = o => plans[all.indexOf(o)]
  const [pick, setPick] = useState(null)
  const companion = useCompanion()
  const projectNumber = useStore(st => st.projectNumber)
  const [asking, setAsking] = useState(null)              // the option being checked
  const [chip, setChip] = useState(null)                 // { name, key, voted }: a served set used, "is this right?"
  const [wrong, setWrong] = useState(false)
  const vote = (key, v, note = null, extra = {}) => shareOutcomes(companion, projectNumber, [{ kind: 'connector', key: String(key), tier: 'connector',
    source: '', supplied: String(key), final: v === 'rejected' ? null : String(key), outcome: v, note, ...extra }])
  const thumb = v => { setChip(c => ({ ...c, voted: v })); vote(chip.key, v) }
  // The chip outlives the card, which goes once the position has the template.
  const chipCard = chip && (
    <div className="p-2 rounded mb-2 companion-card text-muted d-flex align-items-center gap-2" style={{ background: C.accentTint, border: `1px solid ${C.accentEdge}`, fontSize: 11 }} data-testid="suggestion-check-chip">
      <MaterialIcon name="fact_check" size={13} style={{ color: C.companion, flexShrink: 0 }} />
      <span style={{ flex: 1 }}>Used <strong>{chip.name}</strong>.
        {chip.voted ? (chip.voted === 'confirmed' ? ' Thanks.' : " Noted — remove it from the recipe if it's wrong.") : ' Is this right? Your answer helps future projects.'}</span>
      {!chip.voted && <>
        <Button size="sm" variant="link" className="p-0" title="Yes, this is right" aria-label="Yes, this is right" onClick={() => thumb('confirmed')}>
          <MaterialIcon name="thumb_up" size={14} /></Button>
        <Button size="sm" variant="link" className="p-0" title="No, this is wrong" aria-label="No, this is wrong" onClick={() => thumb('rejected')}>
          <MaterialIcon name="thumb_down" size={14} /></Button>
      </>}
    </div>
  )
  // In the recipe editor only where this project's recipes already use connectors, and this position has no template yet.
  const m = groups.members.get(posRef)
  if (!sugg.length || (inRecipe && (!groups.sigs.size || m?.templates.length || m?.clash))) return chipCard || null
  // What the project does (#66), by product code: the set this position already carries most
  // of leads; failing that, the one most other positions carry most of.
  const codeOf = new Map((psRows || []).map(r => [String(r.ElementTypeRef || r.elementTypeRef || '').toLowerCase(), String(r.ProductCode || '').toUpperCase()]))
  const setCodes = sugg.map(o => globalConnectors().find(g => g.key === o.key).parts.map(p => String(p.code).toUpperCase()))
  const carried = ref => {
    const have = new Set((groups.sigs.get(ref) || []).map(p => codeOf.get(p.ref.toLowerCase())).filter(Boolean))
    return setCodes.map(cs => cs.filter(c => have.has(c)).length)
  }
  const strictBest = ns => { const top = Math.max(...ns); return top > 0 && ns.filter(n => n === top).length === 1 ? ns.indexOf(top) : null }
  const own = carried(posRef)
  // Connectors already here that no suggested set shares a part with: this position is wired its own way (UJU4XA).
  if ((groups.sigs.get(posRef) || []).length && own.every(n => n === 0)) return chipCard || null
  const counts = sugg.map(() => 0)
  for (const r of groups.sigs.keys()) {
    const i = r === posRef ? null : strictBest(carried(r))
    if (i != null) counts[i]++
  }
  const lead = sugg.length === 1 ? 0 : strictBest(own) ?? strictBest(counts)
  const cur = pick ?? lead
  // A rule that suggests several sets would hand every position it matches to whichever was used first.
  const ruleFor = o => (all.filter(x => x.why === o.why).length === 1 ? o.rule : null)
  const othersFor = o => groups.scoped.filter(pt => pt.PositionTypeRef !== posRef
    && suggestConnectors(groups.recOf(pt.PositionTypeRef))[0]?.key === o.key).length
  // A served set is voted on by its id (datajoin `connectors()` serves its `votes`); the bundle is not.
  const votesOf = o => (served && companion ? [...WAGO_COMBOS, ...WAGO_TEMPLATES].find(e => e.key === o.key)?.votes : null)

  async function apply(o) {
    setBusy(true)
    try { await applyGlobalConnector(o.key, { posRefs: [posRef], rule: ruleFor(o) }) } finally { setBusy(false) }
  }
  async function use(o) {
    if (served && companion) {
      const votes = votesOf(o)
      const level = levelOf({ votes, projects: 2 }, !!companion?.features?.has?.('checks'))
      if (level === 'unsure' && mayAsk(projectNumber, `connector|${o.key}`, votes)) { setAsking(o); return }
      if (level !== 'sure') setChip({ key: o.key, name: planOf(o).collection?.Name || o.name })
    }
    await apply(o)
  }
  function checked(v, { note }) {
    const o = asking
    setAsking(null)
    noteAsked(projectNumber, `connector|${o.key}`, votesOf(o), v)
    vote(o.key, v, note)
    if (v !== 'rejected') apply(o)
  }
  const useButton = o => (
    <Button size="sm" variant="primary" className="py-0" style={{ fontSize: 10 }} disabled={busy} onClick={() => use(o)} data-testid="wago-use">Use</Button>
  )
  const report = e => useStore.getState().requestBugNote(e.currentTarget.closest('[data-testid="wago-suggestion"]'))
  // A served set is disagreed with by Not right… (its popup carries the report link); the bundled one is only reported.
  const reportButton = served && companion ? (
    <Dropdown align="end">
      <Dropdown.Toggle as={Dots} />
      <Dropdown.Menu style={{ fontSize: 12 }}>
        <Dropdown.Item className="fw-semibold" data-testid="not-right-suggestion" onClick={() => setWrong(true)}>
          <MaterialIcon name="thumb_down" size={13} /> Not right…</Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  ) : (
    <Button size="sm" variant="link" className="text-muted p-0" style={{ fontSize: 10 }} data-testid="report-suggestion" title="Report a problem with this suggestion"
      onClick={report}><MaterialIcon name="flag" size={13} /></Button>
  )
  /** Not right…: every set offered here is voted down; "Just this project" says nothing back. */
  function notRight({ scope, note }) {
    if (scope === 'project') return
    for (const o of s ? [s] : sugg) vote(o.key, 'rejected', null, scope === 'sometimes' ? { scope } : {})
    sendNote(note, `Not right: connector ${(s ? [s] : sugg).map(o => o.key).join(', ')} at ${posRef}`)
    if (projectNumber) useStore.getState().toast(`Saved for ${projectNumber}. Thank you for your contribution.`)
  }
  const s = cur == null ? null : sugg[cur]
  const plan = s && planOf(s)
  const creates = o => planOf(o).parts.filter(p => !planOf(o).collection && p.action === 'create')

  return (<>
    {chipCard}
    <div className={`p-2 rounded mb-2${served ? ' companion-card' : ''}`} style={{ background: C.accentTint, border: `1px solid ${C.accentEdge}` }} data-testid="wago-suggestion" data-source={served ? 'companion' : 'app'}>
      {s ? (<>
        <div className="d-flex align-items-center gap-1">
          <MaterialIcon name="auto_awesome" size={13} style={{ color: C.accent }} />
          <span style={{ flex: 1 }}>Suggested: <strong>{plan.collection?.Name || s.name}</strong></span>
          {useButton(s)}
          {reportButton}
        </div>
        <div className="text-muted" style={{ fontSize: 10 }}>
          {s.why}
          {plan.collection && plan.collection.Name !== s.name ? <> · the project's {s.name}</> : null}
          {own[cur] > 0 ? <> · {posRef} has {own[cur]} of its parts</> : null}
          {counts[cur] > 0 ? <> · {counts[cur]} other position{counts[cur] === 1 ? ' uses' : 's use'} it</> : null}
          {ruleFor(s) && othersFor(s) > 0 ? <> · suits {othersFor(s)} other position{othersFor(s) === 1 ? '' : 's'} too</> : null}
        </div>
        <div className="mt-1"><CodePills parts={globalConnectors().find(g => g.key === s.key).parts} /></div>
        {creates(s).length > 0 && (
          <div className="text-muted" style={{ fontSize: 10 }} title={creates(s).map(p => p.ref).join('\n')}>
            Use adds {creates(s).length} ElementType{creates(s).length === 1 ? '' : 's'} to the Product Spec
          </div>
        )}
        {sugg.length > 1 && (
          <div className="d-flex flex-wrap align-items-center gap-1 mt-1" style={{ fontSize: 10 }}>
            <span className="text-muted">or</span>
            {sugg.map((o, i) => i !== cur && (
              <span key={o.key} role="button" className="rounded-pill px-2" style={{ ...pill, fontFamily: undefined }}
                onClick={() => setPick(i)} data-testid="wago-alt">{o.name.replace(/^Wago /, '')}</span>
            ))}
          </div>
        )}
      </>) : (<>
        {/* Nothing in the project picks one: each is offered the same way. */}
        <div className="d-flex align-items-center gap-1">
          <MaterialIcon name="call_split" size={13} style={{ color: C.accent }} />
          <span style={{ flex: 1 }}>{sugg.length} Wago sets fit {posRef} ({sugg[0].why}); nothing in the project picks one</span>
          {reportButton}
        </div>
        {sugg.map(o => (
          <div key={o.key} className="mt-1 pt-1 border-top" data-testid="wago-option">
            <div className="d-flex align-items-center gap-1">
              <strong style={{ flex: 1 }}>{planOf(o).collection?.Name || o.name}</strong>
              {useButton(o)}
            </div>
            <CodePills parts={globalConnectors().find(g => g.key === o.key).parts} />
            {creates(o).length > 0 && (
              <div className="text-muted" style={{ fontSize: 10 }}>Use adds {creates(o).length} ElementType{creates(o).length === 1 ? '' : 's'} to the Product Spec</div>
            )}
          </div>
        ))}
      </>)}
      {wrong && (
        <NotRightModal show onHide={() => setWrong(false)} onSend={notRight} title={<>What's not right about the connectors for {posRef}?</>}
          placeholder="e.g. a Wago code" facts={[['Suggested', (s ? [s] : sugg).map(o => planOf(o).collection?.Name || o.name).join(' or ')], ['Because', (s || sugg[0]).why]]} />
      )}
      {asking && (
        <ConfirmSuggestionModal onCancel={() => setAsking(null)} onAnswer={checked}
          check={{ key: asking.key, posRef, job: 'connector set', rule: asking.why, noCode: true, unsureLabel: 'Not sure: use it',
            part: { code: globalConnectors().find(g => g.key === asking.key).parts.map(p => p.code).join(' + '), name: asking.name },
            evidence: ['a Wago set published for positions like this', saidOf(votesOf(asking))].filter(Boolean).join('; ') }} />
      )}
    </div>
  </>)
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
    <div className="px-3 py-1 border-bottom" style={{ fontSize: 12, background: C.attnTint, color: C.attnInk }} data-testid="wago-upgrade">
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

