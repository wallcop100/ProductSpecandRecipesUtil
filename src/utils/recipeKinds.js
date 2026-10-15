/**
 * recipeKinds.js — what a position's recipe is made of, by JOB (codeJobs.js), and what positions
 * like it usually also have. The inline suggestions in the recipe editor (RecipeSuggestions.jsx)
 * are built from this. Pure.
 *
 *   positionMakeup(posRef, state)  → { design, driver, secondary, jobs: Map(jobKey → [row]), defining }
 *   sameKindAs(posRef, state)      → the positions of THIS project with the same make-up and more in
 *                                     their recipe (works without a companion)
 *   matchKind(makeup, kinds)       → the closest kind (kinds are served beside a companion only)
 *   usuallyMissing(makeup, kind)   → the kind's usual slots this recipe does not have
 *   elementTypesForJob(job, state) → this project's ElementTypes that do that job, most used first
 *   anchorOf(makeup, idx)          → the profile / channel a recipe is built on
 *   fitFor(job, anchor, state)     → the ElementType that fits THAT profile (end caps, diffuser, clips), and why
 *
 * End caps, diffusers and clips are made for one profile: a "same as" copies them only from a
 * position on the same profile, and a suggestion names the part that fits it rather than the
 * project's most used one.
 */
import { jobOf, jobKey } from './codeJobs'

const U = s => String(s ?? '').trim().toUpperCase()
const refOf = r => r.ElementTypeRef || r.elementTypeRef || ''
const posOf = r => r.PositionTypeRef || r.positionTypeRef || ''
const live = r => (r.IsDeleted || r.isDeleted) !== 'Y'
export const DEFINING = new Set(['TAPE:tape', 'TAPE:flex', 'TAPE:fixed', 'PROFILE', 'MOUNT_CHANNEL', 'LOCAL_DRIVER', 'REMOTE_DRIVER', 'FITTING'])

/** Driver location and secondary power, as the DesignDB's free text means them. */
export function powerOf(pt = {}) {
  const loc = U(pt.DriverLocation ?? pt.driverLocation)
  const sec = U(pt.SecondaryPowerType ?? pt.secondaryPowerType)
  return {
    driver: loc.startsWith('REMOTE') ? 'remote' : loc.startsWith('LOCAL') ? 'local' : loc.startsWith('INTEGR') ? 'integral' : '',
    secondary: sec === 'CC' || sec === 'CV' ? sec : '',
  }
}

/** The job of one recipe row, from its ElementType and that ElementType's Product Spec row. */
export function rowJob(row, { etByRef, psByRef }) {
  const ref = refOf(row)
  const et = etByRef.get(U(ref)) || {}
  const ps = psByRef.get(U(ref)) || {}
  const section = (row.ContextType || row.contextType) === 'PositionType' ? 'position' : 'internal'
  return jobOf({
    ref, family: et.Family || et.family, name: et.Name || et.name, description: et.Description || et.description,
    maker: ps.Manufacturer || ps.manufacturer, code: ps.ProductCode || ps.productCode,
    isDesign: (row.IsDesign || row.isDesign) === 'Y', section, entityType: row.EntityType || row.entityType,
  })
}

export function indexes(state) {
  return {
    etByRef: new Map((state.elementTypes || []).map(e => [U(refOf(e)), e])),
    psByRef: new Map((state.psRows || []).filter(live).map(r => [U(refOf(r)), r])),
    ptByRef: new Map((state.positionTypes || []).map(p => [U(p.PositionTypeRef || p.positionTypeRef), p])),
  }
}

/** A position's recipe by job. Connectors are left out, as templates leave them to the Connectors screen. */
export function positionMakeup(posRef, state, idx = indexes(state)) {
  const rows = (state.recipes || []).filter(r => posOf(r) === posRef && live(r))
  const jobs = new Map()
  let design = rows.length ? 'none' : ''
  for (const r of rows) {
    const j = rowJob(r, idx)
    if (j.slot === 'DESIGN_ELEMENT') { design = j.variant; continue }
    if (j.slot === 'CONNECTOR') continue
    const k = jobKey(j)
    if (!jobs.has(k)) jobs.set(k, [])
    jobs.get(k).push(r)
  }
  const { driver, secondary } = powerOf(idx.ptByRef.get(U(posRef)) || {})
  const defining = [...jobs.keys()].filter(k => DEFINING.has(k)).sort()
  return { posRef, design, driver, secondary, jobs, defining, rows: rows.length }
}

const sig = m => `${m.design}|${m.driver}|${m.secondary}|${m.defining.join('+')}`

/** Jobs whose part is made for one profile: they only carry over between recipes on the same one. */
export const FITS_PROFILE = new Set(['END_CAPS', 'DIFFUSER', 'CLIPS'])

