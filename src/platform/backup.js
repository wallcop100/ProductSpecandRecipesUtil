/**
 * backup.js — everything this browser holds for the app, as one file.
 *
 * The app keeps its work in this browser (IndexedDB), not in the workbooks, until you export:
 * every project you have opened, its UNEXPORTED CHANGES (Product Spec, Recipes and DesignDB
 * edits), templates, connector templates, tags and tag rules, Form captures, the import
 * draft, style and recipe patterns, local ElementTypes — and the app's own settings.
 * A backup is all of that, so clearing the browser, a new computer or a new address loses
 * nothing. Only remembered project FOLDERS cannot travel (browser file permissions): after
 * a restore each project's folder is picked once more. The workbooks on disk are untouched.
 */
import { idbGet } from './idb'
import { flush, importDatabase } from './db'

export const BACKUP_FORMAT = 'recipe-builder-backup'
export const BACKUP_VERSION = 1

/** The app's own localStorage keys (the origin is shared with other github.io sites). */
export const LOCAL_KEYS = ['bugReports', 'bugMode', 'positionRail', 'rb-tutorial-seen', 'rb-form-columns']

export function toBase64(bytes) {
  let s = ''
  const u = new Uint8Array(bytes)
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return btoa(s)
}
export function fromBase64(b64) {
  const s = atob(b64)
  const u = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i)
  return u
}

/**
 * What a backup holds, for the person making or restoring it:
 * { projects: [{ name, unexported }], unexported, templates, connectorTemplates }.
 * `api` is window.electronAPI.db (the app's database API); without it, null.
 */
export async function summarize(api) {
  if (!api?.getAllProjects) return null
  const projects = (await api.getAllProjects()) || []
  const out = { projects: [], unexported: 0 }
  for (const p of projects) {
    const id = p.id ?? p.project_id
    let n = 0
    try {
      const pend = await api.getPendingChanges(id)
      n += (pend?.ps?.length || 0) + (pend?.rs?.length || 0)
      const db = await api.getPref(id, 'pending_db_changes')
      if (db) n += (JSON.parse(db) || []).length
    } catch { /* unreadable: counted as none */ }
    out.projects.push({ name: [p.project_number, p.project_label].filter(Boolean).join(' ') || p.folder_path || `#${id}`, unexported: n })
    out.unexported += n
  }
  return out
}

/** Read this browser's saved work into a backup object. */
export async function makeBackup({ api = null } = {}) {
  try { await flush() } catch { /* nothing open yet */ }
  const db = await idbGet('sqlite-db')
  const local = {}
  for (const k of LOCAL_KEYS) {
    try { const v = localStorage.getItem(k); if (v != null) local[k] = v } catch { /* blocked */ }
  }
  let contents = null
  try { contents = await summarize(api) } catch { /* summary is a courtesy */ }
  return {
    format: BACKUP_FORMAT, version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    from: typeof location !== 'undefined' ? `${location.origin}${location.pathname}` : null,
    contents,
    sqlite: db ? toBase64(db) : null,
    localStorage: local,
  }
}

/** Is this a backup we can restore? → null when fine, else why not. */
export function checkBackup(b) {
  if (!b || b.format !== BACKUP_FORMAT) return 'This is not a Recipe Builder backup.'
  if (b.version > BACKUP_VERSION) return 'This backup was made by a newer version of the app.'
  if (!b.sqlite && !Object.keys(b.localStorage || {}).length) return 'This backup is empty.'
  return null
}

/** One line on what a backup holds: "3 projects, 42 unexported changes". */
export function describeBackup(b) {
  const c = b?.contents
  if (!c) return b?.sqlite ? 'saved work (made before summaries existed)' : 'settings only'
  const p = c.projects.length
  return `${p} project${p === 1 ? '' : 's'}${c.projects.length ? ` (${c.projects.map(x => x.name).join(', ')})` : ''}, ${c.unexported} unexported change${c.unexported === 1 ? '' : 's'}`
}

/** Replace this browser's saved work with a backup. The caller reloads the page after. */
export async function restoreBackup(b) {
  const bad = checkBackup(b)
  if (bad) throw new Error(bad)
  if (b.sqlite) await importDatabase(fromBase64(b.sqlite))
  for (const [k, v] of Object.entries(b.localStorage || {})) {
    if (!LOCAL_KEYS.includes(k)) continue
    try { localStorage.setItem(k, v) } catch { /* blocked */ }
  }
}

/** Is there any saved work here (so a restore would overwrite something)? */
export async function hasSavedWork() {
  try { return !!(await idbGet('sqlite-db')) } catch { return false }
}
