/**
 * etSeed.js — proposals for the ElementTypes a Form import still needs.
 *
 * Creating them one at a time was the slow part of an import. Every unassigned code now
 * gets a proposal — family, ref, name, description — and the user weeds out the wrong
 * ones. Nothing here writes anything.
 *
 * THE FAMILY is one of the company's (src/data/etCanon.js — the company wiki): ET-PS,
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
 * Linear ingredient refs carry their keyword (company wiki): a diffuser files under
 * ET-LIN-PROF but its ref is ET-LIN-DIFF-NN — `head` is that ref prefix.
 *
 * Families that do not exist yet are returned as `newFamilies`, with the canon's description
 * and ParentRef, and their missing parents too.
 */

import { sharedStem } from './etRefSuggest'
import { hasProductIdentity, norm } from './productCodes'
import { styleFor, harvestExemplars, codeTokens } from './styleLibrary'
import { matchShape, makerKey } from './codeShapes'
import { productLineFor } from '../data/productLines'
import { CANON_FAMILIES, classifyText } from '../data/etCanon'
import { jobOf, familyForJob, familiesForJob } from './codeJobs'
import shippedShapes from '../data/codeShapes.json'

const lc = s => String(s ?? '').trim().toLowerCase()
const alnum = s => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
const refOf = e => e.ElementTypeRef || e.elementTypeRef || ''
const famOf = e => e.Family || e.family || ''
const ptRefOf = p => p.PositionTypeRef || p.positionTypeRef || ''
const COUNTER_RE = /^(.*)-(\d+)$/
// The family rules a sitting's own choice may overrule: defaults, not evidence. ('' = no clue at all.)
const SESSION_OVERRIDES = new Set(['canon', 'job', ''])

export const ACCESSORIES = 'ET-PS-ACCESSORIES'
/** Wrappers are assembled in the recipe, never a product: ET-DL-NN, ET-LIN-NN. */
export const isWrapperRef = ref => /^ET-(DL|LIN)-\d+[A-Z]?$/i.test(String(ref ?? '').trim())
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

// What a family is about, minus the words every family shares: ET-REMOTE-DRIVERS → REMOTE, DRIVER.
const GENERIC = new Set(['ET', 'LIN', 'PS', 'ACCESSORIES', 'ACCESSORY', 'INGREDIENTS', 'COMPONENTS'])
const coreOf = f => String(f ?? '').toUpperCase().split(/[-/\s]+/).map(t => t.replace(/S$/, '')).filter(t => t && !GENERIC.has(t) && !GENERIC.has(`${t}S`))

/** How this project heads each family's refs, when it has a habit: ET-LIN-PROF → ET-PROF (ET-PROF-1009…). → Map lc family → head */
export function familyHeads(elementTypes = [], psRows = []) {
  const all = new Map()
  const makerOf = new Map(psRows.map(r => [lc(refOf(r)), makerKey(r.Manufacturer || r.manufacturer)]))
  const byMaker = new Set()   // `family|maker|head`: this maker already names members this way
  for (const et of elementTypes) {
    const f = famOf(et), m = String(refOf(et) || '').match(COUNTER_RE)
    if (!f || !m || isWrapperFamily(f)) continue
    const body = m[1]
    const head = lc(body) === lc(f) || lc(body).startsWith(lc(f) + '-') ? f : body.split('-').slice(0, 2).join('-')
    if (!all.has(lc(f))) all.set(lc(f), [])
    all.get(lc(f)).push(head)
    const mk = makerOf.get(lc(refOf(et)))
    if (mk) byMaker.add(`${lc(f)}|${mk}|${lc(head)}`)
  }
  // A habit, not one-off: one ET-GS-WIBRE-01 does not make every accessory ET-GS. (A majority rule
  // cost 4 points of right heads on the mirrors; a mixed family like ET-LIN-INGREDIENTS still heads by its most common kind.)
  const out = new Map()
  out.mixed = new Set()   // families holding more than one kind (ET-FRAME and ET-GS under accessories)
  out.byMaker = byMaker
  for (const [f, heads] of all) {
    const top = mostCommon(heads)
    if (top.count >= 2) out.set(f, top.value)
    if (new Set(heads.map(lc)).size > 1) out.mixed.add(f)
  }
  return out
}

