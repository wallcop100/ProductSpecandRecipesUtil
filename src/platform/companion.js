/**
 * companion.js — an OPTIONAL server beside the app, discovered at run time.
 *
 * The app is complete without one: on a static host (GitHub Pages) `api/capabilities`
 * is a 404 and every caller gets `null`, which means "behave exactly as before". When
 * the same build is served next to a companion that speaks the protocol in
 * docs/companion-api.md, three things light up:
 *
 *   products       — what a shared product catalogue knows about a code (advisory only),
 *                    and which codes its makers have retired (`sweep`);
 *   contributions  — offer a decision back for review, and later see how it went;
 *   library        — the style library (styleLibrary.js) shared across browsers and projects;
 *   projects       — what a project's users decided, offered back as suggestions;
 *   workspaces     — keep this browser's work (a backup, see backup.js) on the server.
 *
 * Every call is relative to the page, so the build needs no configuration and knows
 * nothing about who answers. Failures are quiet: a companion that is down is the same
 * as no companion, never an error the user has to deal with.
 */
import { useEffect, useState } from 'react'

export const PROTOCOL = 'psr-companion/1'
const LOOKUP_TTL_MS = 10 * 60 * 1000

let probe = null
const lookups = new Map()   // `${maker}|${code}` -> { at, value: Promise }

const keyOf = (code, manufacturer) =>
  `${String(manufacturer || '').trim().toUpperCase()}|${String(code || '').trim().toUpperCase()}`

async function getJson(url, init) {
  const res = await fetch(url, { ...init, headers: { Accept: 'application/json', ...(init?.headers || {}) } })
  const type = res.headers.get('content-type') || ''
  // A static host may answer every path with index.html — that is "no companion", not data.
  if (!type.includes('application/json')) return { res, body: null }
  return { res, body: await res.json().catch(() => null) }
}

/** The catalogue's answer, in the app's terms. null when it has never seen the code. */
export function normalizeProduct(body) {
  if (!body || body.known === false) return null
  const list = x => (Array.isArray(x) ? x : [])
  return {
    manufacturer: body.manufacturer || '',
    retired: !!body.retired,
    replacement: body.replacement || null,
    families: list(body.families)
      .filter(f => f && f.family)
      .map(f => ({ family: String(f.family), projects: list(f.projects).map(String), tier: f.tier || '' })),
    refsUsed: list(body.refsUsed)
      .map(r => (typeof r === 'string' ? { ref: r, count: 1 } : r))
      .filter(r => r && r.ref)
      .map(r => ({ ref: String(r.ref), count: Number(r.count) || 1, confirmed: !!r.confirmed })),
    facts: list(body.facts)
      .filter(f => f && f.attribute)
      .map(f => ({ attribute: String(f.attribute), value: String(f.value ?? ''), tier: f.tier || '', source: f.source || '' })),
  }
}

