import { applyRules, acceptSuggestions } from './codeLearning'
import { deriveCaptures } from './productCodes'

/** Looks like a product code: has a digit and at least 4 letters/digits. */
const codeLike = t => /\d/.test(t) && t.replace(/[^A-Za-z0-9]/g, '').length >= 4

/**
 * A row nobody needs to look at: after taking its suggestions it yields exactly ONE code,
 * and nothing else in the cell looks like a code (a second product hiding as a note).
 * Plain words around it ("louvre", "black") are its note and don't make it doubtful.
 *
 * Every code here came from evidence — your painting, a learned rule, the spec's own
 * codes, or a suggestion learned from your painting — so one clean code is safe to take.
 */
export function isObvious(row, rules = {}, signals = {}, captureOpts = {}) {
  if (row.confirmed) return false
  const taken = applyRules([acceptSuggestions(row, rules, signals)], rules)[0]
  const caps = deriveCaptures(taken, captureOpts).captures
  if (caps.length !== 1 || !codeLike(caps[0].code)) return false   // a lone word ("TBC") is not a product
  // Code words side by side merge into one capture ("QC5012 QC5013"): two products or one?
  if (/\s/.test(caps[0].code)) return false
  const [a, b] = caps[0].range
  return !taken.tokens.some((t, i) => (i < a || i > b) && taken.roles[i] !== 'discard' && codeLike(t.text))
}