/** The range a profile code belongs to: its letters and first run of digits (FPS1709BG2000 → FPS1709). */
export const rangeStem = code => (U(code).match(/^[A-Z]*\d{3,}/) || [''])[0]

/** The profile (else mounting channel) a recipe is built on → { ref, code, maker } | null. */
export function anchorOf(m, idx) {
  for (const k of ['PROFILE', 'MOUNT_CHANNEL']) {
    const r = (m.jobs.get(k) || [])[0]
    if (!r) continue
    const ps = idx.psByRef.get(U(refOf(r))) || {}
    return { ref: refOf(r), code: U(ps.ProductCode || ps.productCode), maker: ps.Manufacturer || ps.manufacturer || '' }
  }
  return null
}
const sameAnchor = (a, b) => !!a && !!b && (U(a.ref) === U(b.ref) || (!!a.code && a.code === b.code))
const codeOf = (ref, idx) => U(idx.psByRef.get(U(ref))?.ProductCode || idx.psByRef.get(U(ref))?.productCode)

/**
 * The positions of this project with the same design, power and make-up whose recipe has jobs this
 * one lacks — "same as C01r" adds just those. A part made for a profile (FITS_PROFILE) is only
 * taken from a position on the same profile. Best first: the same profile, then the most
 * positions sharing that recipe.
 * → [{ posRef, adds: [{ job, rows }], basis: 'profile' | 'makeup', anchor }]
 */
export function sameKindAs(posRef, state, idx = indexes(state)) {
  const me = positionMakeup(posRef, state, idx)
  if (!me.rows || !me.design) return []
  const mine = anchorOf(me, idx)
  const out = []
  const posRefs = [...new Set((state.recipes || []).filter(live).map(posOf))].filter(p => p && p !== posRef)
  for (const p of posRefs) {
    const other = positionMakeup(p, state, idx)
    if (sig(other) !== sig(me)) continue
    const anchor = anchorOf(other, idx)
    const basis = sameAnchor(mine, anchor) ? 'profile' : 'makeup'
    const adds = [...other.jobs.entries()].filter(([k]) => !me.jobs.has(k))
      .filter(([k]) => basis === 'profile' || !FITS_PROFILE.has(k)).map(([job, rows]) => ({ job, rows }))
    if (adds.length) out.push({ posRef: p, adds, basis, anchor })
  }
  const key = o => o.adds.map(a => a.job).sort().join('+')
  const count = new Map()
  for (const o of out) count.set(key(o), (count.get(key(o)) || 0) + 1)
  return out.sort((a, b) => (a.basis === 'profile' ? 0 : 1) - (b.basis === 'profile' ? 0 : 1)
    || count.get(key(b)) - count.get(key(a)) || a.posRef.localeCompare(b.posRef))
}

/**
 * The ElementType of this project that fits `anchor` for `job` (end caps, diffuser, clips):
 *   1. one used with this profile on another position here ("used with ET-LIN-PROF-03 on C08r")
 *   2. one from the same maker range as the profile ("FPS1709 range": FPS1709MC for FPS1709BG2000)
 * → { etRef, why } | null. Nothing fits → null: the caller says so rather than offering any clip.
 */
export function fitFor(job, anchor, state, idx = indexes(state)) {
  if (!anchor || !FITS_PROFILE.has(job)) return null
  const posRefs = [...new Set((state.recipes || []).filter(live).map(posOf))].filter(Boolean).sort()
  for (const p of posRefs) {
    const m = positionMakeup(p, state, idx)
    const r = (m.jobs.get(job) || [])[0]
    if (r && sameAnchor(anchor, anchorOf(m, idx))) return { etRef: refOf(r), why: `used with ${anchor.ref} on ${p}` }
  }
  const stem = rangeStem(anchor.code)
  if (stem.length < 5) return null
  const fits = elementTypesForJob(job, state, idx).filter(e => rangeStem(codeOf(refOf(e), idx)) === stem)
  return fits.length ? { etRef: refOf(fits[0]), why: `${stem} range` } : null
}

/**
 * Of a profile range's catalogue parts for one job (kits served as `range`), the one to offer:
 * the profile's own finish (…BG2000 → …ECG), else the variant this project already uses on
 * another profile (…PCOPD2000, opal), else the first.
 */
export function pickRangePart(parts, anchor, job, state, idx = indexes(state)) {
  if (!parts.length) return null
  const stem = rangeStem(anchor?.code)
  const tail = c => U(c).slice(rangeStem(c).length)
  const finish = (tail(anchor?.code || '').match(/^B([A-Z])/) || [])[1]
  const used = new Set(elementTypesForJob(job, state, idx).map(e => tail(codeOf(refOf(e), idx))).filter(Boolean))
  const score = p => (used.has(tail(p.code)) ? 2 : 0) + (finish && /[A-Z]+/.exec(tail(p.code))?.[0].endsWith(finish) ? 1 : 0)
  return [...parts].filter(p => !stem || rangeStem(p.code) === stem).sort((a, b) => score(b) - score(a))[0] || null
}

