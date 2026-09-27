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
 * A cell that names no product: TBC, n/a, "by specialist", "Awaiting custom code",
 * "*custom*". Rows made only of these have nothing to add.
 */
const PLACEHOLDER_WORD = /^(-+|–|—|n\/?a|n\.a\.?|none|nil|tbc|tba|tbd|0|custom)$/i
const PLACEHOLDER_PHRASE = /^(by\s+(others|specialist|id|client|contractor)\b|awaiting\b|specification\s|spécification\s|see\s|as\s+per\b|feed\b)/i

export function isPlaceholderText(text) {
  const t = String(text ?? '').replace(/\*/g, '').trim()
  return t === '' || PLACEHOLDER_WORD.test(t) || PLACEHOLDER_PHRASE.test(t)
}
