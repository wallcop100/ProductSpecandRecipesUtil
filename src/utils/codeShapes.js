/**
 * codeShapes.js — what KIND of product a code is, from its shape alone.
 *
 * A maker's catalogue is written in a handful of code shapes, and each shape is one kind of
 * product: LEDFlex `FPS2020BG2000` (profile base), `FPS2020PCOPD2000` (diffuser), `UN16TVC2715`
 * (neon flex); EldoLED `SL0240A3-260mA` (driver). The shape table (src/data/codeShapes.json)
 * maps (maker, shape) → canon family and ref head. It holds shapes and a single example code
 * each — no project data — and is rebuilt from catalogues and past projects by
 * scripts/build-code-shapes.mjs.
 *
 * A shape keeps the code's letter runs that name WHAT it is, and reduces the rest to their
 * class — letters `A`, digits `9` — with punctuation kept. Two levels:
 *
 *   fine    first two letter runs literal:  FPS2020BG2000 → FPS9BG9    UN16TVC2715 → UN9TVC9
 *   coarse  first letter run literal only:  FPS2020BG2000 → FPS9A9     UN16TVC2715 → UN9A9
 *
 * The fine level tells a neon (UN…TVC…) from its grip profile (UN…FGP…); the coarse level
 * catches a new variant of a known line, and is only trusted when nearly unanimous.
 * A leading short number is a series and kept: 770-252 → 770-9.
 *
 * Pure.
 */

const lc = s => String(s ?? '').trim().toLowerCase()
/** Makers are compared by letters and digits only: "LightGraphix" = "Light Graphix", "ELdoLED" = "EldoLED". */
export const makerKey = m => String(m ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** The shape of a code at a level ('fine' | 'coarse'). '' for a code with nothing to shape. */
export function shapeOf(code, level = 'coarse') {
  const s = String(code ?? '').toUpperCase().replace(/\s+/g, '')
  const runs = s.match(/[A-Z]+|[0-9]+|[^A-Z0-9]/g) || []
  if (runs.length === 0) return ''
  const literalLetters = level === 'fine' ? 2 : 1
  let lettersSeen = 0
  return runs.map((r, i) => {
    if (/^[A-Z]+$/.test(r)) {
      lettersSeen++
      return lettersSeen <= literalLetters && r.length <= 6 ? r : 'A'
    }
    if (i === 0 && /^[0-9]{1,3}$/.test(r) && runs.length > 1) return r   // numbered series: 770-, 021-
    if (/^[0-9]+$/.test(r)) return '9'
    return r
  }).join('')
}

/**
 * Learn shapes from examples. → [{ maker, shape, family, head, n, agree, example, status }]
 *
 * examples: [{ maker, code, family, head, status?, from? }] — `status: 'superseded'` marks an old
 *   code; `from: 'catalogue'` marks a supplier's own current code (the authority on numbering).
 * A shape is kept when at least `minCount` examples share it and `minAgree` of them agree on
 * the family (coarse shapes: `minCountCoarse` and `minAgreeCoarse`). Everything else is left
 * out: a shape that says two things says nothing. A superseded shape is kept on count alone,
 * with no family when its products disagree — it only has to say "old numbering".
 */
export function buildShapes(examples = [], { minCount = 2, minAgree = 0.75, minAgreeCoarse = 0.9, minCountCoarse = 5 } = {}) {
  const groups = new Map()
  for (const ex of examples) {
    if (!ex.maker || !ex.family) continue
    for (const level of ['fine', 'coarse']) {
      const shape = shapeOf(ex.code, level)
      // A shape with no number in it is a word ("CUSTOM", "MC"), not a code pattern.
      if (!shape || !/[0-9]/.test(shape)) continue
      const key = `${makerKey(ex.maker)}\u0000${shape}\u0000${ex.status || 'current'}\u0000${level}`
      if (!groups.has(key)) groups.set(key, { maker: ex.maker, shape, level, status: ex.status || 'current', rows: [] })
      groups.get(key).rows.push(ex)
    }
  }
  // "Old numbering" must be exclusively old: a shape any current code also has says nothing.
  // Only the supplier's own catalogue says what is current: a project using an old code (before
  // the renumbering) does not make that numbering new.
  const currentShapes = new Set([...groups.values()]
    .filter(g => g.status !== 'superseded' && g.rows.some(r => r.from === 'catalogue'))
    .map(g => `${makerKey(g.maker)}|${g.shape}|${g.level}`))
  const out = []
  for (const g of groups.values()) {
    if (g.status === 'superseded' && currentShapes.has(`${makerKey(g.maker)}|${g.shape}|${g.level}`)) continue
    if (g.rows.length < (g.level === 'coarse' ? minCountCoarse : minCount)) continue
    const votes = new Map()
    for (const r of g.rows) {
      const k = `${r.family}\u0000${r.head || r.family}`
      votes.set(k, (votes.get(k) || 0) + 1)
    }
    const [bestKey, best] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]
    const agree = best / g.rows.length
    const agreed = agree >= (g.level === 'coarse' ? minAgreeCoarse : minAgree)
    // An old numbering is worth flagging whatever mix of products it covered; only a
    // current shape has to say what the product is.
    if (!agreed && g.status !== 'superseded') continue
    const [family, head] = agreed ? bestKey.split('\u0000') : ['', '']
    out.push({
      maker: g.maker, shape: g.shape, level: g.level, family, head, n: g.rows.length,
      agree: Math.round(agree * 100) / 100,
      example: (agreed ? g.rows.find(r => `${r.family}\u0000${r.head || r.family}` === bestKey) : g.rows[0]).code,
      status: g.status,
    })
  }
  // A coarse shape identical to its only fine shape adds nothing.
  const fine = new Set(out.filter(s => s.level === 'fine').map(s => `${makerKey(s.maker)}|${s.shape}|${s.status}`))
  return out
    .filter(s => s.level === 'fine' || !fine.has(`${makerKey(s.maker)}|${s.shape}|${s.status}`))
    .sort((a, b) => lc(a.maker).localeCompare(lc(b.maker)) || a.shape.localeCompare(b.shape)
      || a.status.localeCompare(b.status) || a.level.localeCompare(b.level))
}

/**
 * The shape entries a code matches for this maker. Current shapes first; a superseded one is
 * reported separately so a code can be both "a profile" and "old numbering".
 * → { current: entry|null, superseded: entry|null }
 */
export function matchShape(code, maker, shapes = []) {
  const m = makerKey(maker)
  const find = status => {
    for (const level of ['fine', 'coarse']) {
      const shape = shapeOf(code, level)
      if (!shape) continue
      const hit = shapes.find(s => (s.level || 'coarse') === level && s.shape === shape && makerKey(s.maker) === m
        && (s.status || 'current') === status)
      if (hit) return hit
    }
    return null
  }
  return { current: find('current'), superseded: find('superseded') }
}
