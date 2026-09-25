/**
 * accessories.js — a Form's Accessories column holds more product codes for the same
 * position ("UN223DFP25241000", "A00665.40 glare snoot"). They are read after the product
 * code, on a new line — a line break always splits codes — so the first code stays the
 * lead and accessories become extras.
 *
 * A placeholder ("-", "n/a", "none", "tbc") adds nothing, and a code already written in the
 * ProductCode cell is not read twice.
 */
const PLACEHOLDER = /^(-+|–|—|n\/?a|none|nil|tbc|0)$/i

export function isPlaceholder(text) {
  const t = String(text ?? '').trim()
  return t === '' || PLACEHOLDER.test(t)
}

export function joinAccessories(code, acc) {
  const main = String(code ?? '').trim()
  if (isPlaceholder(acc)) return main
  const seen = new Set((main.match(/\S+/g) || []).filter(w => /\d/.test(w)).map(w => w.toLowerCase()))
  const extra = String(acc).split(/\r?\n/)
    .map(line => line.split(/(\s+)/).filter(w => !(/\d/.test(w) && seen.has(w.toLowerCase()))).join('').trim())
    .filter(line => line && !isPlaceholder(line))
    .join('\n')
  if (!extra) return main
  return main ? `${main}\n${extra}` : extra
}
