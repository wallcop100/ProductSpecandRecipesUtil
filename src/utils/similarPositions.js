/**
 * similarPositions.js — "what other positions are like this one?"
 *
 * The Form is silent about plenty of positions (`A02wE`), and the honest question is
 * usually "is this a technical variant of something the Form DOES describe?". To answer
 * it you want to glance at comparable positions.
 *
 * NOT by ref resemblance. ptResolve.js is explicit that a project may name positions any
 * way it likes — "never compares prefixes … Only ExtRef speaks" — so concluding that
 * `A02wE` belongs with `A02` because the strings look alike is precisely the inference
 * this codebase refuses to make. It would be right here and quietly wrong on the next
 * project. Similarity is therefore read only from what the data actually STATES:
 *
 *   family — the DB's own ParentRef grouping (positionFamilyOf). The DB speaking.
 *   tags   — what the position IS (Local / LIN / DL / IP). Drives templates + validation.
 *   recipe — how far their ingredient sets already coincide. Observed, not guessed.
 *
 * Every candidate is returned, scored and sorted — including the ones with nothing in
 * common (score 0), so the caller can always offer a free pick over all positions rather
 * than pretending the ranking is the whole truth.
 */

import { positionFamilyOf } from './positionFamily'

const refOf = pt => pt.PositionTypeRef || pt.positionTypeRef || ''
const posOf = r => r.PositionTypeRef || r.positionTypeRef || ''
const etOf = r => r.ElementTypeRef || r.elementTypeRef || ''

/** Overlap of two sets, 0..1. Two empty sets share nothing to speak of. */
export function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const v of a) if (b.has(v)) inter++
  return inter / (a.size + b.size - inter)
}

/** The live ElementType refs a position's recipe uses, lowercased. */
function etsOf(recipes, ref) {
  const out = new Set()
  for (const r of recipes) {
    if (posOf(r) !== ref) continue
    if ((r.IsDeleted || r.isDeleted) === 'Y') continue
    const et = etOf(r).toLowerCase()
    if (et) out.add(et)
  }
  return out
}

/**
 * similarPositions(posRef, { positionTypes, recipes, positionUI })
 *   → [{ ref, family, sameFamily, sharedTags, tagScore, recipeOverlap, rowCount, score }]
 *     sorted best-first. Excludes the position itself.
 *
 * A family match is the DB stating the relationship, so it outweighs the two inferred
 * signals; tags say what the thing IS, the recipe says what it is made of.
 */
export function similarPositions(posRef, { positionTypes = [], recipes = [], positionUI = {} } = {}) {
  if (!posRef) return []

  const self = positionTypes.find(pt => refOf(pt) === posRef)
  const selfFamily = self ? positionFamilyOf(self) : null
  const selfTags = new Set(positionUI[posRef]?.tags || [])
  const selfEts = etsOf(recipes, posRef)

  const out = []
  for (const pt of positionTypes) {
    const ref = refOf(pt)
    if (!ref || ref === posRef) continue

    const family = positionFamilyOf(pt)
    const sameFamily = !!selfFamily && family === selfFamily
    const tags = new Set(positionUI[ref]?.tags || [])
    const sharedTags = [...selfTags].filter(t => tags.has(t))
    const tagScore = jaccard(selfTags, tags)
    const ets = etsOf(recipes, ref)
    const recipeOverlap = jaccard(selfEts, ets)

    out.push({
      ref,
      family,
      sameFamily,
      sharedTags,
      tagScore,
      recipeOverlap,
      rowCount: ets.size,
      score: (sameFamily ? 2 : 0) + tagScore * 1.5 + recipeOverlap,
    })
  }

  return out.sort((a, b) => b.score - a.score || a.ref.localeCompare(b.ref))
}

/** A short human reason a position was ranked where it was. */
export function similarityReason(s) {
  const bits = []
  if (s.sameFamily) bits.push('same family')
  if (s.sharedTags.length > 0) bits.push(`${s.sharedTags.join(', ')}`)
  if (s.recipeOverlap > 0) bits.push(`${Math.round(s.recipeOverlap * 100)}% same recipe`)
  return bits.join(' · ')
}
