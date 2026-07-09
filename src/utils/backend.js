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

// --- the three former routes -------------------------------------------------

/** Classify every xlsx in the project folder. → { db, ps, rs, all_xlsx } */
export async function detectFiles(folderKey) {
  const dir = folderKey ? await setActiveDirectory(folderKey) : requireDir()
  if (!dir) throw new Error('That project folder is no longer available.')

  const { detectFiles: classify } = await xlsxModule()
  const entries = await fsx.listXlsx(dir)
  const files = []
  for (const e of entries) files.push({ name: e.name, data: await fsx.readFileHandle(e.handle) })
  return classify(files)
}

/** Parse the three project workbooks. `paths` are filenames. */
export async function importFiles({ db, ps, rs }) {
  const dir = requireDir()
  const { parseDb, parsePs, parseRs } = await xlsxModule()

  const [dbBytes, psBytes, rsBytes] = await Promise.all([
    fsx.readFileNamed(dir, db), fsx.readFileNamed(dir, ps), fsx.readFileNamed(dir, rs),
  ])
  const missing = [['db', db, dbBytes], ['ps', ps, psBytes], ['rs', rs, rsBytes]]
    .filter(([, , bytes]) => !bytes)
    .map(([label, name]) => `${label}: '${name}' not found in the project folder`)
  if (missing.length) throw new Error(missing.join('; '))

  return { db: parseDb(dbBytes), ps: parsePs(psBytes), rs: parseRs(rsBytes) }
}

/** Read one sheet of an arbitrary workbook picked via `openXlsxDialog`. */
export async function readSheet(fileToken, sheet) {
  const handle = fileTokens.get(fileToken)
  if (!handle) throw new Error('That spreadsheet is no longer open — pick it again.')
  const { readSheet: read } = await xlsxModule()
  return read(await fsx.readFileHandle(handle), sheet || null)
}
