/**
 * etSeed.js — proposals for the ElementTypes a Form import still needs.
 *
 * Creating them one at a time was the slow part of an import, and the suggested ref
 * was wrong in kind: `ET-<MANUFACTURER>-01`. A real DesignDB names an ElementType by
 * its FAMILY — `ET-PS-45` (point source), `ET-LIN-…`, `ET-DL-01` — and the family is
 * the ElementType's ParentRef. The Name carries the product: "EldoLED - SL0240A3".
 *
 * So every unassigned code gets a proposal: include it, in this family, with this ref,
 * name and description. The user weeds out the bad ones rather than building the good
 * ones by hand. Nothing here writes anything.
 *
 * The family is a vote between three signals, each reported in `why` so a wrong guess
 * is easy to see and to correct for a whole group at once:
 *
 *   code     — families of products whose codes share a real stem with this one, from
 *              the same maker (FPSN0809BG2000 sits with FPSN0809ECG). Strongest.
 *   maker    — the families this manufacturer's products already sit in (EldoLED →
 *              drivers). A maker's catalogue is narrow.
 *   words    — words in the Form (product name, description, the code's note) that
 *              appear in a family's own members' names ("downlight", "linear").
 *   position — the family of the design (IsDesign) ElementType of the positions that
 *              ask for this code. Weakest: a position also asks for its driver.
 *
 * Pure and dependency-free apart from the shared ref helpers.
 */

import { sharedStem } from './etRefSuggest'

const lc = s => String(s ?? '').trim().toLowerCase()
const refOf = e => e.ElementTypeRef || e.elementTypeRef || ''
const famOf = e => e.Family || e.family || ''
const COUNTER_RE = /^(.*)-(\d+)$/

/** Words worth matching: alphabetic, 4+ letters, not filler. */
const STOP = new Set(['with', 'from', 'type', 'family', 'white', 'black', 'custom', 'standard', 'mounted', 'light', 'lighting', 'fitting', 'luminaire'])
const words = s => String(s ?? '').toLowerCase().match(/[a-z]{4,}/g)?.filter(w => !STOP.has(w)) ?? []

/**
 * The project's families and what they are made of.
 * → Map<family ref, { members: Set<lc ref>, vocab: Map<word, count> }>
 */
export function familyIndex(elementTypes = [], collectionRefs = []) {
  const idx = new Map()
  const get = f => {
    if (!idx.has(f)) idx.set(f, { members: new Set(), vocab: new Map() })
    return idx.get(f)
  }
  for (const f of collectionRefs) if (f) get(f)
  for (const et of elementTypes) {
    const f = famOf(et)
    if (!f) continue
    const fam = get(f)
    fam.members.add(lc(refOf(et)))
    for (const w of words(`${et.Name || ''} ${et.Description || ''}`)) {
      fam.vocab.set(w, (fam.vocab.get(w) || 0) + 1)
    }
  }
  return idx
}

/** The next free `<family>-NN`, counting refs already taken AND refs handed out in this batch. */
export function nextRef(family, taken, width = 2) {
  const base = lc(family)
  let max = 0
  for (const r of taken) {
    const m = String(r).match(COUNTER_RE)
    if (m && lc(m[1]) === base) max = Math.max(max, parseInt(m[2], 10))
  }
  return `${family}-${String(max + 1).padStart(width, '0')}`
}

/** "Manufacturer - Code", the DesignDB's own naming for a product ElementType. */
export const seedName = (manufacturer, code) =>
  [String(manufacturer || '').trim(), String(code || '').trim()].filter(Boolean).join(' - ')

/**
 * Score every family for one code. → [{ family, score, why: ['maker', …] }] best first.
 *
 * `signals` = { code, manufacturer, text, designFamilies: [family] }
 * `ctx`     = { families (familyIndex), makerFamilies: Map<lc maker, Map<family, n>>,
 *               products: [{ code, maker (lc), family }] }
 */
export function rankFamilies(signals, ctx) {
  const scores = new Map()
  const add = (family, pts, why) => {
    if (!family || !ctx.families.has(family)) return
    const s = scores.get(family) || { family, score: 0, why: new Set() }
    s.score += pts
    s.why.add(why)
    scores.set(family, s)
  }

  // code: a shared leading stem with an existing product of the same maker
  for (const { code, maker, family } of ctx.products || []) {
    if (maker !== lc(signals.manufacturer)) continue
    const stem = sharedStem(signals.code, code)
    if (stem >= 4) add(family, 4 * Math.min(1, stem / Math.max(4, String(signals.code).length)), 'code')
  }

  // maker: share of this maker's existing products in each family
  const byMaker = ctx.makerFamilies.get(lc(signals.manufacturer))
  if (byMaker) {
    const total = [...byMaker.values()].reduce((a, b) => a + b, 0)
    for (const [f, n] of byMaker) add(f, 3 * (n / total), 'maker')
  }

  // words: rarer words count for more (a word in every family says nothing)
  const ws = new Set(words(signals.text))
  if (ws.size) {
    const spread = new Map()
    for (const [, fam] of ctx.families) for (const w of fam.vocab.keys()) spread.set(w, (spread.get(w) || 0) + 1)
    for (const [f, fam] of ctx.families) {
      let hit = 0
      for (const w of ws) if (fam.vocab.has(w)) hit += 1 / spread.get(w)
      if (hit > 0) add(f, 2 * Math.min(1, hit), 'words')
    }
  }

  // position: the family of what these positions are designed around
  const design = signals.designFamilies || []
  for (const f of design) add(f, 1 / design.length, 'position')

  return [...scores.values()]
    .map(s => ({ ...s, why: [...s.why] }))
    .sort((a, b) => b.score - a.score || a.family.localeCompare(b.family))
}

