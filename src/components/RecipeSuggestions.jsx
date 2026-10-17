import React, { useEffect, useMemo, useState } from 'react'
import { Button, Dropdown, Form } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { useCompanion } from '../platform/companion'
import { shareOutcomes } from '../platform/outcomes'
import { familiesForJob, familyForJob, jobOf } from '../utils/codeJobs'
import { nextRef } from '../utils/etSeed'
import {
  indexes, positionMakeup, sameKindAs, matchKind, usuallyMissing, elementTypesForJob, sectionFor, rowFromSlot,
  jobLabel, ruleText, usualConnectors, anchorOf, fitFor, pickRangePart, rangeStem, codeIsTbc, FITS_PROFILE,
} from '../utils/recipeKinds'

/**
 * RecipeSuggestions — inline, one line each, never applied unasked:
 *
 *   same     — another position of this project with the same make-up has parts this one lacks.
 *              On the same profile: "Same profile as C01r (ET-LIN-PROF-01): end caps, clips". Only
 *              built alike (same design, power and jobs, another profile): "Built like C05r (LED tape
 *              + profile, remote CV): fixings", never the caps / diffuser / clips of another profile.
 *              Works without a companion.
 *   kit      — served beside a companion: the parts used with this profile / channel on other
 *              projects ("Usually with this profile: 021-8810-11 ×2"), making its ElementType
 *              and Product Spec row when the project has none yet.
 *   kind     — served beside a companion: what positions like this usually also have
 *              ("Positions like this usually also have end caps (96%)"). For caps, diffusers and
 *              clips the part is the one that fits THIS profile (recipeKinds.fitFor): used with it
 *              here, or from its range (FPS1709MC for FPS1709BG2000), made as an ElementType when
 *              the project has none. A range that has no such part (FPS2020: no clip) means no line.
 *              With nothing known, Add makes a TBC placeholder for this profile, and ⋯ picks one of
 *              the project's own instead.
 *   tbc      — a part of this recipe made for the profile whose code is still TBC, once the
 *              profile's range is known: "End caps ET-LIN-CAP-06 is TBC — this profile's is
 *              FPS0808ECG" sets its Product Spec code.
 *   connector — the connector set positions like this usually carry, mapped onto this project's
 *              own connector ElementTypes, each where the project puts it.
 *
 * Every Add and every dismiss is an outcome (platform/outcomes.js): it is what makes the next
 * suggestion better. × hides a line for now; ⋯ → "Don't show this again" hides it for good on this
 * position only (and is the dismissal that feeds back). An added line goes because the part is
 * there, and comes back if it is removed.
 */
