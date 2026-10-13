/**
 * projectConfig.js — a project's configuration, kept in step across browsers by project number,
 * when the app is served beside a companion with `projects` (see companion.js). Silent.
 *
 * Configuration is how the project is SET UP — templates, ignored fittings, tags and notes on
 * positions, slot mappings, collections, project settings, local ElementTypes. It is NEVER the
 * work in progress: unexported changes, the import draft and Form captures are left out, so
 * nothing here can replay or overwrite an edit (see EXCLUDED_PREFS).
 *
 * Each thing is one item, so a change travels on its own and the latest write wins per item:
 *
 *   push  after every database save, the items that changed since the last sync are sent;
 *   pull  when a project opens, items newer than this browser's last sync are applied —
 *         except any this browser has changed and not yet sent: the current session wins,
 *         and its version is sent instead.
 */
import { dbApi, openDatabase, onPersisted } from './db'
import { getCompanion } from './companion'

// Work in progress, not configuration: never leaves this browser through here.
export const EXCLUDED_PREFS = new Set(['pending_db_changes', 'form_import_draft', 'form_captures'])
const VOLATILE = ['created_at', 'updated_at', 'project_id', 'CreatedAt', 'UpdatedAt', 'id']
const PUSH_MS = 4000

const stateKey = n => `rb-config-sync-${n}`
function readState(n) {
  try { return JSON.parse(localStorage.getItem(stateKey(n)) || 'null') || { since: '', snap: {} } } catch { return { since: '', snap: {} } }
}
function writeState(n, st) {
  try { localStorage.setItem(stateKey(n), JSON.stringify(st)) } catch { /* sync still works this session */ }
}

const strip = (o, keep = []) => Object.fromEntries(Object.entries(o || {})
  .filter(([k]) => keep.includes(k) || !VOLATILE.includes(k)))
const stable = v => JSON.stringify(v, Object.keys(v && typeof v === 'object' ? flatKeys(v) : {}).sort())
function flatKeys(v, out = {}) {
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out[k] = 1; flatKeys(x, out) }
  return out
}
const id = (kind, key) => `${kind}\u0000${key}`

/** A config (collectConfigData) as items: [{ kind, key, value }]. Pure; exported for tests. */
export function configItems(cfg = {}) {
  const out = []
  for (const r of cfg.position_ui || []) {
    out.push({ kind: 'cfg-position', key: r.position_type_ref,
      value: { tags: r.tags || [], tag_add: r.tag_add || [], tag_remove: r.tag_remove || [],
        user_notes: r.user_notes || '', ignored: !!r.ignored } })
  }
  for (const t of cfg.templates || []) out.push({ kind: 'cfg-template', key: t.id, value: { ...strip(t), id: t.id } })
  for (const [tid, slots] of Object.entries(cfg.slot_mappings || {})) {
    for (const [slot, ref] of Object.entries(slots || {})) out.push({ kind: 'cfg-slot', key: `${tid}|${slot}`, value: { ref } })
  }
  for (const c of cfg.collections || []) out.push({ kind: 'cfg-collection', key: c.CollectionId, value: strip(c, ['CollectionId']) })
  for (const [k, v] of Object.entries(cfg.prefs || {})) {
    if (!EXCLUDED_PREFS.has(k)) out.push({ kind: 'cfg-pref', key: k, value: { v } })
  }
  for (const et of cfg.local_element_types || []) out.push({ kind: 'local-et', key: et.ref, value: strip(et) })
  return out
}

/**
 * What to send: items whose value differs from the last synced one, plus a tombstone for a
 * template or slot that is gone. → { items, snap } (snap = the new last-synced picture).
 */
export function diffForPush(current, snap = {}) {
  const now = {}
  const items = []
  for (const it of current) {
    const k = id(it.kind, it.key)
    now[k] = stable(it.value)
    if (snap[k] !== now[k]) items.push(it)
  }
  for (const k of Object.keys(snap)) {
    if (k in now) continue
    const [kind, key] = k.split('\u0000')
    // Gone here means gone everywhere: a renamed local ElementType must not come back under its
    // old ref in another browser.
    if (kind === 'cfg-template' || kind === 'cfg-slot' || kind === 'local-et') {
      items.push({ kind, key, value: { deleted: true } })
    }
  }
  return { items, snap: now }
}

/**
 * Which pulled items to apply: newer than the last sync, and not changed here since then (the
 * session wins). → { apply: [item], keep: [key] } — `keep` are local changes still to be sent.
 */
