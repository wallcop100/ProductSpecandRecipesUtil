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
 *   library   — the very same product (maker + code) on a project opened before: its
 *               family, name, description and — if free here — its ref come with it.
 *   track     — the position sits under a TRACK family in the DesignDB: ET-TRACK when the text
 *               says track (the track itself), else ET-TRACK-PS (a fitting on it).
 *   stem      — an existing product from the same maker whose code shares a real stem
 *               (FPSN0809BG3000 beside FPSN0809BG2000). Specific enough to trust.
 *   style     — the tool-wide style library (styleLibrary.js): how this maker's product line
 *               was named on any project opened before. Copies that ref's shape.
 *   shape     — the shipped code-shape table (codeShapes.js): LEDFlex FPS…BG… is a profile,
 *               FPS…PCOPD… a diffuser, EldoLED SL…-…mA a driver.
 *   line      — a researched product line (src/data/productLines.js): the maker AND the
 *               line's name in the text, main codes only. Atea NEO is flexible linear.
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
import { hasProductIdentity, norm } from './productCodes'
import { styleFor } from './styleLibrary'
import { matchShape, makerKey } from './codeShapes'
import { productLineFor } from '../data/productLines'
import { CANON_FAMILIES, classifyText } from '../data/etCanon'
import shippedShapes from '../data/codeShapes.json'

const lc = s => String(s ?? '').trim().toLowerCase()
const refOf = e => e.ElementTypeRef || e.elementTypeRef || ''
const famOf = e => e.Family || e.family || ''
const ptRefOf = p => p.PositionTypeRef || p.positionTypeRef || ''
const COUNTER_RE = /^(.*)-(\d+)$/

