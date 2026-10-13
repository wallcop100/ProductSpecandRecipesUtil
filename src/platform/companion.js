/**
 * companion.js — an OPTIONAL learning service beside the app, discovered at run time.
 *
 * The app is complete without one: on a static host (GitHub Pages) `api/capabilities` is a
 * 404 and every caller gets `null`, which means "behave exactly as before". Served beside a
 * companion that speaks docs/companion-api.md, the app starts from what earlier sessions
 * learned and keeps that learning up to date — silently. Nothing here adds a prompt:
 * knowledge only ever fills a default the app would otherwise leave empty (see
 * screens/import/useProjectKnowledge.js), and a person's own choices always win.
 *
 *   sweep          which product codes their makers have since replaced
 *   library        how products became ElementTypes elsewhere (styleLibrary.js rows)
 *   projects       a project's decisions and configuration, by project number
 *   contributions  evidence for the catalogue, reviewed before it is relied on
 *
 * Every call is relative to the page, so the build needs no configuration and knows nothing
 * about who answers. Failures are quiet: a companion that is down is the same as none.
 */
import { useEffect, useState } from 'react'

export const PROTOCOL = 'psr-companion/1'

let probe = null

async function getJson(url, init) {
  const res = await fetch(url, { ...init, headers: { Accept: 'application/json', ...(init?.headers || {}) } })
  const type = res.headers.get('content-type') || ''
  // A static host may answer every path with index.html — that is "no companion", not data.
  if (!type.includes('application/json')) return { res, body: null }
  return { res, body: await res.json().catch(() => null) }
}

const post = (url, body) => getJson(url, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
/** The JSON answer, or null on any failure. */
const quiet = p => p.then(({ res, body }) => (res.ok ? body : null)).catch(() => null)
const projectUrl = n => `./api/projects/${encodeURIComponent(String(n).trim())}`

function build(features) {
  const has = f => features.has(f)
  return {
    features,

    /** → [{ code, manufacturer, replacement, retired }] for codes their maker has replaced. */
    sweep: has('sweep') ? async codes => (await quiet(post('./api/products/sweep', { codes })))?.retired || [] : null,

    /** Exemplars from OTHER projects for these makers, in style_exemplars row shape. */
    library: has('library') ? async (makers, exclude = '') => {
      const q = new URLSearchParams({ makers: [...new Set(makers.filter(Boolean))].join(','), exclude: String(exclude || '') })
      return (await quiet(getJson(`./api/library?${q}`)))?.exemplars || []
    } : null,
    shareLibrary: has('library') ? (project, exemplars) => quiet(post('./api/library', { project: String(project), exemplars })) : null,

    /** { items: [{ id, kind, key, value, updated_at }], dialect: [...] } | null — `since` for only newer items. */
    projectItems: has('projects') ? (n, since = '') =>
      quiet(getJson(`${projectUrl(n)}${since ? `?${new URLSearchParams({ since })}` : ''}`)) : null,
    shareProjectItems: has('projects') ? (n, items) => quiet(post(`${projectUrl(n)}/items`, { items })) : null,

    /** Evidence for the catalogue (reviewed on the other side). Fire-and-forget → accepted? */
    contribute: has('contributions') ? async payload => !!(await quiet(post('./api/contributions', payload))) : null,
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

/** Tests only: forget the probe. */
export function resetCompanion() {
  probe = null
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
