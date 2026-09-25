/**
 * backend.js — what used to be Flask.
 *
 * The three live routes (`/detect-files`, `/import`, `/read-sheet`) were all
 * read-only xlsx parsing, so they now run in the browser against the project's
 * File System Access directory handle. There is no server.
 *
 * SheetJS is imported dynamically so it stays out of the initial page load.
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

const xlsxModule = () => import('../platform/xlsx')

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

  const { detectFiles: classify } = await xlsxModule()
  const entries = await fsx.listXlsx(dir)
  const files = []
  for (const e of entries) files.push({ name: e.name, data: await fsx.readFileHandle(e.handle) })
  return classify(files)
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
  const { parseDb, parsePs, parseRs, mergeDbs } = await xlsxModule()

  const dbNames = (Array.isArray(db) ? db : [db]).filter(Boolean)
  if (dbNames.length === 0) throw new Error("db: 'DesignDB' not found in the project folder")

  const [dbBytes, psBytes, rsBytes] = await Promise.all([
    Promise.all(dbNames.map(n => fsx.readFileNamed(dir, n))),
    fsx.readFileNamed(dir, ps), fsx.readFileNamed(dir, rs),
  ])
  const absent = dbNames.filter((_, i) => !dbBytes[i])
  if (absent.length) throw new Error(`db: '${absent.join("', '")}' not found in the project folder`)

  const missing = [['ps', psBytes], ['rs', rsBytes]].filter(([, bytes]) => !bytes).map(([l]) => l)

  const parsed = dbNames.map((name, i) => ({ name, data: parseDb(dbBytes[i]) }))
  return {
    db: mergeDbs(parsed),
    ps: psBytes ? parsePs(psBytes) : [],
    rs: rsBytes ? parseRs(rsBytes) : [],
    missing,
  }
}

/** Read one sheet of an arbitrary workbook picked via `openXlsxDialog`. */
export async function readSheet(fileToken, sheet) {
  const handle = fileTokens.get(fileToken)
  if (!handle) throw new Error('That spreadsheet is no longer open — pick it again.')
  const { readSheet: read } = await xlsxModule()
  return read(await fsx.readFileHandle(handle), sheet || null)
}
