/**
 * fs.js — project-folder access via the File System Access API.
 *
 * Replaces Electron's dialogs, chokidar watcher and snapshot copies. Chromium
 * only: `showDirectoryPicker` does not exist in Firefox or Safari.
 *
 * Directory handles are structured-cloneable, so they persist in IndexedDB and a
 * project can be reopened without re-picking. **Permission does not persist** —
 * on reload the user must re-grant with a gesture (`ensurePermission`).
 *
 * THE FORMS ARE READ-ONLY. The DesignDB, Product Spec and Recipes Spec workbooks
 * are never modified by this tool — updates leave as Office Scripts patches the
 * user runs themselves. That invariant is enforced twice, not merely documented:
 *
 *   1. The folder is granted in `mode: 'read'`. The browser itself rejects any
 *      write. Escalating means calling `ensureWritePermission`, which only the
 *      snapshot and config-yaml paths do — from a click, because escalation
 *      needs a user gesture.
 *   2. `writeFile` refuses to write a workbook unless the caller passes
 *      `allowWorkbook`, which only `snapshot` does (into `snapshot/<date>/`,
 *      never the project root). So even a write-granted folder cannot lose a form.
 *
 * So a bug in a caller cannot silently overwrite a form: it has to get past a
 * permission the app never asked for and a guard it never opted out of.
 */

import { idbGet, idbSet, idbDel } from './idb'

const HANDLE_KEY = 'project-dirs'   // { [projectKey]: { handle, name } }

export const isSupported = () =>
  typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'

function assertSupported() {
  if (!isSupported()) {
    throw new Error(
      'This browser cannot open a project folder. The File System Access API is required — use Chrome or Edge.'
    )
  }
}

// --- handles ----------------------------------------------------------------

/**
 * A browser never exposes an absolute path, so a project is keyed by a stable
 * generated id stored alongside its handle. `handle.name` is display only.
 */
const newProjectKey = () => `dir_${crypto.randomUUID()}`

export async function pickDirectory() {
  assertSupported()
  // 'read' — the forms are never written. Snapshotting escalates on demand.
  const handle = await window.showDirectoryPicker({ id: 'recipe-builder-project', mode: 'read' })
  const key = newProjectKey()
  const all = (await idbGet(HANDLE_KEY)) || {}
  all[key] = { handle, name: handle.name }
  await idbSet(HANDLE_KEY, all)
  return { key, handle, name: handle.name }
}

export async function listDirectories() {
  const all = (await idbGet(HANDLE_KEY)) || {}
  return Object.entries(all).map(([key, v]) => ({ key, name: v.name }))
}

export async function getDirectory(key) {
  const all = (await idbGet(HANDLE_KEY)) || {}
  return all[key]?.handle || null
}

export async function forgetDirectory(key) {
  const all = (await idbGet(HANDLE_KEY)) || {}
  delete all[key]
  await idbSet(HANDLE_KEY, all)
}

export async function clearDirectories() { await idbDel(HANDLE_KEY) }

/**
 * Re-grant access after a reload. Must be called from a user gesture, otherwise
 * `requestPermission` rejects. Returns true when usable.
 */
export async function ensurePermission(handle, mode = 'read') {
  if (!handle) return false
  const opts = { mode }
  if ((await handle.queryPermission(opts)) === 'granted') return true
  return (await handle.requestPermission(opts)) === 'granted'
}

/**
 * Escalate a read-only folder to writable. Only the snapshot path needs this, and
 * it too must run from a user gesture. Kept separate from `ensurePermission` so
 * that asking for write is always a deliberate, greppable act.
 */
export const ensureWritePermission = handle => ensurePermission(handle, 'readwrite')

// --- reading ----------------------------------------------------------------

