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

const psRefOf = r => r.ElementTypeRef || r.elementTypeRef || r.EntityRef || r.entityRef || ''
const dbRefOf = r => r.ElementTypeRef || r.elementTypeRef || ''

/**
 * retirableElementTypes({ recipes, deadRefs, psRows, elementTypes }) →
 *   [{ ref, rsRowIds, onlyIn, inPs, inDb }]
 *
 * An ElementType is retirable when NO live recipe uses it — whether that is because the only
 * recipe using it is on a dead position, or because it is a Product Spec entry no recipe uses
 * at all (an orphan like ET-PS-14). "All recipe items must have a PS entry", so anything a
 * live recipe uses is always kept; everything else with a record is cruft.
 *
 * The keep-set is what is reachable from a LIVE position: that position's own ElementTypes,
 * and — transitively — the internals of any wrapper it reaches. The candidate universe is
 * anchored on real records: every ElementType named by a recipe row OR carrying a Product
 * Spec row. Candidates minus keep is the retire set.
 *
 * Per item: `rsRowIds` are the (dead) recipe rows to soft-delete, `onlyIn` the positions it
 * appears under (empty for a pure PS orphan), and `inPs` / `inDb` say which of the other two
 * workbooks also carry it — the deletion cascades to those (IsDeleted), IF they exist.
 * `ref` keeps its original casing.
 */
export function retirableElementTypes({ recipes = [], deadRefs = new Set(), psRows = [], elementTypes = [] } = {}) {
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

  // Flood from live position-level rows down through the wrapper internals they reach.
  const keep = new Set()
  const queue = []
  for (const r of liveRows) {
    if (ctxOf(r) !== 'PositionType' || !etOf(r) || isDead(posOf(r))) continue
    const k = lc(etOf(r))
    if (!keep.has(k)) { keep.add(k); queue.push(k) }
  }
  while (queue.length) {
    const container = queue.shift()
    for (const r of internalByContainer.get(container) || []) {
      const k = lc(etOf(r))
      if (k && !keep.has(k)) { keep.add(k); queue.push(k) }
    }
  }

  // Candidate universe: anything with a record — a recipe row, or a Product Spec row.
  const psByRef = new Map()   // lc -> live PS row
  for (const p of psRows) { if (live(p) && psRefOf(p)) psByRef.set(lc(psRefOf(p)), p) }
  const dbByRef = new Map()   // lc -> live DB master row
  for (const e of elementTypes) { if (live(e) && dbRefOf(e)) dbByRef.set(lc(dbRefOf(e)), e) }

  const meta = new Map()   // lc ref -> { ref, rsRowIds:Set, onlyIn:Set }
  const ensure = (k, ref) => {
    if (!meta.has(k)) meta.set(k, { ref, rsRowIds: new Set(), onlyIn: new Set() })
    const m = meta.get(k)
    if (!m.ref && ref) m.ref = ref
    return m
  }
  for (const r of liveRows) { const k = lc(etOf(r)); if (k) ensure(k, etOf(r)) }
  for (const [k, p] of psByRef) ensure(k, psRefOf(p))

  const retire = []
  for (const [k, m] of meta) {
    if (keep.has(k)) continue
    for (const r of liveRows) {
      if (lc(etOf(r)) !== k) continue
      if (r._id) m.rsRowIds.add(r._id)
      if (posOf(r)) m.onlyIn.add(posOf(r))
    }
    retire.push({
      ref: m.ref,
      rsRowIds: [...m.rsRowIds],
      onlyIn: [...m.onlyIn].sort(),
      inPs: psByRef.has(k),
      inDb: dbByRef.has(k),
    })
  }
  return retire.sort((a, b) => a.ref.localeCompare(b.ref))
}
