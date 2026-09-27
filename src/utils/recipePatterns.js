/**
 * recipePatterns.js — how positions of a kind have been built before.
 *
 * process.md §7 gives the shape of a recipe; real projects show what that shape is in
 * practice, and they disagree with each other in the details (4343 puts remote exterior
 * fittings straight at position level with a frame; another job wraps them in a DL). So
 * the shape a new recipe gets is PRECEDENT, looked up in this order:
 *
 *   1. project — this project's own finished recipes of the same kind
 *   2. library — projects opened in this tool before (harvested on open)
 *   3. shipped — finished projects read from Kaizen (src/data/recipePatterns.json)
 *
 * A pattern is ROLES, not products: "a 5-pin socket at position level, contract item, on
 * 23 of 24 local interior downlights". Which socket is a separate question (recipeProposal).
 *
 * THE KIND of a position is (wrapper, driver location, environment):
 *   wrapper — DL / LIN / PS (a point source straight at position level)
 *   driver  — LOCAL / REMOTE / INTEGRAL / NONE, from the DesignDB's DriverLocation
 *   env     — EXT when the position's family says exterior / inground, else INT
 *
 * Rebuilding the shipped file: run `harvestPatterns`' SQL twin through Kaizen's psr_sql on a
 * finished project (the query is kept in the commit that added the file) and replace
 * src/data/recipePatterns.json. Pure.
 */

import shipped from '../data/recipePatterns.json'

const up = s => String(s ?? '').trim().toUpperCase()
const live = r => (r.IsDeleted || r.isDeleted) !== 'Y'
const refOf = r => r.ElementTypeRef || r.elementTypeRef || r.EntityRef || r.entityRef || ''
const posOf = r => r.PositionTypeRef || r.positionTypeRef || ''
const ctxTypeOf = r => r.ContextType || r.contextType || ''
const ctxRefOf = r => r.ContextRef || r.contextRef || ''
const flag = v => (v === 'Y' || v === true ? 'Y' : null)

/**
 * What an ElementType IS in a recipe, from its ref (and family when the ref says nothing).
 * Connectors keep their name (5PIN-SOCKET, 2PIN-REMOTE-PLUG): the company names them the
 * same way on every job (process.md §6.1), so the name IS the role.
 */
export function roleOf(ref, family = '') {
  const u = up(ref)
  const f = up(family)
  if (/^ET-DL-\d/.test(u) || /^ET-LIN-\d/.test(u)) return 'WRAPPER'
  // Track: the run itself, or a fitting on it (ET-TRACK / ET-TRACK-PS). Its caps, feed
  // heads and frames fall through to their own roles below.
  if (u.startsWith('ET-TRACK-PS') || f === 'ET-TRACK-PS') return 'TRACK-PS'
  if (/^ET-TRACK-\d/.test(u) || (f === 'ET-TRACK' && !/CAP|FEED|FRAME|PSU|CONNECT|JOINT/.test(u))) return 'TRACK'
  if (u.includes('LEVER')) return 'LEVER'
  if (/SOCKET|PLUG|-SR\b|-SR-/.test(u)) return u.replace(/^ET-/, '').replace(/-\d+$/, '')
  if (/CCL|CCR|CVR|DRIVER/.test(u) || f === 'ET-DRIVER') return 'DRIVER'
  if (u.includes('TAPE') || f === 'ET-LIN-TAPE') return 'TAPE'
  if (u.includes('FLEX') || f === 'ET-LIN-FLEX') return 'FLEX'
  if (u.includes('DIFF')) return 'DIFF'
  if (u.includes('CAP')) return 'CAP'
  if (u.includes('CLIP') || f === 'ET-LIN-CLIP') return 'CLIP'
  if (u.includes('MOUNT') || f === 'ET-LIN-MOUNT') return 'MOUNT'
  if (u.includes('PROF') || f === 'ET-LIN-PROF') return 'PROFILE'
  if (f === 'ET-LIN-FIXED' || u.includes('FIXED')) return 'FIXED'
  if (/COLLAR|FRAME|SLEEVE/.test(u) || f.startsWith('ET-PS-MOUNTING')) return 'FRAME'
  if (u.startsWith('ET-PS') || f === 'ET-PS' || f === 'ET-PS-ACCESSORIES') return u.includes('ACC') || f === 'ET-PS-ACCESSORIES' ? 'ACCESSORY' : 'PS'
  return 'OTHER'
}

