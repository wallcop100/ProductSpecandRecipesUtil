/**
 * deadPositions.js — which positions are "dead", and which ElementTypes exist only to serve
 * them.
 *
 * A position is DEAD when either signal says nobody will build it:
 *   • the Form marked it ExcludeFromOutput = Y, or
 *   • no live physical Position in the DesignDB is an instance of it.
 *
 * An ElementType (and any wrapper internals under it) reachable ONLY from dead positions is
 * dead weight — nothing live builds it — and can be retired. An ET a live position still
 * uses is kept, even if a dead position uses it too. "Solely" is the whole point.
 *
 * Pure and read-only. All ref comparison is lowercase.
 *
 * THE ExtRef SUBTLETY: the Form names a position `C02`; the DesignDB row whose ExtRef claims
 * `C02` (say `C02r`) is where the recipe lives, and `Positions.TypeRef` is that same recipe
 * ref. So the two signals must be brought into ONE key space — the recipe's PositionTypeRef —
 * before anything is compared. Naive string-matching the bare Form ref against recipe rows
 * would silently disagree. Only ExtRef speaks: excluded Form refs go through resolveFormRef.
 */

import { resolveFormRef } from './ptResolve.js'

const lc = s => String(s || '').trim().toLowerCase()
const live = r => (r.IsDeleted || r.isDeleted) !== 'Y'
const posOf = r => r.PositionTypeRef || r.positionTypeRef || ''
const etOf = r => r.ElementTypeRef || r.elementTypeRef || ''
const ctxOf = r => r.ContextType || r.contextType
const crefOf = r => r.ContextRef || r.contextRef || ''

/**
 * deadPositionRefs({ recipes, positions, positionTypes, formCaptures }) → Set<lc recipeRef>
 *
 * Only positions that actually bear a recipe are considered — nothing else can hold an
 * ElementType to retire. When the DesignDB carries no Positions sheet (`positions` empty),
 * the zero-instance signal does NOT fire: absence of data is not evidence of absence.
 */
export function deadPositionRefs({ recipes = [], positions = [], positionTypes = [], formCaptures = null } = {}) {
  const recipeRefs = [...new Set(recipes.filter(live).map(posOf).filter(Boolean))]

  const havePositions = positions.length > 0
  const placed = new Set(positions.map(p => lc(p.TypeRef || p.typeRef)).filter(Boolean))

  // ExcludeFromOutput Form refs, resolved into recipe space via ExtRef.
  const excluded = new Set()
  for (const fref of formCaptures?.excludedFormRefs || []) {
    const target = resolveFormRef(fref, positionTypes).target
    if (target) excluded.add(lc(target))
  }

  const dead = new Set()
  for (const ref of recipeRefs) {
    const k = lc(ref)
    if (excluded.has(k)) dead.add(k)
    else if (havePositions && !placed.has(k)) dead.add(k)
  }
  return dead
}

/**
 * retirableElementTypes({ recipes, deadRefs, containerETRefs }) →
 *   [{ ref, rsRowIds, onlyIn }]
 *
 * `ref` keeps its original casing. `rsRowIds` are every live recipe row that refers to it
 * (all of which sit in a dead subgraph, by construction). `onlyIn` names the dead positions
 * it appears under, for the preview.
 *
 * The keep-set is what is reachable from a LIVE position: that position's own ElementTypes,
 * and — transitively — the internals of any wrapper it reaches. Anything used in a dead
 * position's subgraph but NOT in the keep-set is retirable.
 */
export function retirableElementTypes({ recipes = [], deadRefs = new Set() } = {}) {
  const liveRows = recipes.filter(live)
  const isDead = ref => deadRefs.has(lc(ref))

  // Internal rows grouped by the container they sit inside (across all positions, because a
  // shared wrapper's internals may be stored under one position yet reached from another).
  const internalByContainer = new Map()   // lc(container) -> rows
  for (const r of liveRows) {
    if (ctxOf(r) === 'ElementType' && crefOf(r)) {
      const key = lc(crefOf(r))
      if (!internalByContainer.has(key)) internalByContainer.set(key, [])
      internalByContainer.get(key).push(r)
    }
  }

  // Flood from a set of seed ET refs down through wrapper internals.
  const flood = seedRows => {
    const seen = new Set()
    const queue = []
    for (const r of seedRows) {
      const k = lc(etOf(r))
      if (k && !seen.has(k)) { seen.add(k); queue.push(k) }
    }
    while (queue.length) {
      const container = queue.shift()
      for (const r of internalByContainer.get(container) || []) {
        const k = lc(etOf(r))
        if (k && !seen.has(k)) { seen.add(k); queue.push(k) }
      }
    }
    return seen
  }

  const positionRows = liveRows.filter(r => ctxOf(r) === 'PositionType' && etOf(r))
  const keep = flood(positionRows.filter(r => !isDead(posOf(r))))
  const deadUsed = flood(positionRows.filter(r => isDead(posOf(r))))

  // Retirable = used by a dead position, and not kept alive by any live one.
  const retireRefs = [...deadUsed].filter(k => !keep.has(k))
  if (retireRefs.length === 0) return []
  const retireSet = new Set(retireRefs)

  // Gather rows + original casing + which dead positions each appears under.
  const meta = new Map()   // lc ref -> { ref, rsRowIds:Set, onlyIn:Set }
  const ensure = k => meta.get(k) || meta.set(k, { ref: null, rsRowIds: new Set(), onlyIn: new Set() }).get(k)
  for (const r of liveRows) {
    const k = lc(etOf(r))
    if (!retireSet.has(k)) continue
    const m = ensure(k)
    if (!m.ref) m.ref = etOf(r)
    if (r._id) m.rsRowIds.add(r._id)
    if (posOf(r)) m.onlyIn.add(posOf(r))
  }

  return retireRefs.map(k => {
    const m = meta.get(k)
    return { ref: m.ref, rsRowIds: [...m.rsRowIds], onlyIn: [...m.onlyIn].sort() }
  }).sort((a, b) => a.ref.localeCompare(b.ref))
}