/** The closest served kind: same design and power, most of the same defining jobs. */
export function matchKind(m, kinds = []) {
  let best = null
  for (const k of kinds) {
    if (k.design !== m.design || k.driver !== m.driver || k.secondary !== m.secondary) continue
    const a = new Set(k.defining), b = new Set(m.defining)
    const inter = [...a].filter(x => b.has(x)).length
    const score = (a.size + b.size) ? inter / new Set([...a, ...b]).size : 1
    if (score >= 0.5 && (!best || score > best.score || (score === best.score && k.projects > best.kind.projects))) best = { kind: k, score }
  }
  return best?.kind || null
}

/** The kind's slots on at least `min` of its positions that this recipe does not have. */
export function usuallyMissing(m, kind, min = 0.6) {
  if (!kind) return []
  return kind.slots.filter(s => (s.core || s.share >= min) && !m.jobs.has(s.slot) && s.slot !== 'OTHER')
}

/** This project's ElementTypes doing `job` (a jobKey), most used in recipes first. */
export function elementTypesForJob(job, state, idx = indexes(state)) {
  const uses = new Map()
  for (const r of (state.recipes || []).filter(live)) uses.set(U(refOf(r)), (uses.get(U(refOf(r))) || 0) + 1)
  return (state.elementTypes || []).filter(live).filter(e => (e.IsCollection || e.isCollection) !== 'Y')
    .filter(e => jobKey(rowJob({ ElementTypeRef: refOf(e), ContextType: 'ElementType' }, idx)) === job)
    .sort((a, b) => (uses.get(U(refOf(b))) || 0) - (uses.get(U(refOf(a))) || 0) || refOf(a).localeCompare(refOf(b)))
}

/** Where a kind's slot goes on this position: position level, or inside its wrapper. */
export function sectionFor(slot, design) {
  if (slot.section === 'position') return 'position'
  return design === 'LIN' ? 'lin_internal' : design === 'DL' ? 'dl_internal' : 'position'
}

/** The row a kind's slot adds: its usual quantity / per-metre / contract / whole-number rule. */
export function rowFromSlot(slot, etRef) {
  return {
    elementTypeRef: etRef,
    quantity: slot.qty ?? null,
    dimQtyMultiplier: slot.dim ?? null,
    isContractItem: slot.contract >= 0.5 ? 'Y' : null,
    isInteger: slot.integer >= 0.5 ? 'Y' : null,
  }
}

export const JOB_LABEL = {
  'TAPE:tape': 'LED tape', 'TAPE:flex': 'neon / flex', 'TAPE:fixed': 'fixed linear', PROFILE: 'profile', DIFFUSER: 'diffuser',
  END_CAPS: 'end caps', CLIPS: 'clips', MOUNT_CHANNEL: 'mounting channel', MOUNT_COLLAR: 'mounting collar / frame',
  LOCAL_DRIVER: 'driver', REMOTE_DRIVER: 'driver', EMERGENCY: 'emergency pack', OPTIC_ACCESSORY: 'optic accessory',
  ACCESSORY: 'accessory', FIRE_HOOD: 'fire hood', LOCKING_LEVER: 'locking lever', FITTING: 'fitting', CABLE_TAIL: 'cable tail',
  TRACK_ACCESSORY: 'track accessory', ENCLOSURE: 'enclosure', DOOR_SWITCH: 'door switch',
}
export const jobLabel = k => JOB_LABEL[k] || String(k).toLowerCase().replace(/_/g, ' ')

/** The rule of a slot, in words: "×2", "1 per m", "5 per m, whole numbers". */
export function ruleText(slot) {
  const b = []
  if (slot.qty != null) b.push(`×${slot.qty}`)
  if (slot.dim != null) b.push(`${slot.dim} per m`)
  if (slot.integer >= 0.5) b.push('whole numbers')
  return b.join(', ')
}

const FORM_GAP_SLOTS = new Set(['TAPE:tape', 'TAPE:flex', 'PROFILE', 'MOUNT_CHANNEL', 'DIFFUSER', 'END_CAPS', 'CLIPS'])

/**
 * At the Form step: the Form positions whose codes leave out a part positions like them usually
 * have. Only the linear make-up, which codes reliably say (a luminaire's code rarely names its job).
 *   entries — the import's distinct codes ({ text, manufacturers, positionTypes, etRef, variants })
 *   → [{ kind, positions: [ref], missing: [slot] }]  one line per kind + missing set
 */
