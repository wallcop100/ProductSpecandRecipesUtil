/**
 * seen.js — which tutorial cards this person has already dismissed.
 *
 * localStorage, deliberately. Not `project_prefs` — that is per-config, so every new config
 * would re-fire every card. Not the `favorites` table — that travels in the library
 * export/import, and "I have seen this card" is device-local UX state that must not follow
 * a YAML onto a colleague's machine. The browser already IS this app's storage story.
 *
 * Corrupt or unavailable storage is treated as "nothing seen", never a throw: the worst
 * outcome of a broken flag is a card showing once more.
 */

const KEY = 'rb-tutorial-seen'

function read() {
  try {
    const raw = window.localStorage.getItem(KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function write(ids) {
  try { window.localStorage.setItem(KEY, JSON.stringify(ids)) } catch { /* private mode etc. */ }
}

export function hasSeen(id) {
  return read().includes(id)
}

export function markSeen(id) {
  if (!id) return
  const ids = read()
  if (!ids.includes(id)) write([...ids, id])
}

/** The "Skip all tutorials" escape — one click, never bothered again. */
export function markAllSeen(allIds = []) {
  write([...new Set([...read(), ...allIds])])
}

export function resetSeen() {
  try { window.localStorage.removeItem(KEY) } catch { /* nothing to lose */ }
}
