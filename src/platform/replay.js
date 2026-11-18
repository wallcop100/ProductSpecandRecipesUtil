/**
 * replay.js — dev build only (DEV_REPORTS_PLAN.md part 1): what a report needs so Claude can open
 * the same screen with the same data. The workbooks as they were read (bytes, not re-fetched), the
 * companion's answers this tab has had, the browser's saved work (makeBackup) and the view.
 * Sent only when the report's "Include my data (replay)" tick is on, on its own after the report,
 * to the dev bridge (never relayed to datajoin). On every other build nothing is kept.
 */

let DEV = typeof __APP_CHANNEL__ !== 'undefined' && __APP_CHANNEL__ === 'dev'
export const replayOn = () => DEV
const books = new Map()     // name → { role, bytes }
const answers = new Map()   // companion path, as a bed's api/ names it → JSON
// The calls that are reads though they POST (tools/browse.pw.js readPost): a bed answers them too.
const READ_POST = /^(products\/sweep|products\/jobs|recipes\/kits|projects\/[^/]+\/proof)$/

/** A workbook as the app read it. Copied: the bytes go on to the xlsx worker, which may take them. */
export function keepWorkbook(name, bytes, role) {
  if (DEV && name && bytes) books.set(name, { role, bytes: bytes.slice() })
}

/** A companion answer (url './api/<path>?…'), keyed the way a bed's api/<path with _>.json is. */
export function keepAnswer(url, method, body) {
  if (!DEV || body == null || typeof url !== 'string' || !url.startsWith('./api/')) return
  const path = url.slice(6).split('?')[0]
  if ((method || 'GET') === 'GET' || READ_POST.test(path)) answers.set(path.replace(/\//g, '_'), body)
}

async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('')
}

/** Everything a replay needs. `report` is the report as sent; `ui` the view (bugReports.viewOf). */
export async function buildSnapshot({ report, ui }) {
  // imported here: companion.js imports this module, and backup → db is heavy and must not load with it
  const { makeBackup, toBase64 } = await import('./backup')
  const workbooks = []
  for (const [name, { role, bytes }] of books) workbooks.push({ name, role, sha256: await sha256(bytes), data: toBase64(bytes) })
  return {
    format: 'psr-report-snapshot', version: 1, at: new Date().toISOString(),
    report, ui, workbooks, companion: Object.fromEntries(answers), backup: await makeBackup(),
  }
}

/** gzip and PUT it beside report `id`. → true when stored. A failure leaves the report as sent. */
export async function uploadSnapshot(id, snapshot) {
  if (!DEV || !id) return false
  try {
    const gz = new Response(JSON.stringify(snapshot)).body.pipeThrough(new CompressionStream('gzip'))
    const res = await fetch(`./api/reports/snapshots/${encodeURIComponent(id)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/gzip' }, body: await new Response(gz).arrayBuffer(),
    })
    return res.ok
  } catch {
    return false
  }
}

/** Tests: turn it on or off (the build's channel decides otherwise); either way forget what was kept. */
export function setReplay(on) { DEV = !!on; books.clear(); answers.clear() }
