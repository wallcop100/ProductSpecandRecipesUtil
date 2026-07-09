/**
 * api.js — installs a `window.electronAPI`-compatible object before React mounts.
 *
 * Every native call in `src/` funnels through that one object, so supplying a
 * browser implementation leaves the whole app untouched. Nothing here talks to a
 * server: SQLite runs as WASM, xlsx parsing runs in-page, and files come from the
 * File System Access API.
 *
 * Degradations, stated plainly:
 *   - the watcher polls `lastModified` (~3s) rather than receiving fs events;
 *   - the auto-updater is meaningless for a web app and is a no-op;
 *   - `folderPath` is an opaque directory-handle id, not an absolute path.
 */

import { load as yamlLoad, dump as yamlDump } from 'js-yaml'
import { openDatabase, dbApi } from './db'
import * as fsx from './fs'
import * as backend from '../utils/backend'
import defaultTagsYaml from './default-tags.yaml?raw'

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'

/** Every db call awaits the connection, matching the old promise-returning IPC. */
function dbBridge() {
  const call = fn => async (...args) => { await openDatabase(); return fn(...args) }

  return {
    upsertProject: call(({ folderPath, configName, projectNumber, projectLabel, dbFilename, psFilename, rsFilename }) =>
      dbApi.upsertProject(folderPath, configName, projectNumber, projectLabel, dbFilename, psFilename, rsFilename)),
    getProject: call((folderPath, configName) => dbApi.getProject(folderPath, configName)),
    getConfigsForFolder: call(folderPath => dbApi.getConfigsForFolder(folderPath)),
    getAllProjects: call(() => dbApi.getAllProjects()),
    deleteProject: call(projectId => dbApi.deleteProject(projectId)),
    getLastProject: call(() => dbApi.getLastProject()),

    // Config YAML — a save/open picker instead of a native dialog
    exportConfigYAML: call(async (projectId, defaultName) => {
      const data = dbApi.collectConfigData(projectId)
      return fsx.saveAs(`${defaultName || 'config'}.config.yaml`, yamlDump(data, { noRefs: true }),
        'YAML', { 'text/yaml': ['.yaml', '.yml'] })
    }),
    importConfigYAML: call(async projectId => {
      const res = await fsx.openTextFile('YAML', { 'text/yaml': ['.yaml', '.yml'] })
      if (!res.ok) return res
      const data = yamlLoad(res.text) || {}
      if (data.version !== 1) return { ok: false, error: `Unsupported config file version: ${data.version ?? 'none'}` }
      dbApi.applyConfigData(projectId, data)
      return { ok: true, path: res.path }
    }),

    getDefaultTags: async () => {
      try {
        const data = yamlLoad(defaultTagsYaml) || {}
        return { palette: data.palette || [], rules: data.rules || [] }
      } catch {
        return { palette: [], rules: [] }
      }
    },

    upsertPositionUI: call((projectId, positionTypeRef, data) => dbApi.upsertPositionUI(projectId, positionTypeRef, data)),
    getAllPositionUI: call(projectId => dbApi.getAllPositionUI(projectId)),

    upsertTemplate: call(template => dbApi.upsertTemplate(template)),
    getAllTemplates: call(projectId => dbApi.getAllTemplates(projectId)),
    deleteTemplate: call(id => dbApi.deleteTemplate(id)),

    upsertSlotMapping: call((projectId, templateId, slotKey, entityRef) => dbApi.upsertSlotMapping(projectId, templateId, slotKey, entityRef)),
    getSlotMappings: call((projectId, templateId) => dbApi.getSlotMappings(projectId, templateId)),
    getAllSlotMappings: call(projectId => dbApi.getAllSlotMappings(projectId)),
    deleteSlotMapping: call((projectId, templateId, slotKey) => dbApi.deleteSlotMapping(projectId, templateId, slotKey)),

    setPref: call((projectId, key, value) => dbApi.setPref(projectId, key, value)),
    getPref: call((projectId, key) => dbApi.getPref(projectId, key)),

    upsertCollection: call((projectId, collection) => dbApi.upsertCollection(projectId, collection)),
    getAllCollections: call(projectId => dbApi.getAllCollections(projectId)),
    deleteCollection: call(collectionId => dbApi.deleteCollection(collectionId)),

    upsertFavorite: call(favorite => dbApi.upsertFavorite(favorite)),
    getFavorites: call(() => dbApi.getFavorites()),
    deleteFavorite: call(id => dbApi.deleteFavorite(id)),

    getPendingChanges: call(projectId => dbApi.getPendingChanges(projectId)),
    setPendingChanges: call((projectId, ps, rs) => dbApi.setPendingChanges(projectId, ps, rs)),
    clearPendingChanges: call(projectId => dbApi.clearPendingChanges(projectId)),

    upsertLocalET: call((projectId, et) => dbApi.upsertLocalElementType(projectId, et)),
    getLocalETs: call(projectId => dbApi.getLocalElementTypes(projectId)),
    renameLocalET: call((projectId, oldRef, newRef) => dbApi.renameLocalElementType(projectId, oldRef, newRef)),
    deleteLocalET: call((projectId, ref) => dbApi.deleteLocalElementType(projectId, ref)),
  }
}

