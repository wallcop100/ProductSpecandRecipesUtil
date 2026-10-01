/**
 * recipeStyles.js — recipe STYLES: a taught recipe template plus a RULE saying which
 * positions it is for, the way connector templates work (templateRules.js).
 *
 * A style's rule reads a position's record: what the Form says it is (its main product,
 * that product's family and maker, its accessories), its KIND (driver location, interior /
 * exterior, point / linear / track — recipePatterns.js), its tags and DesignDB columns.
 * When several styles match a position the most specific rule wins.
 *
 * Styles come from two directions:
 *   - from existing recipes: positions built alike (same SHAPE: which roles sit where, the
 *     Form's own products abstracted) are found, and a rule is suggested that picks them
 *     out (templateRules.ruleFor);
 *   - from a blank slate: the first recipe of a group (company patterns) is checked by a
 *     person and saved as a style, its rule prefilled from the group's dimensions.
 *
 * Positions no style matches are grouped by the dimensions the person chooses (main
 * product, driver + environment, accessories). Pure.
 */
import { roleOf, driverOf, envOf } from './recipePatterns'
import { ruleFor, ruleMatchesRecord, mostSpecific, ruleIsEmpty } from './templateRules'
import { positionRecipeWithWrapperInternals } from './collectionStatus'
import { rowSlot } from './recipePresence'
import { TAG_COLUMNS } from './tagRules'

const up = s => String(s ?? '').trim().toUpperCase()
const refOf = r => r.ElementTypeRef || r.elementTypeRef || ''
const live = r => (r.IsDeleted || r.isDeleted) !== 'Y'
const LINEAR = new Set(['TAPE', 'FLEX', 'PROFILE', 'DIFF', 'CAP', 'CLIP', 'MOUNT', 'FIXED'])

/** The fields a style rule can use, grouped for RuleBuilder. */
export const STYLE_RULE_COLUMNS = [
  { label: 'What the Form says', options: [
    { key: 'Form.Main', label: 'Main product (ElementType)' },
    { key: 'Form.MainFamily', label: 'Main product family' },
    { key: 'Form.Maker', label: 'Maker' },
    { key: 'Form.Extras', label: 'Accessories (families)' },
  ] },
  { label: 'Kind', options: [
    { key: 'Kind.Product', label: 'Product (point / linear / track)' },
    { key: 'Kind.Driver', label: 'Driver location' },
    { key: 'Kind.Env', label: 'Interior / exterior' },
  ] },
  { label: 'Tags', options: [{ key: 'Tags', label: 'Tags' }] },
  { label: 'PositionType (DesignDB)', options: TAG_COLUMNS.map(c => ({ key: c, label: c })) },
]
export const FIELD_LABEL = Object.fromEntries(STYLE_RULE_COLUMNS.flatMap(g => g.options.map(o => [o.key, o.label])))

/**
 * styleRecords({ positionTypes, elementTypes, formCaptures, positionUI }) → Map(posRef → record)
 */
