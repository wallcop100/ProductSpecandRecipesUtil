/**
 * formSpec.js — the Form's spec versus the recipe that was built from it.
 *
 * THE GOVERNING PRINCIPLE
 *
 *   The Form is the TRUTH. The Recipe contains more detail — connectors, plaster-in
 *   kits, strain reliefs — that never appears in the Form and is DERIVED from the
 *   things in it.
 *
 * Two consequences, and everything here follows from them:
 *
 *   (a) The Form is authoritative about WHICH products a position uses, and silent
 *       about everything else. So a Form ET absent from the recipe is a defect; a
 *       recipe row absent from the Form is not. Extras are never errors.
 *
 *   (b) The Form carries NO slot information. It says "C01 uses product X", never
 *       whether X sits at position level or inside the DL wrapper. Matching with a
 *       section would report every driver and plug that legitimately lives inside a
 *       wrapper as 'misplaced' — noise on nearly every row. So Form matching is
 *       SLOT-AGNOSTIC within the position's scope, and `misplaced` is a state this
 *       module cannot produce. It belongs to connector templates, which do declare
 *       a section (see collectionStatus.js).
 *
 * There is also no `short` state: the Form has no quantity column, so it can say
 * "C01 → FPS2020BG2000" but never "×2". Quantity is the recipe's business.
 */

import { buildPresence, containerForPosition, POSITION, INTERNAL } from './recipePresence'
import { positionRecipeWithWrapperInternals, wrapperUsedBy } from './collectionStatus'
import { isConnector } from './connectors'

const lc = s => String(s ?? '').trim().toLowerCase()
const etOf = r => r.ElementTypeRef || r.elementTypeRef || ''
const refOfEntry = e => e.elementTypeRef || e.ElementTypeRef || ''

/**
 * Is this ref present ANYWHERE in the position's scope?
 *
 * `buildPresence` already indexes exactly the two slots that count — `position|ref`
 * and `internal|ref` — and deliberately excludes internal rows filed under a wrapper
 * this position does not use. Reading both keys is the whole predicate; no new
 * traversal.
 */
export function formPresence(presence, ref) {
  const key = lc(ref)
  const p = presence.bySlot.get(`${POSITION}|${key}`)
  const i = presence.bySlot.get(`${INTERNAL}|${key}`)
  const rows = [...(p?.rows ?? []), ...(i?.rows ?? [])]
  return {
    have: rows.length,
    rows,
    foundIn: p && i ? 'both' : p ? POSITION : i ? INTERNAL : null,
  }
}

/**
 * Why a recipe row is in the recipe but not in the Form. Never an error.
 *
 * Connector wins over contract-item: a socket is usually both, and "connector" is
 * what tells you it was derived from the products the Form does name.
 */
export function classifyExtra(row, container) {
  const ref = etOf(row)
  if (container && lc(ref) === lc(container)) return 'wrapper'
  if (isConnector(ref)) return 'connector'
  if ((row.IsContractItem || row.isContractItem) === 'Y') return 'contract'
  if ((row.ContextType || row.contextType) === 'ElementType') return 'internal'
  return 'other'
}

/**
 * compareFormToRecipe(recipes, posRef, formEts, containerETRefs, { orphanRefs })
 *
 * `formEts` — the captures for this position: [{ elementTypeRef, code, note, manufacturer, formRef }]
 * `orphanRefs` — refs that WERE in a previous Form and are not in this one (§ diff)
 *
 * → { matched, missing, orphaned, extra, container, coverage }
 */
export function compareFormToRecipe(recipes, posRef, formEts = [], containerETRefs = new Set(), { orphanRefs = [] } = {}) {
  const { combined, wrapperRefs } = positionRecipeWithWrapperInternals(recipes, posRef)
  const presence = buildPresence(combined, wrapperRefs)
  const container = containerForPosition(recipes, posRef, containerETRefs)

  const matched = []
  const missing = []
  const specified = new Set()

  for (const entry of formEts) {
    const ref = refOfEntry(entry)
    if (!ref) continue
    specified.add(lc(ref))
    const p = formPresence(presence, ref)
    ;(p.have > 0 ? matched : missing).push({ ...entry, elementTypeRef: ref, ...p })
  }

  // Everything the recipe holds in scope, that the Form never mentioned.
  const orphanSet = new Set(orphanRefs.map(lc))
  const extra = []
  const orphaned = []
  const seen = new Set()
  for (const [key, slot] of presence.bySlot) {
    const ref = key.slice(key.indexOf('|') + 1)
    if (specified.has(ref) || seen.has(ref)) continue
    seen.add(ref)
    const row = slot.rows[0]
    const item = { elementTypeRef: etOf(row), rows: slot.rows, kind: classifyExtra(row, container) }
    if (orphanSet.has(ref)) orphaned.push(item)
    else extra.push(item)
  }

  return {
    matched, missing, orphaned, extra, container,
    coverage: { present: matched.length, total: matched.length + missing.length },
  }
}