/** Roles a Form product can fill: the product itself, never its wiring. */
export const PRODUCT_ROLES = new Set(['PS', 'ACCESSORY', 'TAPE', 'FLEX', 'PROFILE', 'DIFF', 'CAP', 'CLIP', 'MOUNT', 'FIXED', 'FRAME', 'TRACK', 'TRACK-PS'])

/** LOCAL / REMOTE / INTEGRAL / NONE from the DesignDB's DriverLocation. */
export function driverOf(pt) {
  const d = up(pt?.DriverLocation ?? pt?.driverLocation)
  if (d.startsWith('LOCAL')) return 'LOCAL'
  if (d.startsWith('REMOTE')) return 'REMOTE'
  if (d.startsWith('INTEGRAL')) return 'INTEGRAL'
  return 'NONE'
}

/**
 * EXT only when the position's own family chain SAYS exterior (EXTERIOR-DOWNLIGHT…). An IP
 * rating or an in-ground fitting is not evidence of being outside.
 */
export function envOf(pt, parentOf = () => null) {
  const chain = [pt?.PositionTypeRef ?? pt?.positionTypeRef, pt?.ParentRef ?? pt?.parentRef]
  let p = pt?.ParentRef ?? pt?.parentRef
  for (let i = 0; i < 4 && p; i++) { p = parentOf(p); if (p) chain.push(p) }
  return chain.some(x => /EXTERIOR/.test(up(x))) ? 'EXT' : 'INT'
}

/**
 * The pattern rows of one project's recipes — the in-app twin of the Kaizen query.
 * → [{ wk, dl, env, lvl: 'P'|'I', role, isDesign, isContractItem, quantity, dimQtyMultiplier,
 *      isInteger, n, of }]
 */
export function harvestPatterns({ recipes = [], positionTypes = [], elementTypes = [], source = '' } = {}) {
  const famOf = new Map(elementTypes.map(e => [up(e.ElementTypeRef || e.elementTypeRef), e.Family || e.family || '']))
  const ptByRef = new Map(positionTypes.map(p => [up(p.PositionTypeRef || p.positionTypeRef), p]))
  const parentOf = r => { const p = ptByRef.get(up(r)); return p ? (p.ParentRef || p.parentRef || null) : null }
  const rows = recipes.filter(live)
  const kinds = new Map()   // pos -> kind key
  const design = new Map()  // pos -> design ref
  for (const r of rows) {
    if (ctxTypeOf(r) !== 'PositionType' || flag(r.IsDesign ?? r.isDesign) !== 'Y') continue
    const pos = posOf(r) || ctxRefOf(r)
    const pt = ptByRef.get(up(pos))
    if (!pt || (pt.IsCollection || pt.isCollection) === 'Y') continue
    const de = up(refOf(r))
    const wk = designKind(de)
    design.set(pos, de)
    kinds.set(pos, `${wk}|${driverOf(pt)}|${envOf(pt, parentOf)}`)
  }
  const tally = new Map()
  const count = new Map()
  for (const k of kinds.values()) count.set(k, (count.get(k) || 0) + 1)
  const seen = new Set()
  for (const r of rows) {
    const ct = ctxTypeOf(r)
    let pos, lvl
    if (ct === 'PositionType') { pos = posOf(r) || ctxRefOf(r); lvl = 'P' }
    else if (ct === 'ElementType') {
      pos = [...design.entries()].find(([p, de]) => de === up(ctxRefOf(r)) && (!posOf(r) || posOf(r) === p))?.[0]
      lvl = 'I'
    }
    if (!pos || !kinds.has(pos)) continue
    const ref = refOf(r)
    const shape = {
      role: roleOf(ref, famOf.get(up(ref))), lvl,
      isDesign: flag(r.IsDesign ?? r.isDesign), isContractItem: flag(r.IsContractItem ?? r.isContractItem),
      quantity: r.Quantity ?? r.quantity ?? null, dimQtyMultiplier: r.Dim_QuantityMultiplier ?? r.dimQtyMultiplier ?? null,
      isInteger: flag(r.IsInteger ?? r.isInteger),
    }
    const key = `${kinds.get(pos)}|${JSON.stringify(shape)}`
    if (seen.has(`${key}|${pos}`)) continue
    seen.add(`${key}|${pos}`)
    if (!tally.has(key)) tally.set(key, { kind: kinds.get(pos), shape, n: 0 })
    tally.get(key).n++
  }
  return [...tally.values()].map(({ kind, shape, n }) => {
    const [wk, dl, env] = kind.split('|')
    return clean({ wk, dl, env, ...shape, n, of: count.get(kind), source })
  })
}

