/**
 * knownCodes.js — stage ① of the import: what does the Product Spec already know?
 *
 * Most of a revised Form is unchanged. On the real project, 63 of 184 tokens across
 * 40 Form rows are VERBATIM product codes already in the spec, and 33 of those rows
 * contain at least one. Making the user paint them again is busywork.
 *
 * An exact hit against the project's own Product Spec is a LOOKUP, not a guess. So
 * it is painted for you — visibly, countably, and reversibly. Anything less certain
 * is never painted:
 *
 *   exact   — this run of tokens IS a known product code. Painted.
 *   variant — this run CONTAINS a known code but is not it ("FPS2020BG2000-EM").
 *             The whole reason the review step exists: "errr, that's the same code
 *             with a bit more on the end, so it's a different product." Flagged only.
 *
 * MATCHING IS SPAN-AWARE, and it has to be. Real spec codes are multi-token:
 * "SP6569 - NL-INFDT-27-X-M-NA-AWB-54", "XAL 011-8000018M",
 * "MICRO FLIGHT CASE BY IW MLS". Matching single tokens would miss all three and
 * then report their first word as a bogus "variant" of them.
 *
 * Longest match wins, left to right, and matched spans do not overlap.
 */

import { norm, hasProductIdentity } from './productCodes'

/** How many tokens a single product code may span. "MICRO FLIGHT CASE BY IW MLS" is 6. */
const MAX_SPAN = 8

/** Below this, a prefix relation is coincidence rather than a variant. */
const MIN_VARIANT_BASE = 5

const isAlnum = t => /[A-Za-z0-9]/.test(t.text)

/**
 * Index the Product Spec by normalised code.
 * → Map<normCode, { code, ref, manufacturer }>   (first row wins; ties are the
 *   user's duplicate problem, not ours)
 */
export function indexKnownCodes(master = []) {
  const byCode = new Map()
  for (const m of master) {
    if (!hasProductIdentity(m.code)) continue
    const key = norm(m.code)
    if (!byCode.has(key)) byCode.set(key, { code: m.code, ref: m.ref, manufacturer: m.manufacturer })
  }
  return byCode
}

/** The literal text a token span covers, exactly as the user typed it. */
const spanText = (row, a, b) => row.rawText.slice(row.tokens[a].start, row.tokens[b].end).trim()

/**
 * matchKnownCodes(row, index) → { exact, variants }
 *
 *   exact    [{ range: [a, b], code, ref, manufacturer }]
 *   variants [{ range: [a, b], text, base, ref, manufacturer, extra }]
 *
 * `extra` is what the run carries beyond the known code — the thing the user has to
 * judge. Ranges never overlap; an exact match consumes its tokens.
 */
export function matchKnownCodes(row, index) {
  const exact = []
  const variants = []
  if (!row?.tokens?.length || !index?.size) return { exact, variants }

  const n = row.tokens.length
  let i = 0
  while (i < n) {
    if (!isAlnum(row.tokens[i])) { i++; continue }

    // Longest span first: "XAL 011-8000018M" must beat "XAL".
    let hit = null
    for (let j = Math.min(i + MAX_SPAN - 1, n - 1); j >= i; j--) {
      if (!isAlnum(row.tokens[j])) continue
      const text = spanText(row, i, j)
      const found = index.get(norm(text))
      if (found) { hit = { range: [i, j], ...found }; break }
    }
    if (hit) { exact.push(hit); i = hit.range[1] + 1; continue }

    // Not a known code. Does this single token carry one, plus something more?
    const v = variantAt(row, i, index)
    if (v) variants.push(v)
    i++
  }
  return { exact, variants }
}

/**
 * A token that is a known code with extra on the end (or the spec's code with extra
 * on the end of it). Either way the two are not the same product, and only a human
 * can say whether the difference matters.
 */
function variantAt(row, i, index) {
  const text = row.tokens[i].text
  const nt = norm(text)
  if (!hasProductIdentity(text) || nt.length < MIN_VARIANT_BASE) return null

  let best = null
  for (const [key, info] of index) {
    if (key === nt || key.length < MIN_VARIANT_BASE) continue
    const longerHasShorter = nt.startsWith(key)
    const shorterInLonger = key.startsWith(nt)
    if (!longerHasShorter && !shorterInLonger) continue
    // Prefer the longest shared base — the most specific claim.
    if (!best || key.length > norm(best.base).length) {
      best = {
        range: [i, i],
        text,
        base: info.code,
        ref: info.ref,
        manufacturer: info.manufacturer,
        extra: longerHasShorter ? text.slice(info.code.length) : '',
      }
    }
  }
  return best
}

/**
 * Two exact matches whose tokens TOUCH must not both be painted.
 *
 * A code is a run of adjacent 'code' tokens (productCodes.codeRuns), so painting
 * "TBC" beside "XAL 011-8000018M" merges them into "TBC XAL 011-8000018M" — a code
 * that exists in no spec and in no catalogue. Rather than invent one, paint neither
 * and hand the pair to the human. Rare, and always worth a look when it happens.
 */
function splitAdjacent(exact) {
  const paint = []
  const touching = []
  for (let i = 0; i < exact.length; i++) {
    const prev = exact[i - 1]
    const next = exact[i + 1]
    const touchesPrev = prev && prev.range[1] + 1 === exact[i].range[0]
    const touchesNext = next && exact[i].range[1] + 1 === next.range[0]
    ;(touchesPrev || touchesNext ? touching : paint).push(exact[i])
  }
  return { paint, touching }
}

/**
 * applyKnownCodes(rows, master) → { rows, exactCount, variantCount, adjacentCount, byRow }
 *
 * Paints every exact run as a code, as a per-row override (a decision about THIS
 * row, not a batch rule about a token's text). Variants are reported, never painted.
 * Neither are runs that touch another run — see splitAdjacent.
 *
 * Idempotent: re-running over already-painted rows changes nothing.
 */
export function applyKnownCodes(rows = [], master = []) {
  const index = indexKnownCodes(master)
  const byRow = new Map()
  let exactCount = 0
  let variantCount = 0
  let adjacentCount = 0

  if (index.size === 0) return { rows, exactCount, variantCount, adjacentCount, byRow }

  const next = rows.map(row => {
    const { exact, variants } = matchKnownCodes(row, index)
    if (!exact.length && !variants.length) return row

    const { paint, touching } = splitAdjacent(exact)
    byRow.set(row.id, { exact: paint, variants, adjacent: touching })
    variantCount += variants.length
    adjacentCount += touching.length

    if (!paint.length) return row
    const overrides = { ...row.overrides }
    for (const e of paint) {
      exactCount++
      for (let k = e.range[0]; k <= e.range[1]; k++) overrides[k] = 'code'
    }
    return { ...row, overrides }
  })

  return { rows: next, exactCount, variantCount, adjacentCount, byRow }
}

/** Token indices painted from the spec, for the paint surface to style differently. */
export function knownTokenIndices(match) {
  const out = new Set()
  for (const e of match?.exact || []) {
    for (let k = e.range[0]; k <= e.range[1]; k++) out.add(k)
  }
  return out
}
