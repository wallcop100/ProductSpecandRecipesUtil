/**
 * useProjectKnowledge — what earlier sessions on THIS project number decided, as DEFAULTS.
 *
 * Served beside a companion (platform/companion.js) the import starts from that learning
 * instead of from nothing: codes arrive already assigned, the code column's dialect is already
 * known, near-miss codes already ruled different stay apart. It is applied the way the app's
 * own memory is (`priorEtByCode`), never announced and never asked about. Precedence, highest
 * first — a lower level only fills what the higher ones leave empty:
 *
 *   1. the Product Spec / DesignDB          (unchanged)
 *   2. what this person decided here        (unchanged; always beats learning)
 *   3. what this project number learned     (this hook)
 *   4. what other projects learned          (dialect agreed by 2+ projects; families via the library)
 *
 * A learned value that cannot stand — a ref this project cannot resolve — is dropped, and the
 * app behaves exactly as it would without it. Without a companion or a project number the hook
 * is inert.
 *
 * Item kinds and keys (the companion stores them opaquely):
 *   assignment  `${MAKER}|${CODE}`  → { ref, code, maker }
 *   local-et    ref                 → { name, description, family }
 *   rule        token text          → { role, maker }
 *   pair        groupKey(codes)     → { verdict: 'same' | 'different' }
 */
import { useEffect, useMemo, useState } from 'react'
import { useCompanion } from '../../platform/companion'
import { norm } from '../../utils/productCodes'

export const assignmentKey = (code, maker) => `${norm(maker || '')}|${norm(code)}`

const EMPTY = { items: [], dialect: [] }

/** The learning, reduced to the defaults the import uses. Pure; exported for tests. */
export function digest({ items = [], dialect = [] } = EMPTY) {
  const out = { assignments: new Map(), localEts: new Map(), rules: {}, separate: [] }
  for (const d of dialect) if (d.token && d.role) out.rules[String(d.token).toLowerCase()] = d.role
  for (const it of items) {
    if (it.kind === 'assignment' && it.value?.ref) out.assignments.set(it.key, it.value.ref)
    else if (it.kind === 'local-et') out.localEts.set(norm(it.key), { ref: it.key, ...(it.value || {}) })
    else if (it.kind === 'rule' && it.value?.role) out.rules[String(it.key).toLowerCase()] = it.value.role   // project beats dialect
    else if (it.kind === 'pair' && it.value?.verdict === 'different') out.separate.push(it.key)
  }
  return out
}

export default function useProjectKnowledge(projectNumber) {
  const api = useCompanion()
  const number = String(projectNumber || '').trim()
  const [data, setData] = useState(null)

  useEffect(() => {
    setData(null)
    if (!api?.projectItems || !number) return
    let live = true
    api.projectItems(number).then(d => { if (live && d) setData(d) })
    return () => { live = false }
  }, [api, number])

  return useMemo(() => (data ? { ready: true, ...digest(data) } : { ready: false, ...digest() }), [data])
}

/**
 * The learned ElementType for one code, or null. Usable only when this project knows the ref, or
 * a learned local ElementType describes it (the caller creates that first) — otherwise it is
 * dropped rather than guessed at.
 */
export function learnedRef(knowledge, entry, knownRefs) {
  if (!knowledge?.ready) return null
  const maker = entry.manufacturers?.length === 1 ? entry.manufacturers[0] : ''
  const ref = knowledge.assignments.get(assignmentKey(entry.text, maker))
  if (!ref) return null
  return knownRefs.has(norm(ref)) ? ref : null
}

/** Learned local ElementTypes this Form's codes need and this project does not have yet. */
export function localEtsNeeded(knowledge, entries, knownRefs) {
  if (!knowledge?.ready) return []
  const out = new Map()
  for (const e of entries) {
    const maker = e.manufacturers?.length === 1 ? e.manufacturers[0] : ''
    const ref = knowledge.assignments.get(assignmentKey(e.text, maker))
    const et = ref && !knownRefs.has(norm(ref)) ? knowledge.localEts.get(norm(ref)) : null
    if (et) out.set(norm(ref), et)
  }
  return [...out.values()]
}

/** What this session decided, for the next session on the project. Background; latest wins. */
export function shareDecisions(api, projectNumber, { entries = [], rules = {}, keptSeparate = new Set(),
  merged = [], localEts = [] } = {}) {
  const number = String(projectNumber || '').trim()
  if (!api?.shareProjectItems || !number) return Promise.resolve(null)
  const items = []
  for (const e of entries) {
    if (!e.etRef || e.placeholder) continue
    const maker = e.manufacturers?.length === 1 ? e.manufacturers[0] : ''
    items.push({ kind: 'assignment', key: assignmentKey(e.text, maker), value: { ref: e.etRef, code: e.text, maker } })
  }
  const makers = [...new Set(entries.flatMap(e => e.manufacturers || []))]
  for (const [token, role] of Object.entries(rules)) {
    items.push({ kind: 'rule', key: token, value: { role, maker: makers.length === 1 ? makers[0] : '' } })
  }
  for (const k of keptSeparate) items.push({ kind: 'pair', key: k, value: { verdict: 'different' } })
  for (const k of merged) items.push({ kind: 'pair', key: k, value: { verdict: 'same' } })
  for (const et of localEts) {
    if (et.ref) items.push({ kind: 'local-et', key: et.ref, value: { name: et.name || '', description: et.description || '', family: et.family || '' } })
  }
  return items.length ? api.shareProjectItems(number, items.slice(0, 2000)) : Promise.resolve(null)
}

/**
 * The style library in precedence order for etSeed (first exact-code hit wins): this project's
 * own shared rows (newest first, as served), then this browser's, then other projects'.
 */
export function orderLibrary(shared = [], local = [], projectNumber = '') {
  const n = String(projectNumber || '').trim()
  const own = n ? shared.filter(e => String(e.source || '') === n) : []
  const others = n ? shared.filter(e => String(e.source || '') !== n) : shared
  return [...own, ...local, ...others]
}

const offered = new Set()

/**
 * Evidence for the catalogue: the ElementType (and its family) each staged code was given. It is
 * reviewed on the other side before anything relies on it. Single-maker codes only (a product
 * is the pair), each once per session.
 */
export async function offerAssignments(api, entries, { project = '', familyOf = () => '' } = {}) {
  if (!api?.contribute) return 0
  const offers = (entries || []).filter(e => e.etRef && !e.placeholder && e.manufacturers?.length === 1)
    .map(e => ({
      kind: 'et-assignment', code: e.text, manufacturer: e.manufacturers[0], ref: e.etRef,
      family: familyOf(e.etRef) || '', description: e.variants?.[0]?.note || '', project,
    }))
    .filter(o => !offered.has(assignmentKey(o.code, o.manufacturer) + '|' + o.ref))
  const ok = await Promise.all(offers.map(o => api.contribute(o)))
  offers.forEach((o, i) => { if (ok[i]) offered.add(assignmentKey(o.code, o.manufacturer) + '|' + o.ref) })
  return ok.filter(Boolean).length
}
