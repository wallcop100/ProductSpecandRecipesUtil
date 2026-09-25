/**
 * styleLibrary.js — how ElementTypes have been named before, on any project, reused to
 * name new ones.
 *
 * Every project opened contributes EXEMPLARS: a real product (maker + code) and the
 * ElementType it became — its family, ref, name and description. They are kept
 * tool-wide (see dbSchema `style_exemplars`), so a project with no families yet can
 * still be seeded the way the last one was.
 *
 * Seeding is by ANALOGY with the nearest exemplar: the same maker, and a code sharing a
 * real stem (the same product line). The new ref copies the exemplar's shape:
 *
 *   exemplar  SL0240A3-260mA  → ET-CCL-D-260-1CH-01   (family ET-DRIVER)
 *   new code  SL0240A3-350mA  → ET-CCL-D-350-1CH-NN   the "260" that came from the code
 *                                                     becomes "350"; the rest is kept
 *
 * Each part of the exemplar's ref middle is one of three kinds, and treated accordingly:
 *
 *   from its CODE   ("260" of SL0240A3-260mA) — mapped onto the new code, or, if that
 *                   cannot be done, the whole style is refused: copying it would give a
 *                   new product another product's ref;
 *   from its TEXT   ("Plug" of "2-pin plug", "CAP" of "End Caps") — kept only if the new
 *                   product's own text (Form product name, description, note) says it too;
 *                   otherwise the ref falls back to the plain family and is marked
 *                   `partial` ("check the ref") — a ref with a word missing is not a ref;
 *   neither         ("LIN") — the project's own vocabulary, kept.
 *
 * Pure. Nothing here reads or writes storage.
 */

import { sharedStem } from './etRefSuggest'
import { hasProductIdentity } from './productCodes'

const lc = s => String(s ?? '').trim().toLowerCase()
const refOf = e => e.ElementTypeRef || e.elementTypeRef || ''
const famOf = e => e.Family || e.family || ''
const COUNTER_RE = /^(.*)-(\d+)$/

/** Code tokens: split on punctuation AND letter/digit boundaries. SL0240A3-260mA → SL 0240 A 3 260 mA */
export const codeTokens = code => String(code ?? '').match(/[A-Za-z]+|[0-9]+/g) || []

/**
 * Exemplars from one project: every ElementType with a family AND a real product
 * (maker + code) in the Product Spec. Wrappers ("N/A") and unnamed products teach nothing.
 */
export function harvestExemplars({ elementTypes = [], psRows = [], source = '' } = {}) {
  const spec = new Map()
  for (const r of psRows) {
    if ((r.IsDeleted || r.isDeleted) === 'Y') continue
    spec.set(lc(r.ElementTypeRef || r.elementTypeRef), r)
  }
  const out = []
  for (const et of elementTypes) {
    const ref = refOf(et)
    const family = famOf(et)
    const p = spec.get(lc(ref))
    if (!ref || !family || !p) continue
    const code = String(p.ProductCode || p.productCode || '').trim()
    const maker = String(p.Manufacturer || p.manufacturer || '').trim()
    if (!maker || !hasProductIdentity(code)) continue
    out.push({
      maker, code, family, ref,
      name: String(et.Name || et.name || '').trim(),
      description: String(et.Description || et.description || '').trim(),
      source,
    })
  }
  return out
}

/**
 * The nearest exemplars: same maker, longest shared code stem (≥ 4). Every exemplar tied at
 * that stem is returned — the library may hold one product under two refs (a driver used
 * locally on one job and remotely on another), and that disagreement must be seen.
 */
export function nearestExemplars(code, maker, exemplars = []) {
  let best = 0
  let hits = []
  for (const ex of exemplars) {
    if (lc(ex.maker) !== lc(maker)) continue
    const stem = sharedStem(code, ex.code)
    if (stem < 4 || stem < best) continue
    if (stem > best) { best = stem; hits = [] }
    hits.push(ex)
  }
  return hits
}

/**
 * The ref shape of an exemplar: `head` (its family when the ref starts with it, else the
 * ref's own first segment, "ET") and the `middle` between head and counter.
 *   ET-LIN-FLEX-ULTIMO103D-01 (family ET-LIN-FLEX) → { head: 'ET-LIN-FLEX', middle: 'ULTIMO103D' }
 *   ET-CCL-D-260-1CH-01       (family ET-DRIVER)   → { head: 'ET', middle: 'CCL-D-260-1CH' }
 */
export function refShape(ref, family) {
  const m = String(ref).match(COUNTER_RE)
  const body = m ? m[1] : String(ref)
  if (family && lc(body).startsWith(lc(family) + '-')) return { head: body.slice(0, family.length), middle: body.slice(family.length + 1) }
  if (family && lc(body) === lc(family)) return { head: body, middle: '' }
  const [head, ...rest] = body.split('-')
  return { head, middle: rest.join('-') }
}

const textWords = s => new Set((String(s ?? '').toLowerCase().match(/[a-z]+|[0-9]+/g) || []))
/** Does a word-ish segment ("Plug", "CAP", "5Pin", "0409") appear in the text? Plurals count. */
function inText(seg, words) {
  const parts = seg.toLowerCase().match(/[a-z]+|[0-9]+/g) || []
  return parts.length > 0 && parts.every(p => words.has(p) || words.has(p + 's') || words.has(p + 'es'))
}

