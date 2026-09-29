/**
 * connectorGroups.js — connector templates as GROUPS of positions.
 *
 * A position's connector set-up is its SIGNATURE: every connector part in its recipe
 * (its own rows plus its wrapper's internals), each as { ref, section, quantity } where
 * section is 'position' (site, first-fix) or 'internal' (inside the wrapper). Positions
 * with the same signature are a group; a group can become a template, a template can be
 * changed for its whole group, forked, or split.
 *
 * What counts as a connector part is NOT hard-coded to ET-CONNECTORS: a socket, plug,
 * strain relief or lever by its ref (process.md §6.1 naming), or any ElementType in a
 * family the user picks.
 *
 * Membership: a template covers a position when the position is PINNED to it (and matches
 * its tags, if it has any), or — when the position is pinned nowhere — when the template's
 * tag filter matches. A position pinned to one template is out of every other template's
 * filter; a position REMOVED from a template (excludes) is out of it whatever the filter. Two filters matching
 * one unpinned position is a CLASH, flagged for the user to settle by pinning.
 * Pure.
 */
import { positionRecipeWithWrapperInternals } from './collectionStatus'
import { rowSlot, normalizeSection, POSITION, INTERNAL } from './recipePresence'
import { roleOf } from './recipePatterns'
import { connectorRole } from './connectors'

const lc = s => String(s ?? '').trim().toLowerCase()
const live = r => (r.IsDeleted || r.isDeleted) !== 'Y'
const etOf = r => r.ElementTypeRef || r.elementTypeRef || ''
const qtyOf = r => { const q = Number(r.Quantity ?? r.quantity); return Number.isFinite(q) && q > 0 ? q : 1 }
const parse = v => (Array.isArray(v) ? v : (() => { try { return JSON.parse(v || '[]') } catch { return [] } })())

/** A connector by its name: a socket, plug or strain relief (connectors.js), or a lever (process.md §6.4). */
export function looksLikeConnector(ref) {
  if (!ref) return false
  return !!connectorRole(ref) || roleOf(ref) === 'LEVER'
}

/**
 * isConnectorPart(ref, { familyOf, families }) — by name, or by being in one of the
 * chosen families (lowercased refs in `families`).
 */
export function isConnectorPart(ref, { familyOf = () => '', families = null } = {}) {
  if (!ref) return false
  if (families && families.size && families.has(lc(familyOf(ref)))) return true
  return looksLikeConnector(ref)
}

/** Template ingredients as parts: [{ ref, section, quantity }], sorted. */
export function templateParts(collection) {
  return sortParts(parse(collection?.Ingredients).map(i => ({
    ref: i.ElementTypeRef || i.slotLabel || i.ref || '',
    section: normalizeSection(i.section),
    quantity: Number(i.quantity) > 0 ? Number(i.quantity) : 1,
  })).filter(p => p.ref))
}

/** Parts back into template ingredients. */
export function partsToIngredients(parts) {
  return (parts || []).map(p => ({ ElementTypeRef: p.ref, section: p.section === INTERNAL ? 'dl_internal' : 'position', quantity: p.quantity || 1 }))
}

export function sortParts(parts) {
  return [...parts].sort((a, b) => (a.section === b.section ? 0 : a.section === POSITION ? -1 : 1) || lc(a.ref).localeCompare(lc(b.ref)))
}

export const signatureKey = parts => sortParts(parts).map(p => `${p.section}|${lc(p.ref)}|${p.quantity}`).join(';')

/**
 * The connector parts of one position: own rows and its wrapper's internals, quantities
 * summed per (section, ref).
 */
export function connectorSignature(recipes, posRef, opts = {}) {
  const { combined, wrapperRefs } = positionRecipeWithWrapperInternals(recipes, posRef)
  const wrappers = new Set(wrapperRefs.map(lc))
  const by = new Map()
  for (const r of combined) {
    if (!live(r)) continue
    const ref = etOf(r)
    if (!isConnectorPart(ref, opts)) continue
    const { section, container } = rowSlot(r)
    if (section === INTERNAL && container && !wrappers.has(container)) continue
    const key = `${section}|${lc(ref)}`
    const cur = by.get(key) || { ref, section, quantity: 0 }
    cur.quantity += qtyOf(r)
    by.set(key, cur)
  }
  return sortParts([...by.values()])
}

/** Every position's signature: Map(posRef → parts). Positions without connectors are left out. */
export function signatures(positionTypes, recipes, opts = {}) {
  const out = new Map()
  for (const pt of positionTypes || []) {
    const ref = pt.PositionTypeRef
    const parts = connectorSignature(recipes, ref, opts)
    if (parts.length) out.set(ref, parts)
  }
  return out
}

/**
 * findGroups(sigs) → [{ key, parts, positions }] — positions sharing a signature, the
 * biggest first. `exclude` (set of signature keys) drops groups already a template.
 */
