import React, { useEffect, useMemo, useState } from 'react'
import { Button, Form } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { useCompanion } from '../platform/companion'
import { shareOutcomes } from '../platform/outcomes'
import { familiesForJob, familyForJob, jobOf } from '../utils/codeJobs'
import { nextRef } from '../utils/etSeed'
import {
  indexes, positionMakeup, sameKindAs, matchKind, usuallyMissing, elementTypesForJob, sectionFor, rowFromSlot,
  jobLabel, ruleText, usualConnectors,
} from '../utils/recipeKinds'

/**
 * RecipeSuggestions — inline, one line each, never applied unasked:
 *
 *   same     — another position of this project with the same make-up has parts this one lacks
 *              ("Same as C01r: end caps, clips"). Works without a companion.
 *   kit      — served beside a companion: the parts used with this profile / channel on other
 *              projects ("Usually with this profile: 021-8810-11 ×2"), making its ElementType
 *              and Product Spec row when the project has none yet.
 *   kind     — served beside a companion: what positions like this usually also have
 *              ("Positions like this usually also have end caps (96%)").
 *   connector — the connector set positions like this usually carry, mapped onto this project's
 *              own connector ElementTypes, each where the project puts it.
 *
 * Every Add and every dismiss is an outcome (platform/outcomes.js): it is what makes the next
 * suggestion better. A dismissed line stays dismissed for this project.
 */
let libraryAsked = false
const DISMISSED = n => `psr-suggestions-dismissed:${n || '-'}`
function readDismissed(n) {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISSED(n)) || '[]')) } catch { return new Set() }
}
function writeDismissed(n, set) {
  try { localStorage.setItem(DISMISSED(n), JSON.stringify([...set].slice(-500))) } catch { /* a convenience only */ }
}

