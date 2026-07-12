/**
 * formColumns.js — which of the Form's columns get carried across, and which get shown.
 *
 * Two different questions, deliberately separated:
 *
 *   CAPTURE  happens once, at import. It is generous: every column the sheet has, minus
 *            junk and the ones already mapped to a role. If a column is not captured, the
 *            pane can never offer it to you later without a re-import — which was the old
 *            behaviour (four hard-coded CONTEXT_WANTS and no way to change your mind).
 *
 *   SHOW     is a display preference, changed any time, per project. localStorage, for the
 *            same reasons seen.js gives: it is device-local UX state and must not travel in
 *            an export onto a colleague's machine. Corrupt storage falls back to the
 *            defaults, never throws.
 *
 * `null` from loadVisible means "this person has never chosen" — the caller uses the
 * import-time defaults. An EMPTY ARRAY is a real choice: show nothing. Those must not
 * collapse into each other.
 */

const KEY = 'rb-form-columns'

/** xlsx names unheaded columns __EMPTY, __EMPTY_1, … — never anything a human wants. */
const JUNK = /^__EMPTY/i

/**
 * Everything worth carrying from a sheet: real headers that are not already doing a job.
 * A column mapped to PositionType / ProductCode / Manufacturer / Exclude is not "context",
 * it IS the import — repeating it in the pane would be noise.
 */
export function capturableColumns(headers = [], map = {}) {
  const used = new Set([map.pt, map.code, map.mfr, map.exclude].filter(Boolean))
  return headers.filter(h => h && !JUNK.test(String(h)) && !used.has(h))
}

/** The row's captured context: every capturable column that actually has a value. */
export function captureContext(row = {}, columns = []) {
  const out = {}
  for (const c of columns) {
    const v = row[c]
    if (v != null && String(v).trim() !== '') out[c] = v
  }
  return out
}

function read() {
  try {
    const raw = window.localStorage.getItem(KEY)
    const obj = raw ? JSON.parse(raw) : {}
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {}
  } catch {
    return {}
  }
}

/** The columns this project shows, or null if it has never been asked. */
export function loadVisible(projectKey) {
  if (!projectKey) return null
  const cols = read()[projectKey]
  return Array.isArray(cols) ? cols : null
}

export function saveVisible(projectKey, columns) {
  if (!projectKey) return
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...read(), [projectKey]: [...columns] }))
  } catch { /* private mode etc. */ }
}

/** Forget the choice: back to whatever the import decided. */
export function clearVisible(projectKey) {
  if (!projectKey) return
  const all = read()
  delete all[projectKey]
  try { window.localStorage.setItem(KEY, JSON.stringify(all)) } catch { /* nothing to lose */ }
}

/**
 * What to actually render, in the order the sheet has them.
 *
 * Ordering by `available` rather than by the saved list keeps the pane stable: the columns
 * read down the panel in the same order they read across the Form, whatever order they were
 * ticked in.
 */
export function visibleColumns({ available = [], defaults = [], chosen = null }) {
  const want = new Set(chosen ?? defaults)
  return available.filter(c => want.has(c))
}