const Dots = React.forwardRef(({ onClick }, ref) => (
  <button ref={ref} type="button" className="btn btn-link btn-sm text-muted p-0" style={{ fontSize: 13, lineHeight: 1 }}
    aria-label="More" title="More" onClick={e => { e.preventDefault(); onClick(e) }}>⋯</button>
))
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
  const [hidden, setHidden] = useState(() => new Set())   // × — for now, this position
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

  // The profile / channel this recipe is built on: its kit and its range are looked up by maker + code.
  const profile = useMemo(() => anchorOf(me, idx), [me, idx])
  const anchor = profile?.code ? { code: profile.code, manufacturer: profile.maker } : null
  useEffect(() => {
    setKits([])
    if (!companion?.kits || !anchor) return
    let live = true
    companion.kits([anchor], projectNumber).then(k => { if (live) setKits(k || []) })
    return () => { live = false }
  }, [companion, anchor?.code, anchor?.manufacturer, projectNumber])   // eslint-disable-line react-hooks/exhaustive-deps

  /** The ElementType for a catalogue part: the project's own (same code) or a new one, with its spec row. */
  function elementTypeFor(job, part, { fromRange = false } = {}) {
    const st = useStore.getState()
    const have = st.elementTypes.find(e => String(idx.psByRef.get(String(e.ElementTypeRef || '').toUpperCase())?.ProductCode || '').toUpperCase() === part.code)
    if (have) return have.ElementTypeRef
    const j = jobOf({ maker: anchor?.manufacturer, code: part.code, name: part.name })
    const house = familyForJob(j.slot === 'OTHER' ? { slot: job } : j) || {}
    const own = [...familiesForJob({ slot: job }, { elementTypes: st.elementTypes, familyRows: new Set(st.elementTypes.map(e => String(e.ElementTypeRef || '').toUpperCase())) })]
      .find(f => f !== String(house.family || '').toUpperCase())
    const ref = nextRef(house.head || 'ET-LIN', st.elementTypes.map(e => e.ElementTypeRef))
    const named = `${anchor?.manufacturer || ''} - ${part.code}`.replace(/^ - /, '')
    st.createElementType({ ref, name: (!fromRange && part.name) || named, description: fromRange ? part.name || null : null, family: own || house.family || null })
    st.addPSRow(ref, { Manufacturer: anchor?.manufacturer || '', ProductCode: part.code })
    return ref
  }
  /** A TBC ElementType holding the place of a profile's part, until its code is known. */
  function makePlaceholder(job, label) {
    const st = useStore.getState()
    const house = familyForJob({ slot: job }) || {}
    const ref = nextRef(house.head || 'ET-LIN', st.elementTypes.map(e => e.ElementTypeRef))
    st.createElementType({ ref, name: label, family: house.family || null })
    st.addPSRow(ref, { Manufacturer: profile?.maker || null, IsTBC: 'Y', ComponentDescription: label.replace(/^TBC - /, '') })
    return ref
  }
  const ownByCode = code => elementTypes.find(e => String(idx.psByRef.get(String(e.ElementTypeRef || '').toUpperCase())?.ProductCode || '').toUpperCase() === code)

  const lines = []
  for (const s of same) {
    const key = `same|${s.posRef}>${posRef}|${s.adds.map(a => a.job).sort().join('+')}`
    const what = s.adds.map(a => jobLabel(a.job)).join(', ')
    const built = [me.defining.map(jobLabel).join(' + '), [me.driver, me.secondary].filter(Boolean).join(' ')].filter(Boolean).join(', ')
    lines.push({ key, kind: 'same', icon: 'content_copy',
      text: s.basis === 'profile'
        ? <span title={`${s.posRef} is built on the same profile, so its parts fit this one`}>
            Same profile as <b>{s.posRef}</b> <span className="font-monospace">({s.anchor.ref})</span>: {what}</span>
        : <span title={`${s.posRef} is built the same way (${built}) on another profile: only parts that do not depend on the profile are offered`}>
            Built like <b>{s.posRef}</b> <span className="text-muted">({built})</span>: {what}</span>,
      add: () => useStore.getState().copyRecipeFrom(s.posRef, posRef, {
        merge: true, etRefs: s.adds.flatMap(a => a.rows.map(r => r.ElementTypeRef || r.elementTypeRef)),
      }) })
  }
  const kitFor = new Map()
  for (const k of kits) if (!k.range && !me.jobs.has(k.part.slot) && !kitFor.has(k.part.slot)) kitFor.set(k.part.slot, k)
  for (const [job, k] of kitFor) {
    const rule = { qty: k.qty, dim: k.dim, integer: k.integer ? 1 : 0, contract: k.contract ? 1 : 0, section: 'internal' }
    const kindSlot = kind?.slots.find(s => s.slot === job)
    const existing = ownByCode(k.part.code)
    lines.push({ key: `kit|${k.key}`, kind: 'kit', icon: 'extension',
      text: <>Usually with this profile: <b>{jobLabel(job)}</b> <span className="font-monospace">{existing ? existing.ElementTypeRef : k.part.code}</span>
        {k.part.name ? <span className="text-muted"> {k.part.name}</span> : null}{ruleText(rule) ? ` ${ruleText(rule)}` : ''}</>,
      add: () => {
        const ref = elementTypeFor(job, k.part)
        useStore.getState().addRecipeRow(posRef, sectionFor(kindSlot || rule, me.design), rowFromSlot(kindSlot ? { ...rule, ...kindSlot } : rule, ref), { asPosition: true })
      } })
  }
  for (const s of missing) {
    if (kitFor.has(s.slot)) continue
    const pct = Math.round(s.share * 100)
    const head = <>Positions like this usually also have <b>{jobLabel(s.slot)}</b>{pct < 100 ? ` (${pct}%)` : ''}{ruleText(s) ? `, ${ruleText(s)}` : ''}</>
    const base = { key: `kind|${kind.id}|${s.slot}`, kind: 'kind', icon: 'lightbulb' }
    const addRow = ref => useStore.getState().addRecipeRow(posRef, sectionFor(s, me.design), rowFromSlot(s, ref), { asPosition: true })
    const fitsProfile = FITS_PROFILE.has(s.slot) && profile
    const fit = fitsProfile ? fitFor(s.slot, profile, state, idx) : null
    if (fit) {
      lines.push({ ...base, supplied: fit.etRef, add: () => addRow(fit.etRef),
        text: <>{head}: <span className="font-monospace">{fit.etRef}</span> <span className="text-muted">— {fit.why}</span></> })
      continue
    }
    const rangeKnown = kits.some(k => k.range)
    const part = fitsProfile ? pickRangePart(kits.filter(k => k.range && k.part.slot === s.slot).map(k => k.part), profile, s.slot, state, idx) : null
    // The maker's range for this profile is known and has no such part (FPS2020 has no clip): nothing to suggest.
    if (fitsProfile && !part && rangeKnown) continue
    if (part) {
      const own = ownByCode(part.code)
      lines.push({ ...base, supplied: part.code, add: () => addRow(elementTypeFor(s.slot, part, { fromRange: true })),
        text: <>{head}: <span className="font-monospace">{own ? own.ElementTypeRef : part.code}</span>
          <span className="text-muted"> — made for {profile.code}{own ? '' : ', as a new ElementType'}{part.name ? ` (${part.name.toLowerCase()})` : ''}</span></> })
      continue
    }
    // With a profile and nothing known to fit it, no part is pre-chosen, and parts of another range are left out.
    const stem = fitsProfile ? rangeStem(profile.code) : ''
    const options = elementTypesForJob(s.slot, state, idx).filter(e => {
      const own = rangeStem(idx.psByRef.get(String(e.ElementTypeRef || '').toUpperCase())?.ProductCode)
      return !stem || !own || own === stem
    })
    if (fitsProfile) {
      // Nothing known to fit: a placeholder for THIS profile, its code TBC; ⋯ for one of the project's own.
      const label = `TBC - ${jobLabel(s.slot)} for ${profile.ref}`
      const placeholder = elementTypes.find(e => e.Name === label)
      lines.push({ ...base, supplied: placeholder?.ElementTypeRef || 'placeholder', addLabel: placeholder ? 'Add' : 'Add placeholder',
        add: () => addRow(placeholder?.ElementTypeRef || makePlaceholder(s.slot, label)),
        more: options.slice(0, 12).map(o => ({ ref: o.ElementTypeRef, label: `${o.ElementTypeRef}${o.Name ? ` — ${o.Name}` : ''}`, add: () => addRow(o.ElementTypeRef) })),
        text: <>{head}<span className="text-muted"> — {profile.code ? `not known for ${profile.code}` : `${profile.ref}'s code is TBC: fill it in for the right part`}
          {placeholder ? <>; <span className="font-monospace">{placeholder.ElementTypeRef}</span> holds its place</> : ''}</span></> })
      continue
    }
    const chosen = pick[s.slot] ?? options[0]?.ElementTypeRef ?? ''
    lines.push({ ...base, supplied: chosen || null,
      text: <>{head}
        {options.length > 1 && (
          <Form.Select size="sm" className="d-inline-block ms-2" style={{ width: 'auto', fontSize: 11, padding: '0 22px 0 6px' }}
            value={chosen} onChange={e => setPick(p => ({ ...p, [s.slot]: e.target.value }))} aria-label={`${jobLabel(s.slot)} to add`}>
            {options.slice(0, 12).map(o => <option key={o.ElementTypeRef} value={o.ElementTypeRef}>{o.ElementTypeRef}{o.Name ? ` — ${o.Name}` : ''}</option>)}
          </Form.Select>
        )}
        {options.length === 1 && <> <span className="font-monospace">{chosen}</span></>}
        {!options.length && <span className="text-muted fst-italic ms-1">no ElementType for it yet</span>}</>,
      add: chosen ? () => addRow(chosen) : null })
  }
  // Parts of this recipe made for the profile whose code is still TBC: the profile's range names them.
  if (profile?.code && kits.some(k => k.range)) {
    for (const job of FITS_PROFILE) {
      for (const r of me.jobs.get(job) || []) {
        const ref = r.ElementTypeRef || r.elementTypeRef
        if (!codeIsTbc(ref, idx)) continue
        const part = pickRangePart(kits.filter(k => k.range && k.part.slot === job).map(k => k.part), profile, job, state, idx)
        if (!part) continue
        lines.push({ key: `tbc|${ref}|${part.code}`, kind: 'tbc', icon: 'edit', supplied: part.code, addLabel: 'Set code',
          text: <><b>{jobLabel(job)}</b> <span className="font-monospace">{ref}</span> is TBC — this profile's is <span className="font-monospace">{part.code}</span>
            {part.name ? <span className="text-muted"> ({part.name.toLowerCase()})</span> : null}</>,
          add: () => useStore.getState().updatePSRow(ref, { Manufacturer: profile.maker || null, ProductCode: part.code, IsTBC: null }) })
      }
    }
  }
  if (connectors) {
    lines.push({ key: `connector|${kind.id}|${connectors.rows.map(r => r.etRef).join('+')}`, kind: 'connector', icon: 'cable',
      text: <>Positions like this usually carry connectors: {connectors.rows.map((r, i) => (
        <span key={i}>{i ? ', ' : ''}<span className="font-monospace">{r.etRef}</span></span>))}</>,
      add: () => { for (const r of connectors.rows) useStore.getState().addRecipeRow(posRef, r.section, { elementTypeRef: r.etRef }, { asPosition: true }) },
      supplied: connectors.rows.map(r => r.etRef).join('+') })
  }
  // Keys stored before dismissals were per position hid a line project-wide; they still do.
  const here = l => `${posRef}|${l.key}`
  const shown = lines.filter(l => !dismissed.has(l.key) && !dismissed.has(here(l)) && !hidden.has(here(l)))
  if (!shown.length) return null

  function answer(l, outcome, chosen = null) {
    if (outcome === 'accepted') (chosen ? chosen.add : l.add)?.()
    // Only a dismissal hides a line for good: an added part's line goes because the part is there.
    if (outcome === 'dismissed') {
      const next = new Set(dismissed); next.add(here(l))
      setDismissed(next); writeDismissed(projectNumber, next)
    }
    shareOutcomes(companion, projectNumber, [{
      kind: l.kind, key: l.key.replace(/^(same|kit|kind|tbc|connector)\|/, ''), tier: l.kind, source: kind ? String(kind.id) : '',
      supplied: l.supplied || null, final: outcome === 'accepted' ? (chosen?.ref || l.supplied || 'added') : null, outcome,
    }])
  }

  return (
    <div className="mb-3 px-3 py-2 rounded" data-testid="recipe-suggestions" style={{ background: '#eef5ff', border: '1px solid #c9dcf5', fontSize: 12 }}>
      {shown.map(l => (
        <div key={l.key} className="d-flex align-items-center gap-2 py-1" data-testid={`suggestion-${l.kind}`}>
          <MaterialIcon name={l.icon} size={13} style={{ color: '#1c5cab', flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{l.text}</span>
          {l.add && (
            <Button size="sm" variant="outline-primary" style={{ fontSize: 11, padding: '0px 8px' }} onClick={() => answer(l, 'accepted')}>{l.addLabel || 'Add'}</Button>
          )}
          <Dropdown align="end">
            <Dropdown.Toggle as={Dots} />
            <Dropdown.Menu style={{ fontSize: 12 }}>
              {l.more?.length > 0 && <>
                <Dropdown.Header>Add one of this project's own</Dropdown.Header>
                {l.more.map(o => <Dropdown.Item key={o.ref} onClick={() => answer(l, 'accepted', o)}>{o.label}</Dropdown.Item>)}
                <Dropdown.Divider />
              </>}
              <Dropdown.Item onClick={() => answer(l, 'dismissed')}>Don't show this again for {posRef}</Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
          <Button size="sm" variant="link" className="text-muted p-0" style={{ fontSize: 11 }} aria-label="Hide" title="Not now"
            onClick={() => setHidden(h => new Set(h).add(here(l)))}>
            <MaterialIcon name="close" size={13} />
          </Button>
        </div>
      ))}
    </div>
  )
}
