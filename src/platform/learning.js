/**
 * learning.js — every ElementType decision is learned when it is made, not when it is exported.
 *
 * A ref or family can be set or corrected in many places — the bulk create, a new ElementType,
 * "Change family or ref", a fork, a family move — and all of them end in the store's
 * `elementTypes` and `psRows`. So rather than a hook in each builder, this watches those two
 * and, a few seconds after they settle, records what the project now says:
 *
 *   exemplars    maker + code → family, ref, name, description (styleLibrary.harvestExemplars),
 *                into this browser's library at once, and — beside a companion — the changed
 *                ones to the shared library, replacing that project's earlier rows for each code;
 *   assignments  maker + code → ref, as the project's decisions (useProjectKnowledge.js).
 *
 * The next import then starts from the corrected family and ref: the project's own latest
 * exemplars come first (see ProductCodeImportScreen's library order). Silent; nothing is shown.
 * Only after `primeLearning` for the open project, so loading a project is never taken for an edit.
 */
import useStore from '../store/useStore'
import { harvestExemplars } from '../utils/styleLibrary'
import { hasProductIdentity, norm } from '../utils/productCodes'
import { getCompanion } from './companion'

const SETTLE_MS = 4000
const keyOf = (maker, code) => `${norm(maker || '')}|${norm(code)}`

const snapKey = n => `rb-learned-${n}`
function readSnap(n) {
  try { return JSON.parse(localStorage.getItem(snapKey(n)) || 'null') || { ex: {}, as: {} } } catch { return { ex: {}, as: {} } }
}
function writeSnap(n, snap) {
  try { localStorage.setItem(snapKey(n), JSON.stringify(snap)) } catch { /* learned again next time */ }
}

/** Exemplars grouped by maker|code → a stable signature of what the project says about it. */
export function groupExemplars(exemplars = []) {
  const by = {}
  for (const e of exemplars) (by[keyOf(e.maker, e.code)] ||= []).push(e)
  const out = {}
  for (const [k, list] of Object.entries(by)) {
    const rows = list.map(e => ({ maker: e.maker, code: e.code, ref: e.ref, family: e.family, name: e.name || '', description: e.description || '' }))
      .sort((a, b) => a.ref.localeCompare(b.ref))
    out[k] = { rows, sig: JSON.stringify(rows.map(r => [r.ref, r.family, r.name, r.description])) }
  }
  return out
}

/** What changed since the last snapshot: rows to send (merge mode) and codes that are gone. */
export function diffExemplars(groups, snapEx = {}) {
  const send = []
  for (const [k, g] of Object.entries(groups)) if (snapEx[k] !== g.sig) send.push(...g.rows)
  for (const k of Object.keys(snapEx)) {
    if (groups[k]) continue
    const [maker, code] = k.split('|')
    send.push({ maker, code, deleted: true })
  }
  return { send, snapEx: Object.fromEntries(Object.entries(groups).map(([k, g]) => [k, g.sig])) }
}

/** maker|code → ref, from the live Product Spec rows. */
export function assignmentsFrom(psRows = []) {
  const out = {}
  for (const r of psRows) {
    if ((r.IsDeleted || r.isDeleted) === 'Y') continue
    const code = String(r.ProductCode || r.productCode || '').trim()
    const ref = String(r.ElementTypeRef || r.elementTypeRef || '').trim()
    const maker = String(r.Manufacturer || r.manufacturer || '').trim()
    if (ref && hasProductIdentity(code)) out[keyOf(maker, code)] = { ref, code, maker }
  }
  return out
}

/** Assignment items whose ref changed (latest wins on the other side). */
export function diffAssignments(cur, snapAs = {}) {
  const items = []
  for (const [k, v] of Object.entries(cur)) {
    if (snapAs[k] !== v.ref) items.push({ kind: 'assignment', key: k, value: v })
  }
  return { items, snapAs: Object.fromEntries(Object.entries(cur).map(([k, v]) => [k, v.ref])) }
}

let primed = null       // the project number the snapshot belongs to
let timer = null

/** After a project opens: what it says now is the baseline, not a change. */
export function primeLearning(projectNumber, { elementTypes = [], psRows = [] } = {}) {
  const n = String(projectNumber || '').trim()
  primed = n || null
  if (!n) return
  const groups = groupExemplars(harvestExemplars({ elementTypes, psRows, source: n }))
  writeSnap(n, { ex: diffExemplars(groups, {}).snapEx, as: diffAssignments(assignmentsFrom(psRows), {}).snapAs })
}

/** Record what the open project says now; send only what changed. → { exemplars, assignments } sent. */
export async function learnNow(state = useStore.getState()) {
  const n = String(state.projectNumber || '').trim()
  if (!n || primed !== n) return { exemplars: 0, assignments: 0 }
  const exemplars = harvestExemplars({ elementTypes: state.elementTypes, psRows: state.psRows, source: n })
  try { await window.electronAPI?.db?.recordStyleExemplars?.(exemplars) } catch { /* local library is a convenience */ }
  const snap = readSnap(n)
  const ex = diffExemplars(groupExemplars(exemplars), snap.ex)
  const as = diffAssignments(assignmentsFrom(state.psRows), snap.as)
  const api = await getCompanion()
  let sentEx = 0, sentAs = 0
  if (ex.send.length && api?.shareLibrary) {
    if (await api.shareLibrary(n, ex.send.slice(0, 5000), 'merge')) { snap.ex = ex.snapEx; sentEx = ex.send.length }
  } else if (!ex.send.length) snap.ex = ex.snapEx
  if (as.items.length && api?.shareProjectItems) {
    if (await api.shareProjectItems(n, as.items.slice(0, 2000))) { snap.as = as.snapAs; sentAs = as.items.length }
  } else if (!as.items.length) snap.as = as.snapAs
  writeSnap(n, snap)
  return { exemplars: sentEx, assignments: sentAs }
}

/** Watch the store from boot. Call once. */
export function startLearning() {
  return useStore.subscribe((s, p) => {
    if (s.elementTypes === p.elementTypes && s.psRows === p.psRows) return
    if (!primed || String(s.projectNumber || '').trim() !== primed) return
    clearTimeout(timer)
    timer = setTimeout(() => { learnNow().catch(() => { /* the next change tries again */ }) }, SETTLE_MS)
  })
}

/** Tests only. */
export function resetLearning() { primed = null; clearTimeout(timer) }
