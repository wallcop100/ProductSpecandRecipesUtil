/**
 * db.js — the browser's project database.
 *
 * Boots SQLite-WASM (sql.js), restores the previous database from IndexedDB,
 * and hands the connection to `dbSchema.js` — which is the old `electron/db.js`
 * with its SQL untouched. Every write is serialized back to IndexedDB, debounced.
 *
 * sql.js keeps the whole database in memory; `export()` gives the file bytes.
 * This needs no COOP/COEP headers, which GitHub Pages cannot set — the reason we
 * chose it over an OPFS/sync-handle backend.
 */

import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'
import { wrapSqlJs } from './sqlShim'
import { idbGet, idbSet } from './idb'
import * as schema from './dbSchema'

const DB_KEY = 'sqlite-db'
const PERSIST_MS = 300

let conn = null
let persistTimer = null
let persisting = null

/** Debounced serialize → IndexedDB. Writes are frequent; the blob is small. */
function schedulePersist() {
  if (!conn) return
  clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persisting = idbSet(DB_KEY, conn.export()).catch(err => {
      console.error('[db] persist failed', err)
    })
  }, PERSIST_MS)
}

/** Flush any pending write — call before the page unloads. */
export async function flush() {
  clearTimeout(persistTimer)
  if (conn) await idbSet(DB_KEY, conn.export())
  await persisting
}

/**
 * Open the database, restoring prior state if any. Idempotent.
 * sql.js and its wasm are only fetched on first call, so they stay out of the
 * initial page load.
 */
export async function openDatabase() {
  if (conn) return conn

  // Dynamic so neither the sql.js loader nor its wasm reach the first page load.
  const initSqlJs = (await import('sql.js')).default
  const SQL = await initSqlJs({ locateFile: () => wasmUrl })
  const saved = await idbGet(DB_KEY)
  const sqlDb = saved ? new SQL.Database(new Uint8Array(saved)) : new SQL.Database()

  conn = wrapSqlJs(sqlDb)
  schema.initDb(conn)          // creates tables + runs migrations, exactly as before
  await idbSet(DB_KEY, conn.export())

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => { try { flush() } catch { /* best effort */ } })
  }
  return conn
}

/** Wrap a schema function so every call persists afterwards. */
function writer(fn) {
  return (...args) => {
    const result = fn(...args)
    schedulePersist()
    return result
  }
}

/** Reads need no persistence. */
const reader = fn => (...args) => fn(...args)

/**
 * The 33 methods `window.electronAPI.db` exposes, promise-returning to match the
 * old IPC surface exactly. Reads and writes both resolve; writes also persist.
 */
export const dbApi = {
  // projects
  upsertProject: writer(schema.upsertProject),
  getProject: reader(schema.getProject),
  getConfigsForFolder: reader(schema.getConfigsForFolder),
  getAllProjects: reader(schema.getAllProjects),
  deleteProject: writer(schema.deleteProject),
  getRecentProjects: reader(schema.getRecentProjects),
  getProjectSummaries: reader(schema.getProjectSummaries),
  renameProject: writer(schema.renameProject),
  renameConfig: writer(schema.renameConfig),
  setProjectNumber: writer(schema.setProjectNumber),
  adoptDuplicateProject: writer(schema.adoptDuplicateProject),

  // position UI
  upsertPositionUI: writer(schema.upsertPositionUI),
  getPositionUI: reader(schema.getPositionUI),
  getAllPositionUI: reader(schema.getAllPositionUI),

  // templates + slots
  upsertTemplate: writer(schema.upsertTemplate),
  getTemplate: reader(schema.getTemplate),
  getAllTemplates: reader(schema.getAllTemplates),
  deleteTemplate: writer(schema.deleteTemplate),
  upsertSlotMapping: writer(schema.upsertSlotMapping),
  getSlotMappings: reader(schema.getSlotMappings),
  getAllSlotMappings: reader(schema.getAllSlotMappings),
  deleteSlotMapping: writer(schema.deleteSlotMapping),

  // prefs
  setPref: writer(schema.setPref),
  getPref: reader(schema.getPref),
  getAllPrefs: reader(schema.getAllPrefs),
  seedGlobalTemplates: writer(schema.seedGlobalTemplates),

  // collections + favourites
  upsertCollection: writer(schema.upsertCollection),
  getAllCollections: reader(schema.getAllCollections),
  deleteCollection: writer(schema.deleteCollection),
  upsertFavorite: writer(schema.upsertFavorite),
  getFavorites: reader(schema.getFavorites),
  deleteFavorite: writer(schema.deleteFavorite),

  // config + library payloads (YAML is handled by the caller)
  collectConfigData: reader(schema.collectConfigData),
  applyConfigData: writer(schema.applyConfigData),
  collectLibraryData: reader(schema.collectLibraryData),
  applyLibraryData: writer(schema.applyLibraryData),

  // pending changes (crash-safe dirty registry)
  getPendingChanges: reader(schema.getPendingChanges),
  setPendingChanges: writer(schema.setPendingChanges),
  clearPendingChanges: writer(schema.clearPendingChanges),

  // local element types
  upsertLocalElementType: writer(schema.upsertLocalElementType),
  getLocalElementTypes: reader(schema.getLocalElementTypes),
  renameLocalElementType: writer(schema.renameLocalElementType),
  deleteLocalElementType: writer(schema.deleteLocalElementType),
}

/** Export/import the whole database as a file — global settings portability. */
export function exportDatabase() {
  return conn ? conn.export() : new Uint8Array()
}

export async function importDatabase(bytes) {
  await idbSet(DB_KEY, new Uint8Array(bytes))
  conn = null                 // force a reopen from the restored blob
  return openDatabase()
}
