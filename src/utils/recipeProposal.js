/**
 * recipeProposal.js — a first recipe for a position, from the Form and from precedent.
 *
 * process.md §7 and the projects before this one decide the SHAPE; the Form decides the
 * PRODUCTS; nothing is guessed. Every row says where it came from, and a part nobody can
 * vouch for is left EMPTY and flagged — the person building the first one fills it, and
 * that first one is what the rest of its group then copies (see formGroups).
 *
 *   kind     — from the DesignDB: DriverLocation, and exterior from the position's family;
 *              the product (point / linear) from the Form's main product.
 *   wrapper  — linear: a LIN (§7.8). Point: a DL, or the PS straight at position level
 *              where precedent does that (§7.3 note: remote with nothing inside).
 *              Positions of one kind with the same Form products SHARE one wrapper.
 *   products — the Form's, each in the slot its role takes (tape inside the LIN with
 *              Dim_QuantityMultiplier 1, caps ×2, clips at position level as IsInteger…).
 *   parts    — sockets, plugs, strain reliefs, drivers, frames: this project's own recipes
 *              of the kind first, then its ElementTypes, then projects opened before (the
 *              style library), else empty.
 *
 * Pure.
 */

import { roleOf, driverOf, envOf, wrapperFor, patternFor, designKind, PRODUCT_ROLES, SHIPPED_PATTERNS, harvestPatterns } from './recipePatterns'

const up = s => String(s ?? '').trim().toUpperCase()
const refOf = r => r.ElementTypeRef || r.elementTypeRef || ''
const posOf = r => r.PositionTypeRef || r.positionTypeRef || ''
const live = r => (r.IsDeleted || r.isDeleted) !== 'Y'

const LINEAR_ROLES = new Set(['TAPE', 'FLEX', 'PROFILE', 'DIFF', 'CAP', 'CLIP', 'MOUNT', 'FIXED'])
const DIM_ROLES = new Set(['TAPE', 'FLEX', 'PROFILE', 'DIFF', 'MOUNT'])   // §5.3

export const KIND_LABEL = {
  DL: 'Point source in a DL wrapper', LIN: 'Linear in a LIN wrapper', PS: 'Point source at position level',
  TRACK: 'Track run', TRACKPS: 'Point source on track',
}
export const DRIVER_LABEL = { LOCAL: 'local driver', REMOTE: 'remote driver', INTEGRAL: 'integral driver', NONE: 'no driver location' }

/** Where precedent comes from, best first: this project, projects opened before, shipped. */
export function precedentSources({ recipes = [], positionTypes = [], elementTypes = [], libraryPatterns = [] }) {
  return [
    { name: 'this project', patterns: harvestPatterns({ recipes, positionTypes, elementTypes, source: 'this project' }) },
    { name: 'projects opened before', patterns: libraryPatterns },
    { name: 'finished projects', patterns: SHIPPED_PATTERNS },
  ].filter(s => s.patterns.length > 0)
}

/** The row a Form product takes when precedent does not place it (§7.2, §7.8, §5.3). */
function defaultSlot(role, wk) {
  if (wk === 'LIN') {
    if (role === 'CLIP') return { section: 'position', isContractItem: 'Y', isInteger: 'Y', check: 'clips per metre: confirm with the maker (§5.3)' }
    if (role === 'CAP') return { section: 'internal', isContractItem: 'Y', quantity: 2 }
    if (DIM_ROLES.has(role)) return { section: 'internal', isContractItem: 'Y', dimQtyMultiplier: 1 }
    return { section: 'internal', isContractItem: 'Y' }
  }
  if (wk === 'DL') return { section: 'internal', isContractItem: 'Y' }
  if (wk === 'TRACK' && role === 'CAP') return { section: 'position', isContractItem: 'Y', quantity: 2 }
  return { section: 'position', isContractItem: 'Y' }
}