export const ACCESSORIES = 'ET-PS-ACCESSORIES'
/** Wrappers are assembled in the recipe, never a product: ET-DL-NN, ET-LIN-NN. */
const isWrapperRef = ref => /^ET-(DL|LIN)-\d+[A-Z]?$/i.test(String(ref ?? '').trim())
/** The families wrappers live in. A product code never goes here. */
const isWrapperFamily = f => /^ET-(DL|LIN)$/i.test(String(f ?? '').trim())
const POINT = 'ET-PS'
const LUMINAIRE_WORDS = /\b(DOWN\s*LIGHTS?|SPOT\s*LIGHTS?|SPOTS?|PENDANTS?|LUMINAIRES?|UPLIGHTS?|WALL\s*LIGHTS?|WALL\s*WASHERS?|FLOODS?|FLOOD\s*LIGHTS?|BOLLARDS?|LAMPS?)\b/
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
  // An extra (frame, louvre…) often shares its luminaire's stem; the luminaire's family is
  // then the wrong answer for it.
  let best = null
  for (const { code, maker, family } of ctx.products || []) {
    if (!family || maker !== lc(signals.manufacturer)) continue
    if (signals.role === 'extra' && lc(family) === lc(POINT)) continue
    const stem = sharedStem(signals.code, code)
    if (stem >= 4 && (!best || stem > best.stem)) best = { family, stem }
  }
  if (best) return done(best.family, 'stem')

  // On a track position (the DesignDB files it under a TRACK family): the track itself, or a
  // fitting that sits on it. Before shapes and style: a Flos spot on track is not an ET-PS.
  if ((signals.parents || []).some(p => /TRACK/i.test(p))) {
    const trackText = /TRACK/i.test(signals.text || '')
    if (trackText) return done('ET-TRACK', 'track', { canon: 'track position, says track' })
    if (signals.role !== 'extra') return done('ET-TRACK-PS', 'track', { canon: 'fitting on a track position' })
  }

  const style = styleFor(signals.code, signals.manufacturer, ctx.library || [], signals.text || '')
  if (style) return done(style.family, 'style', { style, flag: !!style.partial })

  // An old code still says what KIND of product it is: a superseded grip profile is a mount.
  const shapes = matchShape(signals.code, signals.manufacturer, ctx.shapes || [])
  const shape = shapes.current?.family ? shapes.current : shapes.superseded?.family ? shapes.superseded : null
  if (shape?.family) return done(shape.family, 'shape', { head: shape.head || shape.family, shape })

  const line = signals.role !== 'extra' && productLineFor(signals.manufacturer, signals.text)
  if (line) return done(line.family, 'line', { head: line.head })

  // The design element's family says what the position's MAIN product is — not its extras.
  const design = signals.role !== 'extra' && mostCommon(signals.designFamilies || [])
  if (design?.value) return done(design.value, 'design', { spread: design.distinct })

  const words = classifyText(signals.text)
  // Text that names two kinds of product ("tape in profile") is a guess, not an answer.
  const mixed = words?.others?.length > 0
  if (signals.pageType === 'point') {
    if (signals.role !== 'extra') {
      // A frame / sleeve / louvre on a row of its own is still not a luminaire: its own note,
      // or the row's words when they name no luminaire, file it with the accessories.
      const own = classifyText(signals.note)
      const acc = w => w && /^ET-PS-/.test(w.family)
      if (acc(own)) return done(own.family, 'canon', { head: own.head, canon: own.keyword })
      if (acc(words) && !LUMINAIRE_WORDS.test(String(signals.text || '').toUpperCase())) {
        return done(words.family, 'canon', { head: words.head, canon: words.keyword, flag: true })
      }
      return done(POINT, 'canon', { canon: 'Point page' })
    }
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

  // The design element's family per position. A wrapper (ET-DL-NN, ET-LIN-NN) is assembled
  // here, never bought: look through it to the design element inside it.
  const liveDesign = recipes.filter(r => (r.IsDeleted || r.isDeleted) !== 'Y' && (r.IsDesign || r.isDesign) === 'Y')
  const innerDesign = new Map()   // lc wrapper ref -> inner design ET ref
  for (const r of liveDesign) {
    if ((r.ContextType || r.contextType) !== 'ElementType') continue
    innerDesign.set(lc(r.ContextRef || r.contextRef), r.ElementTypeRef || r.elementTypeRef)
  }
  const designFamilyOf = new Map()   // lc PositionTypeRef -> [family]
  for (const r of liveDesign) {
    if ((r.ContextType || r.contextType) === 'ElementType') continue
    let ref = r.ElementTypeRef || r.elementTypeRef
    if (isWrapperRef(ref)) ref = innerDesign.get(lc(ref))
    const f = ref && etFamily.get(lc(ref))
    const pt = lc(r.PositionTypeRef || r.positionTypeRef)
    if (!f || !pt || isWrapperFamily(f)) continue
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

    // "N/A": not a product, so not an ElementType either. A TBC placeholder (`e.placeholder`)
    // is the exception: a product is wanted there, so it gets an ElementType of its own.
    if (!e.placeholder && !hasProductIdentity(e.text)) {
      proposals.push({
        code: e.text, manufacturer, include: false, action: 'skip', reuseRef: null, family: '', ref: '',
        name: '', description: '', why: 'placeholder', parent: null, spread: 0,
      })
      continue
    }

    const context = contextFor(e) || ''
    const pick = pickFamily({
      code: e.placeholder ? '' : e.text,
      manufacturer,
      text: `${context} ${note}`,
      note,
      role: e.placeholder ? 'lead' : roleOf(e),
      pageType: lc(pageTypeFor(e)).startsWith('point') ? 'point' : lc(pageTypeFor(e)).startsWith('linear') ? 'linear' : '',
      designFamilies: targets.flatMap(t => designFamilyOf.get(t) || []),
      parents: targets.map(t => parentOf.get(t)).filter(Boolean),
    }, { products, library, shapes })

    // The very same product on an earlier project: its ElementType comes with it — family,
    // name, description, and its ref when this project has not used that ref yet.
    // ElementTypes belong to a project, so only when this project has nothing of its own
    // to go on (a sibling product already filed here, or the positions' design element).
    const ownKnowledge = pick.why === 'stem' || pick.why === 'design'
    const seen = !same && !ownKnowledge && !e.placeholder && library.find(ex => norm(ex.code) === norm(e.text)
      && (!manufacturer || !ex.maker || makerKey(ex.maker) === makerKey(manufacturer)))
    if (seen) Object.assign(pick, { family: seen.family, head: seen.family, why: 'library', flag: false, seen })
    // A TBC placeholder with nothing to go on is still a product wanted: a point source,
    // flagged, rather than a row the review cannot apply.
    if (e.placeholder && !pick.family) Object.assign(pick, { family: POINT, head: POINT, why: 'canon', canon: 'TBC, no other clue', flag: true })
    // Whatever the evidence, a product is never filed with the wrappers (ET-DL, ET-LIN).
    if (isWrapperFamily(pick.family)) {
      const extra = !e.placeholder && roleOf(e) === 'extra'
      Object.assign(pick, { family: extra ? ACCESSORIES : POINT, head: extra ? ACCESSORIES : POINT,
        why: 'canon', canon: `not ${pick.family} (wrappers only)`, flag: true, seen: null, style: null })
    }

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
    const ref = !family || same ? ''
      : pick.seen && pick.seen.ref && !taken.has(pick.seen.ref) ? pick.seen.ref
        // A TBC placeholder is an ordinary ref: TBC lives on its spec (IsTBC) and name, never in the ref.
        : e.placeholder ? nextRef(pick.head || family, taken)
          : nextRef(pick.style?.refBase || pick.head || family, taken)
    if (ref) taken.add(ref)
    const old = !e.placeholder && matchShape(e.text, manufacturer, shapes).superseded

    proposals.push({
      code: e.text,
      manufacturer,
      include: !e.blocked,
      action: same ? 'reuse' : 'create',
      reuseRef: same?.ref || null,
      family: same ? '' : family,
      ref,
      name: pick.seen?.name || (e.placeholder ? `${e.placeholder.formRef} — TBC${manufacturer ? ` (${manufacturer})` : ''}` : seedName(manufacturer, e.text)),
      placeholder: e.placeholder || null,
      description: pick.seen?.description || [context, note].map(s => String(s).trim()).filter(Boolean).join(' — '),
      why: pick.why,
      parent: pick.parent || null,
      spread: pick.spread,
      styledOn: pick.seen ? { ref: pick.seen.ref, code: pick.seen.code, source: pick.seen.source }
        : pick.style ? { ref: pick.style.exemplar.ref, code: pick.style.exemplar.code, source: pick.style.exemplar.source } : null,
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