/** Every .xlsx directly inside the folder: [{ name, handle }]. */
export async function listXlsx(dirHandle) {
  const out = []
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === 'file' && name.toLowerCase().endsWith('.xlsx') && !name.startsWith('~$')) {
      out.push({ name, handle })
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

export async function readFileHandle(fileHandle) {
  const file = await fileHandle.getFile()
  return new Uint8Array(await file.arrayBuffer())
}

/** Read one named file from the folder; null when absent. */
export async function readFileNamed(dirHandle, name) {
  try {
    return await readFileHandle(await dirHandle.getFileHandle(name))
  } catch {
    return null
  }
}

export async function lastModified(dirHandle, name) {
  try {
    return (await (await dirHandle.getFileHandle(name)).getFile()).lastModified
  } catch {
    return null
  }
}

/** Pick a single spreadsheet (the product-code import). */
export async function pickXlsxFile() {
  assertSupported()
  const [handle] = await window.showOpenFilePicker({
    types: [{ description: 'Excel', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx', '.xlsm'] } }],
    multiple: false,
  })
  return handle ? { name: handle.name, handle } : null
}

// --- writing ----------------------------------------------------------------

const isWorkbook = name => /\.(xlsx|xlsm)$/i.test(String(name || ''))

/**
 * `allowWorkbook` is the opt-out, and only `snapshot` takes it — a snapshot copies
 * workbooks into `snapshot/<date>/`, which is the one legitimate workbook write.
 * Everything else (config yaml) is refused outright, so no future caller can reach
 * a form by accident.
 */
export async function writeFile(dirHandle, name, contents, { allowWorkbook = false } = {}) {
  if (isWorkbook(name) && !allowWorkbook) {
    throw new Error(`Refusing to write "${name}": the design workbooks are read-only. Export a patch script instead.`)
  }
  const fileHandle = await dirHandle.getFileHandle(name, { create: true })
  const w = await fileHandle.createWritable()
  await w.write(contents)
  await w.close()
}

/** mkdir -p, relative to a directory handle. */
async function ensureDir(dirHandle, segments) {
  let cur = dirHandle
  for (const s of segments) cur = await cur.getDirectoryHandle(s, { create: true })
  return cur
}

async function dirExists(dirHandle, name) {
  try { await dirHandle.getDirectoryHandle(name); return true } catch { return false }
}

/**
 * Copy the project files into `<folder>/snapshot/<date>/`, matching Electron's
 * behaviour (a same-day snapshot gets a time suffix rather than overwriting).
 * `overlay` is written beside them when provided.
 *
 * The only writer of workbooks, and the only caller that needs write permission.
 * It escalates the folder grant here, so it must be reached from a user gesture.
 * Sources are read from `dirHandle`; nothing in the project root is ever touched.
 */
export async function snapshot(dirHandle, files, overlay) {
  if (!(await ensureWritePermission(dirHandle))) {
    throw new Error('Write access to the project folder was declined, so no snapshot was taken.')
  }
  const dateStr = new Date().toISOString().slice(0, 10)
  const snapRoot = await ensureDir(dirHandle, ['snapshot'])

  let leaf = dateStr
  if (await dirExists(snapRoot, dateStr)) {
    leaf = `${dateStr}_${new Date().toTimeString().slice(0, 8).replace(/:/g, '')}`
  }
  const target = await snapRoot.getDirectoryHandle(leaf, { create: true })

  const copied = []
  for (const name of files || []) {
    if (!name) continue
    const bytes = await readFileNamed(dirHandle, name)
    if (!bytes) continue
    await writeFile(target, name, bytes, { allowWorkbook: true })   // a copy, inside snapshot/
    copied.push(name)
  }
  if (overlay?.name && overlay.contents != null) await writeFile(target, overlay.name, overlay.contents)

  return { ok: true, dir: `snapshot/${leaf}`, copied }
}

/** Newest snapshot's mtime, or null. Used to decide whether to nag on export. */
export async function lastSnapshotTime(dirHandle) {
  if (!(await dirExists(dirHandle, 'snapshot'))) return null
  const root = await dirHandle.getDirectoryHandle('snapshot')
  let newest = null
  for await (const [, child] of root.entries()) {
    if (child.kind !== 'directory') continue
    for await (const [, f] of child.entries()) {
      if (f.kind !== 'file') continue
      const t = (await f.getFile()).lastModified
      if (newest === null || t > newest) newest = t
    }
  }
  return newest
}

// --- watching ---------------------------------------------------------------

let watchTimer = null

/**
 * Poll `lastModified` on the PS/RS files. Not fs events — a ~3s latency, and
 * renames/deletes are not distinguished. Emits the same `{ file, path }` payload
 * the Electron watcher sent, so `FileWatchBanner` is unchanged.
 */
export function startWatcher(dirHandle, { psFilename, rsFilename }, onChange) {
  stopWatcher()
  const seen = new Map()

  const tick = async () => {
    for (const [file, name] of [['ps', psFilename], ['rs', rsFilename]]) {
      if (!name) continue
      const t = await lastModified(dirHandle, name)
      if (t === null) continue
      const prev = seen.get(name)
      seen.set(name, t)
      if (prev !== undefined && t !== prev) onChange({ file, path: name })
    }
  }
  tick()                                   // prime, so the first poll never fires
  watchTimer = setInterval(tick, 3000)
}

export function stopWatcher() {
  if (watchTimer) { clearInterval(watchTimer); watchTimer = null }
}

/** Suppress is a no-op: our own writes never touch the watched xlsx files. */
export function suppressWatcher() {}

// --- downloads (fallback when no folder handle is in play) -------------------

export function download(filename, contents, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Prompt for a save location, falling back to a plain download. */
export async function saveAs(filename, contents, description = 'File', accept = { 'text/plain': ['.txt'] }) {
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: filename, types: [{ description, accept }] })
      const w = await handle.createWritable()
      await w.write(contents)
      await w.close()
      return { ok: true, path: handle.name }
    } catch (err) {
      if (err?.name === 'AbortError') return { ok: false, canceled: true }
    }
  }
  download(filename, contents)
  return { ok: true, path: filename }
}

/** Open a single file of any type and return its text. */
export async function openTextFile(description, accept) {
  if (typeof window.showOpenFilePicker !== 'function') return { ok: false, canceled: true }
  try {
    const [handle] = await window.showOpenFilePicker({ types: [{ description, accept }], multiple: false })
    if (!handle) return { ok: false, canceled: true }
    return { ok: true, path: handle.name, text: await (await handle.getFile()).text() }
  } catch (err) {
    if (err?.name === 'AbortError') return { ok: false, canceled: true }
    throw err
  }
}
