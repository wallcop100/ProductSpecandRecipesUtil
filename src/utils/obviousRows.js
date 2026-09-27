import { applyRules, acceptSuggestions } from './codeLearning'
import { deriveCaptures } from './productCodes'
import { looksLikeProductCode, isNoProductText } from './codeHeuristics'

/** One word, a code: no space inside it (a stray "/" or "+" beside it doesn't count). */
const oneWord = code => code.split(/\s+/).filter(w => /[A-Za-z0-9]/.test(w)).length === 1

const cellLines = row => String(row.rawText || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
const hasCodeWord = row => row.tokens.some(t => looksLikeProductCode(t.text))

/**
 * A row with no product at all ("n/a", "by specialist", "-", or empty): nothing to add,
 * so there is nothing to decide.
 */
export function isNothingRow(row) {
  if (hasCodeWord(row)) return false
  return cellLines(row).every(isNoProductText)
}

/**
 * A row that wants a product nobody has chosen yet: "TBC", "*custom*", "Awaiting custom
 * code", or words with no code in them ("Light Sheet", "BE/ZEP/IB/**"). It gets a
 * placeholder Product Spec row (ProductCode TBC) and an ElementType of its own.
 * Whether it really has no code is the caller's to check (a painted code wins).
 */
export function isTbcRow(row) {
  if (hasCodeWord(row)) return false
  const lines = cellLines(row)
  return lines.length > 0 && !lines.every(isNoProductText)
}

/**
 * A row nobody needs to look at. After taking its suggestions:
 *   - it is a placeholder row: nothing to add, or TBC with no code in it; or
 *   - its ProductCode cell yields one code, or several joined by "+" (the Form's own
 *     "main + extras" convention), each a single code-like word; Accessories-column codes
 *     are extras; and nothing else in the cell looks like a code.
 * Codes on separate lines of the ProductCode cell, or side by side with no "+", are left
 * for a person: two products, or one product written twice?
 */
export function isObvious(row, rules = {}, signals = {}, captureOpts = {}) {
  if (row.confirmed) return false
  if (isNothingRow(row)) return true
  const taken = applyRules([acceptSuggestions(row, rules, signals)], rules)[0]
  const caps = deriveCaptures(taken, captureOpts).captures
  // No code at all: a TBC row is one click too (it becomes a placeholder product).
  if (caps.length === 0) return isTbcRow(row)
  if (!caps.every(c => oneWord(c.code) && looksLikeProductCode(c.code))) return false

  const startOf = c => taken.tokens[c.range[0]].start
  const own = taken.accFrom == null ? caps : caps.filter(c => startOf(c) < taken.accFrom)
  if (own.length === 0) return false
  // Between two codes of the ProductCode cell: only a "+" (or "," / "&") and spaces.
  for (let k = 1; k < own.length; k++) {
    const gap = taken.rawText.slice(taken.tokens[own[k - 1].range[1]].end, startOf(own[k]))
    if (!/^[\s]*[+,&][\s]*$/.test(gap)) return false
  }
  const inCode = new Set(caps.flatMap(c => Array.from({ length: c.range[1] - c.range[0] + 1 }, (_, j) => c.range[0] + j)))
  return !taken.tokens.some((t, i) => !inCode.has(i) && taken.roles[i] !== 'discard' && looksLikeProductCode(t.text))
}
