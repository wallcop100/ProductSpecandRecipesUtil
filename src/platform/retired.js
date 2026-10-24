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
import { sharedStem } from '../utils/etRefSuggest'

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

/** "A" for one replacement, "A or B" when it is a Maybe. */
export const newerCodes = retired => (retired?.options ? retired.options.map(o => o.code).join(' or ') : retired?.replacement || '')

/**
 * The one successor that matches a part already beside this ElementType in a recipe (a diffuser's
 * FPS1709PMOPD2000 beside profile FPS1709BG2000), or null. It must share a longer stem than any rival,
 * and at least 6 letters and digits: anything less is a range, not a fit.
 */
export function fitsRecipe(options, etRef, recipes, psRows) {
  const key = String(etRef || '').toLowerCase()
  const lc = r => String(r.ElementTypeRef || r.elementTypeRef || '').toLowerCase()
  const live = recipes.filter(r => (r.IsDeleted || r.isDeleted) !== 'Y')
  const positions = new Set(live.filter(r => lc(r) === key).map(r => r.PositionTypeRef || r.positionTypeRef))
  const beside = new Set(live.filter(r => positions.has(r.PositionTypeRef || r.positionTypeRef) && lc(r) !== key).map(lc))
  const codes = psRows.filter(r => beside.has(lc(r))).map(r => r.ProductCode || r.productCode).filter(Boolean)
  const alnum = s => String(s).replace(/[^a-z0-9]/gi, '')
  const scored = options.map(o => codes.reduce((best, c) => {
    const n = sharedStem(alnum(o.code), alnum(c))
    return n > best.n ? { code: o.code, with: c, n } : best
  }, { code: o.code, with: null, n: 0 })).sort((a, b) => b.n - a.n)
  return scored[0]?.n >= 6 && scored[0].n > (scored[1]?.n || 0) ? { code: scored[0].code, with: scored[0].with } : null
}

/** Tests only. */
export function resetRetired() { asked.clear() }
