/**
 * useProjectKnowledge — what other people on THIS project (same project number) decided, offered
 * back as suggestions when the app is served beside a companion that keeps it (see
 * platform/companion.js). Without one, or without a project number, it is empty and inert.
 *
 * Nothing here is applied on its own. Each suggestion is shown, and the person takes it or
 * refuses it — and that answer is reported back, so the suggestions several people keep refusing
 * stop being made. That is how several people's configurations converge on one.
 *
 * Item kinds and keys (the companion stores them opaquely; these are the app's own):
 *   assignment  `${MAKER}|${CODE}`  → { ref, code, maker }
 *   local-et    ref                 → { name, description, family }   (made here, not in the DesignDB yet)
 *   rule        token text          → { role, maker }                 (codeLearning rules)
 *   pair        groupKey(codes)     → { verdict: 'same' | 'different' }
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCompanion } from '../../platform/companion'
import { norm, groupKey } from '../../utils/productCodes'

export const assignmentKey = (code, maker) => `${norm(maker || '')}|${norm(code)}`

const EMPTY = { items: [], dialect: [] }

export default function useProjectKnowledge(projectNumber) {
  const api = useCompanion()
  const number = String(projectNumber || '').trim()
  const [data, setData] = useState(EMPTY)
  const [refused, setRefused] = useState(() => new Set())
  const shown = useRef(new Set())

  useEffect(() => {
    if (!api?.projectItems || !number) return
    let live = true
    api.projectItems(number).then(d => { if (live && d) setData({ items: d.items || [], dialect: d.dialect || [] }) })
    return () => { live = false }
  }, [api, number])

  const byKind = useMemo(() => {
    const out = { assignment: new Map(), 'local-et': new Map(), rule: [], pair: new Map() }
    for (const it of data.items) {
      if (refused.has(it.id)) continue
      if (it.kind === 'rule') out.rule.push(it)
      else out[it.kind]?.set(it.kind === 'local-et' ? norm(it.key) : it.key, it)
    }
    return out
  }, [data, refused])

  const report = useCallback((item, outcome) => {
    if (!api?.feedback || !item?.id || !number) return
    if (outcome === 'shown') {
      if (shown.current.has(item.id)) return
      shown.current.add(item.id)
    }
    if (outcome === 'rejected') setRefused(s => new Set(s).add(item.id))
    api.feedback(number, item.id, outcome)
  }, [api, number])

  return { active: !!(api?.projectItems && number), byKind, dialect: data.dialect, report }
}

/**
 * What to say about one code: the ref a colleague gave it on this project, and whether it can be
 * used as is (the project knows the ref, or a colleague's local ET describes it).
 */
export function colleagueHint(knowledge, entry, knownRefs) {
  if (!knowledge?.active || entry.etRef) return null
  const maker = entry.manufacturers?.length === 1 ? entry.manufacturers[0] : ''
  const item = knowledge.byKind.assignment.get(assignmentKey(entry.text, maker))
  const ref = item?.value?.ref
  if (!ref) return null
  const local = knowledge.byKind['local-et'].get(norm(ref)) || null
  return { ref, item, local, usable: knownRefs.has(norm(ref)) || !!local }
}

/** Rules colleagues use (here, or on two or more projects) that this batch does not have yet. */
export function pendingRules(knowledge, rules = {}) {
  if (!knowledge?.active) return []
  const out = new Map()
  for (const it of knowledge.byKind.rule) {
    const t = String(it.key).toLowerCase()
    if (it.value?.role && rules[t] !== it.value.role) out.set(t, { token: t, role: it.value.role, item: it })
  }
  for (const d of knowledge.dialect || []) {
    if (!out.has(d.token) && rules[d.token] !== d.role) out.set(d.token, { token: d.token, role: d.role, item: null })
  }
  return [...out.values()]
}

/** Near-miss groups a colleague on this project already ruled were different products. */
export function separatedByColleagues(knowledge, similar = [], keptSeparate = new Set()) {
  if (!knowledge?.active) return []
  return similar.filter(g => {
    const k = groupKey(g)
    return !keptSeparate.has(k) && knowledge.byKind.pair.get(k)?.value?.verdict === 'different'
  })
}

/**
 * What this browser decided, for the next person on the project. Sent after staging; the
 * companion keeps the latest per key. → the companion's answer, or null.
 */
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