export function styleRecords({ positionTypes = [], elementTypes = [], formCaptures = null, positionUI = {} } = {}) {
  const famOf = new Map(elementTypes.map(e => [up(refOf(e)), e.Family || e.family || '']))
  const ptByRef = new Map(positionTypes.map(p => [up(p.PositionTypeRef || p.positionTypeRef), p]))
  const parentOf = r => { const p = ptByRef.get(up(r)); return p ? (p.ParentRef || p.parentRef || null) : null }
  const out = new Map()
  for (const pt of positionTypes) {
    const ref = pt.PositionTypeRef || pt.positionTypeRef
    const rec = {}
    for (const [k, v] of Object.entries(pt)) if (!k.startsWith('_') && (v == null || typeof v !== 'object')) rec[k] = v
    const caps = (formCaptures?.byPosition?.[ref] || []).filter(c => c.elementTypeRef)
    const lead = caps.find(c => c.role === 'lead') || caps[0] || null
    const leadRole = lead ? roleOf(lead.elementTypeRef, famOf.get(up(lead.elementTypeRef))) : ''
    const extras = caps.filter(c => c !== lead)
    Object.assign(rec, {
      'Form.Main': lead?.elementTypeRef || '',
      'Form.MainFamily': lead ? (famOf.get(up(lead.elementTypeRef)) || '') : '',
      'Form.Maker': lead?.manufacturer || '',
      // An accessory is named by its family (ET-EM, ET-PS-ACCESSORIES), else its role.
      'Form.Extras': [...new Set(extras.map(c => famOf.get(up(c.elementTypeRef)) || roleOf(c.elementTypeRef, '')))].sort(),
      'Kind.Product': !lead ? '' : leadRole === 'TRACK' || leadRole === 'TRACK-PS' ? 'track' : LINEAR.has(leadRole) ? 'linear' : 'point',
      'Kind.Driver': driverOf(pt),
      'Kind.Env': envOf(pt, parentOf),
      Tags: positionUI[ref]?.tags || [],
    })
    out.set(ref, rec)
  }
  return out
}

/**
 * recipeShape(recipes, posRef, { formRefs, familyOf }) → a key: which roles sit where.
 * The Form's own products are abstracted (FORM:lead / FORM:extra), so two positions built
 * alike around different products share a shape; wiring (drivers, sockets, frames) keeps
 * its role, connectors their name (5PIN-SOCKET ≠ 2PIN-REMOTE-SOCKET). '' when unbuilt.
 */
export function recipeShape(recipes, posRef, { formRefs = [], leadRef = null, familyOf = () => '' } = {}) {
  const { combined } = positionRecipeWithWrapperInternals(recipes, posRef)
  const form = new Set(formRefs.map(up))
  const parts = []
  for (const r of combined.filter(live)) {
    const ref = up(refOf(r))
    if (!ref) continue
    const { section } = rowSlot(r)
    const what = form.has(ref) ? (up(leadRef) === ref ? 'FORM:lead' : 'FORM:extra') : roleOf(ref, familyOf(ref))
    parts.push(`${section}:${what}`)
  }
  return [...new Set(parts)].sort().join(' + ')
}

/**
 * findStyleGroups(posRefs, ctx) → [{ key: shape, positions }] — positions built alike,
 * biggest first. ctx: { recipes, formCaptures, elementTypes }.
 */
export function findStyleGroups(posRefs, { recipes = [], formCaptures = null, elementTypes = [] } = {}) {
  const famOf = new Map(elementTypes.map(e => [up(refOf(e)), e.Family || e.family || '']))
  const byShape = new Map()
  for (const p of posRefs) {
    const caps = formCaptures?.byPosition?.[p] || []
    const lead = caps.find(c => c.role === 'lead') || caps[0]
    const shape = recipeShape(recipes, p, { formRefs: caps.map(c => c.elementTypeRef).filter(Boolean), leadRef: lead?.elementTypeRef, familyOf: r => famOf.get(up(r)) || '' })
    if (!shape) continue
    if (!byShape.has(shape)) byShape.set(shape, [])
    byShape.get(shape).push(p)
  }
  return [...byShape.entries()].map(([key, positions]) => ({ key, positions }))
    .sort((a, b) => b.positions.length - a.positions.length || a.key.localeCompare(b.key))
}

/** Style fields, best first, for suggesting a rule (precedent: kind, then the product). */
const STYLE_ORDER = ['Form.MainFamily', 'Kind.Driver', 'Kind.Env', 'Kind.Product', 'Form.Extras', 'Form.Maker', 'Form.Main', 'Tags']
export function suggestStyleRule(group, scope, recOf, against) {
  return ruleFor(group, scope, recOf, { against, fields: STYLE_ORDER })
}

