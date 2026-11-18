/**
 * trace.js — why the tool decided what it shows, for dev bug reports (DEV_REPORTS_PLAN.md).
 *
 * Utils stay pure: they RETURN a trace beside their result,
 *   { rule, subject, inputs, result, rejected }
 * and the component that renders it registers it (`useTrace`) and puts the id on the element
 * (`data-trace`). A right-click report collects the ids up the tree (bugReports.domContext) and
 * attaches those traces. On prod builds nothing is kept and no id is given.
 */
import { useMemo } from 'react'

const RING = 500
const ring = new Map()   // id → trace, oldest first
const byKey = new Map()  // content → id
let seq = 0
// Read here, not from bugReports.js: that module imports this one.
let enabled = (typeof __APP_CHANNEL__ !== 'undefined' ? __APP_CHANNEL__ : 'prod') === 'dev'

/** Tests turn tracing on or off; the build's channel decides otherwise. */
export function setTracing(on) { enabled = !!on; if (!on) { ring.clear(); byKey.clear() } }
export const tracing = () => enabled

/** Keep a trace; → its id ('t12'), or undefined when not tracing or there is no trace. */
export function registerTrace(trace) {
  if (!enabled || !trace) return undefined
  // The same decision re-rendered keeps its id, so renders don't flood the ring.
  let key
  try { key = JSON.stringify([trace.rule, trace.subject, trace.inputs, trace.result]) } catch { key = null }
  const had = key && byKey.get(key)
  if (had && ring.has(had)) { const t = ring.get(had); ring.delete(had); ring.set(had, t); return had }
  const id = `t${++seq}`
  ring.set(id, { ...trace, at: Date.now() })
  if (key) byKey.set(key, id)
  if (ring.size > RING) { const old = ring.keys().next().value; ring.delete(old) }
  if (byKey.size > RING * 2) for (const [k, v] of byKey) if (!ring.has(v)) byKey.delete(k)
  return id
}

export const getTrace = id => ring.get(id) || null
export const recentTraces = (n = 10) => [...ring.values()].slice(-n)

/** Register a rendered result's trace once per trace object; → the id for `data-trace`. */
export function useTrace(trace) {
  return useMemo(() => registerTrace(trace), [trace])
}

/** Several ids for one element: `data-trace={traceIds(a, b)}`. */
export const traceIds = (...ids) => ids.filter(Boolean).join(' ') || undefined

/**
 * A trace small enough for a report: long strings cut, long lists cut to their first items,
 * nesting cut at depth 4. A report is at most 16 KB in all (psr_bridge REPORT_MAX).
 */
export function clipTrace(t, { str = 160, list = 8, depth = 4 } = {}) {
  const walk = (v, d) => {
    if (v == null || typeof v === 'number' || typeof v === 'boolean') return v
    if (typeof v === 'string') return v.length > str ? `${v.slice(0, str - 1)}…` : v
    if (d >= depth) return '…'
    if (Array.isArray(v)) return [...v.slice(0, list).map(x => walk(x, d + 1)), ...(v.length > list ? [`…${v.length - list} more`] : [])]
    if (v instanceof Set) return walk([...v], d)
    if (v instanceof Map) return walk(Object.fromEntries(v), d)
    if (typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined && typeof x !== 'function').map(([k, x]) => [k, walk(x, d + 1)]))
    return String(v)
  }
  const { at, ...rest } = t || {}
  return walk(rest, 0)
}

/**
 * The traces a report carries: the ones on what was clicked (all of them, clipped), then
 * recent ones while the budget lasts. → { clicked: [...], recent: [...] } or null.
 */
export function reportTraces(ids = [], { budget = 7000, recent = 10 } = {}) {
  if (!enabled) return null
  const size = x => JSON.stringify(x).length
  const clicked = []
  for (const id of ids) {
    const t = getTrace(id)
    if (!t) continue
    let c = clipTrace(t)
    if (size(c) > budget / 2) c = clipTrace(t, { str: 60, list: 4, depth: 3 })
    if (size(clicked) + size(c) > budget) break
    clicked.push(c)
  }
  const out = { clicked, recent: [] }
  const seen = new Set(ids)
  for (const [id, t] of [...ring].slice(-recent).reverse()) {
    if (seen.has(id)) continue
    const c = { rule: t.rule, subject: t.subject, result: clipTrace({ r: t.result }, { str: 60, list: 4, depth: 2 }).r }
    if (size(out) + size(c) > budget) break
    out.recent.push(c)
  }
  return clicked.length || out.recent.length ? out : null
}
