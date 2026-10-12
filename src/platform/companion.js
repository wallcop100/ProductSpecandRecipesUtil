/**
 * companion.js — an OPTIONAL server beside the app, discovered at run time.
 *
 * The app is complete without one: on a static host (GitHub Pages) `api/capabilities`
 * is a 404 and every caller gets `null`, which means "behave exactly as before". When
 * the same build is served next to a companion that speaks the protocol in
 * docs/companion-api.md, three things light up:
 *
 *   products       — what a shared product catalogue knows about a code (advisory only);
 *   contributions  — offer an ElementType decision or a product fact back to it;
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
    refsUsed: list(body.refsUsed)
      .map(r => (typeof r === 'string' ? { ref: r, count: 1 } : r))
      .filter(r => r && r.ref)
      .map(r => ({ ref: String(r.ref), count: Number(r.count) || 1, confirmed: !!r.confirmed })),
    facts: list(body.facts)
      .filter(f => f && f.attribute)
      .map(f => ({ attribute: String(f.attribute), value: String(f.value ?? ''), tier: f.tier || '', source: f.source || '' })),
  }
}

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
      try {
        const res = await fetch('./api/contributions', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        })
        return res.ok
      } catch { return false }
    } : null,

    workspaces: has('workspaces'),
  }
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
