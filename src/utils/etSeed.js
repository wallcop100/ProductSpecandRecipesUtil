/**
 * etSeed.js — proposals for the ElementTypes a Form import still needs.
 *
 * Creating them one at a time was the slow part of an import. Every unassigned code now
 * gets a proposal — family, ref, name, description — and the user weeds out the wrong
 * ones. Nothing here writes anything.
 *
 * THE FAMILY is one of the company's (src/data/etCanon.js — Kaizen page 1217215): ET-PS,
 * ET-DL, ET-LIN-TAPE/FLEX/FIXED/PROF/CLIP/MOUNT, ET-DRIVER, ET-CONNECTION… The rule, first
 * match wins, each reported in `why`:
 *
 *   stem      — an existing product from the same maker whose code shares a real stem
 *               (FPSN0809BG3000 beside FPSN0809BG2000). Specific enough to trust.
 *   style     — the tool-wide style library (styleLibrary.js): how this maker's product line
 *               was named on any project opened before. Copies that ref's shape.
 *   shape     — the shipped code-shape table (codeShapes.js): LEDFlex FPS…BG… is a profile,
 *               FPS…PCOPD… a diffuser, EldoLED SL…-…mA a driver.
 *   design    — the family of the design (IsDesign) ElementType already in the recipe of
 *               the positions asking for this code. Only fires once recipes exist.
 *   canon     — the Form: a Point page's lead code is ET-PS, its other codes accessories
 *               unless their words say what they are; a Linear page's code is filed by the
 *               keyword in its text (TAPE, NEON, PROFILE, DIFFUSER…), else ET-LIN-INGREDIENTS
 *               and flagged.
 *   parent    — the position's parent PositionType (DOWNLIGHT → ET-DOWNLIGHT). A last
 *               resort, always flagged: it is not a company family.
 *
 * Nothing is guessed from a maker alone: on an early project (5452) that filed every Phos
 * downlight as a remote driver, because Phos also makes a driver.
 *
 * Linear ingredient refs carry their keyword (Kaizen page 140959): a diffuser files under
 * ET-LIN-PROF but its ref is ET-LIN-DIFF-NN — `head` is that ref prefix.
 *
 * Families that do not exist yet are returned as `newFamilies`, with the canon's description
 * and ParentRef, and their missing parents too.
 */

import { sharedStem } from './etRefSuggest'
import { hasProductIdentity } from './productCodes'
import { styleFor } from './styleLibrary'
import { matchShape } from './codeShapes'
import { CANON_FAMILIES, classifyText } from '../data/etCanon'
import shippedShapes from '../data/codeShapes.json'

const lc = s => String(s ?? '').trim().toLowerCase()
const refOf = e => e.ElementTypeRef || e.elementTypeRef || ''
const famOf = e => e.Family || e.family || ''
const ptRefOf = p => p.PositionTypeRef || p.positionTypeRef || ''
const COUNTER_RE = /^(.*)-(\d+)$/

export const ACCESSORIES = 'ET-PS-ACCESSORIES'
const POINT = 'ET-PS'
const LINEAR_FALLBACK = 'ET-LIN-INGREDIENTS'