/** The kind of wrapper a design element makes: DL / LIN / PS / TRACK / TRACKPS / OTHER. */
export function designKind(ref) {
  const de = up(ref)
  if (/^ET-DL-/.test(de)) return 'DL'
  if (/^ET-LIN-\d/.test(de)) return 'LIN'
  if (de.startsWith('ET-TRACK-PS')) return 'TRACKPS'
  if (de.startsWith('ET-TRACK')) return 'TRACK'
  if (de.startsWith('ET-PS')) return 'PS'
  return 'OTHER'
}

const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ''))

/** Shipped patterns (finished projects read from Kaizen). */
export const SHIPPED_PATTERNS = shipped.patterns || []

/**
 * The wrapper a new position of (product, driver, env) should get, by precedent.
 * `product` is 'point' | 'linear'. Linear is always a LIN (§7.8). For a point source the
 * precedent decides between a DL and the PS straight at position level (§7.3 note).
 * → { wk, source, n, of } — the most common choice in the first source that has one.
 */
export function wrapperFor(product, dl, env, sources) {
  if (product === 'linear') return { wk: 'LIN', source: 'rule' }
  // Track (4343): the run is the design element at position level, by length; a fitting on
  // track is the design element itself. Neither is wrapped.
  if (product === 'track') return { wk: 'TRACK', source: 'rule' }
  if (product === 'track-ps') return { wk: 'TRACKPS', source: 'rule' }
  for (const { name, patterns } of sources) {
    const wrappers = patterns.filter(p => p.dl === dl && p.env === env && p.lvl === 'P' && p.isDesign === 'Y'
      && (p.wk === 'DL' || p.wk === 'PS'))
    if (wrappers.length === 0) continue
    const by = new Map()
    for (const p of wrappers) by.set(p.wk, Math.max(by.get(p.wk) || 0, p.n))
    const [wk, n] = [...by.entries()].sort((a, b) => b[1] - a[1])[0]
    return { wk, source: name, n, of: wrappers[0].of }
  }
  return { wk: dl === 'REMOTE' ? 'PS' : 'DL', source: 'rule' }   // §7.2 / §7.3
}

/**
 * The rows precedent gives a kind: every role on at least `min` of its positions.
 * → { rows: [pattern row + share], source } from the first source with that kind.
 */
export function patternFor(wk, dl, env, sources, min = 0.5) {
  for (const { name, patterns } of sources) {
    const rows = patterns.filter(p => p.wk === wk && p.dl === dl && p.env === env && p.n / p.of >= min)
    if (rows.length === 0) continue
    // One shape per (level, role): the most common.
    const best = new Map()
    for (const r of rows) {
      const k = `${r.lvl}|${r.role}`
      if (!best.has(k) || r.n > best.get(k).n) best.set(k, r)
    }
    return { rows: [...best.values()].map(r => ({ ...r, share: r.n / r.of })), source: name }
  }
  return { rows: [], source: null }
}

/**
 * Roles whose quantity depends on the job — clips per metre, tape / profile / mount by
 * length, caps per run: a taught recipe must have them confirmed, even when prefilled.
 */
export const QTY_CONFIRM_ROLES = new Set(['CLIP', 'TAPE', 'FLEX', 'PROFILE', 'MOUNT', 'CAP'])