let fileChangedCb = null

export function installPlatform() {
  if (typeof window === 'undefined' || window.electronAPI) return

  window.electronAPI = {
    // --- dialogs. `folderPath` is a directory-handle id, not a path.
    openFolderDialog: async () => {
      try {
        const { key } = await fsx.pickDirectory()
        await backend.setActiveDirectory(key)
        return key
      } catch (err) {
        if (err?.name === 'AbortError') return null
        throw err
      }
    },
    openXlsxDialog: async () => {
      try {
        const picked = await fsx.pickXlsxFile()
        return picked ? backend.registerFile(picked.handle) : null
      } catch (err) {
        if (err?.name === 'AbortError') return null
        throw err
      }
    },

    /** Display name of a persisted folder handle (`folderPath` is only an id). */
    getFolderName: async folderPath => {
      const dirs = await fsx.listDirectories()
      return dirs.find(d => d.key === folderPath)?.name || null
    },

    /**
     * Re-grant access to a remembered folder. The File System Access API will not
     * persist a permission grant, so reopening a project needs a user gesture —
     * call this from a click, never on mount.
     */
    requestFolderAccess: async folderPath => {
      const dir = await fsx.getDirectory(folderPath)
      if (!dir) return false
      const granted = await fsx.ensurePermission(dir)
      if (granted) await backend.setActiveDirectory(folderPath)
      return granted
    },

    /** Whether this browser can open a project folder at all. */
    isFolderAccessSupported: () => fsx.isSupported(),

    // --- watcher (polling)
    startWatcher: async ({ folderPath, psFilename, rsFilename }) => {
      const dir = await backend.setActiveDirectory(folderPath)
      if (dir) fsx.startWatcher(dir, { psFilename, rsFilename }, payload => fileChangedCb?.(payload))
    },
    stopWatcher: async () => fsx.stopWatcher(),
    suppressWatcher: () => fsx.suppressWatcher(),
    onFileChanged: cb => { fileChangedCb = cb },

    db: dbBridge(),

    // No snapshotProject / lastSnapshotTime / configWriteYaml: nothing writes into
    // the project folder. Export produces a patch script, and the config yaml goes
    // out through the save picker (db.exportConfigYAML).

    // --- personal library (global settings, shareable)
    libraryExportYaml: async () => {
      await openDatabase()
      const data = dbApi.collectLibraryData()
      return fsx.saveAs('my-library.yaml', yamlDump(data, { noRefs: true }), 'YAML', { 'text/yaml': ['.yaml', '.yml'] })
    },
    libraryImportYaml: async () => {
      const res = await fsx.openTextFile('YAML', { 'text/yaml': ['.yaml', '.yml'] })
      if (!res.ok) return res
      await openDatabase()
      try {
        dbApi.applyLibraryData(yamlLoad(res.text) || {})
        return { ok: true, path: res.path }
      } catch (err) {
        return { ok: false, error: err.message }
      }
    },

    getAppVersion: async () => APP_VERSION,

    // --- no-ops: a web app is always current, and there is no native menu
    onDebugToggle: () => {},
    onFlaskStatus: () => {},
    updater: {
      onStatusChange: () => {},
      checkNow: async () => ({ ok: true, status: 'current' }),
      installNow: async () => ({ ok: true }),
    },
  }
}
