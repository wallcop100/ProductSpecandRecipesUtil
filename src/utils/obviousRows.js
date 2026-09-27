import { applyRules, acceptSuggestions } from './codeLearning'
import { deriveCaptures } from './productCodes'
import { looksLikeProductCode, isPlaceholderText } from './codeHeuristics'

/** One word, a code: no space inside it (a stray "/" or "+" beside it doesn't count). */
const oneWord = code => code.split(/\s+/).filter(w => /[A-Za-z0-9]/.test(w)).length === 1

/**
 * A row made only of placeholders ("TBC", "n/a", "by specialist", "Awaiting custom code")
 * or nothing at all: there is no product to add, so there is nothing to decide.
 */
export function isNothingRow(row) {
  if (row.tokens.some(t => looksLikeProductCode(t.text))) return false
  const lines = String(row.rawText || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  return lines.length === 0 || lines.every(isPlaceholderText)
}

/**
 * A row nobody needs to look at. After taking its suggestions:
 *   - it is a placeholder row (nothing to add); or
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
  if (caps.length === 0) return false
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
