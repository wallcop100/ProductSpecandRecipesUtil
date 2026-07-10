/**
 * etRefSuggest.js — the ElementType assignment brain for the product-code import.
 *
 * Turning a captured code into an ElementType is the pain: avoid duplicates, spot
 * reuse of an ET already in the project, and give it a ref. Real refs are
 * attribute-encoded (ET-CCR-D-250-1CH-EM-01), so the tool can't invent the
 * meaningful middle — it learns the reliable parts (ET- prefix, -NN counter,
 * existing stems) and, above all, detects when a code reuses/varies an existing ET.
 *
 * Pure and dependency-free. Reuses getNextAvailableRef (counter arithmetic) and
 * familyOf.
 */

import { getNextAvailableRef } from './containerUtils'
import { familyOf } from './etRef'
import { hasProductIdentity } from './productCodes'

const norm = s => String(s || '').trim().toUpperCase()
const refOf = e => e.ElementTypeRef || e.elementTypeRef || ''
const COUNTER_RE = /^(.*)-(\d+)$/

/** Alphanumeric tokens (length ≥ 2), for haystack/token comparisons. */
function tokens(s) {
  return norm(s).split(/[^A-Z0-9]+/).filter(t => t.length >= 2)
}

/** Length of the shared leading run of two strings. */
export function sharedStem(a, b) {
  const x = norm(a), y = norm(b)
  let i = 0
  while (i < x.length && i < y.length && x[i] === y[i]) i++
  return i
}

/** Levenshtein ratio in [0,1]; 1 == identical. Compact, no dependency. */
export function similarity(a, b) {
  const x = norm(a), y = norm(b)
  if (!x && !y) return 1
  if (!x || !y) return 0
  if (x === y) return 1
  const m = x.length, n = y.length
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  let cur = new Array(n + 1)
  for (let i = 1; i <= m; i++) {
    cur[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
    }
    [prev, cur] = [cur, prev]
  }
  return 1 - prev[n] / Math.max(m, n)
}

/** Fraction of `needle` tokens present in the `haystack` string. */
export function tokenOverlap(needleTokens, haystack) {
  if (!needleTokens.length) return 0
  const hay = new Set(tokens(haystack))
  let hit = 0
  for (const t of needleTokens) if (hay.has(t)) hit++
  return hit / needleTokens.length
}

/**
 * Learn the project's ref convention from the ETs already in it:
 *   prefix        the dominant leading segment ("ET")
 *   counterWidth  the common trailing -NN width (2)
 *   stems         Map<stem, { refs, family }>  — refs with the counter stripped
 */
