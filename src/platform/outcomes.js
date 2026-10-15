/**
 * outcomes.js — what became of each default the app filled in from learning.
 *
 * Learned values only ever fill defaults the app would otherwise leave empty
 * (screens/import/useProjectKnowledge.js). This module remembers which values were filled that
 * way, and what each one is when the person stages or creates: kept, changed or cleared. Served
 * beside a companion with `outcomes`, the result goes there in the background, for people to read.
 * Nothing here changes a default, and nothing is shown or asked.
 *
 * It also answers "which learned values are in view" for a report (BugReporter), so a problem
 * flagged on a code says where that code's values came from.
 *
 *   kind        key                    supplied
 *   assignment  `${MAKER}|${CODE}`     the ElementType ref this project learned
 *   family      `${MAKER}|${CODE}`     the family a proposal took from the library
 *   rule        token text             the token's role (code / note / discard)
 *   pair        groupKey(codes)        'different' (a near-miss ruled apart)
 */
import { norm } from '../utils/productCodes'

const supplied = new Map()          // `${kind}|${key}` → { kind, key, tier, source, supplied, code }
const sent = new Map()              // `${project}|${kind}|${key}` → the outcome last sent

const id = (kind, key) => `${kind}|${key}`

/** Remember a learned value the app filled in. The first one this session stands. */
export function noteSupplied({ kind, key, tier, source = '', value, code = '' }) {
  if (!kind || !key || value == null || value === '') return
  const k = id(kind, key)
  if (!supplied.has(k)) supplied.set(k, { kind, key, tier, source: String(source || ''), supplied: String(value), code: String(code || '') })
}

/** A new project (or a fresh import): nothing supplied yet. */
export function forgetSupplied() {
  supplied.clear()
}

export const suppliedOf = kind => [...supplied.values()].filter(s => s.kind === kind)

/** kept / changed / cleared. Refs and roles compare as the app does: trimmed, case-insensitive. */
export function outcomeOf(value, final) {
  if (final == null || String(final).trim() === '') return 'cleared'
  return norm(String(final)) === norm(String(value)) ? 'kept' : 'changed'
}

/**
 * The outcome rows for one kind. `finalOf(key)` → the value now, null when cleared, or undefined
 * when this key is not being decided now (left out). Only rows whose outcome changed since the
 * last send for this project are returned. Pure apart from that memory.
 */
export function settle(project, kind, finalOf) {
  const rows = []
  for (const s of suppliedOf(kind)) {
    const final = finalOf(s.key)
    if (final === undefined) continue
    const outcome = outcomeOf(s.supplied, final)
    const k = `${project}|${kind}|${s.key}|${final ?? ''}`
    if (sent.get(`${project}|${kind}|${s.key}`) === k) continue
    sent.set(`${project}|${kind}|${s.key}`, k)
    rows.push({ kind, key: s.key, tier: s.tier, source: s.source, supplied: s.supplied, final: final ?? null, outcome })
  }
  return rows
}

/** Background; never awaited by the caller's flow. → rows sent. */
export function shareOutcomes(api, project, rows) {
  const n = String(project || '').trim()
  if (!api?.shareOutcomes || !n || !rows.length) return Promise.resolve(0)
  return api.shareOutcomes(n, rows.slice(0, 2000)).then(ok => (ok ? rows.length : 0))
}

/** For a report: the learned values behind the codes in view. */
export function learnedInView(codes = []) {
  const want = new Set(codes.filter(Boolean).map(c => norm(String(c))))
  if (!want.size) return []
  return [...supplied.values()]
    .filter(s => want.has(norm(s.code)) || want.has(norm(s.supplied)) || s.key.split('|').some(p => want.has(norm(p))))
    .slice(0, 20)
    .map(s => ({ kind: s.kind, key: s.key, value: s.supplied, tier: s.tier, source: s.source }))
}

/** Tests only. */
export function resetOutcomes() {
  supplied.clear()
  sent.clear()
}