export function findGroups(sigs, { exclude = new Set(), min = 1 } = {}) {
  const groups = new Map()
  for (const [pos, parts] of sigs) {
    const key = signatureKey(parts)
    if (!groups.has(key)) groups.set(key, { key, parts, positions: [] })
    groups.get(key).positions.push(pos)
  }
  return [...groups.values()]
    .filter(g => !exclude.has(g.key) && g.positions.length >= min)
    .sort((a, b) => b.positions.length - a.positions.length || a.key.localeCompare(b.key))
}

/**
 * What it takes to turn `have` into `want`, per (section, ref):
 * → { add: [part], remove: [part], qty: [{ ...part, from }] }
 */
export function diffParts(have, want) {
  const k = p => `${p.section}|${lc(p.ref)}`
  const h = new Map(have.map(p => [k(p), p]))
  const w = new Map(want.map(p => [k(p), p]))
  const add = [], remove = [], qty = []
  for (const [key, p] of w) {
    const cur = h.get(key)
    if (!cur) add.push(p)
    else if (cur.quantity !== p.quantity) qty.push({ ...p, from: cur.quantity })
  }
  for (const [key, p] of h) if (!w.has(key)) remove.push(p)
  return { add, remove, qty }
}

export const diffSize = d => d.add.length + d.remove.length + d.qty.length

/** Human label for a signature: "Site: 5PIN-SOCKET, 5PIN-SR · Wrapper: 2PIN-PLUG ×2". */
export function describeParts(parts) {
  const side = s => parts.filter(p => p.section === s).map(p => `${p.ref}${p.quantity > 1 ? ` ×${p.quantity}` : ''}`)
  const site = side(POSITION), inside = side(INTERNAL)
  return [site.length && `Site: ${site.join(', ')}`, inside.length && `Wrapper: ${inside.join(', ')}`].filter(Boolean).join(' · ') || 'no connectors'
}

/**
 * membership(positionRefs, collections, pins, tagsOf) →
 *   Map(posRef → { templates: [collectionId], pinnedTo: id|null, clash: bool })
 * pins: { [collectionId]: [posRef] }.
 */
export function membership(positionRefs, collections, pins = {}, tagsOf = () => [], excludes = {}) {
  const pinnedTo = new Map()
  for (const [id, refs] of Object.entries(pins || {})) for (const r of refs || []) pinnedTo.set(r, id)
  const removed = (id, pos) => (excludes?.[id] || []).includes(pos)
  const out = new Map()
  for (const pos of positionRefs) {
    const tags = tagsOf(pos) || []
    const pin = pinnedTo.get(pos) || null
    const pinTpl = pin && (collections || []).find(c => c.CollectionId === pin)
    if (pinTpl) {
      // Pinned: this template only — and still subject to its tags, when it has any.
      const incl = parse(pinTpl.ApplicableTags), excl = parse(pinTpl.ExcludedTags)
      const ok = !removed(pin, pos) && !(excl.length && excl.some(t => tags.includes(t)))
        && (incl.length === 0 || incl.some(t => tags.includes(t)))
      out.set(pos, { templates: ok ? [pin] : [], pinnedTo: pin, clash: false })
      continue
    }
    const matches = (collections || [])
      .filter(c => !removed(c.CollectionId, pos) && filterMatches(c, tags, { hasPins: (pins?.[c.CollectionId] || []).length > 0 }))
      .map(c => c.CollectionId)
    out.set(pos, { templates: matches, pinnedTo: null, clash: matches.length > 1 })
  }
  return out
}

/**
 * The tag filter alone. A template with no included tags and no pinned positions keeps
 * the old meaning (applies everywhere); once it has pins, an empty filter adds nobody.
 */
export function filterMatches(collection, tags, { hasPins = false } = {}) {
  const incl = parse(collection.ApplicableTags)
  const excl = parse(collection.ExcludedTags)
  if (excl.length && excl.some(t => tags.includes(t))) return false
  if (incl.length === 0) return !hasPins
  return incl.some(t => tags.includes(t))
}

/**
 * nearMisses(parts, sigs, members, max) → [{ posRef, diff }] — positions (not already
 * exact) whose connectors are within `max` changes of the template, members first.
 */
export function nearMisses(parts, sigs, { members = new Set(), max = 2 } = {}) {
  const out = []
  for (const [pos, have] of sigs) {
    const d = diffParts(have, parts)
    const n = diffSize(d)
    if (n === 0 || n > max) continue
    // At least half the template must already be there: a near miss, not a stranger.
    const shared = parts.filter(p => have.some(h => h.section === p.section && lc(h.ref) === lc(p.ref))).length
    if (shared * 2 < parts.length) continue
    out.push({ posRef: pos, diff: d, member: members.has(pos) })
  }
  return out.sort((a, b) => (b.member - a.member) || diffSize(a.diff) - diffSize(b.diff) || a.posRef.localeCompare(b.posRef))
}

/** A readable default name for a group: its site parts, else its wrapper parts. */
export function suggestName(parts) {
  const short = r => r.replace(/^ET-/i, '')
  const site = parts.filter(p => p.section === POSITION).map(p => short(p.ref))
  const inside = parts.filter(p => p.section === INTERNAL).map(p => short(p.ref))
  return (site.length ? site.join(' + ') : `in wrapper: ${inside.join(' + ')}`).slice(0, 60)
}