/**
 * Proposals for every code that still has no ElementType.
 *
 * entries  — distinct codes: { text, manufacturers, positionTypes, variants, reuse, blocked }
 * project  — { elementTypes, psRows, recipes, collectionRefs, ptTarget(formRef), contextFor(entry) }
 *
 * → [{ code, manufacturer, include, action: 'create'|'reuse', reuseRef, family, ref,
 *      name, description, why, alternatives }]
 *
 * An entry that already has a same-product match in the project is proposed as a REUSE
 * of it, not a new ElementType — the dedup win stays the default.
 */
export function proposeElementTypes(entries = [], project = {}) {
  const {
    elementTypes = [], psRows = [], recipes = [], collectionRefs = [],
    ptTarget = r => r, contextFor = () => '',
  } = project

  const families = familyIndex(elementTypes, collectionRefs)
  const etFamily = new Map(elementTypes.map(e => [lc(refOf(e)), famOf(e)]))

  const makerFamilies = new Map()
  const products = []
  for (const r of psRows) {
    const maker = lc(r.Manufacturer || r.manufacturer)
    const f = etFamily.get(lc(r.ElementTypeRef || r.elementTypeRef))
    if (!maker || !f) continue
    const code = String(r.ProductCode || r.productCode || '').trim()
    if (code && code.toUpperCase() !== 'N/A') products.push({ code, maker, family: f })
    if (!makerFamilies.has(maker)) makerFamilies.set(maker, new Map())
    const m = makerFamilies.get(maker)
    m.set(f, (m.get(f) || 0) + 1)
  }

  const designFamilyOf = new Map()   // lc PositionTypeRef -> [family]
  for (const r of recipes) {
    if ((r.IsDeleted || r.isDeleted) === 'Y') continue
    if ((r.IsDesign || r.isDesign) !== 'Y') continue
    const f = etFamily.get(lc(r.ElementTypeRef || r.elementTypeRef))
    const pt = lc(r.PositionTypeRef || r.positionTypeRef)
    if (!f || !pt) continue
    if (!designFamilyOf.has(pt)) designFamilyOf.set(pt, [])
    designFamilyOf.get(pt).push(f)
  }

  const ctx = { families, makerFamilies, products }
  const taken = new Set(elementTypes.map(refOf))
  const out = []

  for (const e of entries) {
    const manufacturer = e.manufacturers?.[0] || ''
    const note = e.variants?.[0]?.note || ''
    const same = (e.reuse || []).find(c => c.kind === 'same')

    const designFamilies = (e.positionTypes || [])
      .flatMap(pt => designFamilyOf.get(lc(ptTarget(pt) || pt)) || [])
    const context = contextFor(e) || ''
    const ranked = rankFamilies({ code: e.text, manufacturer, text: `${context} ${note}`, designFamilies }, ctx)
    const best = ranked[0] || null

    const family = best?.family || ''
    const ref = family ? nextRef(family, taken) : ''
    if (ref) taken.add(ref)

    out.push({
      code: e.text,
      manufacturer,
      include: !e.blocked,
      action: same ? 'reuse' : 'create',
      reuseRef: same?.ref || null,
      family,
      ref,
      name: seedName(manufacturer, e.text),
      description: [context, note].map(s => String(s).trim()).filter(Boolean).join(' — '),
      why: best?.why || [],
      alternatives: ranked.slice(1, 4).map(r => r.family),
    })
  }
  return out
}

/**
 * Move proposals to another family, re-numbering their refs so none collide with the
 * project or each other. Used when the user corrects a whole group at once.
 */
export function refamily(proposals, indices, family, elementTypes = []) {
  const pick = new Set(indices)
  const taken = new Set(elementTypes.map(refOf))
  proposals.forEach((p, i) => { if (!pick.has(i) && p.ref) taken.add(p.ref) })
  return proposals.map((p, i) => {
    if (!pick.has(i)) return p
    const ref = family ? nextRef(family, taken) : ''
    if (ref) taken.add(ref)
    return { ...p, family, ref, why: family === p.family ? p.why : ['you'] }
  })
}
