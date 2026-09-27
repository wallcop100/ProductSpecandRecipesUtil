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

/** Where the Accessories text starts in a joined cell (`joinAccessories`), or null when none was added. */
export function accessoriesFrom(code, joined) {
  const main = String(code ?? '').trim()
  if (!joined || joined === main) return null
  return main ? main.length + 1 : 0
}

/**
 * The main product of a row: the one you chose (`row.leadCode`), else the first code from
 * the ProductCode cell itself, else the first code at all. Accessories-column codes are
 * extras unless you say otherwise. `captures` are deriveCaptures(row).captures.
 */
export function leadOf(row, captures = []) {
  if (captures.length === 0) return null
  if (row.leadCode) {
    const chosen = captures.find(c => c.code === row.leadCode)
    if (chosen) return chosen
  }
  if (row.accFrom != null) {
    const own = captures.find(c => (row.tokens[c.range[0]]?.start ?? 0) < row.accFrom)
    if (own) return own
  }
  return captures[0]
}