/**
 * The family's usual head for this code, or null. In a family of several kinds, a head that names one
 * kind (ET-FRAME, filed under ET-PS-ACCESSORIES) only fits a code whose own words or family say so: 4746 has three plaster
 * Phos frames in accessories, and that must not make a LightGraphix louvre ET-FRAME-04.
 */
export function headFor(heads, family, code = '', text = '', maker = '') {
  const head = heads.get(lc(family))
  if (!head || !heads.mixed?.has(lc(family))) return head || null
  // Backtest: of the refs this check would lose (ET-CCR under ET-DRIVER), 142 of 151 had a sibling from the same maker.
  if (heads.byMaker?.has(`${lc(family)}|${makerKey(maker)}|${lc(head)}`)) return head
  const words = lc(`${family} ${code} ${text}`).match(/[a-z]+|[0-9]+/g) || []
  const fits = p => words.some(w => w === p || w.startsWith(p))   // PROF fits "profile"
  return lc(head).replace(/^et-/, '').split('-').every(fits) ? head : null
}

/** The next free `<family>-NN`, counting refs already taken AND refs handed out in this batch. */
export function nextRef(family, taken, width = 2) {
  const base = lc(family)
  let max = 0
  for (const r of taken) {
    const m = String(r).match(COUNTER_RE)
    // A 4-digit tail is a product number (ET-PROF-1009), not a counter.
    if (m && m[2].length <= 3 && lc(m[1]) === base) max = Math.max(max, parseInt(m[2], 10))
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
  let split = false
  // Similar codes here that disagree make whatever the later rules say a guess worth checking.
  const done = (family, why, extra = {}) => ({ family, head: family, why, spread: 1, ...extra, flag: !!(extra.flag || split) })

  // stem: the family this project files the same maker's most similar codes under: the longest
  // shared prefix (3+ characters) that at least two of them have, agreeing 80%+. One sibling is
  // only a guess (tools/backtest-inprogress.py: ~92% right with two that agree, ~80% on one).
  // An extra (frame, louvre…) often shares its luminaire's stem; the luminaire's family is
  // then the wrong answer for it.
  const kin = new Map()   // norm code -> { code, family, stem }
  for (const { code, maker, family } of ctx.products || []) {
    if (!family || maker !== lc(signals.manufacturer) || norm(code) === norm(signals.code)) continue
    if (signals.role === 'extra' && lc(family) === lc(POINT)) continue
    // Letters and digits only: "NA-" is not a 3-character stem.
    const stem = sharedStem(alnum(signals.code), alnum(code))
    if (stem >= 3 && !kin.has(norm(code))) kin.set(norm(code), { code, family, stem })
  }
  const stems = [...new Set([...kin.values()].map(k => k.stem))].sort((a, b) => b - a)
  for (const n of stems) {
    const near = [...kin.values()].filter(k => k.stem >= n)
    if (near.length < 2) continue
    const top = mostCommon(near.map(k => k.family))
    if (top.count / near.length >= 0.8) {
      return done(top.value, 'stem', { kin: near.filter(k => k.family === top.value).map(k => k.code).slice(0, 3) })
    }
    split = true
    break
  }
  // Otherwise the single closest sibling is still the best guess, flagged.
  const closest = [...kin.values()].filter(k => k.stem === stems[0])
  if (closest.length === 1 && stems[0] >= 4) return done(closest[0].family, 'stem', { kin: [closest[0].code], flag: true })

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

  // Nothing to go on. The position's parent (DOWNLIGHT) is not a family — 2% right on the
  // mirrors (tools/backtest-forms.mjs); the house default for the product's role is, half the time.
  if (!(signals.parents || []).length) return { family: '', head: '', why: null, flag: false, spread: 0 }
  return done(signals.role === 'extra' ? ACCESSORIES : POINT, 'canon', { canon: 'a position, no other clue', flag: true })
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
    shapes = shippedShapes.shapes || [], families = CANON_FAMILIES, jobs = null,
    // This sitting's decisions, oldest first: { code, maker, proposed: {family, ref, name}, kept: {...} }.
    session = [],
  } = project
  const canonByRef = new Map(families.map(f => [lc(f.ref), f]))

  const etFamily = new Map(elementTypes.map(e => [lc(refOf(e)), famOf(e)]))
  const existingFamilies = new Set([...collectionRefs, ...elementTypes.map(famOf)].filter(Boolean).map(lc))
  // A family "exists" for the job check only when it has a row: ET-LIN-COMPONENTS, named by 32
  // ElementTypes on one project and a row on none, must not be copied to the next product.
  const familyRows = new Set([...collectionRefs, ...elementTypes.map(refOf)].filter(Boolean).map(f => String(f).toUpperCase()))
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

  // Taken = any ref the project names anywhere, as NewETModal checks: a Product Spec or recipe ref
  // the DesignDB lacks still exists (4746: ET-PS-ACCESSORIES-02 proposed, then "already exists").
  const taken = new Set([...elementTypes, ...psRows, ...recipes, ...session.map(s => ({ ElementTypeRef: s.kept?.ref }))].map(refOf).filter(Boolean))
  const newFamilies = new Map()   // lc ref -> { ref, description, include, from }
  const proposals = []

  // How this project names each family's members: its products (to style a ref on the nearest
  // sibling) and the most common ref head (ET-PROF for ET-LIN-PROF, ET-GS for ET-PS-ACCESSORIES).
  const ownExemplars = harvestExemplars({ elementTypes, psRows, source: 'project' })
  const heads = familyHeads(elementTypes, psRows)
  // The ref base for a new member of `family`, best first: its nearest sibling's ref here, a
  // library product's ref carried over whole, the family's usual head here, the family itself.
  const refBaseFor = (family, code, maker, text, pick) => {
    const own = styleFor(code, maker, ownExemplars.filter(ex => lc(ex.family) === lc(family)), text)
    if (own && !own.partial) return { base: own.refBase, from: 'sibling', example: own.exemplar.ref }
    // No near sibling: the last one you made in this family for this maker, this sitting.
    const last = [...session].reverse().find(s => s.kept?.ref && lc(s.kept.family) === lc(family) && makerKey(s.maker) === makerKey(maker))
    if (last) return { base: String(last.kept.ref).replace(/-\d+[a-z]?$/i, ''), from: 'session', example: last.kept.ref }
    // A library style that kept a middle (ET-PS-CURVE) is worth more than a bare head, even flagged.
    if (pick.style && lc(pick.style.family) === lc(family) && lc(pick.style.refBase) !== lc(family)) {
      return { base: pick.style.refBase, from: 'library', example: pick.style.exemplar.ref }
    }
    const head = headFor(heads, family, code, text, maker)
    if (head) return { base: head, from: 'family' }
    return { base: pick.style?.refBase || pick.head || family, from: 'default' }
  }

  // A name in the style of its nearest sibling here ("LED Flex - 1009 End Cap" → 1019), when the
  // sibling's name holds no code token that this code changes or lacks. null → the house default.
  const nameLike = (family, code, maker) => {
    const sib = styleFor(code, maker, ownExemplars.filter(ex => lc(ex.family) === lc(family)))?.exemplar
    if (!sib?.name) return null
    const a = codeTokens(sib.code), b = codeTokens(code)
    if (a.length !== b.length) return null
    // Every token that changed must be in the name, or the name describes the sibling, not this.
    let name = sib.name
    for (let i = 0; i < a.length; i++) {
      if (lc(a[i]) === lc(b[i])) continue
      if (a[i].length < 3) return null   // "2" in "2-pin plug" is prose, not the code
      const at = new RegExp(`(?<![A-Za-z0-9])${a[i]}(?![A-Za-z0-9])`, 'gi')
      if (!at.test(name)) return null
      name = name.replace(at, b[i])
    }
    return name
  }

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
    // name and description. Never its ref: that number belonged to another set (ET-PS-22 on a
    // project with no ET-PS yet), so this project numbers it afresh.
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

    // The code's JOB (codeJobs.js) settles the family when the evidence above did not: a tape is
    // filed with tapes. This project's own family for that job wins (if it has a row), then the
    // house family. Only the code's own evidence counts — its maker and code, its own note, a
    // known job or catalogue category — and the row's words only when they name one kind of product.
    if (!e.placeholder && !same) {
      const known = jobs?.get?.(`${makerKey(manufacturer)}|${norm(e.text)}`)
      const rowWords = classifyText(context)
      const job = known?.slot ? known : jobOf({
        maker: manufacturer, code: e.text, category: known?.category || '',
        name: [note, rowWords && !rowWords.others.length ? context : ''].join(' '),
      })
      const house = familyForJob(job)
      if (house && job.slot !== 'CONNECTOR' && job.slot !== 'FITTING') {
        const ok = familiesForJob(job, { elementTypes, familyRows })
        pick.job = job
        if (!ok.has(String(pick.family || '').toUpperCase())) {
          const own = [...ok].find(f => f !== house.family.toUpperCase())
          const fam = own ? elementTypes.find(x => String(refOf(x)).toUpperCase() === own) : null
          Object.assign(pick, { family: fam ? refOf(fam) : house.family, head: house.head,
            why: 'job', flag: false, was: pick.family || null, seen: pick.seen?.family === pick.family ? null : pick.seen })
        }
      }
    }

    // A family this project lacks, where it files the same kind under its own spelling
    // (ET-DRIVER-ACCESSORIES / ET-DRIVERS here ET-DRIVER): use the project's, flagged.
    if (!same && pick.family && !existingFamilies.has(lc(pick.family))) {
      const mine = [...existingFamilies].filter(f => coreOf(f).some(t => coreOf(pick.family).includes(t)))
      if (mine.length === 1) {
        const ref = elementTypes.map(famOf).find(f => lc(f) === mine[0]) || mine[0].toUpperCase()
        Object.assign(pick, { family: ref, head: ref, was: pick.family, flag: true })
      }
    }
    // Only a default to go on (a lead is ET-PS, a job's house family): the family you kept for
    // this maker's last product this sitting is a better guess. Flagged: it is a guess.
    if (!same && SESSION_OVERRIDES.has(pick.why || '')) {
      // AEST77: never across roles: a lead you filed as ET-PS does not make its maker's extras ET-PS.
      const wrong = lc(!e.placeholder && roleOf(e) === 'extra' ? POINT : ACCESSORIES)
      const last = [...session].reverse().find(s => s.kept?.family && makerKey(s.maker) === makerKey(manufacturer) && lc(s.kept.family) !== wrong)
      if (last && lc(last.kept.family) !== lc(pick.family)) {
        Object.assign(pick, { family: last.kept.family, head: last.kept.family, why: 'session', was: pick.family || null, flag: true, session: last })
      }
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
    let refFrom = null
    const ref = !family || same ? ''
        // A TBC placeholder is an ordinary ref: TBC lives on its spec (IsTBC) and name, never in the ref.
        : e.placeholder ? nextRef(pick.head || family, taken)
          : nextRef((refFrom = refBaseFor(family, e.text, manufacturer, `${context} ${note}`, pick)).base, taken)
    if (ref) taken.add(ref)
    const old = !e.placeholder && matchShape(e.text, manufacturer, shapes).superseded
    const liked = !pick.seen?.name && !e.placeholder && family && !same ? nameLike(family, e.text, manufacturer) : ''

    proposals.push({
      code: e.text,
      manufacturer,
      include: !e.blocked,
      action: same ? 'reuse' : 'create',
      reuseRef: same?.ref || null,
      family: same ? '' : family,
      ref,
      name: pick.seen?.name || liked || (e.placeholder ? `${e.placeholder.formRef} TBC${manufacturer ? ` (${manufacturer})` : ''}` : seedName(manufacturer, e.text)),
      placeholder: e.placeholder || null,
      // An extra shares its Form row with the luminaire, so the row's product name is the lead's.
      description: pick.seen?.description || [context && roleOf(e) === 'extra' ? `For ${context}` : context, note].map(s => String(s).trim()).filter(Boolean).join(', '),
      why: pick.why,
      kin: pick.kin || null,
      parent: pick.parent || null,
      spread: pick.spread,
      styledOn: pick.seen ? { ref: pick.seen.ref, code: pick.seen.code, source: pick.seen.source,
          // beside a companion: how sure it is of this family (utils/certainty.js)
          ...(pick.seen.tier ? { family: pick.seen.family, tier: pick.seen.tier, votes: pick.seen.votes } : {}) }
        : pick.style ? { ref: pick.style.exemplar.ref, code: pick.style.exemplar.code, source: pick.style.exemplar.source } : null,
      job: pick.job || null,
      wasFamily: pick.was || null,
      session: pick.session ? { code: pick.session.code, family: pick.session.kept.family } : null,
      shapedOn: pick.shape ? { shape: pick.shape.shape, example: pick.shape.example, n: pick.shape.n } : null,
      canon: pick.canon || null,
      checkRef: !!pick.flag,
      // Where the ref's shape came from: a sibling here, the library, the family's usual head, or nothing.
      refFrom: refFrom ? { from: refFrom.from, example: refFrom.example || null } : null,
      // How the name was made, for the audit trail: the same product seen elsewhere, a sibling's name, or maker + code.
      nameFrom: pick.seen?.name ? 'seen' : liked ? 'sibling' : e.placeholder ? 'placeholder' : 'maker-code',
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
export function refamily(proposals, indices, family, elementTypes = [], psRows = []) {
  const pick = new Set(indices)
  const taken = new Set(elementTypes.map(refOf))
  const heads = familyHeads(elementTypes, psRows)
  proposals.forEach((p, i) => { if (!pick.has(i) && p.ref) taken.add(p.ref) })
  return proposals.map((p, i) => {
    if (!pick.has(i)) return p
    const head = family && headFor(heads, family, p.code, `${p.name || ''} ${p.description || ''}`, p.manufacturer)
    const ref = family ? nextRef(head || family, taken) : ''
    if (ref) taken.add(ref)
    if (family === p.family) return { ...p, family, ref }
    return { ...p, family, ref, why: 'you', refFrom: { from: head ? 'family' : 'default', example: null } }
  })
}

/**
 * Plan moving existing ElementTypes to another family.
 * → { moves: [{ from, to, family }], newFamilies: [{ ref, description, parent }] }
 *
 * With `renumber`, each ref takes the next free `<family>-NN` unless it already reads as a
 * member of that family (ET-PS-MOUNTING-FRAME-03 stays put). Collection rows (families
 * themselves) keep their refs. The family, and any canon parent the project lacks, is
 * proposed for creation.
 */
export function planFamilyMove(refs, family, elementTypes = [], { renumber = true, families = CANON_FAMILIES } = {}) {
  const fam = String(family ?? '').trim()
  const byRef = new Map(elementTypes.map(e => [lc(refOf(e)), e]))
  const taken = new Set(elementTypes.map(refOf))
  const known = new Set(elementTypes.flatMap(e => [lc(famOf(e)), (e.IsCollection || e.isCollection) === 'Y' ? lc(refOf(e)) : '']).filter(Boolean))
  const canon = new Map(families.map(f => [lc(f.ref), f]))
  const newFamilies = []
  const propose = ref => {
    if (!ref || known.has(lc(ref)) || newFamilies.some(f => lc(f.ref) === lc(ref))) return
    const c = canon.get(lc(ref))
    newFamilies.push({ ref, description: c?.description || familyDescription(ref.replace(/^ET-/i, '')), parent: c?.parent || null })
    if (c?.parent) propose(c.parent)
  }
  if (fam) propose(fam)
  const member = ref => { const m = String(ref).match(COUNTER_RE); return !!m && lc(m[1]) === lc(fam) }
  const moves = []
  for (const r of refs) {
    const et = byRef.get(lc(r))
    if (!et) continue
    const from = refOf(et)
    const collection = (et.IsCollection || et.isCollection) === 'Y'
    let to = from
    if (renumber && fam && !collection && !member(from)) { to = nextRef(fam, taken); taken.add(to) }
    moves.push({ from, to, family: fam || null })
  }
  return { moves, newFamilies }
}

/** Why a proposal was placed where it was, in words — Bulk and the single New ElementType modal (ZAJ889). */
/** One line on where a proposal's ref came from, or '' when it is only the next free number. */
export function refFromText(r) {
  const f = r.refFrom
  if (!f || !r.ref) return ''
  const shape = String(r.ref).replace(COUNTER_RE, '$1')
  if (f.from === 'sibling') return `ref like ${f.example} here`
  if (f.from === 'library') return `ref like ${f.example} elsewhere`
  if (f.from === 'session') return `ref like ${f.example}, your last one in ${r.family}`
  if (f.from === 'family') return `ref as ${r.family} names its members (${shape}-NN)`
  return `ref: next free ${shape}-NN, no pattern to follow`
}

const WHY = {
  // Its own words would hide the code: "ZH-INFD-… (Finish: RAL 9010)".
  stem: r => (r.kin?.length ? `like ${r.kin.map(c => c.split(' (')[0]).join(', ')} here` : 'same product line'),
  shape: r => `code shaped like ${r.shapedOn?.example} (${r.shapedOn?.n} known)`,
  canon: r => `company family — ${r.canon}`,
  style: r => `styled like ${r.styledOn?.ref}${r.styledOn?.source ? ` (${r.styledOn.source})` : ''}`,
  line: 'known product line',
  track: r => `track — ${r.canon}`,
  library: r => `same product on ${r.styledOn?.source || 'an earlier project'} (${r.styledOn?.ref})`,
  design: "position's design element",
  parent: p => `position parent ${p} (not a company family)`,
  extra: 'extra code in its cell',
  you: 'you chose it',
  session: r => `you filed ${r.manufacturer}'s last one (${r.session?.code}) here this sitting${r.wasFamily ? ` (not ${r.wasFamily})` : ''}`,
  kit: r => `usually with ${r.kitOf}`,
  job: r => `${JOB_LABEL[r.job?.slot === 'TAPE' ? `TAPE:${r.job.variant}` : r.job?.slot] || 'its job'}${r.wasFamily ? ` (not ${r.wasFamily})` : ''}`,
}
const JOB_LABEL = { 'TAPE:tape': 'LED tape', 'TAPE:flex': 'neon / flex', 'TAPE:fixed': 'fixed linear', PROFILE: 'a profile', DIFFUSER: 'a diffuser',
  END_CAPS: 'end caps', CLIPS: 'clips', MOUNT_CHANNEL: 'a mounting channel', MOUNT_COLLAR: 'a mounting collar / frame', LOCAL_DRIVER: 'a driver',
  REMOTE_DRIVER: 'a driver', EMERGENCY: 'an emergency pack', OPTIC_ACCESSORY: 'an optic accessory', ACCESSORY: 'an accessory', FIRE_HOOD: 'a fire hood',
  LOCKING_LEVER: 'a locking lever', TRACK_ACCESSORY: 'a track accessory' }
export const whyText = r => (typeof WHY[r.why] === 'function' ? WHY[r.why](r.why === 'parent' ? r.parent : r) : WHY[r.why] || '')
