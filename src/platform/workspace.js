/**
 * workspace.js — this browser's work, kept on the companion server (see companion.js).
 *
 * A workspace is a backup (backup.js) stored under a long random key. The key IS the
 * access: whoever has it can read and replace the workspace, so it is shown once, shared
 * as a link whose key sits in the URL FRAGMENT (`#ws=…`) — never sent to a server, never
 * in an access log — and kept only in this browser.
 *
 * Sync is last-writer-checked, never merged. Every save names the version it replaces
 * (If-Match); if someone else saved in between, the save is refused and auto-sync stops
 * until a person chooses which copy wins. Two browsers silently overwriting each other's
 * work is the one outcome this must not produce.
 */
import { makeBackup, restoreBackup, checkBackup } from './backup'
import { onPersisted } from './db'

const STORE_KEY = 'rb-workspace'
const AUTO_MS = 5000

let state = load()            // { key, etag, auto } | null
let status = { phase: state ? 'idle' : 'off', at: null, error: null }
const listeners = new Set()
let timer = null

function load() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null') } catch { return null }
}
function save() {
  try {
    if (state) localStorage.setItem(STORE_KEY, JSON.stringify(state))
    else localStorage.removeItem(STORE_KEY)
  } catch { /* blocked: sync still works for this session */ }
}
function set(patch) {
  status = { ...status, ...patch }
  for (const l of listeners) l(status, state)
}

const url = key => `./api/workspaces/${encodeURIComponent(key)}`

/** 128 random bits, URL-safe. */
export function newKey() {
  const b = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export const current = () => (state ? { ...state } : null)
export const currentStatus = () => status
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) }

/** The link that opens this workspace in another browser. */
export function shareLink(key = state?.key) {
  if (!key || typeof location === 'undefined') return ''
  return `${location.origin}${location.pathname}#ws=${key}`
}

let linkKey = null

/**
 * Take a `#ws=` link off the address bar at boot, so it is not bookmarked or shared by
 * accident. Called once from main.jsx; `linkedKey()` then says whether one was opened.
 */
export function captureLink() {
  if (typeof location === 'undefined') return
  const m = /(?:^#|&)ws=([A-Za-z0-9_-]{16,})/.exec(location.hash || '')
  if (!m) return
  try { history.replaceState(null, '', location.pathname + location.search) } catch { /* fine */ }
  linkKey = m[1] === state?.key ? null : m[1]
}
export const linkedKey = () => linkKey
export function dismissLink() { linkKey = null }

/** Save this browser's work to the workspace. → 'saved' | 'conflict' | 'error'. */
export async function push({ force = false } = {}) {
  if (!state) return 'error'
  clearTimeout(timer)
  set({ phase: 'saving', error: null })
  try {
    const backup = await makeBackup({ api: typeof window !== 'undefined' ? window.electronAPI?.db : null })
    const headers = { 'Content-Type': 'application/json' }
    if (!force) {
      if (state.etag) headers['If-Match'] = state.etag
      else headers['If-None-Match'] = '*'
    }
    const res = await fetch(url(state.key), { method: 'PUT', headers, body: JSON.stringify(backup) })
    if (res.status === 412) { set({ phase: 'conflict' }); return 'conflict' }
    if (!res.ok) throw new Error(res.status === 413 ? 'too large for the server' : `server said ${res.status}`)
    state = { ...state, etag: res.headers.get('ETag') || null }
    save()
    set({ phase: 'idle', at: new Date().toISOString() })
    return 'saved'
  } catch (e) {
    set({ phase: 'error', error: e.message })
    return 'error'
  }
}

/** Replace this browser's work with the workspace. The caller reloads after. → true when restored. */
export async function pull(key = state?.key) {
  if (!key) return false
  set({ phase: 'loading', error: null })
  try {
    const res = await fetch(url(key), { headers: { Accept: 'application/json' } })
    if (res.status === 404) { set({ phase: 'error', error: 'nothing saved under that key' }); return false }
    if (!res.ok) throw new Error(`server said ${res.status}`)
    const backup = await res.json()
    const bad = checkBackup(backup)
    if (bad) throw new Error(bad)
    await restoreBackup(backup)
    state = { key, etag: res.headers.get('ETag') || null, auto: state?.key === key ? state.auto : true }
    save()
    set({ phase: 'idle', at: new Date().toISOString() })
    return true
  } catch (e) {
    set({ phase: 'error', error: e.message })
    return false
  }
}

/** Does the server hold anything under this key? → backup object | null. */
export async function peek(key) {
  try {
    const res = await fetch(url(key), { headers: { Accept: 'application/json' } })
    return res.ok ? await res.json() : null
  } catch { return null }
}

/** Start a new workspace from this browser's work. */
export async function create() {
  state = { key: newKey(), etag: null, auto: true }
  save()
  return push()
}

/** Stop syncing here. The server copy is left alone. */
export function disconnect() {
  clearTimeout(timer)
  state = null
  save()
  set({ phase: 'off', error: null })
}

export function setAuto(on) {
  if (!state) return
  state = { ...state, auto: !!on }
  save()
  set({})
}

// Every database write schedules a save; a burst of edits is one save.
onPersisted(() => {
  if (!state?.auto || status.phase === 'conflict') return
  clearTimeout(timer)
  timer = setTimeout(() => { push() }, AUTO_MS)
})
