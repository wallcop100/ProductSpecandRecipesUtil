'use strict'

const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron')
const path = require('path')
const fs = require('fs')
const yaml = require('js-yaml')
const { spawn } = require('child_process')
const http = require('http')
const chokidar = require('chokidar')
const { autoUpdater } = require('electron-updater')
const log = require('electron-log')
const db = require('./db')

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FLASK_PORT = 5001
const FLASK_TIMEOUT_MS = 10000
const AUTO_UPDATE_CHECK_INTERVAL_MS = 1000 * 60 * 60 // 1 hour
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let mainWindow = null
let flaskProcess = null
let watcher = null
let flaskReady = false

// ---------------------------------------------------------------------------
// Flask management
// ---------------------------------------------------------------------------

function pingFlask() {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${FLASK_PORT}/ping`, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 300)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(500, () => { req.destroy(); resolve(false) })
  })
}

function spawnPython(pythonCmd, scriptPath) {
  return new Promise((resolve) => {
    const proc = spawn(pythonCmd, [scriptPath], { env: { ...process.env } })
    // If the command doesn't exist, 'error' fires before any data
    proc.once('error', () => resolve(null))
    // Give it a moment; if no error, assume the process launched
    setTimeout(() => resolve(proc), 400)
  })
}

async function startFlask() {
  let proc

  if (isDev) {
    const scriptPath = path.join(__dirname, '..', 'backend', 'app.py')
    const candidates = ['python', 'python3', 'py']
    for (const cmd of candidates) {
      proc = await spawnPython(cmd, scriptPath)
      if (proc) break
      log.warn(`[Flask] '${cmd}' not found, trying next`)
    }
    if (!proc) throw new Error('Python not found. Install Python 3 to run in dev mode.')
  } else {
    const exeName = process.platform === 'win32' ? 'backend-server.exe' : 'backend-server'
    const exePath = path.join(process.resourcesPath, exeName)
    proc = spawn(exePath, [], { env: { ...process.env } })
  }

  proc.stdout.on('data', (data) => log.info('[Flask]', data.toString()))
  proc.stderr.on('data', (data) => log.warn('[Flask stderr]', data.toString()))
  proc.on('exit', (code) => log.info('[Flask] exited with code', code))
  proc.on('error', (err) => log.error('[Flask] process error:', err))
  flaskProcess = proc

  // Poll /ping until ready (max FLASK_TIMEOUT_MS)
  const deadline = Date.now() + FLASK_TIMEOUT_MS
  while (Date.now() < deadline) {
    const ok = await pingFlask()
    if (ok) return true
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error('Flask failed to start within timeout')
}

// ---------------------------------------------------------------------------
// Application menu (adds a Debug toggle that overlays UI element code IDs)
// ---------------------------------------------------------------------------

function buildAppMenu() {
  const template = [
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    {
      label: 'Debug',
      submenu: [
        {
          id: 'debug-show-ids',
          label: 'Show UI element IDs',
          type: 'checkbox',
          checked: false,
          accelerator: 'CmdOrCtrl+Shift+D',
          click: (item) => {
            if (mainWindow) mainWindow.webContents.send('debug-toggle', item.checked)
          },
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ---------------------------------------------------------------------------
// BrowserWindow
// ---------------------------------------------------------------------------

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173') // Vite dev server
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('flask-status', { ready: flaskReady })
  })

  mainWindow.on('closed', () => { mainWindow = null })

  buildAppMenu()
}

// ---------------------------------------------------------------------------
// Chokidar file watcher
// ---------------------------------------------------------------------------

// Paths the app is about to write itself → the watcher must ignore the change
// event that our own export produces (otherwise every export prompts a bogus
// "the file changed on disk, discard your changes?"). Keyed by normalised path.
const selfWriteUntil = new Map()

function normPath(p) {
  return path.normalize(p).toLowerCase()
}

function suppressWatcher(paths, ms = 8000) {
  const until = Date.now() + ms
  for (const p of (paths || [])) {
    if (p) selfWriteUntil.set(normPath(p), until)
  }
}

function startWatcher(folderPath, psFilename, rsFilename) {
  if (watcher) watcher.close()

  const filesToWatch = [
    psFilename ? path.join(folderPath, psFilename) : null,
    rsFilename ? path.join(folderPath, rsFilename) : null,
  ].filter(Boolean)

  if (!filesToWatch.length) return

  watcher = chokidar.watch(filesToWatch, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
  })

  watcher.on('change', (filePath) => {
    // Skip changes the app itself just wrote (export/snapshot).
    const key = normPath(filePath)
    const until = selfWriteUntil.get(key)
    if (until && Date.now() < until) {
      selfWriteUntil.delete(key)
      return
    }
    const filename = path.basename(filePath)
    const file = filename === psFilename ? 'ps' : 'rs'
    if (mainWindow) {
      mainWindow.webContents.send('file-changed', { file, path: filePath })
    }
  })
}

function stopWatcher() {
  if (watcher) { watcher.close(); watcher = null }
}

// ---------------------------------------------------------------------------
// Auto-updater
// ---------------------------------------------------------------------------

function initAutoUpdater() {
  if (isDev) {
    // Dev has no update feed; the manual "Check for updates" simulates a result.
    return
  }

  autoUpdater.logger = log
  autoUpdater.logger.transports.file.level = 'info'
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.autoDownload = true

  setTimeout(() => autoUpdater.checkForUpdates(), 3000)
  setInterval(() => autoUpdater.checkForUpdates(), AUTO_UPDATE_CHECK_INTERVAL_MS)

  const send = (payload) => { if (mainWindow) mainWindow.webContents.send('update-status', payload) }

  autoUpdater.on('checking-for-update', () => send({ status: 'checking' }))

  autoUpdater.on('update-not-available', () => send({ status: 'none', version: app.getVersion() }))

  autoUpdater.on('update-available', (info) => {
    send({ status: 'available', version: info.version, releaseNotes: info.releaseNotes })
  })

  autoUpdater.on('download-progress', (progress) => {
    if (mainWindow) {
      mainWindow.webContents.send('update-status', {
        status: 'downloading',
        percent: Math.round(progress.percent),
      })
    }
  })

  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow) {
      mainWindow.webContents.send('update-status', {
        status: 'ready',
        version: info.version,
        releaseNotes: info.releaseNotes,
      })
    }
  })

  autoUpdater.on('error', (err) => {
    log.error('Auto-updater error:', err)
  })
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

// File dialogs
ipcMain.handle('open-folder-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  })
  return result.canceled ? null : result.filePaths[0]
})

// Watcher control
ipcMain.handle('start-watcher', (event, { folderPath, psFilename, rsFilename }) => {
  startWatcher(folderPath, psFilename, rsFilename)
})
ipcMain.handle('stop-watcher', () => stopWatcher())
ipcMain.handle('suppress-watcher', (event, { files, ms }) => suppressWatcher(files, ms))

// SQLite — Projects
ipcMain.handle('db-upsert-project', (event, { folderPath, configName, projectNumber, projectLabel, dbFilename, psFilename, rsFilename }) =>
  db.upsertProject(folderPath, configName, projectNumber, projectLabel, dbFilename, psFilename, rsFilename))
ipcMain.handle('db-get-project', (event, { folderPath, configName }) => db.getProject(folderPath, configName))
ipcMain.handle('db-get-configs-for-folder', (event, { folderPath }) => db.getConfigsForFolder(folderPath))
ipcMain.handle('db-get-all-projects', () => db.getAllProjects())
ipcMain.handle('db-delete-project', (event, { projectId }) => db.deleteProject(projectId))
ipcMain.handle('db-get-last-project', () => db.getLastProject())

// Config YAML export / import
ipcMain.handle('config-export-yaml', async (event, { projectId, defaultName }) => {
  const data = db.collectConfigData(projectId)
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export project config',
    defaultPath: `${defaultName || 'project-config'}.yaml`,
    filters: [{ name: 'YAML', extensions: ['yaml', 'yml'] }],
  })
  if (result.canceled || !result.filePath) return { ok: false, canceled: true }
  fs.writeFileSync(result.filePath, yaml.dump(data, { noRefs: true }), 'utf8')
  return { ok: true, path: result.filePath }
})

ipcMain.handle('config-import-yaml', async (event, { projectId }) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import project config',
    properties: ['openFile'],
    filters: [{ name: 'YAML', extensions: ['yaml', 'yml'] }],
  })
  if (result.canceled || !result.filePaths?.[0]) return { ok: false, canceled: true }
  const raw = fs.readFileSync(result.filePaths[0], 'utf8')
  const data = yaml.load(raw) || {}
  if (data.version !== 1) {
    return { ok: false, error: `Unsupported config file version: ${data.version ?? 'none'}` }
  }
  db.applyConfigData(projectId, data)
  return { ok: true, path: result.filePaths[0] }
})

// Silent overlay write (no dialog) — auto-snapshot beside the Excels on export
ipcMain.handle('config-write-yaml', async (event, { projectId, filePath }) => {
  const data = db.collectConfigData(projectId)
  fs.writeFileSync(filePath, yaml.dump(data, { noRefs: true }), 'utf8')
  return { ok: true, path: filePath }
})

// Project snapshot (EXPORT_PLAN §6): copy the project files + config overlay
// into <folder>/snapshot/<date>/ . Plain file copies, user's discretion.
ipcMain.handle('snapshot-project', async (event, { folderPath, files, projectId, configName }) => {
  try {
    if (!folderPath) return { ok: false, error: 'No project folder is open.' }
    const dateStr = new Date().toISOString().slice(0, 10)
    let dir = path.join(folderPath, 'snapshot', dateStr)
    if (fs.existsSync(dir)) {
      const t = new Date().toTimeString().slice(0, 8).replace(/:/g, '')
      dir = path.join(folderPath, 'snapshot', `${dateStr}_${t}`)
    }
    fs.mkdirSync(dir, { recursive: true })
    const copied = []
    for (const f of (files || [])) {
      if (!f) continue
      const src = path.join(folderPath, f)
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(dir, f))
        copied.push(f)
      }
    }
    if (projectId != null) {
      try {
        const data = db.collectConfigData(projectId)
        fs.writeFileSync(
          path.join(dir, `${configName || 'config'}.ideaworks.yaml`),
          yaml.dump(data, { noRefs: true }), 'utf8'
        )
      } catch (err) {
        log.warn('[snapshot] overlay write failed:', err.message)
      }
    }
    return { ok: true, dir, copied }
  } catch (err) {
    log.warn('[snapshot] failed:', err.message)
    return { ok: false, error: err.message }
  }
})

// Newest snapshot folder's mtime (ms) — drives the "snapshot is stale?" check.
ipcMain.handle('last-snapshot-time', (event, { folderPath }) => {
  try {
    const dir = path.join(folderPath, 'snapshot')
    if (!fs.existsSync(dir)) return null
    let newest = 0
    for (const name of fs.readdirSync(dir)) {
      const st = fs.statSync(path.join(dir, name))
      if (st.isDirectory() && st.mtimeMs > newest) newest = st.mtimeMs
    }
    return newest || null
  } catch {
    return null
  }
})

// Personal library (favorites + global templates) export / import
ipcMain.handle('library-export-yaml', async () => {
  const data = db.collectLibraryData()
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Export my library',
    defaultPath: 'my-library.yaml',
    filters: [{ name: 'YAML', extensions: ['yaml', 'yml'] }],
  })
  if (result.canceled || !result.filePath) return { ok: false, canceled: true }
  fs.writeFileSync(result.filePath, yaml.dump(data, { noRefs: true }), 'utf8')
  return { ok: true, path: result.filePath }
})

ipcMain.handle('library-import-yaml', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Import a library',
    properties: ['openFile'],
    filters: [{ name: 'YAML', extensions: ['yaml', 'yml'] }],
  })
  if (result.canceled || !result.filePaths?.[0]) return { ok: false, canceled: true }
  const raw = fs.readFileSync(result.filePaths[0], 'utf8')
  const data = yaml.load(raw) || {}
  try {
    const report = db.applyLibraryData(data)
    return { ok: true, path: result.filePaths[0], ...report }
  } catch (err) {
    return { ok: false, error: err.message }
  }
})

// SQLite — Pending changes (crash-safe dirty registry)
ipcMain.handle('db-get-pending-changes', (event, { projectId }) => db.getPendingChanges(projectId))
ipcMain.handle('db-set-pending-changes', (event, { projectId, ps, rs }) => db.setPendingChanges(projectId, ps, rs))
ipcMain.handle('db-clear-pending-changes', (event, { projectId }) => db.clearPendingChanges(projectId))

// SQLite — Local ElementTypes (app-created catalogue entries)
ipcMain.handle('db-upsert-local-et', (event, { projectId, et }) => db.upsertLocalElementType(projectId, et))
ipcMain.handle('db-get-local-ets', (event, { projectId }) => db.getLocalElementTypes(projectId))
ipcMain.handle('db-rename-local-et', (event, { projectId, oldRef, newRef }) => db.renameLocalElementType(projectId, oldRef, newRef))
ipcMain.handle('db-delete-local-et', (event, { projectId, ref }) => db.deleteLocalElementType(projectId, ref))

// SQLite — Position UI
ipcMain.handle('db-upsert-position-ui', (event, { projectId, positionTypeRef, data }) =>
  db.upsertPositionUI(projectId, positionTypeRef, data))
ipcMain.handle('db-get-all-position-ui', (event, { projectId }) =>
  db.getAllPositionUI(projectId))

// SQLite — Templates
ipcMain.handle('db-upsert-template', (event, { template }) => db.upsertTemplate(template))
ipcMain.handle('db-get-all-templates', (event, { projectId }) => db.getAllTemplates(projectId))
ipcMain.handle('db-delete-template', (event, { id }) => db.deleteTemplate(id))

// SQLite — Slot mappings
ipcMain.handle('db-upsert-slot-mapping', (event, { projectId, templateId, slotKey, entityRef }) =>
  db.upsertSlotMapping(projectId, templateId, slotKey, entityRef))
ipcMain.handle('db-get-slot-mappings', (event, { projectId, templateId }) =>
  db.getSlotMappings(projectId, templateId))
ipcMain.handle('db-get-all-slot-mappings', (event, { projectId }) =>
  db.getAllSlotMappings(projectId))
ipcMain.handle('db-delete-slot-mapping', (event, { projectId, templateId, slotKey }) =>
  db.deleteSlotMapping(projectId, templateId, slotKey))

// SQLite — Prefs
ipcMain.handle('db-set-pref', (event, { projectId, key, value }) =>
  db.setPref(projectId, key, value))
ipcMain.handle('db-get-pref', (event, { projectId, key }) =>
  db.getPref(projectId, key))

// SQLite — ET Collections
ipcMain.handle('db-upsert-collection', (event, { projectId, collection }) =>
  db.upsertCollection(projectId, collection))
ipcMain.handle('db-get-all-collections', (event, { projectId }) =>
  db.getAllCollections(projectId))
ipcMain.handle('db-delete-collection', (event, { collectionId }) =>
  db.deleteCollection(collectionId))

// SQLite — Favourites (cross-project user library)
ipcMain.handle('db-upsert-favorite', (event, { favorite }) => db.upsertFavorite(favorite))
ipcMain.handle('db-get-favorites', () => db.getFavorites())
ipcMain.handle('db-delete-favorite', (event, { id }) => db.deleteFavorite(id))

// Default tag palette + rules (bundled YAML, seeded into new configs)
ipcMain.handle('get-default-tags', () => {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'default-tags.yaml'), 'utf8')
    const data = yaml.load(raw) || {}
    return { palette: data.palette || [], rules: data.rules || [] }
  } catch (err) {
    log.warn('[tags] could not read default-tags.yaml:', err.message)
    return { palette: [], rules: [] }
  }
})

// App info
ipcMain.handle('get-app-version', () => app.getVersion())

// Auto-updater
ipcMain.handle('check-for-updates', () => {
  // Immediate feedback; real events follow in prod.
  if (mainWindow) mainWindow.webContents.send('update-status', { status: 'checking' })
  if (!isDev) {
    autoUpdater.checkForUpdates()
  } else {
    // Dev: no feed configured — simulate an "up to date" result.
    setTimeout(() => {
      if (mainWindow) mainWindow.webContents.send('update-status', { status: 'none', version: app.getVersion() })
    }, 800)
  }
})
ipcMain.handle('install-update', () => {
  if (!isDev) autoUpdater.quitAndInstall(false, true)
})

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  const dbPath = path.join(app.getPath('userData'), 'recipe-builder.db')
  db.initDb(dbPath)
  db.seedGlobalTemplates()

  try {
    await startFlask()
    flaskReady = true
    log.info('Flask started successfully')
  } catch (err) {
    log.error('Flask failed to start:', err)
    // Continue anyway — renderer will receive flask-status { ready: false }
  }

  createWindow()
  initAutoUpdater()

  // Resume last project's watcher
  const lastProject = db.getLastProject()
  if (lastProject && lastProject.folder_path && lastProject.ps_filename && lastProject.rs_filename) {
    startWatcher(lastProject.folder_path, lastProject.ps_filename, lastProject.rs_filename)
  }
})

app.on('window-all-closed', () => {
  stopWatcher()
  if (flaskProcess) flaskProcess.kill()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
