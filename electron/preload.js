'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // File dialogs
  openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),
  openXlsxDialog: () => ipcRenderer.invoke('open-xlsx-dialog'),

  // Flask status
  onFlaskStatus: (callback) =>
    ipcRenderer.on('flask-status', (_event, data) => callback(data)),

  // File watcher
  startWatcher: (opts) => ipcRenderer.invoke('start-watcher', opts),
  stopWatcher: () => ipcRenderer.invoke('stop-watcher'),
  suppressWatcher: (files, ms) => ipcRenderer.invoke('suppress-watcher', { files, ms }),
  onFileChanged: (callback) =>
    ipcRenderer.on('file-changed', (_event, data) => callback(data)),

  // DB — Projects & all SQLite operations
  db: {
    upsertProject: (data) => ipcRenderer.invoke('db-upsert-project', data),
    getProject: (folderPath, configName) => ipcRenderer.invoke('db-get-project', { folderPath, configName }),
    getConfigsForFolder: (folderPath) => ipcRenderer.invoke('db-get-configs-for-folder', { folderPath }),
    getAllProjects: () => ipcRenderer.invoke('db-get-all-projects'),
    deleteProject: (projectId) => ipcRenderer.invoke('db-delete-project', { projectId }),
    getLastProject: () => ipcRenderer.invoke('db-get-last-project'),

    // Config YAML export / import
    exportConfigYAML: (projectId, defaultName) => ipcRenderer.invoke('config-export-yaml', { projectId, defaultName }),
    importConfigYAML: (projectId) => ipcRenderer.invoke('config-import-yaml', { projectId }),

    // Default tag palette + rules (bundled YAML)
    getDefaultTags: () => ipcRenderer.invoke('get-default-tags'),

    // Position UI
    upsertPositionUI: (projectId, positionTypeRef, data) =>
      ipcRenderer.invoke('db-upsert-position-ui', { projectId, positionTypeRef, data }),
    getAllPositionUI: (projectId) =>
      ipcRenderer.invoke('db-get-all-position-ui', { projectId }),

    // Templates
    upsertTemplate: (template) =>
      ipcRenderer.invoke('db-upsert-template', { template }),
    getAllTemplates: (projectId) =>
      ipcRenderer.invoke('db-get-all-templates', { projectId }),
    deleteTemplate: (id) => ipcRenderer.invoke('db-delete-template', { id }),

    // Slot mappings
    upsertSlotMapping: (projectId, templateId, slotKey, entityRef) =>
      ipcRenderer.invoke('db-upsert-slot-mapping', { projectId, templateId, slotKey, entityRef }),
    getSlotMappings: (projectId, templateId) =>
      ipcRenderer.invoke('db-get-slot-mappings', { projectId, templateId }),
    getAllSlotMappings: (projectId) =>
      ipcRenderer.invoke('db-get-all-slot-mappings', { projectId }),
    deleteSlotMapping: (projectId, templateId, slotKey) =>
      ipcRenderer.invoke('db-delete-slot-mapping', { projectId, templateId, slotKey }),

    // Prefs
    setPref: (projectId, key, value) =>
      ipcRenderer.invoke('db-set-pref', { projectId, key, value }),
    getPref: (projectId, key) =>
      ipcRenderer.invoke('db-get-pref', { projectId, key }),

    // ET Collections
    upsertCollection: (projectId, collection) =>
      ipcRenderer.invoke('db-upsert-collection', { projectId, collection }),
    getAllCollections: (projectId) =>
      ipcRenderer.invoke('db-get-all-collections', { projectId }),
    deleteCollection: (collectionId) =>
      ipcRenderer.invoke('db-delete-collection', { collectionId }),

    // Favourites (cross-project user library)
    upsertFavorite: (favorite) => ipcRenderer.invoke('db-upsert-favorite', { favorite }),
    getFavorites: () => ipcRenderer.invoke('db-get-favorites'),
    deleteFavorite: (id) => ipcRenderer.invoke('db-delete-favorite', { id }),

    // Pending changes (crash-safe dirty registry — EXPORT_PLAN §3.1)
    getPendingChanges: (projectId) => ipcRenderer.invoke('db-get-pending-changes', { projectId }),
    setPendingChanges: (projectId, ps, rs) => ipcRenderer.invoke('db-set-pending-changes', { projectId, ps, rs }),
    clearPendingChanges: (projectId) => ipcRenderer.invoke('db-clear-pending-changes', { projectId }),

    // Local ElementTypes (app-created catalogue entries — EXPORT_PLAN §4)
    upsertLocalET: (projectId, et) => ipcRenderer.invoke('db-upsert-local-et', { projectId, et }),
    getLocalETs: (projectId) => ipcRenderer.invoke('db-get-local-ets', { projectId }),
    renameLocalET: (projectId, oldRef, newRef) => ipcRenderer.invoke('db-rename-local-et', { projectId, oldRef, newRef }),
    deleteLocalET: (projectId, ref) => ipcRenderer.invoke('db-delete-local-et', { projectId, ref }),
  },

  // Project snapshot + silent overlay write (EXPORT_PLAN §5–6)
  snapshotProject: (opts) => ipcRenderer.invoke('snapshot-project', opts),
  lastSnapshotTime: (folderPath) => ipcRenderer.invoke('last-snapshot-time', { folderPath }),
  configWriteYaml: (opts) => ipcRenderer.invoke('config-write-yaml', opts),

  // Personal library export / import
  libraryExportYaml: () => ipcRenderer.invoke('library-export-yaml'),
  libraryImportYaml: () => ipcRenderer.invoke('library-import-yaml'),

  // App
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Debug: menu toggle for the UI-element-ID overlay
  onDebugToggle: (callback) =>
    ipcRenderer.on('debug-toggle', (_event, on) => callback(on)),

  // Auto-updater
  updater: {
    onStatusChange: (callback) =>
      ipcRenderer.on('update-status', (_event, data) => callback(data)),
    checkNow: () => ipcRenderer.invoke('check-for-updates'),
    installNow: () => ipcRenderer.invoke('install-update'),
  },
})