/**
 * formPending(formCaptures, posRef) — products the Form asks for here that nobody has
 * given an ElementType yet.
 *
 * Staging is incremental: you may stage the codes that are ready and leave the rest.
 * Those left behind used to be dropped from the captures entirely, so the pane — whose
 * whole promise is "what the Form asks for vs what the recipe has" — could never
 * mention them. An intention with no name is still an intention.
 */
export function formPending(formCaptures, posRef) {
  return formCaptures?.pendingByPosition?.[posRef] ?? []
}

/**
 * Just the numbers, for the roll-up chip. Cheap enough to call per position.
 *
 * `pending` counts toward the total: the Form asked for it and the recipe has not got
 * it. It is simply not addable until it has an ElementType. Counting only what can be
 * added would report 12/12 on a Form that asked for 14.
 */
export function formCoverage(recipes, posRef, formEts, containerETRefs, pending = 0) {
  if ((!formEts || formEts.length === 0) && !pending) return null
  const c = compareFormToRecipe(recipes, posRef, formEts || [], containerETRefs).coverage
  return { present: c.present, total: c.total + pending, pending }
}

/**
 * formWorklist(recipes, formCaptures, containerETRefs) — what is left to reconcile.
 *
 * Reconciliation is per-position, but nothing told you WHICH positions still needed
 * it; you had to open each one and look. Every position the Form speaks about, that
 * does not yet hold everything the Form specifies — or that still carries a code the
 * Form has dropped — in ref order.
 *
 * `orphans` are counted but never make a position "incomplete": an orphan is a soft
 * hint, not a defect (see §2(a)). A position with only orphans still appears, because
 * it needs a look, but its coverage is complete.
 */
export function formWorklist(recipes, formCaptures, containerETRefs = new Set()) {
  const byPosition = formCaptures?.byPosition || {}
  const orphansBy = formCaptures?.orphansByPosition || {}
  const pendingBy = formCaptures?.pendingByPosition || {}

  const refs = [...new Set([
    ...Object.keys(byPosition), ...Object.keys(orphansBy), ...Object.keys(pendingBy),
  ])].sort()
  const out = []
  for (const posRef of refs) {
    const formEts = byPosition[posRef] || []
    const orphanRefs = orphansBy[posRef] || []
    const pending = (pendingBy[posRef] || []).length
    const r = compareFormToRecipe(recipes, posRef, formEts, containerETRefs, { orphanRefs })
    // A pending product is a product the Form asked for and the recipe has not got.
    // It cannot be added yet, but the position is certainly not reconciled.
    if (r.missing.length === 0 && r.orphaned.length === 0 && pending === 0) continue
    out.push({
      posRef,
      coverage: { present: r.coverage.present, total: r.coverage.total + pending, pending },
      missing: r.missing.length,
      orphans: r.orphaned.length,
      pending,
    })
  }
  return out
}

/** Totals for the header: positions done, positions total, products still missing. */
export function formProgress(recipes, formCaptures, containerETRefs = new Set()) {
  const byPosition = formCaptures?.byPosition || {}
  const pendingBy = formCaptures?.pendingByPosition || {}
  const total = new Set([...Object.keys(byPosition), ...Object.keys(pendingBy)]).size
  if (total === 0) return null
  const work = formWorklist(recipes, formCaptures, containerETRefs)
  const incomplete = work.filter(w => w.missing > 0 || w.pending > 0).length
  return {
    total,
    complete: total - incomplete,
    missing: work.reduce((n, w) => n + w.missing, 0),
    orphans: work.reduce((n, w) => n + w.orphans, 0),
    // Named separately: these are blocked on an ElementType, not on you adding a row.
    pending: work.reduce((n, w) => n + (w.pending || 0), 0),
  }
}

// ---------------------------------------------------------------------------
// Re-import: what changed since last time
// ---------------------------------------------------------------------------

const codeKey = e => lc(e.code || refOfEntry(e))

/** Flatten byPosition into Map<codeKey, { posRef, entry }>. Last write wins. */
function indexCaptures(byPosition = {}) {
  const map = new Map()
  for (const [posRef, entries] of Object.entries(byPosition)) {
    for (const e of entries || []) {
      const k = codeKey(e)
      if (k) map.set(k, { posRef, entry: e })
    }
  }
  return map
}

/**
 * diffCaptures(prev, next) — the manual compare the user does when the sheet is
 * revised, done for them.
 *
 * Keyed on the PRODUCT CODE, because that is the thing the spreadsheet actually
 * carries; the ElementType is our interpretation of it, and may itself change.
 *
 * → { added, removed, changed, moved }
 */