/**
 * The best existing part for a role: this project's recipes of the same kind, then any of
 * its recipes, then its ElementTypes, then the style library. → { ref, from, exemplar? } | null
 */
export function pickPart(role, kind, ctx, leadRef = null) {
  const { recipes = [], elementTypes = [], exemplars = [], kindOfPos = () => null } = ctx
  // A driver belongs to its fitting (current, channels): only a position with the SAME
  // fitting can vouch for one. Anything else would be a guess.
  if (role === 'DRIVER') {
    const withLead = new Set(recipes.filter(live).filter(r => up(refOf(r)) === up(leadRef)).map(posOf))
    const n = new Map()
    for (const r of recipes.filter(live)) {
      if (!withLead.has(posOf(r)) || roleOf(refOf(r)) !== 'DRIVER') continue
      n.set(refOf(r), (n.get(refOf(r)) || 0) + 1)
    }
    const ref = [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
    return ref ? { ref, from: 'this project (same fitting)' } : null
  }
  const count = (rows) => {
    const n = new Map()
    for (const r of rows) {
      const ref = refOf(r)
      if (roleOf(ref) === role) n.set(ref, (n.get(ref) || 0) + 1)
    }
    return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null
  }
  const liveRows = recipes.filter(live)
  const same = count(liveRows.filter(r => kindOfPos(posOf(r)) === kind))
  if (same) return { ref: same, from: 'this project (same kind)' }
  const any = count(liveRows)
  if (any) return { ref: any, from: 'this project' }
  const et = elementTypes.find(e => roleOf(refOf(e), e.Family || e.family) === role && (e.IsCollection || e.isCollection) !== 'Y')
  if (et) return { ref: refOf(et), from: 'this project’s ElementTypes' }
  const ex = exemplars.filter(e => roleOf(e.ref, e.family) === role)
  if (ex.length) {
    const n = new Map()
    for (const e of ex) n.set(e.ref, (n.get(e.ref) || 0) + 1)
    const ref = [...n.entries()].sort((a, b) => b[1] - a[1])[0][0]
    const exemplar = ex.find(e => e.ref === ref)
    return { ref, from: `projects opened before${exemplar.source ? ` (${exemplar.source})` : ''}`, exemplar }
  }
  return null
}

/** Internal ElementType refs of every wrapper in the project: wrapper ref → sorted refs. */
export function wrapperContents(recipes, containerRefs) {
  const out = new Map()
  for (const r of recipes.filter(live)) {
    if ((r.ContextType || r.contextType) !== 'ElementType') continue
    const w = up(r.ContextRef || r.contextRef)
    if (!containerRefs.has(w.toLowerCase())) continue
    if (!out.has(w)) out.set(w, [])
    out.get(w).push(up(refOf(r)))
  }
  for (const v of out.values()) v.sort()
  return out
}

/**
 * proposeRecipe(posRef, ctx) → proposal
 *
 * ctx: { positionTypes, elementTypes, recipes, formCaptures, exemplars, sources,
 *        containerRefs (Set of lc wrapper refs), kindOfPos }
 *
 * proposal: { posRef, skip?, kind: { product, dl, env, wk, wkSource, patternSource },
 *   signature, wrapper: { ref, isNew, family } | null,
 *   rows: [{ section, role, ref, isDesign, isContractItem, quantity, dimQtyMultiplier,
 *            isInteger, from, missing, check, exemplar }],
 *   notes: [text] }
 */
export function proposeRecipe(posRef, ctx) {
  const { positionTypes = [], elementTypes = [], recipes = [], formCaptures, sources = [], containerRefs = new Set() } = ctx
  const ptByRef = new Map(positionTypes.map(p => [up(p.PositionTypeRef || p.positionTypeRef), p]))
  const pt = ptByRef.get(up(posRef))
  if (!pt) return { posRef, skip: 'not in the DesignDB' }
  if ((pt.IsCollection || pt.isCollection) === 'Y') return { posRef, skip: 'a parent position: never reciped (§2)' }
  const famOf = new Map(elementTypes.map(e => [up(refOf(e)), e.Family || e.family || '']))

  const caps = (formCaptures?.byPosition?.[posRef] || []).filter(c => c.elementTypeRef)
  if (caps.length === 0) return { posRef, skip: 'no Form product with an ElementType' }
  const lead = caps.find(c => c.role === 'lead') || caps[0]
  const products = caps.map(c => ({ ref: c.elementTypeRef, code: c.code, lead: c === lead, role: roleOf(c.elementTypeRef, famOf.get(up(c.elementTypeRef))) }))
  const leadRole = products.find(p => p.lead).role
  const product = leadRole === 'TRACK' ? 'track' : leadRole === 'TRACK-PS' ? 'track-ps'
    : LINEAR_ROLES.has(leadRole) ? 'linear' : 'point'

  const parentOf = r => { const p = ptByRef.get(up(r)); return p ? (p.ParentRef || p.parentRef || null) : null }
  const dl = driverOf(pt)
  const env = envOf(pt, parentOf)
  const w = wrapperFor(product, dl, env, sources)
  const pat = patternFor(w.wk, dl, env, sources)
  const kindKey = `${w.wk}|${dl}|${env}`
  const kind = { product, dl, env, wk: w.wk, wkSource: w.source, wkShare: w.n && w.of ? `${w.n} of ${w.of}` : null, patternSource: pat.source }

  const rows = []
  const notes = []
  const placed = new Set()
  const inWrapper = w.wk === 'DL' || w.wk === 'LIN'

  // 1. The design element: a wrapper, or the PS itself.
  if (inWrapper) rows.push({ section: 'position', role: 'WRAPPER', ref: null, isDesign: 'Y', from: 'rule' })

  // 2. Precedent, role by role.
  const order = r => (r.lvl === 'P' ? 0 : 1) * 100 + (r.isDesign === 'Y' ? 0 : 1) * 10
  for (const p of [...pat.rows].sort((a, b) => order(a) - order(b))) {
    if (p.role === 'WRAPPER') continue
    const flags = {
      isDesign: p.isDesign || null, isContractItem: p.isContractItem || null, quantity: p.quantity ?? null,
      dimQtyMultiplier: p.dimQtyMultiplier ?? null, isInteger: p.isInteger || null,
    }
    const share = `${p.n} of ${p.of} on ${pat.source}`
    if (!inWrapper && p.lvl === 'I') {
      notes.push(`Inside the fitting on ${pat.source}: ${p.role} (${p.n} of ${p.of}). Add it in the builder if this one needs it.`)
      continue
    }
    const section = p.lvl === 'P' ? 'position' : 'internal'
    if (PRODUCT_ROLES.has(p.role)) {
      // Products come from the Form only: a diffuser the Form doesn't ask for isn't needed.
      const fromForm = products.filter(x => x.role === p.role && !placed.has(x.ref))
      for (const prod of fromForm) {
        placed.add(prod.ref)
        rows.push({ section, role: p.role, ref: prod.ref, code: prod.code, ...flags, from: 'the Form', share })
      }
      // …except a frame / collar / sleeve: a first-fix part the Form often leaves out (§5.4).
      if (fromForm.length > 0 || p.role !== 'FRAME') continue
    }
    const part = pickPart(p.role, kindKey, ctx, lead.elementTypeRef)
    rows.push({ section, role: p.role, ref: part?.ref || null, ...flags, from: part?.from || null, share,
      missing: !part, exemplar: part?.exemplar || null,
      check: p.role === 'DRIVER' && !part ? 'depends on the fitting (current, channels): add it in the builder' : null })
  }

  // 3. Form products precedent didn't place: where §7 puts them.
  for (const prod of products) {
    if (placed.has(prod.ref)) continue
    placed.add(prod.ref)
    const isLead = prod.lead
    const slot = isLead && !inWrapper ? { section: 'position', isDesign: 'Y' }
      : isLead && w.wk === 'DL' ? { section: 'internal', isDesign: 'Y' }
        : defaultSlot(prod.role, w.wk)
    rows.push({ role: prod.role, ref: prod.ref, code: prod.code, ...slot, from: 'the Form', share: null })
  }
  // Unwrapped, the main product IS the design element, at position level. A track run is
  // ordered by length (4343: Dim_QuantityMultiplier 1).
  if (!inWrapper) {
    const leadRow = rows.find(r => r.ref === lead.elementTypeRef)
    if (leadRow) {
      leadRow.section = 'position'; leadRow.isDesign = 'Y'; leadRow.isContractItem = null
      if (w.wk === 'TRACK') { leadRow.dimQtyMultiplier = 1; leadRow.quantity = null }
    }
  }

  // 4. The wrapper: shared with an existing one holding exactly these internals, else new.
  const wrapper = inWrapper ? resolveWrapper(rows, w.wk, recipes, containerRefs) : null

  // Positions with the same kind and the same kinds of product are one group.
  const signature = `${kindKey}|${[...new Set(products.map(p => p.role))].sort().join('+')}`
  return { posRef, kind, signature, wrapper, rows, notes, products }
}

/** A wrapper already holding exactly these internals (shared), else a new one. Sets rows' WRAPPER ref. */
function resolveWrapper(rows, wk, recipes, containerRefs) {
  const want = rows.filter(r => r.section === 'internal' && r.ref).map(r => up(r.ref)).sort()
  const contents = wrapperContents(recipes, containerRefs)
  const prefix = wk === 'DL' ? 'ET-DL-' : 'ET-LIN-'
  const hit = [...contents.entries()].find(([ref, have]) => ref.startsWith(prefix) && want.length > 0
    && have.length === want.length && have.every((x, i) => x === want[i]))
  const wrapper = hit ? { ref: hit[0], isNew: false, family: `ET-${wk}` } : { ref: null, isNew: true, family: `ET-${wk}` }
  const row = rows.find(r => r.role === 'WRAPPER')
  if (row) { row.ref = wrapper.ref; row.from = hit ? 'shared: same kind, same products' : 'new wrapper' }
  return wrapper
}

/**
 * The rest of a group, from the recipe a person built and checked on its first position
 * (saved as a Form template). Its Form slots take THIS position's products of the same
 * role; its other rows come as taught; products it has no slot for go where §7 puts them.
 * A driver taught on another fitting is marked for checking.
 */
export function proposalFromTemplate(template, posRef, ctx) {
  const base = proposeRecipe(posRef, ctx)
  if (base.skip) return base
  const ings = Array.isArray(template.ingredients) ? template.ingredients : []
  const wrapIng = ings.find(i => i.newWrapper || i.slotKey === 'DESIGN_ELEMENT')
  const wk = wrapIng ? (wrapIng.newWrapper === 'LIN' || /LIN/i.test(wrapIng.slotLabel) ? 'LIN' : 'DL') : base.kind.wk
  const taughtOn = template.taughtOn || template.name
  const lead = base.products.find(p => p.lead)
  const taughtLead = ings.find(i => i.fromForm === 'lead')?.slotLabel
  const placed = new Set()
  const rows = []
  const flags = i => ({
    isDesign: i.isDesign || null, isContractItem: i.isContractItem || null, quantity: i.quantity ?? null,
    dimQtyMultiplier: i.dimQtyMultiplier ?? null, isInteger: i.isInteger || null,
  })
  const sectionOf = i => (i.section === 'position' ? 'position' : 'internal')
  for (const i of ings) {
    if (i.newWrapper || (i === wrapIng)) { rows.push({ section: 'position', role: 'WRAPPER', ref: null, isDesign: 'Y', from: 'rule' }); continue }
    if (i.fromForm === 'lead') {
      placed.add(lead.ref)
      rows.push({ section: sectionOf(i), role: lead.role, ref: lead.ref, code: lead.code, ...flags(i), from: 'the Form' })
      continue
    }
    if (i.fromForm) {
      const role = i.fromForm === 'extra' ? null : i.fromForm
      for (const prod of base.products.filter(p => !p.lead && !placed.has(p.ref) && (!role || p.role === role))) {
        placed.add(prod.ref)
        rows.push({ section: sectionOf(i), role: prod.role, ref: prod.ref, code: prod.code, ...flags(i), from: 'the Form' })
      }
      continue
    }
    const role = roleOf(i.slotLabel)
    rows.push({ section: sectionOf(i), role, ref: i.slotLabel, ...flags(i), from: `taught on ${taughtOn}`,
      check: role === 'DRIVER' && taughtLead && lead.ref !== taughtLead ? `taught with ${taughtLead}; check it suits ${lead.ref}` : null })
  }
  for (const prod of base.products) {
    if (placed.has(prod.ref)) continue
    rows.push({ role: prod.role, ref: prod.ref, code: prod.code, ...defaultSlot(prod.role, wk), from: 'the Form',
      check: 'not in the taught recipe: placed by the rules, check it' })
  }
  const wrapper = wk === 'DL' || wk === 'LIN' ? resolveWrapper(rows, wk, ctx.recipes || [], ctx.containerRefs || new Set()) : null
  return { ...base, kind: { ...base.kind, wk }, rows, wrapper, notes: [], taught: template.id }
}

/**
 * Group imported positions: same kind, same kinds of product. The first of each group is
 * built and checked by a person; the rest copy it (as a taught template).
 * → [{ key, kind, label, positions: [posRef], first: posRef, skipped }]
 */
export function formGroups(posRefs, ctx) {
  const groups = new Map()
  const skipped = []
  for (const ref of posRefs) {
    const p = proposeRecipe(ref, ctx)
    if (p.skip) { skipped.push({ posRef: ref, why: p.skip }); continue }
    if (!groups.has(p.signature)) {
      const roles = [...new Set(p.products.map(x => x.role))].map(r => r.toLowerCase()).join(' + ')
      groups.set(p.signature, {
        key: p.signature, kind: p.kind,
        label: `${KIND_LABEL[p.kind.wk]} · ${DRIVER_LABEL[p.kind.dl]} · ${p.kind.env === 'EXT' ? 'exterior' : 'interior'} · ${roles}`,
        positions: [],
      })
    }
    groups.get(p.signature).positions.push(ref)
  }
  return { groups: [...groups.values()].map(g => ({ ...g, first: g.positions[0] })), skipped }
}

/**
 * Everything proposeRecipe needs, from the store's state and the tool-wide library.
 * `library` = { patterns, exemplars } (recipe patterns and products of projects opened before).
 */
export function proposalContext(state, library = {}) {
  const { positionTypes = [], elementTypes = [], recipes = [], formCaptures = null, containerETRefs = new Set() } = state
  const ptByRef = new Map(positionTypes.map(p => [up(p.PositionTypeRef || p.positionTypeRef), p]))
  const parentOf = r => { const p = ptByRef.get(up(r)); return p ? (p.ParentRef || p.parentRef || null) : null }
  const kindOf = new Map()
  for (const r of recipes.filter(live)) {
    if ((r.ContextType || r.contextType) !== 'PositionType' || (r.IsDesign || r.isDesign) !== 'Y') continue
    const pt = ptByRef.get(up(posOf(r)))
    if (!pt) continue
    const wk = designKind(refOf(r))
    kindOf.set(posOf(r), `${wk}|${driverOf(pt)}|${envOf(pt, parentOf)}`)
  }
  return {
    positionTypes, elementTypes, recipes, formCaptures,
    exemplars: library.exemplars || [],
    containerRefs: containerETRefs,
    kindOfPos: p => kindOf.get(p) || null,
    sources: precedentSources({ recipes, positionTypes, elementTypes, libraryPatterns: library.patterns || [] }),
  }
}