/**
 * Carry an exemplar's ref middle over to a new code.
 * → { middle, partial } or null when a code-derived part cannot be mapped onto this code.
 *
 * `fromText` is the exemplar's Name + Description; `toText` what is known of the new product.
 */
export function carryMiddle(middle, fromCode, toCode, fromText = '', toText = '') {
  if (!middle) return { middle: '', partial: false }
  const fromWords = textWords(fromText)
  const toWords = textWords(toText)
  const codeWords = textWords(codeTokens(fromCode).join(' '))
  let partial = false
  const a = codeTokens(fromCode), b = codeTokens(toCode)
  const changed = new Map()   // lc exemplar token -> new token
  if (a.length === b.length) a.forEach((t, i) => { if (lc(t) !== lc(b[i])) changed.set(lc(t), b[i]) })
  // Exemplar tokens that are specific enough to have been copied into a ref.
  const telling = new Set(a.filter(t => t.length >= 2 && /\d/.test(t)).map(lc))
  const sameShape = a.length === b.length

  const codeSegs = new Set()
  const segs = middle.split('-').map((seg, i) => {
    const k = lc(seg)
    if (changed.has(k)) { codeSegs.add(i); return changed.get(k).toUpperCase() }
    if (inText(seg, codeWords)) codeSegs.add(i)
    // A segment that embeds a code token which differs (or can't be aligned) is unsafe.
    for (const t of telling) {
      if (!k.includes(t)) continue
      if (!sameShape || changed.has(t)) return null
    }
    // ...or that is PART of a code token which changed ("48" of HLG48048 → HLG48024).
    if (k.length >= 2 && /\d/.test(k)) {
      for (const t of changed.keys()) if (t !== k && t.includes(k)) return null
      if (!sameShape && a.some(t => lc(t) !== k && lc(t).includes(k))) return null
    }
    // From the exemplar's text, not its code: only the new product's text can vouch for it.
    if (inText(seg, fromWords) && !inText(seg, codeWords) && !inText(seg, toWords)) {
      partial = true
      return ''
    }
    return seg
  })
  if (segs.includes(null)) return null
  // Positions dropped as '' keep their index here, so callers can line segments up.
  return { middle: segs.filter(Boolean).join('-'), partial, segments: segs, codeSegs, toWords }
}

/**
 * Ref positions that differ between sibling exemplars (same family, same head, same number
 * of segments) — an attribute the project encodes in the ref. → Set<index>
 * "CCL"/"CCR" in ET-CC?-D-260-1CH is one: local or remote, which no code says.
 */
function varyingPositions(lead, exemplars) {
  const { head, middle } = refShape(lead.ref, lead.family)
  const n = middle ? middle.split('-').length : 0
  const values = Array.from({ length: n }, () => new Set())
  for (const ex of exemplars) {
    if (lc(ex.family) !== lc(lead.family)) continue
    const sh = refShape(ex.ref, ex.family)
    if (lc(sh.head) !== lc(head) || !sh.middle) continue
    const segs = sh.middle.split('-')
    if (segs.length !== n) continue
    segs.forEach((v, i) => values[i].add(lc(v)))
  }
  return new Set(values.map((v, i) => (v.size > 1 ? i : -1)).filter(i => i >= 0))
}

/**
 * The style for a new code, from the library. → null, or
 *   { family, refBase, exemplar, partial, alternatives }
 * `refBase` is the ref without its counter; the caller numbers it. `partial` means part of
 * the exemplar's ref could not be vouched for and was left out, or that equally near
 * exemplars disagree (`alternatives` lists their refs) — check the ref.
 *
 * `text` is whatever is known of the new product: the Form's product name, description, note.
 */
export function styleFor(code, maker, exemplars = [], text = '') {
  const hits = nearestExemplars(code, maker, exemplars)
  if (hits.length === 0) return null

  const styled = hits.map(ex => {
    const { head, middle } = refShape(ex.ref, ex.family)
    const carried = carryMiddle(middle, ex.code, code, `${ex.name} ${ex.description}`, text)
    const fallback = head.toUpperCase() === 'ET' ? ex.family : head
    // A position that varies between siblings, taken neither from the code nor vouched for
    // by the new product's text, is this exemplar's choice — not necessarily this product's.
    let undecided = false
    if (carried?.segments) {
      for (const i of varyingPositions(ex, exemplars)) {
        const seg = carried.segments[i]
        if (seg && !carried.codeSegs.has(i) && !inText(seg, carried.toWords)) undecided = true
      }
    }
    return {
      family: ex.family,
      // A middle with a part dropped reads like a ref but isn't one ("ET-LIN-AQN16" from
    // ET-LIN-PROFILE-AQN16): use the plain family then, and let "styled like" show the rest.
    refBase: carried?.middle && !carried.partial ? `${head}-${carried.middle}` : fallback,
      exemplar: ex,
      partial: !carried || carried.partial || undecided,
    }
  })

  // The most common answer leads; any disagreement is reported, never hidden.
  const tally = new Map()
  for (const st of styled) tally.set(st.refBase.toLowerCase(), (tally.get(st.refBase.toLowerCase()) || 0) + 1)
  styled.sort((x, y) => tally.get(y.refBase.toLowerCase()) - tally.get(x.refBase.toLowerCase()))
  const lead = styled[0]
  const alternatives = [...new Set(styled.map(st => st.refBase))].filter(r => r.toLowerCase() !== lead.refBase.toLowerCase())
  return { ...lead, alternatives, partial: lead.partial || alternatives.length > 0 }
}