/** A template saved before styles had rules: its `form-group:point|REMOTE|INT` tag, as a rule. */
export function styleRuleOf(template) {
  let r = template?.rule
  if (typeof r === 'string') { try { r = JSON.parse(r) } catch { r = null } }
  if (r && Array.isArray(r.conditions) && r.conditions.length) return r
  const tags = Array.isArray(template?.applicable_tags) ? template.applicable_tags
    : (() => { try { return JSON.parse(template?.applicable_tags || '[]') } catch { return [] } })()
  const g = tags.find(t => String(t).startsWith('form-group:'))
  if (!g) return null
  const parts = g.slice('form-group:'.length).split('|')
  // Only the old coarse key (point|REMOTE|INT); finer group keys carry their rule instead.
  if (parts.length !== 3 || parts.some(x => !x || x.includes('#'))) return null
  const [product, dl, env] = parts
  return { match: 'all', conditions: [
    { column: 'Kind.Product', op: 'equals', value: product },
    { column: 'Kind.Driver', op: 'equals', value: dl },
    { column: 'Kind.Env', op: 'equals', value: env },
  ] }
}

/**
 * The style for a record: the most specific matching rule (templateRules.mostSpecific,
 * measured against `scope`, the project's records); ties go to the first.
 */
export function matchStyle(rec, styles, scope) {
  const cands = []
  for (const t of styles || []) {
    const rule = styleRuleOf(t)
    if (!rule || ruleIsEmpty(rule) || !ruleMatchesRecord(rule, rec)) continue
    cands.push({ id: cands.length, rule, style: t })
  }
  if (!cands.length) return null
  return cands[mostSpecific(cands, scope).winners[0]].style
}

export const GROUP_DIMS = [
  { key: 'main', label: 'Main product' },
  { key: 'kind', label: 'Driver + environment' },
  { key: 'extras', label: 'Accessories' },
]

/** The group a record falls in for the chosen dimensions: { key, parts: [label] }. */
export function groupKeyFor(rec, by = ['main', 'kind', 'extras']) {
  const parts = [], labels = []
  if (by.includes('kind')) {
    parts.push(`${rec['Kind.Product']}|${rec['Kind.Driver']}|${rec['Kind.Env']}`)
    labels.push(`${rec['Kind.Product'] || '?'} · ${String(rec['Kind.Driver'] || '').toLowerCase()} driver · ${rec['Kind.Env'] === 'EXT' ? 'exterior' : 'interior'}`)
  }
  if (by.includes('main')) { parts.push(`M:${rec['Form.Main']}`); labels.push(rec['Form.Main'] || 'no main product') }
  if (by.includes('extras')) {
    const x = rec['Form.Extras'] || []
    parts.push(`X:${x.join(',')}`)
    labels.push(x.length ? `+ ${x.join(', ')}` : 'no accessories')
  }
  return { key: parts.join('#') || 'all', label: labels.join(' · ') || 'Everything' }
}

/** A rule prefilled from a group's dimensions, for "Save as style". */
export function ruleForDims(rec, by = ['main', 'kind', 'extras']) {
  const c = []
  if (by.includes('main')) {
    if (rec['Form.MainFamily']) c.push({ column: 'Form.MainFamily', op: 'equals', value: rec['Form.MainFamily'] })
    else if (rec['Form.Main']) c.push({ column: 'Form.Main', op: 'equals', value: rec['Form.Main'] })
  }
  if (by.includes('kind')) {
    c.push({ column: 'Kind.Product', op: 'equals', value: rec['Kind.Product'] })
    c.push({ column: 'Kind.Driver', op: 'equals', value: rec['Kind.Driver'] })
    c.push({ column: 'Kind.Env', op: 'equals', value: rec['Kind.Env'] })
  }
  if (by.includes('extras')) {
    const x = rec['Form.Extras'] || []
    if (x.length) for (const v of x) c.push({ column: 'Form.Extras', op: 'equals', value: v })
    else c.push({ column: 'Form.Extras', op: 'isEmpty', value: '' })
  }
  return { match: 'all', conditions: c.filter(x => x.op === 'isEmpty' || String(x.value ?? '') !== '') }
}