/** A PositionType parent as a family ref: "SURFACE MOUNTED POINT SOURCE" → ET-SURFACE-MOUNTED-POINT-SOURCE. */
export function familyRefFor(parent) {
  const body = String(parent ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return body ? `ET-${body}` : ''
}

/**
 * A family's description from its PositionType parent: DOWNLIGHT → "Downlight family",
 * LINEAR-JOINERY → "Linear joinery family". A short all-caps parent (FF&E) is an acronym
 * and stays as written.
 */
export function familyDescription(parent) {
  const raw = String(parent ?? '').trim()
  if (!raw) return ''
  if (raw.length <= 4) return `${raw} family`
  const words = raw.replace(/[-_]+/g, ' ').toLowerCase()
  return `${words[0].toUpperCase()}${words.slice(1)} family`
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

/** Most common value, first-seen wins a tie. → { value, count, distinct } */
function mostCommon(values) {
  const n = new Map()
  for (const v of values) if (v) n.set(v, (n.get(v) || 0) + 1)
  let value = '', count = 0
  for (const [v, c] of n) if (c > count) { value = v; count = c }
  return { value, count, distinct: n.size }
}

/**
 * The family for one code. → { family, head, why, flag, parent?, spread, style?, shape? }
 *
 * `signals` = { code, manufacturer, text, role: 'lead'|'extra', pageType: 'point'|'linear'|'',
 *               designFamilies: [f], parents: [ptParent] }
 * `ctx`     = { products: [{ code, maker (lc), family }], library: [exemplar], shapes: [shape] }
 *
 * `flag` means "a guess worth checking" — the review marks the ref.
 */
export function pickFamily(signals, ctx) {
  const done = (family, why, extra = {}) => ({ family, head: family, why, flag: false, spread: 1, ...extra })

  // stem: the same maker's product line, already filed somewhere in this project
  let best = null
  for (const { code, maker, family } of ctx.products || []) {
    if (!family || maker !== lc(signals.manufacturer)) continue
    const stem = sharedStem(signals.code, code)
    if (stem >= 4 && (!best || stem > best.stem)) best = { family, stem }
  }
  if (best) return done(best.family, 'stem')

  const style = styleFor(signals.code, signals.manufacturer, ctx.library || [], signals.text || '')
  if (style) return done(style.family, 'style', { style, flag: !!style.partial })

  const shape = matchShape(signals.code, signals.manufacturer, ctx.shapes || []).current
  if (shape?.family) return done(shape.family, 'shape', { head: shape.head || shape.family, shape })

  const design = mostCommon(signals.designFamilies || [])
  if (design.value) return done(design.value, 'design', { spread: design.distinct })

  const words = classifyText(signals.text)
  // Text that names two kinds of product ("tape in profile") is a guess, not an answer.
  const mixed = words?.others?.length > 0
  if (signals.pageType === 'point') {
    if (signals.role !== 'extra') return done(POINT, 'canon', { canon: 'Point page' })
    if (words) return done(words.family, 'canon', { head: words.head, canon: words.keyword, flag: mixed })
    return done(ACCESSORIES, 'canon', { canon: 'extra code on a Point page' })
  }
  if (signals.pageType === 'linear') {
    if (words) return done(words.family, 'canon', { head: words.head, canon: words.keyword, flag: mixed })
    return done(LINEAR_FALLBACK, 'canon', { canon: 'Linear page, no keyword', flag: true })
  }
  if (words) return done(words.family, 'canon', { head: words.head, canon: words.keyword, flag: mixed })

  const parent = mostCommon(signals.parents || [])
  if (parent.value) {
    return done(familyRefFor(parent.value), 'parent', { parent: parent.value, spread: parent.distinct, flag: true })
  }
  return { family: '', head: '', why: null, flag: false, spread: 0 }
}

/**
 * Proposals for every code that still has no ElementType.
 *
 * entries  — distinct codes: { text, manufacturers, positionTypes, variants, reuse, blocked }
 * project  — { elementTypes, psRows, recipes, positionTypes, collectionRefs,
 *              ptTarget(formRef), contextFor(entry), roleOf(entry), pageTypeFor(entry),
 *              library: [exemplar], shapes (default: shipped table), families (default: canon) }
 *
 * → { proposals: [{ code, manufacturer, include, action: 'create'|'reuse'|'skip', reuseRef, family,
 *                   ref, name, description, why, parent, spread, styledOn, shapedOn, canon,
 *                   checkRef, alternatives, superseded }],
 *     newFamilies: [{ ref, description, parent, include, from }] }
 *
 * A code that already matches an existing product is proposed as a REUSE of it.
 */
export function proposeElementTypes(entries = [], project = {}) {
  const {
    elementTypes = [], psRows = [], recipes = [], positionTypes = [], collectionRefs = [],
    ptTarget = r => r, contextFor = () => '', roleOf = () => 'lead', pageTypeFor = () => '', library = [],
    shapes = shippedShapes.shapes || [], families = CANON_FAMILIES,
  } = project
  const canonByRef = new Map(families.map(f => [lc(f.ref), f]))

  const etFamily = new Map(elementTypes.map(e => [lc(refOf(e)), famOf(e)]))
  const existingFamilies = new Set([...collectionRefs, ...elementTypes.map(famOf)].filter(Boolean).map(lc))
  const parentOf = new Map(positionTypes.map(p => [lc(ptRefOf(p)), p.ParentRef || p.parentRef || '']))

  const products = []
  for (const r of psRows) {
    const f = etFamily.get(lc(r.ElementTypeRef || r.elementTypeRef))
    const code = String(r.ProductCode || r.productCode || '').trim()
    if (f && code && code.toUpperCase() !== 'N/A') products.push({ code, maker: lc(r.Manufacturer || r.manufacturer), family: f })
  }

  const designFamilyOf = new Map()   // lc PositionTypeRef -> [family]
  for (const r of recipes) {
    if ((r.IsDeleted || r.isDeleted) === 'Y' || (r.IsDesign || r.isDesign) !== 'Y') continue
    const f = etFamily.get(lc(r.ElementTypeRef || r.elementTypeRef))
    const pt = lc(r.PositionTypeRef || r.positionTypeRef)
    if (!f || !pt) continue
    if (!designFamilyOf.has(pt)) designFamilyOf.set(pt, [])
    designFamilyOf.get(pt).push(f)
  }

  const taken = new Set(elementTypes.map(refOf))
  const newFamilies = new Map()   // lc ref -> { ref, description, include, from }
  const proposals = []

  for (const e of entries) {
    const manufacturer = e.manufacturers?.[0] || ''
    const note = e.variants?.[0]?.note || ''
    const same = (e.reuse || []).find(c => c.kind === 'same')
    const targets = (e.positionTypes || []).map(pt => lc(ptTarget(pt) || pt))

    // "N/A", "TBC": not a product, so not an ElementType either.
    if (!hasProductIdentity(e.text)) {
      proposals.push({
        code: e.text, manufacturer, include: false, action: 'skip', reuseRef: null, family: '', ref: '',
        name: '', description: '', why: 'placeholder', parent: null, spread: 0,
      })
      continue
    }

    const context = contextFor(e) || ''
    const pick = pickFamily({
      code: e.text,
      manufacturer,
      text: `${context} ${note}`,
      role: roleOf(e),
      pageType: lc(pageTypeFor(e)).startsWith('point') ? 'point' : lc(pageTypeFor(e)).startsWith('linear') ? 'linear' : '',
      designFamilies: targets.flatMap(t => designFamilyOf.get(t) || []),
      parents: targets.map(t => parentOf.get(t)).filter(Boolean),
    }, { products, library, shapes })

    const family = pick.family
    // Propose the family, and any parent of it the project lacks, from the canon.
    const propose = (ref, from) => {
      if (!ref || existingFamilies.has(lc(ref)) || newFamilies.has(lc(ref))) return
      const canon = canonByRef.get(lc(ref))
      newFamilies.set(lc(ref), {
        ref,
        description: canon?.description || familyDescription(from || ref.replace(/^ET-/i, '')),
        parent: canon?.parent || null,
        include: true,
        from: from || null,
      })
      if (canon?.parent) propose(canon.parent)
    }
    if (family && !same) propose(family, pick.parent)
    const ref = family && !same ? nextRef(pick.style?.refBase || pick.head || family, taken) : ''
    if (ref) taken.add(ref)
    const old = matchShape(e.text, manufacturer, shapes).superseded

    proposals.push({
      code: e.text,
      manufacturer,
      include: !e.blocked,
      action: same ? 'reuse' : 'create',
      reuseRef: same?.ref || null,
      family: same ? '' : family,
      ref,
      name: seedName(manufacturer, e.text),
      description: [context, note].map(s => String(s).trim()).filter(Boolean).join(' — '),
      why: pick.why,
      parent: pick.parent || null,
      spread: pick.spread,
      styledOn: pick.style ? { ref: pick.style.exemplar.ref, code: pick.style.exemplar.code, source: pick.style.exemplar.source } : null,
      shapedOn: pick.shape ? { shape: pick.shape.shape, example: pick.shape.example, n: pick.shape.n } : null,
      canon: pick.canon || null,
      checkRef: !!pick.flag,
      alternatives: pick.style?.alternatives || [],
      superseded: old ? { shape: old.shape, example: old.example } : null,
    })
  }
  return { proposals, newFamilies: [...newFamilies.values()] }
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
    return { ...p, family, ref, why: family === p.family ? p.why : 'you' }
  })
}