export function formKindGaps(entries, { kinds = [], positionTypes = [], elementTypes = [], psRows = [], pageTypeFor = () => '' } = {}) {
  if (!kinds.length) return []
  const idx = indexes({ elementTypes, psRows, positionTypes })
  const byPos = new Map()
  for (const e of entries) {
    const job = e.etRef
      ? rowJob({ ElementTypeRef: e.etRef, ContextType: 'ElementType' }, idx)
      : jobOf({ maker: e.manufacturers?.[0], code: e.text, name: e.variants?.[0]?.note || '' })
    for (const pt of e.positionTypes || []) {
      const p = String(pt ?? '').trim()
      if (!p) continue
      if (!byPos.has(p)) byPos.set(p, { jobs: new Set(), linear: false })
      byPos.get(p).jobs.add(jobKey(job))
      if (String(pageTypeFor(e) || '').toLowerCase().startsWith('linear')) byPos.get(p).linear = true
    }
  }
  const lines = new Map()
  for (const [pos, { jobs, linear }] of byPos) {
    if (!linear) continue
    const { driver, secondary } = powerOf(idx.ptByRef.get(U(pos)) || {})
    const m = { design: 'LIN', driver: driver || 'remote', secondary: secondary || 'CV', jobs: new Map([...jobs].map(j => [j, []])),
      defining: [...jobs].filter(j => DEFINING.has(j)).sort() }
    const kind = matchKind(m, kinds)
    const missing = usuallyMissing(m, kind, 0.8).filter(s => FORM_GAP_SLOTS.has(s.slot))
    if (!missing.length) continue
    const key = `${kind.id}|${missing.map(s => s.slot).join('+')}`
    if (!lines.has(key)) lines.set(key, { key, kind, missing, positions: [] })
    lines.get(key).positions.push(pos)
  }
  return [...lines.values()].sort((a, b) => b.positions.length - a.positions.length)
}

/**
 * The connector set positions of this kind usually carry (when one is usual: on 30%+ of them),
 * mapped onto this project's own connector ElementTypes, each where the project puts it.
 * → { set: [descriptor], rows: [{ descriptor, etRef, section }], share } | null
 */
export function usualConnectors(m, kind, state, idx = indexes(state), min = 0.3) {
  const top = (kind?.connectors || []).find(c => c.set.length)
  if (!top || top.positions / Math.max(1, kind.positions) < min) return null
  const have = new Map()
  for (const r of (state.recipes || []).filter(r => posOf(r) === m.posRef && live(r))) {
    const j = rowJob(r, idx)
    if (j.slot === 'CONNECTOR') have.set(j.variant, (have.get(j.variant) || 0) + 1)
  }
  const need = new Map()
  for (const d of top.set) need.set(d, (need.get(d) || 0) + 1)
  const byJob = new Map(), where = new Map()
  for (const r of (state.recipes || []).filter(live)) {
    const j = rowJob(r, idx)
    if (j.slot !== 'CONNECTOR') continue
    const ref = refOf(r)
    if (!byJob.has(j.variant)) byJob.set(j.variant, new Map())
    byJob.get(j.variant).set(ref, (byJob.get(j.variant).get(ref) || 0) + 1)
    const w = (r.ContextType || r.contextType) === 'PositionType' ? 'position' : 'internal'
    const k = `${U(ref)}|${w}`
    where.set(k, (where.get(k) || 0) + 1)
  }
  for (const e of (state.elementTypes || []).filter(live)) {
    const j = rowJob({ ElementTypeRef: refOf(e), ContextType: 'PositionType' }, idx)
    if (j.slot === 'CONNECTOR' && !byJob.get(j.variant)?.has(refOf(e))) {
      if (!byJob.has(j.variant)) byJob.set(j.variant, new Map())
      byJob.get(j.variant).set(refOf(e), 0)
    }
  }
  const rows = []
  for (const [d, n] of need) {
    const missing = n - (have.get(d) || 0)
    if (missing <= 0) continue
    const cands = [...(byJob.get(d) || new Map()).entries()].sort((a, b) => b[1] - a[1])
    if (!cands.length) continue
    const etRef = cands[0][0]
    const pos = where.get(`${U(etRef)}|position`) || 0, inside = where.get(`${U(etRef)}|internal`) || 0
    const section = inside > pos && (m.design === 'LIN' || m.design === 'DL') ? (m.design === 'LIN' ? 'lin_internal' : 'dl_internal') : 'position'
    for (let i = 0; i < missing; i++) rows.push({ descriptor: d, etRef, section })
  }
  return rows.length ? { set: top.set, rows, share: top.positions / Math.max(1, kind.positions) } : null
}