export function inferConvention(elementTypes = []) {
  const prefixCount = new Map()
  const widthCount = new Map()
  const stems = new Map()

  for (const et of elementTypes) {
    const ref = refOf(et)
    const m = ref.match(COUNTER_RE)
    if (!m) continue
    const stem = m[1]
    const pfx = ref.split('-')[0]
    prefixCount.set(pfx, (prefixCount.get(pfx) || 0) + 1)
    widthCount.set(m[2].length, (widthCount.get(m[2].length) || 0) + 1)
    if (!stems.has(stem)) stems.set(stem, { refs: [], family: familyOf(ref, et) })
    stems.get(stem).refs.push(ref)
  }

  const top = map => [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
  return {
    prefix: top(prefixCount) || 'ET',
    counterWidth: top(widthCount) || 2,
    stems,
  }
}

/**
 * Existing ETs this captured product might reuse, ranked. Searches each ET's product
 * code (from the Product Spec) plus its Name/Description — on the real DesignDB the
 * product code lives verbatim in the Name ("LEDFlex - FPSN0809ECG"), so a verbatim
 * token hit is a strong "same" signal.
 *
 * A PRODUCT IS (MANUFACTURER, CODE). Two consequences:
 *
 *   · A code with no identity ("N/A", blank) matches nothing. Every wrapper in the
 *     sheet carries "N/A", so it is evidence of nothing — it once suggested reusing
 *     a driver for a pendant, because both were `Ideaworks / N/A`.
 *   · The same code from a DIFFERENT maker is a different product, and carries no
 *     code evidence at all. It is not a weaker match; it is not a match.
 *
 * kind: 'same'    — likely the same product; reuse the ref
 *       'variant' — shares a stem but differs; offer the next counter on that stem
 */
export function reuseCandidates(code, note, { psRows = [], elementTypes = [], manufacturer = '' } = {}, limit = 3) {
  const nc = norm(code)
  if (!hasProductIdentity(code)) return []
  const nm = norm(manufacturer)

  const specByRef = new Map()   // ref -> { code, manufacturer }
  for (const r of psRows) {
    const ref = norm(refOf(r))
    const pc = (r.ProductCode || r.productCode || '').trim()
    const pm = (r.Manufacturer || r.manufacturer || '').trim()
    if (ref) specByRef.set(ref, { code: pc, manufacturer: pm })
  }
  const noteToks = tokens(note)

  /** A blank maker on either side cannot distinguish anything, so it matches. */
  const sameMaker = other => !norm(other) || !nm || norm(other) === nm

  const out = []
  for (const et of elementTypes) {
    const ref = refOf(et)
    if (!ref || (et.IsDeleted || et.isDeleted) === 'Y') continue
    const spec = specByRef.get(norm(ref)) || { code: '', manufacturer: '' }
    // A wrapper's "N/A" is not a code; never let it match or fuzzy-match.
    const pc = hasProductIdentity(spec.code) ? spec.code : ''
    const pm = spec.manufacturer
    const name = et.Name || et.name || ''
    const desc = et.Description || et.description || ''
    const haystackToks = new Set([...tokens(pc), ...tokens(name), ...tokens(desc)])

    // Only an exact/verbatim hit BY THE SAME MAKER is 'same' (safe to reuse).
    // Anything merely similar is a 'variant' — offered, but it earns its own ref by
    // default, so a one-char attribute change (250-1CH vs 250-2CH) is never merged.
    let codeScore = 0
    let kind = 'variant'
    const codeMatches = pc && norm(pc) === nc

    if (codeMatches && sameMaker(pm)) { codeScore = 1; kind = 'same' }
    else if (codeMatches) { codeScore = 0 }   // same code, another maker: another product
    else if (haystackToks.has(nc) && sameMaker(pm)) { codeScore = 0.92; kind = 'same' }
    else if (!codeMatches) {
      const sim = pc ? similarity(nc, norm(pc)) : 0
      const stem = pc ? sharedStem(nc, norm(pc)) : 0
      const stemScore = stem >= 4 ? 0.5 + Math.min(stem / nc.length, 1) * 0.35 : 0
      codeScore = Math.max(sim, stemScore)   // kind stays 'variant'
    }

    // Note overlap only boosts an existing code signal; it never dilutes it.
    const noteScore = tokenOverlap(noteToks, [pc, name, desc].join(' '))
    const score = Math.min(1, codeScore + noteScore * 0.1)
    if (score >= 0.4) out.push({ ref, matchedCode: pc, description: name || desc, score, kind })
  }

  return out.sort((a, b) => b.score - a.score).slice(0, limit)
}

/** A short, alnum, best-effort family token for a brand-new ref (the user edits it). */
function skeletonToken(note, manufacturer, code) {
  const source = [manufacturer, note, code].map(s => String(s || '').trim()).find(Boolean) || 'NEW'
  const word = norm(source).match(/[A-Z0-9]+/)?.[0] || 'NEW'
  return word.slice(0, 8)
}

/**
 * A suggested ElementTypeRef for a captured (code, note):
 *   reuse   — a strong existing match; hand back its ref (no new ET)
 *   variant — shares a stem; the next free counter on that stem (never a dup -01)
 *   new     — a skeleton ET-<guess>-01 in the project's convention; user fills the middle
 */
export function suggestRef(code, note, manufacturer, convention, elementTypes = [], psRows = []) {
  const cands = reuseCandidates(code, note, { psRows, elementTypes, manufacturer }, 3)

  const strong = cands.find(c => c.kind === 'same' && c.score >= 0.85)
  if (strong) return { ref: strong.ref, reason: 'reuse', candidate: strong }

  const variant = cands.find(c => c.score >= 0.5)
  if (variant) {
    const stem = variant.ref.match(COUNTER_RE)?.[1]
    const next = stem && getNextAvailableRef(`${stem}-01`, elementTypes)
    if (next) return { ref: next, reason: 'variant', candidate: variant }
  }

  const guess = skeletonToken(note, manufacturer, code)
  const width = '0'.repeat(Math.max(0, (convention.counterWidth || 2) - 1)) + '1'
  return { ref: `${convention.prefix || 'ET'}-${guess}-${width}`, reason: 'new' }
}
