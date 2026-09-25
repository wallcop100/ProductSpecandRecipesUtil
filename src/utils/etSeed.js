/**
 * etSeed.js — proposals for the ElementTypes a Form import still needs.
 *
 * Creating them one at a time was the slow part of an import. Every unassigned code now
 * gets a proposal — family, ref, name, description — and the user weeds out the wrong
 * ones. Nothing here writes anything.
 *
 * THE FAMILY. An ElementType's ref is named by its family (its ParentRef): `ET-DOWNLIGHT-01`.
 * The first version guessed the family from the families the DesignDB already had, voting
 * on the maker's other products and on words in the Form. On an early project that is
 * wrong in kind: 5452 had only cable and driver families, Phos already had a driver in
 * ET-REMOTE-DRIVERS, and so every Phos downlight was filed as a remote driver. A family
 * that does not exist yet cannot be voted for.
 *
 * What an early project DOES have is its PositionType tree (A1b → DOWNLIGHT →
 * RECESSED-POINT-SOURCE). So the rule, first match wins, each reported in `why`:
 *
 *   stem      — an existing product from the same maker whose code shares a real stem
 *               (FPSN0809BG3000 beside FPSN0809BG2000). Specific enough to trust.
 *   style     — the tool-wide style library (styleLibrary.js): how this maker's product line
 *               was named on ANY project opened before. Copies that ref's shape, swapping
 *               the parts that came from the code; `partial` when a part can't be vouched for.
 *   design    — the family of the design (IsDesign) ElementType already in the recipe of
 *               the positions asking for this code. Only fires once recipes exist.
 *   parent    — the LEAD code of a Form cell is the luminaire: its family is named after
 *               its position's parent PositionType (DOWNLIGHT → ET-DOWNLIGHT).
 *   extra     — any later code in the cell ("7A3194.4XG + A00665.40") is an accessory:
 *               ET-ACCESSORIES.
 *
 * Nothing else. No family is ever guessed from a maker or a word; a code none of these
 * place is left without one, for the user.
 *
 * Families that do not exist yet are returned as `newFamilies`, to be created as
 * collection rows alongside their members (the DesignDB's own shape: ET-CABLES,
 * IsCollection=Y, Description "Cable Family").
 */

import { sharedStem } from './etRefSuggest'
import { hasProductIdentity } from './productCodes'
import { styleFor } from './styleLibrary'

const lc = s => String(s ?? '').trim().toLowerCase()
const refOf = e => e.ElementTypeRef || e.elementTypeRef || ''
const famOf = e => e.Family || e.family || ''
const ptRefOf = p => p.PositionTypeRef || p.positionTypeRef || ''
const COUNTER_RE = /^(.*)-(\d+)$/

export const ACCESSORIES = 'ET-ACCESSORIES'

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
 * The family for one code. → { family, why, parent?, spread }
 *
 * `signals` = { code, manufacturer, text, role: 'lead'|'extra', designFamilies: [f], parents: [ptParent] }
 * `ctx`     = { products: [{ code, maker (lc), family }], library: [exemplar] }
 */
export function pickFamily(signals, ctx) {
  // stem: the same maker's product line, already filed somewhere
  let best = null
  for (const { code, maker, family } of ctx.products || []) {
    if (!family || maker !== lc(signals.manufacturer)) continue
    const stem = sharedStem(signals.code, code)
    if (stem >= 4 && (!best || stem > best.stem)) best = { family, stem }
  }
  if (best) return { family: best.family, why: 'stem', spread: 1 }

  const style = styleFor(signals.code, signals.manufacturer, ctx.library || [], signals.text || '')
  if (style) return { family: style.family, why: 'style', spread: 1, style }

  const design = mostCommon(signals.designFamilies || [])
  if (design.value) return { family: design.value, why: 'design', spread: design.distinct }

  if (signals.role === 'extra') return { family: ACCESSORIES, why: 'extra', spread: 1 }

  const parent = mostCommon(signals.parents || [])
  if (parent.value) return { family: familyRefFor(parent.value), why: 'parent', parent: parent.value, spread: parent.distinct }

  return { family: '', why: null, spread: 0 }
}

/**
 * Proposals for every code that still has no ElementType.
 *
 * entries  — distinct codes: { text, manufacturers, positionTypes, variants, reuse, blocked }
 * project  — { elementTypes, psRows, recipes, positionTypes, collectionRefs,
 *              ptTarget(formRef), contextFor(entry), roleOf(entry), library: [exemplar] }
 *
 * → { proposals: [{ code, manufacturer, include, action: 'create'|'reuse'|'skip', reuseRef, family,
 *                   ref, name, description, why, parent, spread, styledOn, checkRef, alternatives }],
 *     newFamilies: [{ ref, description, include, from }] }
 *
 * A code that already matches an existing product is proposed as a REUSE of it.
 */
export function proposeElementTypes(entries = [], project = {}) {
  const {
    elementTypes = [], psRows = [], recipes = [], positionTypes = [], collectionRefs = [],
    ptTarget = r => r, contextFor = () => '', roleOf = () => 'lead', library = [],
  } = project

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
      designFamilies: targets.flatMap(t => designFamilyOf.get(t) || []),
      parents: targets.map(t => parentOf.get(t)).filter(Boolean),
    }, { products, library })

    const family = pick.family
    if (family && !same && !existingFamilies.has(lc(family)) && !newFamilies.has(lc(family))) {
      newFamilies.set(lc(family), {
        ref: family,
        description: family === ACCESSORIES ? 'Accessories family'
          : familyDescription(pick.parent || family.replace(/^ET-/i, '')),
        include: true,
        from: pick.parent || null,
      })
    }
    const ref = family && !same ? nextRef(pick.style?.refBase || family, taken) : ''
    if (ref) taken.add(ref)

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
      checkRef: !!pick.style?.partial,
      alternatives: pick.style?.alternatives || [],
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