export function pickForPull(pulled, current, snap = {}) {
  const local = new Map(current.map(it => [id(it.kind, it.key), stable(it.value)]))
  const apply = []
  const keep = []
  for (const it of pulled) {
    const k = id(it.kind, it.key)
    const changedHere = local.has(k) ? local.get(k) !== snap[k] : (k in snap)
    if (changedHere && snap[k] !== undefined) keep.push(k)
    else apply.push(it)
  }
  return { apply, keep }
}

/** Pulled items back into collectConfigData's shape, plus the deletions to make. */
export function itemsToConfig(items) {
  const cfg = { version: 2, position_ui: [], templates: [], slot_mappings: {}, collections: [], prefs: {}, local_element_types: [] }
  const deletes = { templates: [], slots: [], localEts: [] }
  for (const { kind, key, value } of items) {
    if (value?.deleted) {
      if (kind === 'cfg-template') deletes.templates.push(key)
      if (kind === 'cfg-slot') deletes.slots.push(key.split('|'))
      if (kind === 'local-et') deletes.localEts.push(key)
      continue
    }
    if (kind === 'cfg-position') cfg.position_ui.push({ position_type_ref: key, ...value })
    else if (kind === 'cfg-template') cfg.templates.push({ ...value, id: key })
    else if (kind === 'cfg-slot') {
      const [tid, slot] = key.split('|')
      ;(cfg.slot_mappings[tid] ||= {})[slot] = value.ref
    } else if (kind === 'cfg-collection') cfg.collections.push({ ...value, CollectionId: key })
    else if (kind === 'cfg-pref') cfg.prefs[key] = value.v
    else if (kind === 'local-et') cfg.local_element_types.push({ ...value, ref: key })
  }
  return { cfg, deletes }
}

const current = projectId => configItems(dbApi.collectConfigData(projectId))

/**
 * Bring this project's configuration up to date before it is loaded. Quiet and bounded: a slow
 * or absent companion never delays opening by more than `timeoutMs`. → number of items applied.
 */
export async function pullConfig(projectId, projectNumber, { timeoutMs = 3000 } = {}) {
  const n = String(projectNumber || '').trim()
  if (!n || projectId == null) return 0
  const api = await getCompanion()
  if (!api?.projectItems) return 0
  const st = readState(n)
  const answer = await Promise.race([api.projectItems(n, st.since), new Promise(r => setTimeout(() => r(null), timeoutMs))])
  const pulled = (answer?.items || []).filter(it => String(it.kind).startsWith('cfg-') || it.kind === 'local-et')
  if (!pulled.length) return 0
  await openDatabase()
  const { apply } = pickForPull(pulled, current(projectId), st.snap)
  const { cfg, deletes } = itemsToConfig(apply)
  dbApi.applyConfigData(projectId, cfg)
  for (const t of deletes.templates) dbApi.deleteTemplate(t)
  for (const [tid, slot] of deletes.slots) dbApi.deleteSlotMapping(projectId, tid, slot)
  for (const ref of deletes.localEts) dbApi.deleteLocalElementType(projectId, ref)
  // The applied values are now the synced picture; anything changed here stays different and
  // is sent on the next push.
  const snap = { ...st.snap }
  for (const it of apply) snap[id(it.kind, it.key)] = it.value?.deleted ? undefined : stable(it.value)
  const since = pulled.reduce((m, it) => (it.updated_at > m ? it.updated_at : m), st.since)
  writeState(n, { since, snap })
  return apply.length
}

/** Send what changed since the last sync. → number of items sent. */
export async function pushConfig(projectId, projectNumber) {
  const n = String(projectNumber || '').trim()
  if (!n || projectId == null) return 0
  const api = await getCompanion()
  if (!api?.shareProjectItems) return 0
  const st = readState(n)
  const { items, snap } = diffForPush(current(projectId), st.snap)
  if (!items.length) return 0
  const ok = await api.shareProjectItems(n, items.slice(0, 2000))
  if (ok) writeState(n, { since: st.since, snap })
  return ok ? items.length : 0
}

let timer = null
/**
 * After every save, push the open project's changes (debounced). `getOpen` → { projectId,
 * projectNumber } of the project in use. Call once at boot.
 */
export function startConfigSync(getOpen) {
  return onPersisted(() => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      const { projectId, projectNumber } = getOpen() || {}
      pushConfig(projectId, projectNumber).catch(() => { /* next save tries again */ })
    }, PUSH_MS)
  })
}
