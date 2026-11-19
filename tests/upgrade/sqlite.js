// The project database as the browser build keeps it: sql.js running THIS tree's dbSchema.js.
// Copied into the prod tree by scripts/upgrade-check.sh, so on that side it is prod's schema.
import initSqlJs from 'sql.js'
import path from 'node:path'
import { wrapSqlJs } from '../../src/platform/sqlShim.js'
import * as schema from '../../src/platform/dbSchema.js'

// api.js's names that differ from dbSchema's (keep in step with src/platform/api.js)
const ALIAS = { upsertLocalET: 'upsertLocalElementType', deleteLocalET: 'deleteLocalElementType', renameLocalET: 'renameLocalElementType', getLocalETs: 'getLocalElementTypes' }

export async function openSqlite(bytes) {
  const SQL = await initSqlJs({ locateFile: f => path.resolve('node_modules/sql.js/dist', f) })
  const raw = bytes ? new SQL.Database(bytes) : new SQL.Database()
  return { raw, conn: wrapSqlJs(raw), schema }
}

// window.electronAPI.db over the real schema. A call the store makes that the schema lacks fails
// loudly, so a silent no-op can never pass for "saved".
export const dbApiOver = schema => new Proxy({}, {
  get: (_, name) => async (...a) => {
    const fn = schema[ALIAS[name] || name]
    if (typeof fn !== 'function') throw new Error(`electronAPI.db.${String(name)}: not in dbSchema`)
    return JSON.parse(JSON.stringify(fn(...a) ?? null))
  },
})

// Every row of every table, keyed by table name, read with plain SQL (no app code involved).
export function dumpTables(raw) {
  const out = {}
  const [t] = raw.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
  for (const [name] of t?.values || []) {
    const [r] = raw.exec(`SELECT * FROM "${name}"`)
    out[name] = r ? r.values.map(v => Object.fromEntries(r.columns.map((c, i) => [c, v[i]]))) : []
  }
  return out
}
