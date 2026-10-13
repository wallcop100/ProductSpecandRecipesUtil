/**
 * retired.js — which product codes their manufacturer has since replaced, when the app is served
 * beside a companion that knows (`sweep`, see companion.js).
 *
 * The workbooks stay self-consistent about a code that has gone — the world moved, not the
 * spec — so nothing inside the app can see it. Each code is asked about once per session; the
 * answers land in the store (`retiredCodes`), where the codes list and the ET panel show a quiet
 * "replaced by …" line. No prompt, nothing to dismiss.
 */
import useStore from '../store/useStore'
import { getCompanion } from './companion'

const asked = new Set()

/** codes: [{ code, manufacturer }] — returns when the answers are in the store. */
export async function sweepCodes(codes = []) {
  const api = await getCompanion()
  if (!api?.sweep) return
  const fresh = []
  for (const c of codes) {
    const code = String(c?.code || '').trim()
    if (!code || /^tbc$/i.test(code) || asked.has(code.toUpperCase())) continue
    asked.add(code.toUpperCase())
    fresh.push({ code, manufacturer: String(c.manufacturer || '').trim() })
  }
  for (let i = 0; i < fresh.length; i += 2000) {
    const found = await api.sweep(fresh.slice(i, i + 2000))
    if (found.length) useStore.getState().noteRetired(found)
  }
}

/** The replacement for a code, or null. */
export const retiredFor = (retiredCodes, code) => retiredCodes?.[String(code || '').trim().toUpperCase()] || null

/** Tests only. */
export function resetRetired() { asked.clear() }
