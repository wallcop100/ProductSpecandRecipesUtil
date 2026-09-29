/**
 * idb.js — a minimal promise wrapper over one IndexedDB key/value store.
 *
 * Holds the serialized SQLite database and the persisted File System Access
 * directory handles. Deliberately tiny: a dependency would earn nothing here.
 */

const DB_NAME = 'recipe-builder'
const STORE = 'kv'
const VERSION = 1

let openPromise = null

function open() {
  if (openPromise) return openPromise
  openPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return openPromise
}

function tx(mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const req = fn(t.objectStore(STORE))
    t.oncomplete = () => resolve(req?.result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  }))
}

export const idbGet = key => tx('readonly', store => store.get(key))
export const idbSet = (key, value) => tx('readwrite', store => store.put(value, key))
export const idbDel = key => tx('readwrite', store => store.delete(key))
export const idbKeys = () => tx('readonly', store => store.getAllKeys())
