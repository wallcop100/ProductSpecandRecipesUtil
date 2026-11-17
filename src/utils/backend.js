/**
 * backend.js — what used to be Flask.
 *
 * The three live routes (`/detect-files`, `/import`, `/read-sheet`) were all
 * read-only xlsx parsing, so they now run in the browser against the project's
 * File System Access directory handle. There is no server.
 *
 * SheetJS runs in a worker (or is imported dynamically where there's none), so it stays
 * out of the initial page load and off the main thread.
 *
 * Identity note: a browser never exposes an absolute path. `folderKey` is the
 * opaque id of a persisted directory handle, and `paths` hold plain FILENAMES
 * resolved inside that directory.
 */

import * as fsx from '../platform/fs'

let activeKey = null
let activeDir = null

/** File handles picked ad hoc (the product-code import), addressed by token. */
const fileTokens = new Map()

// --- xlsx parsing, in a worker ------------------------------------------------
// A big workbook takes seconds to parse; on the main thread that froze the tab. Where
// there is no Worker (tests), the parsers run inline.
let worker = null
let inlineXlsx = null
let seq = 0
const pending = new Map()

function getWorker() {
  if (worker === null && typeof Worker !== 'undefined') {
    worker = new Worker(new URL('../platform/xlsx.worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data: { id, result, error } }) => {
      const p = pending.get(id)
      pending.delete(id)
      if (error) p.reject(new Error(error)); else p.resolve(result)
      setParsing(-1)
    }
    worker.onerror = e => {   // a worker that failed to load: fail what's waiting, retry inline
      for (const p of pending.values()) p.reject(new Error(e.message || 'Spreadsheet reader failed to start'))
      setParsing(-pending.size); pending.clear(); worker = false
    }
  }
  return worker || null
}

/** Run `fn` from platform/xlsx.js on `args`, off the main thread when possible. */
async function xlsxCall(fn, ...args) {
  const w = getWorker()
  if (!w) {
    setParsing(1)
    try { return (await (inlineXlsx ||= import('../platform/xlsx')))[fn](...args) } finally { setParsing(-1) }
  }
  const id = ++seq
  setParsing(1)
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); w.postMessage({ id, fn, args }) })
}

// How many parses are in flight, for the loading bar (components/ParsingBar.jsx).
let parsing = 0
const parsingListeners = new Set()
function setParsing(delta) { parsing += delta; parsingListeners.forEach(l => l()) }
export const parsingCount = () => parsing
export function onParsing(listener) { parsingListeners.add(listener); return () => parsingListeners.delete(listener) }

export async function setActiveDirectory(folderKey) {
  if (folderKey && folderKey === activeKey && activeDir) return activeDir
  activeDir = await fsx.getDirectory(folderKey)
  activeKey = folderKey
  return activeDir
}

export const getActiveDirectory = () => activeDir

function requireDir() {
  if (!activeDir) throw new Error('No project folder is open.')
  return activeDir
}

/** The file handle behind a token (null when unknown). */
export const handleOf = token => fileTokens.get(token) || null

/** Register a picked file so it can be referenced by an opaque token. */
export function registerFile(handle) {
  const token = `file_${crypto.randomUUID()}`
  fileTokens.set(token, handle)
  return token
}

/**
 * Identity of a picked workbook: `{ name, lastModified }`, or null once the token
 * is stale. The token is opaque by design, but the Form's captures need to record
 * WHICH sheet they came from — otherwise a pane built from them can't say so, and
 * a re-import can't tell you the file even changed.
 */
export async function fileMeta(fileToken) {
  const handle = fileTokens.get(fileToken)
  if (!handle) return null
  try {
    const file = await handle.getFile()
    return { name: handle.name, lastModified: file.lastModified }
  } catch {
    return null   // permission lapsed or the file moved
  }
}

// --- the three former routes -------------------------------------------------

/** Classify every xlsx in the project folder. → { db, dbs, ps, rs, all_xlsx } */
export async function detectFiles(folderKey) {
  const dir = folderKey ? await setActiveDirectory(folderKey) : requireDir()
  if (!dir) throw new Error('That project folder is no longer available.')

  const entries = await fsx.listXlsx(dir)
  const files = []
  for (const e of entries) files.push({ name: e.name, data: await fsx.readFileHandle(e.handle) })
  return xlsxCall('detectFiles', files)
}

/**
 * Parse the project workbooks. `paths` are filenames.
 *
 * `db` is one DesignDB filename or an array of them. Several DBs (one project split
 * across buildings) are merged into one view — see mergeDbs — and all of them are
 * required: a config that silently opened with one house missing would call that
 * house's positions dead.
 *
 * Only the DesignDB is required: it is the sole source of PositionTypes and of the
 * ExtRef convention (C01 → C01r), so nothing can be resolved without it. A new
 * project legitimately has no Product Spec and no Recipes Spec yet — those start
 * empty and are filled by patch scripts pasted into the fixed-schema workbook at
 * export. `missing` names which, so the caller can say "will be created" rather
 * than "not found".
 */
export async function importFiles({ db, ps, rs }) {
  const dir = requireDir()

  const dbNames = (Array.isArray(db) ? db : [db]).filter(Boolean)
  if (dbNames.length === 0) throw new Error("db: 'DesignDB' not found in the project folder")

  const [dbBytes, psBytes, rsBytes] = await Promise.all([
    Promise.all(dbNames.map(n => fsx.readFileNamed(dir, n))),
    fsx.readFileNamed(dir, ps), fsx.readFileNamed(dir, rs),
  ])
  const absent = dbNames.filter((_, i) => !dbBytes[i])
  if (absent.length) throw new Error(`db: '${absent.join("', '")}' not found in the project folder`)

  const missing = [['ps', psBytes], ['rs', rsBytes]].filter(([, bytes]) => !bytes).map(([l]) => l)

  const parsed = await Promise.all(dbNames.map(async (name, i) => ({ name, data: await xlsxCall('parseDb', dbBytes[i]) })))
  return {
    db: await xlsxCall('mergeDbs', parsed),
    ps: psBytes ? await xlsxCall('parsePs', psBytes) : [],
    rs: rsBytes ? await xlsxCall('parseRs', rsBytes) : [],
    missing,
  }
}

/** Read one sheet of an arbitrary workbook picked via `openXlsxDialog`. */
export async function readSheet(fileToken, sheet, want = null) {
  const handle = fileTokens.get(fileToken)
  if (!handle) throw new Error('That spreadsheet is no longer open — pick it again.')
  return xlsxCall('readSheet', await fsx.readFileHandle(handle), sheet || null, want)
}