export default function RecipeSuggestions({ posRef }) {
  const recipes = useStore(s => s.recipes)
  const elementTypes = useStore(s => s.elementTypes)
  const psRows = useStore(s => s.psRows)
  const positionTypes = useStore(s => s.positionTypes)
  const projectNumber = useStore(s => s.projectNumber)
  const kinds = useStore(s => s.library?.kinds)
  const companion = useCompanion()
  const [dismissed, setDismissed] = useState(() => readDismissed(projectNumber))
  const [kits, setKits] = useState([])
  const [pick, setPick] = useState({})
  useEffect(() => { setDismissed(readDismissed(projectNumber)) }, [projectNumber])
  // The library (with what other projects do, beside a companion) loads once, on first use.
  useEffect(() => { if (!libraryAsked) { libraryAsked = true; useStore.getState().loadLibrary?.() } }, [])

  const state = { recipes, elementTypes, psRows, positionTypes }
  const idx = useMemo(() => indexes(state), [recipes, elementTypes, psRows, positionTypes])   // eslint-disable-line react-hooks/exhaustive-deps
  const me = useMemo(() => positionMakeup(posRef, state, idx), [posRef, idx])                  // eslint-disable-line react-hooks/exhaustive-deps
  const same = useMemo(() => sameKindAs(posRef, state, idx).slice(0, 1), [posRef, idx])        // eslint-disable-line react-hooks/exhaustive-deps
  const kind = useMemo(() => matchKind(me, kinds || []), [me, kinds])
  const missing = useMemo(() => usuallyMissing(me, kind), [me, kind])
  const connectors = useMemo(() => usualConnectors(me, kind, state, idx), [me, kind, idx])   // eslint-disable-line react-hooks/exhaustive-deps

  // The profile / channel this recipe is built on, by maker + code, for its kit.
  const anchor = useMemo(() => {
    for (const k of ['PROFILE', 'MOUNT_CHANNEL']) {
      for (const r of me.jobs.get(k) || []) {
        const ps = idx.psByRef.get(String(r.ElementTypeRef || r.elementTypeRef || '').toUpperCase())
        if (ps?.ProductCode) return { code: ps.ProductCode, manufacturer: ps.Manufacturer || '' }
      }
    }
    return null
  }, [me, idx])
  useEffect(() => {
    setKits([])
    if (!companion?.kits || !anchor) return
    let live = true
    companion.kits([anchor], projectNumber).then(k => { if (live) setKits(k || []) })
    return () => { live = false }
  }, [companion, anchor?.code, anchor?.manufacturer, projectNumber])   // eslint-disable-line react-hooks/exhaustive-deps

  const lines = []
  for (const s of same) {
    const key = `same|${s.posRef}>${posRef}|${s.adds.map(a => a.job).sort().join('+')}`
    lines.push({ key, kind: 'same', icon: 'content_copy',
      text: <>Same as <b>{s.posRef}</b>: {s.adds.map(a => jobLabel(a.job)).join(', ')}</>,
      add: () => useStore.getState().copyRecipeFrom(s.posRef, posRef, {
        merge: true, etRefs: s.adds.flatMap(a => a.rows.map(r => r.ElementTypeRef || r.elementTypeRef)),
      }) })
  }
  const kitFor = new Map()
  for (const k of kits) if (!me.jobs.has(k.part.slot) && !kitFor.has(k.part.slot)) kitFor.set(k.part.slot, k)
  for (const [job, k] of kitFor) {
    const rule = { qty: k.qty, dim: k.dim, integer: k.integer ? 1 : 0, contract: k.contract ? 1 : 0, section: 'internal' }
    const kindSlot = kind?.slots.find(s => s.slot === job)
    const existing = elementTypes.find(e => {
      const ps = idx.psByRef.get(String(e.ElementTypeRef || '').toUpperCase())
      return ps && String(ps.ProductCode || '').toUpperCase() === k.part.code
    })
    lines.push({ key: `kit|${k.key}`, kind: 'kit', icon: 'extension',
      text: <>Usually with this profile: <b>{jobLabel(job)}</b> <span className="font-monospace">{existing ? existing.ElementTypeRef : k.part.code}</span>
        {k.part.name ? <span className="text-muted"> {k.part.name}</span> : null}{ruleText(rule) ? ` ${ruleText(rule)}` : ''}</>,
      add: () => {
        const st = useStore.getState()
        let ref = existing?.ElementTypeRef
        if (!ref) {
          const j = jobOf({ maker: anchor?.manufacturer, code: k.part.code, name: k.part.name })
          const house = familyForJob(j.slot === 'OTHER' ? { slot: job } : j) || {}
          const own = [...familiesForJob({ slot: job }, { elementTypes: st.elementTypes, familyRows: new Set(st.elementTypes.map(e => String(e.ElementTypeRef || '').toUpperCase())) })]
            .find(f => f !== String(house.family || '').toUpperCase())
          ref = nextRef(house.head || 'ET-LIN', st.elementTypes.map(e => e.ElementTypeRef))
          st.createElementType({ ref, name: k.part.name || `${anchor?.manufacturer || ''} - ${k.part.code}`.trim(), family: own || house.family || null })
          st.addPSRow(ref, { Manufacturer: anchor?.manufacturer || '', ProductCode: k.part.code })
        }
        st.addRecipeRow(posRef, sectionFor(kindSlot || rule, me.design), rowFromSlot(kindSlot ? { ...rule, ...kindSlot } : rule, ref), { asPosition: true })
      } })
  }
  for (const s of missing) {
    if (kitFor.has(s.slot)) continue
    const options = elementTypesForJob(s.slot, state, idx)
    const chosen = pick[s.slot] || options[0]?.ElementTypeRef || ''
    const pct = Math.round(s.share * 100)
    lines.push({ key: `kind|${kind.id}|${s.slot}`, kind: 'kind', icon: 'lightbulb',
      text: <>Positions like this usually also have <b>{jobLabel(s.slot)}</b>{pct < 100 ? ` (${pct}%)` : ''}{ruleText(s) ? `, ${ruleText(s)}` : ''}
        {options.length > 1 && (
          <Form.Select size="sm" className="d-inline-block ms-2" style={{ width: 'auto', fontSize: 11, padding: '0 22px 0 6px' }}
            value={chosen} onChange={e => setPick(p => ({ ...p, [s.slot]: e.target.value }))} aria-label={`${jobLabel(s.slot)} to add`}>
            {options.slice(0, 12).map(o => <option key={o.ElementTypeRef} value={o.ElementTypeRef}>{o.ElementTypeRef}{o.Name ? ` — ${o.Name}` : ''}</option>)}
          </Form.Select>
        )}
        {options.length === 1 && <> <span className="font-monospace">{chosen}</span></>}
        {!options.length && <span className="text-muted fst-italic ms-1">no ElementType for it yet</span>}</>,
      add: options.length ? () => useStore.getState().addRecipeRow(posRef, sectionFor(s, me.design), rowFromSlot(s, chosen), { asPosition: true }) : null,
      supplied: chosen })
  }
  if (connectors) {
    lines.push({ key: `connector|${kind.id}|${connectors.rows.map(r => r.etRef).join('+')}`, kind: 'connector', icon: 'cable',
      text: <>Positions like this usually carry connectors: {connectors.rows.map((r, i) => (
        <span key={i}>{i ? ', ' : ''}<span className="font-monospace">{r.etRef}</span></span>))}</>,
      add: () => { for (const r of connectors.rows) useStore.getState().addRecipeRow(posRef, r.section, { elementTypeRef: r.etRef }, { asPosition: true }) },
      supplied: connectors.rows.map(r => r.etRef).join('+') })
  }
  const shown = lines.filter(l => !dismissed.has(l.key))
  if (!shown.length) return null

  function answer(l, outcome) {
    if (outcome === 'accepted') l.add?.()
    const next = new Set(dismissed); next.add(l.key)
    setDismissed(next); writeDismissed(projectNumber, next)
    shareOutcomes(companion, projectNumber, [{
      kind: l.kind, key: l.key.replace(/^(same|kit|kind|connector)\|/, ''), tier: l.kind, source: kind ? String(kind.id) : '',
      supplied: l.supplied || null, final: outcome === 'accepted' ? (l.supplied || 'added') : null, outcome,
    }])
  }

  return (
    <div className="mb-3 px-3 py-2 rounded" data-testid="recipe-suggestions" style={{ background: '#eef5ff', border: '1px solid #c9dcf5', fontSize: 12 }}>
      {shown.map(l => (
        <div key={l.key} className="d-flex align-items-center gap-2 py-1" data-testid={`suggestion-${l.kind}`}>
          <MaterialIcon name={l.icon} size={13} style={{ color: '#1c5cab', flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{l.text}</span>
          {l.add && (
            <Button size="sm" variant="outline-primary" style={{ fontSize: 11, padding: '0px 8px' }} onClick={() => answer(l, 'accepted')}>Add</Button>
          )}
          <Button size="sm" variant="link" className="text-muted p-0" style={{ fontSize: 11 }} aria-label="Dismiss" title="Not for this one"
            onClick={() => answer(l, 'dismissed')}>
            <MaterialIcon name="close" size={13} />
          </Button>
        </div>
      ))}
    </div>
  )
}