export function diffCaptures(prev, next) {
  const before = indexCaptures(prev?.byPosition)
  const after = indexCaptures(next?.byPosition)

  const added = []
  const removed = []
  const changed = []
  const moved = []

  for (const [k, now] of after) {
    const was = before.get(k)
    if (!was) { added.push({ posRef: now.posRef, entry: now.entry }); continue }

    if (was.posRef !== now.posRef) {
      moved.push({ code: now.entry.code, from: was.posRef, to: now.posRef, entry: now.entry })
    }

    const fields = ['elementTypeRef', 'note', 'manufacturer']
      .filter(f => lc(was.entry[f]) !== lc(now.entry[f]))
    if (fields.length) {
      changed.push({ posRef: now.posRef, before: was.entry, after: now.entry, fields })
    }
  }
  for (const [k, was] of before) {
    if (!after.has(k)) removed.push({ posRef: was.posRef, entry: was.entry })
  }

  return { added, removed, changed, moved }
}

// ---------------------------------------------------------------------------
// Wrapper divergence: can the shared wrapper absorb this change, or must it fork?
// ---------------------------------------------------------------------------

/**
 * wrapperDivergence(recipes, diff, containerETRefs)
 *
 * A wrapper is shared. If the Form changed a product for EVERY position using
 * `ET-LIN-01`, edit it in place. If it changed for only SOME, one wrapper cannot
 * hold both states, and the diverging positions need a fork (`duplicateET`).
 *
 * → [{ wrapper, sharers, changedPositions, unchangedPositions, consistent, entries }]
 * Only wrappers actually touched by the diff are reported.
 */
export function wrapperDivergence(recipes, diff, containerETRefs = new Set()) {
  const byWrapper = new Map()

  for (const c of diff?.changed || []) {
    const wrapper = containerForPosition(recipes, c.posRef, containerETRefs)
    if (!wrapper) continue                       // position-level change: nothing shared
    const key = wrapper
    if (!byWrapper.has(key)) byWrapper.set(key, { wrapper, positions: new Set(), entries: [] })
    byWrapper.get(key).positions.add(c.posRef)
    byWrapper.get(key).entries.push(c)
  }

  return [...byWrapper.values()].map(({ wrapper, positions, entries }) => {
    const sharers = wrapperUsedBy(recipes, wrapper)
    const changedPositions = [...positions]
    const unchangedPositions = sharers.filter(p => !positions.has(p))
    return {
      wrapper,
      sharers,
      changedPositions,
      unchangedPositions,
      // One sharer is not "shared" — nothing can diverge.
      consistent: unchangedPositions.length === 0,
      entries,
    }
  })
}

// ---------------------------------------------------------------------------
// Learned association: "X code consistently has Y code"
// ---------------------------------------------------------------------------

/**
 * associations(recipes, captures, { minSupport = 2 })
 *
 * The recipe holds derived detail the Form never mentions. When a Form code goes
 * away, its derived rows MIGHT go with it — but nothing records what derived from
 * what, so we learn it from the project instead:
 *
 *     X implies Y  when  Y is present in EVERY position whose Form set contains X
 *                  and  Y is present in NO position whose Form set lacks X
 *
 * The second clause is what makes it mean something: a connector that appears
 * everywhere is not evidence of anything. Support is |positions containing X|.
 *
 * Advisory only, exactly like codeLearning.js — a suggestion is offered, never
 * applied. → Map<lowercased X ref, [{ ref, support }]>
 */
export function associations(recipes, captures, { minSupport = 2 } = {}) {
  const byPosition = captures?.byPosition || {}
  const positions = Object.keys(byPosition)
  if (positions.length === 0) return new Map()

  // What each position's recipe actually holds, in scope.
  const holds = new Map()
  for (const posRef of positions) {
    const { combined, wrapperRefs } = positionRecipeWithWrapperInternals(recipes, posRef)
    const presence = buildPresence(combined, wrapperRefs)
    const refs = new Set()
    for (const key of presence.bySlot.keys()) refs.add(key.slice(key.indexOf('|') + 1))
    holds.set(posRef, refs)
  }

  // Which positions the Form gives each ET.
  const withX = new Map()
  for (const posRef of positions) {
    for (const e of byPosition[posRef] || []) {
      const x = lc(refOfEntry(e))
      if (!x) continue
      if (!withX.has(x)) withX.set(x, new Set())
      withX.get(x).add(posRef)
    }
  }

  const out = new Map()
  for (const [x, ps] of withX) {
    if (ps.size < minSupport) continue
    const without = positions.filter(p => !ps.has(p))

    const inAll = [...ps].reduce(
      (acc, p) => acc === null ? new Set(holds.get(p)) : new Set([...acc].filter(r => holds.get(p).has(r))),
      null
    ) || new Set()

    const ys = [...inAll]
      .filter(y => y !== x)
      .filter(y => !(byPosition[[...ps][0]] || []).some(e => lc(refOfEntry(e)) === y))  // Y is derived, not itself specified
      .filter(y => without.every(p => !holds.get(p).has(y)))                            // and never seen without X
      .map(y => ({ ref: y, support: ps.size }))

    if (ys.length) out.set(x, ys)
  }
  return out
}