const post = (url, body) => getJson(url, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
/** GET/POST a JSON answer, or null on any failure — a companion that is down is no companion. */
const quiet = p => p.then(({ res, body }) => (res.ok ? body : null)).catch(() => null)
const projectUrl = n => `./api/projects/${encodeURIComponent(String(n).trim())}`

function build(features) {
  const has = f => features.has(f)
  return {
    features,

    /** → normalized product (see normalizeProduct) | null. Cached per session. */
    lookupProduct: has('products') ? (code, manufacturer = '') => {
      const k = keyOf(code, manufacturer)
      const hit = lookups.get(k)
      if (hit && Date.now() - hit.at < LOOKUP_TTL_MS) return hit.value
      const q = new URLSearchParams({ code: String(code).trim() })
      if (manufacturer) q.set('manufacturer', String(manufacturer).trim())
      const value = getJson(`./api/products?${q}`)
        .then(({ res, body }) => (res.ok ? normalizeProduct(body) : null))
        .catch(() => null)
      lookups.set(k, { at: Date.now(), value })
      return value
    } : null,

    /**
     * Offer something back. Fire-and-forget: a contribution is queued for a person to
     * review on the other side, so nothing here waits on, or depends on, its outcome.
     * → true when the companion accepted it for review.
     */
    contribute: has('contributions') ? async payload => {
      const out = await quiet(post('./api/contributions', payload))
      if (out?.id) rememberContribution(out.id, payload)
      return !!out
    } : null,

    /** → [{ code, manufacturer, replacement, retired }] for the codes the maker has retired. */
    sweep: has('sweep') ? async codes => (await quiet(post('./api/products/sweep', { codes })))?.retired || [] : null,

    /** Exemplars from OTHER projects for these makers, in style_exemplars row shape. */
    library: has('library') ? async (makers, exclude = '') => {
      const q = new URLSearchParams({ makers: [...new Set(makers.filter(Boolean))].join(','), exclude: String(exclude || '') })
      return (await quiet(getJson(`./api/library?${q}`)))?.exemplars || []
    } : null,
    shareLibrary: has('library') ? (project, exemplars) => quiet(post('./api/library', { project: String(project), exemplars })) : null,

    /** { items: [{ id, kind, key, value }], dialect: [{ maker, token, role, projects }] } | null */
    projectItems: has('projects') ? n => quiet(getJson(projectUrl(n))) : null,
    shareProjectItems: has('projects') ? (n, items) => quiet(post(`${projectUrl(n)}/items`, { items })) : null,
    /** How a suggestion was taken: 'shown' | 'accepted' | 'rejected'. Fire-and-forget. */
    feedback: has('projects') ? (n, itemId, outcome) => { quiet(post(`${projectUrl(n)}/feedback`, { item_id: itemId, outcome })) } : () => {},

    /** → { accepted, rejected, queued } for everything this browser has offered. */
    contributionStatus: has('contribution-status') ? async () => {
      const mine = readContributions()
      const open = mine.filter(c => !c.settled).slice(0, 50)
      await Promise.all(open.map(async c => {
        const out = await quiet(getJson(`./api/contributions/${c.id}`))
        if (out?.status === 'accepted' || out?.status === 'rejected') c.settled = out.status
      }))
      writeContributions(mine)
      const n = s => mine.filter(c => (c.settled || 'queued') === s).length
      return { accepted: n('accepted'), rejected: n('rejected'), queued: n('queued') }
    } : null,

    workspaces: has('workspaces'),
  }
}

// What this browser has offered, so it can be told later how each one went.
const CONTRIB_KEY = 'rb-contributions'
function readContributions() {
  try { return JSON.parse(localStorage.getItem(CONTRIB_KEY) || '[]') } catch { return [] }
}
function writeContributions(list) {
  try { localStorage.setItem(CONTRIB_KEY, JSON.stringify(list.slice(-500))) } catch { /* blocked */ }
}
function rememberContribution(id, payload) {
  const list = readContributions()
  if (!list.some(c => c.id === id)) list.push({ id, kind: payload.kind, code: payload.code })
  writeContributions(list)
}

/** → the companion API, or null when this build is served without one. Probed once. */
export function getCompanion() {
  if (!probe) {
    probe = getJson('./api/capabilities')
      .then(({ res, body }) => {
        if (!res.ok || !body || body.protocol !== PROTOCOL) return null
        return build(new Set(Array.isArray(body.features) ? body.features : []))
      })
      .catch(() => null)
  }
  return probe
}

/** Tests only: forget the probe and the lookup cache. */
export function resetCompanion() {
  probe = null
  lookups.clear()
}

/** React: the companion, or null (also null until the probe answers). */
export function useCompanion() {
  const [api, setApi] = useState(null)
  useEffect(() => {
    let live = true
    getCompanion().then(c => { if (live) setApi(c) })
    return () => { live = false }
  }, [])
  return api
}
