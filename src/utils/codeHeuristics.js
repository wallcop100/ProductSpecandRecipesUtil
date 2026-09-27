/**
 * codeHeuristics.js — what a product code looks like, before anyone has taught the tool.
 *
 * Makers' codes carry digits and letters or separators (EYP-TA-R-CR-…, 05.5171.14ADA,
 * UN22SVDW214012G2, 021-1102). Spec values carry digits too, so they are ruled out by
 * shape: 2700K, IP67, 1000mm, RAL9010, 26x26, CRI90. Used as a SUGGESTION: nothing is a
 * code until a row is confirmed, and one click in the table changes it.
 */

const SPEC_VALUE = [
  /^\d{3,5}K$/i, /^IP\d{2}$/i, /^\d+(\.\d+)?(mm|cm|m|w|v|ma|a|deg|lm|hz)$/i,
  /^RAL\d+/i, /^\d{1,4}[x×]\d{1,4}/i, /^CRI\d+/i, /^(AISI|SS|GR)\d{3}[A-Z]?$/i, /^[LHWD]\d{2,4}$/i,
]

export function looksLikeProductCode(text) {
  const s = String(text ?? '')
  const alnum = s.replace(/[^A-Za-z0-9]/g, '')
  if (alnum.length < 4 || !/\d/.test(s)) return false
  if (SPEC_VALUE.some(re => re.test(s))) return false
  if (/[A-Za-z]/.test(s)) return true      // UN22SVDW214012G2, 7A3194.4XG
  if (/[-./]/.test(s)) return true         // 021-1102, 05.4524
  return alnum.length >= 5                  // 20025310 — but not a bare "1013"
}

/**
 * A cell that names no product yet. Two kinds, because they are handled differently:
 *
 *   none — there is no product here at all: "n/a", "-", "by others", "by specialist",
 *          "see …". Nothing to add.
 *   tbc  — a product is wanted but not chosen yet: "TBC", "*custom*", "Awaiting custom
 *          code". It still needs a placeholder Product Spec row and its own ElementType.
 */
const NONE_WORD = /^(-+|–|—|n\/?a|n\.a\.?|none|nil|0)$/i
const NONE_PHRASE = /^(by\s+(others|specialist|id|client|contractor)\b|see\s|as\s+per\b|feed\b)/i
const TBC_WORD = /^(tbc|tba|tbd|custom)$/i
const TBC_PHRASE = /^(awaiting\b|specification\s|spécification\s)/i

const bare = text => String(text ?? '').replace(/\*/g, '').trim()

/** No product at all ("n/a", "by specialist"): nothing to add. */
export function isNoProductText(text) {
  const t = bare(text)
  return t === '' || NONE_WORD.test(t) || NONE_PHRASE.test(t)
}

/** Either kind of placeholder: not a product code. */
export function isPlaceholderText(text) {
  const t = bare(text)
  return isNoProductText(t) || TBC_WORD.test(t) || TBC_PHRASE.test(t)
}
