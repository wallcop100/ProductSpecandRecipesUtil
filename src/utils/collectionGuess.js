/**
 * collectionGuess.js — where does a new ElementType belong in the DesignDB tree?
 *
 * The parent is NOT a prefix of the ref. In the real DesignDB `ET-CCR-D-300-1CH-01`
 * sits under `ET-REMOTE-DRIVERS`, and `LC9` under `ET-CABLE`. Nothing about the ref
 * predicts the family, so the only honest source is what the workbook already does:
 *
 *   FIND THE NEAREST SIBLING and adopt its ParentRef.
 *
 * "Nearest" is the most leading hyphen-segments in common. That number IS the
 * confidence, and it is reported, because a two-segment match is a guess and a
 * four-segment match is nearly a fact. Measured on project 5642:
 *
 *   ET-CCR-D-250-1CH-01 → ET-REMOTE-DRIVERS   (3 segments — right)
 *   ET-LIN-01           → ET-LIN-COMPONENTS   (2 segments — WRONG; it is an assembled
 *                                              wrapper, not a component of one)
 *
 * So nothing here is ever applied automatically. A guess is a proposal.
 */

import { CANON_FAMILIES } from '../data/etCanon.js'

const lc = s => String(s ?? '').trim().toLowerCase()
const segs = ref => String(ref ?? '').toUpperCase().split('-').filter(Boolean)

/** Leading hyphen-segments two refs share. `ET` alone counts for 1 and means nothing. */
export function sharedSegments(a, b) {
  const A = segs(a)
  const B = segs(b)
  let i = 0
  while (i < A.length && i < B.length && A[i] === B[i]) i++
  return i
}

/** Below this, a match is prefix noise: every ref starts with "ET". */
export const MIN_SEGMENTS = 2
/** At or above this, the family is near-certain rather than merely likely. */
export const CONFIDENT_SEGMENTS = 3

/**
 * guessCollection(ref, elementTypes, collectionRefs)
 *   → { parent, via, segments, confident } | null
 *
 * `via` names the sibling (or collection) the guess was read from, so the user can see
 * WHY. A collection whose own ref is a complete prefix of the new ref wins outright —
 * `ET-LIN-TAPE-09` under `ET-LIN-TAPE` needs no sibling.
 */
export function guessCollection(ref, elementTypes = [], collectionRefs = []) {
  if (!ref) return null
  const target = segs(ref)

  let best = null
  // Strictly more segments wins. On a tie a real collection beats a sibling, because a
  // collection that IS a prefix of the ref states the family; a sibling only implies it.
  const better = cand => !best || cand.segments > best.segments ||
    (cand.segments === best.segments && cand.byPrefix && !best.byPrefix)

  // 1. A collection whose whole ref is a leading prefix of this one.
  //    ET-LIN-TAPE-09 → ET-LIN-TAPE, needing no sibling at all.
  for (const c of collectionRefs) {
    const n = sharedSegments(ref, c)
    if (n < MIN_SEGMENTS || n !== segs(c).length || n >= target.length) continue
    const cand = { parent: c, via: c, segments: n, byPrefix: true }
    if (better(cand)) best = cand
  }

  // 2. The nearest sibling that already has a parent. A DEEPER sibling still wins:
  //    ET-LIN-CAP-09 belongs with ET-LIN-CAP-01 (3 segments) under ET-LIN-COMPONENTS,
  //    not with the shallower ET-LIN collection (2).
  for (const e of elementTypes) {
    const eRef = e.ElementTypeRef || e.elementTypeRef
    const parent = e.Family || e.family || e.ParentRef || e.parentRef
    if (!eRef || !parent) continue
    if (lc(eRef) === lc(ref)) continue
    const n = sharedSegments(ref, eRef)
    if (n < MIN_SEGMENTS) continue
    const cand = { parent, via: eRef, segments: n, byPrefix: false }
    if (better(cand)) best = cand
  }
  if (!best) return null

  // A prefix collection names the family outright; a sibling has to be believed.
  return { ...best, confident: best.byPrefix || best.segments >= CONFIDENT_SEGMENTS }
}

/** Guess for many refs at once. Unresolved refs come back with `guess: null`. */
export function guessCollections(refs = [], elementTypes = [], collectionRefs = []) {
  return refs.map(ref => ({ ref, guess: guessCollection(ref, elementTypes, collectionRefs) }))
}

// ---------------------------------------------------------------------------
// The house style guide: the families a DesignDB is SUPPOSED to have.
//
// The real workbook predates it — it has ET-LIN-COMPONENTS where the guide says
// ET-LIN-INGREDIENTS, and no ET-DL or ET-PS at all, which is exactly why the wrappers
// and the point sources have nowhere to go. Seeding the missing ones is offered, never
// automatic: it writes rows into the master.
//
// The list itself lives in src/data/etCanon.js (one copy, shared with the import's
// ElementType seeding).
// ---------------------------------------------------------------------------
export const STYLE_GUIDE = CANON_FAMILIES.map(f => ({
  ref: f.ref, name: f.description, ...(f.parent ? { parent: f.parent } : {}),
}))

/**
 * missingFamilies(refs, elementTypes, collectionRefs)
 *   → the style-guide collections that WOULD give one of `refs` a home, and that this
 *     workbook does not have.
 *
 * Only families that actually adopt something are offered. Seeding `ET-LIGHTINGCONTROL`
 * into a project with no lighting controls is clutter, not tidiness.
 */
export function missingFamilies(refs = [], elementTypes = [], collectionRefs = []) {
  const have = new Set([
    ...collectionRefs.map(lc),
    ...elementTypes.map(e => lc(e.ElementTypeRef || e.elementTypeRef)),
  ])

  const out = []
  for (const fam of STYLE_GUIDE) {
    if (have.has(lc(fam.ref))) continue
    const famSegs = segs(fam.ref).length
    const adopts = refs.filter(r => {
      const n = sharedSegments(r, fam.ref)
      return n === famSegs && n >= MIN_SEGMENTS && segs(r).length > famSegs
    })
    if (adopts.length === 0) continue
    out.push({ ...fam, adopts })
  }

  // A deeper family wins its members: ET-LIN-TAPE-09 belongs to ET-LIN-TAPE, not ET-LIN.
  const claimed = new Map()
  for (const fam of [...out].sort((a, b) => segs(b.ref).length - segs(a.ref).length)) {
    for (const r of fam.adopts) if (!claimed.has(lc(r))) claimed.set(lc(r), fam.ref)
  }
  return out
    .map(fam => ({ ...fam, adopts: fam.adopts.filter(r => claimed.get(lc(r)) === fam.ref) }))
    .filter(fam => fam.adopts.length > 0)
    .sort((a, b) => segs(a.ref).length - segs(b.ref).length || a.ref.localeCompare(b.ref))
}
