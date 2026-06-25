'use strict'

const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
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

async function startFlask() {
  const scriptPath = isDev
    ? path.join(__dirname, '..', 'backend', 'app.py')
    : path.join(process.resourcesPath, 'backend', 'app.py')

  flaskProcess = spawn('python', [scriptPath], {
    env: { ...process.env },
  })

  flaskProcess.stdout.on('data', (data) => log.info('[Flask]', data.toString()))
  flaskProcess.stderr.on('data', (data) => log.warn('[Flask stderr]', data.toString()))
  flaskProcess.on('exit', (code) => log.info('[Flask] exited with code', code))

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

  mainWindow.on('closed', () => { mainWindow = null })
}

// ---------------------------------------------------------------------------
// Chokidar file watcher
// ---------------------------------------------------------------------------

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
    // Dev sim: send fake update-available after 5s for UI testing
    setTimeout(() => {
      if (mainWindow) {
        mainWindow.webContents.send('update-status', {
          status: 'available',
          version: '99.0.0',
          releaseNotes: '<p>Test release</p>',
        })
      }
    }, 5000)
    return
  }

  autoUpdater.logger = log
  autoUpdater.logger.transports.file.level = 'info'
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.autoDownload = true

  setTimeout(() => autoUpdater.checkForUpdates(), 3000)
  setInterval(() => autoUpdater.checkForUpdates(), AUTO_UPDATE_CHECK_INTERVAL_MS)

  autoUpdater.on('update-available', (info) => {
    if (mainWindow) {
      mainWindow.webContents.send('update-status', {
        status: 'available',
        version: info.version,
        releaseNotes: info.releaseNotes,
      })
    }
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

// SQLite — Projects
ipcMain.handle('db-upsert-project', (event, { folderPath, dbFilename, psFilename, rsFilename }) =>
  db.upsertProject(folderPath, dbFilename, psFilename, rsFilename))
ipcMain.handle('db-get-project', (event, { folderPath }) => db.getProject(folderPath))
ipcMain.handle('db-get-last-project', () => db.getLastProject())

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

// App info
ipcMain.handle('get-app-version', () => app.getVersion())

// Auto-updater
ipcMain.handle('check-for-updates', () => {
  if (!isDev) autoUpdater.checkForUpdates()
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
    log.info('Flask started successfully')
  } catch (err) {
    log.error('Flask failed to start:', err)
    // Continue anyway — user will see connection errors in UI
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
