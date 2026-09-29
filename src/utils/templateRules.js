/**
 * templateRules.js — which positions a connector template applies to, as a RULE.
 *
 * A template's rule has the same shape as a tag rule (tagRules.js):
 *
 *   { match: 'all' | 'any', conditions: [{ column, op, value }] }
 *
 * and is evaluated against a position's RECORD: its DesignDB columns, its position
 * family, its tags (a list), and what its recipe holds besides connectors (Recipe.*
 * lists). Tags are just one more field: "Tags is Exterior AND DriverLocation is REMOTE".
 *
 * Templates saved before rules existed carry ApplicableTags / ExcludedTags; templateRule
 * reads those as the equivalent conditions, so nothing downstream sees the old shape.
 *
 * PRECEDENCE when several templates' rules match one position: a pin wins; otherwise the
 * MOST SPECIFIC rule wins (specificity below). Two equally specific winners are a clash.
 *
 * ruleFor() is the other direction: given the positions that already carry a set of
 * connectors, find a short rule that picks out exactly them. Pure.
 */
import { conditionMatches, TAG_COLUMNS, RECIPE_TAG_COLUMNS, recipeTagIndex, withRecipeFields } from './tagRules'
import { positionFamilyOf } from './positionFamily'

const lc = s => String(s ?? '').trim().toLowerCase()
const parseList = raw => {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : [] } catch { return [] }
}

export const EMPTY_RULE = { match: 'all', conditions: [] }

/** The fields a template rule can use, grouped for a picker. */
export const TEMPLATE_RULE_COLUMNS = [
  { label: 'Tags', options: [{ key: 'Tags', label: 'Tags' }] },
  { label: 'PositionType (DesignDB)', options: [{ key: 'Family', label: 'Family (position)' }, ...TAG_COLUMNS.map(c => ({ key: c, label: c }))] },
  { label: 'What its recipe holds, besides connectors (Product Spec)', options: RECIPE_TAG_COLUMNS },
]

/** A usable condition: a column and an op, and a value when the op needs one. */
const usable = c => c && c.column && c.op && (['isEmpty', 'isNotEmpty'].includes(c.op) || String(c.value ?? '').trim() !== '')

/** A template's rule, from `Rule` or from its old included / excluded tags. */
export function templateRule(collection) {
  if (!collection) return EMPTY_RULE
  let r = collection.Rule
  if (typeof r === 'string') { try { r = JSON.parse(r) } catch { r = null } }
  if (r && Array.isArray(r.conditions)) return { match: r.match === 'any' ? 'any' : 'all', conditions: r.conditions }
  return ruleFromTags(parseList(collection.ApplicableTags), parseList(collection.ExcludedTags))
}

/** Included tags (any of) and excluded tags (none of) as rule conditions. */
export function ruleFromTags(include = [], exclude = []) {
  const conditions = []
  if (include.length === 1) conditions.push({ column: 'Tags', op: 'equals', value: include[0] })
  else if (include.length > 1) conditions.push({ column: 'Tags', op: 'matches', value: include.join(', ') })
  for (const t of exclude) conditions.push({ column: 'Tags', op: 'notEquals', value: t })
  return { match: 'all', conditions }
}

export const ruleConditionsOf = rule => (rule?.conditions || []).filter(usable)
export const ruleIsEmpty = rule => ruleConditionsOf(rule).length === 0

/**
 * How specific a rule is: its condition count when all must hold; an OR rule is only as
 * specific as one condition. An empty rule is 0.
 */
export function ruleSpecificity(rule) {
  const n = ruleConditionsOf(rule).length
  if (n === 0) return 0
  return rule.match === 'any' ? 1 : n
}

/** Does a rule hold for a record? An empty rule holds for nothing (callers decide). */
export function ruleMatchesRecord(rule, rec) {
  const conds = ruleConditionsOf(rule)
  if (conds.length === 0) return false
  return rule.match === 'any' ? conds.some(c => conditionMatches(c, rec)) : conds.every(c => conditionMatches(c, rec))
}

/** A record from a bare tag list — what callers without the full picture have. */
export const recordFromTags = tags => ({ Tags: Array.isArray(tags) ? tags : [] })
/** Whatever a caller passed (tags or a record) as a record. */
export const asRecord = x => (Array.isArray(x) ? recordFromTags(x) : (x || recordFromTags([])))

/**
 * templateRecords({ positionTypes, recipes, psRows, elementTypes, positionUI, isConnector })
 * → Map(PositionTypeRef → record). Connector parts are left out of the Recipe.* lists, so
 * a rule describes the position, not the connectors the template itself adds.
 */
export function templateRecords({ positionTypes = [], recipes = [], psRows = [], elementTypes = [], positionUI = {}, isConnector = () => false } = {}) {
  const live = recipes.filter(r => !isConnector(r.ElementTypeRef || r.elementTypeRef || ''))
  const index = recipeTagIndex({ recipes: live, psRows, elementTypes })
  const out = new Map()
  for (const pt of positionTypes) {
    const ref = pt.PositionTypeRef
    const rec = {}
    for (const [k, v] of Object.entries(pt)) if (!k.startsWith('_') && (v == null || typeof v !== 'object')) rec[k] = v
    Object.assign(rec, withRecipeFields({ PositionTypeRef: ref }, index))
    rec.Family = positionFamilyOf(pt) || ''
    rec.Tags = positionUI[ref]?.tags || []
    out.set(ref, rec)
  }
  return out
}

/** A rule in words: "Tags is Exterior and DriverLocation is REMOTE". */
export function describeRule(rule) {
  const conds = ruleConditionsOf(rule)
  if (conds.length === 0) return 'no rule'
  const OPS = { equals: 'is', notEquals: 'is not', contains: 'contains', notContains: "doesn't contain", startsWith: 'starts with', matches: 'matches', isEmpty: 'is empty', isNotEmpty: 'is not empty', gt: '>', lt: '<', between: 'between' }
  const label = k => RECIPE_TAG_COLUMNS.find(c => c.key === k)?.label || k
  return conds.map(c => `${label(c.column)} ${OPS[c.op] || c.op}${['isEmpty', 'isNotEmpty'].includes(c.op) ? '' : ` ${c.value}`}`)
    .join(rule.match === 'any' ? ' or ' : ' and ')
}

// ── Suggesting a rule from the positions that already have the connectors ──────────────

/**
 * Fields in the order a suggestion tries them — precedent first. Finished projects show
 * connectors follow the KIND of position (wrapper × driver location × interior/exterior,
 * recipePatterns.json), so those come first; tags next; refs, names and notes never
 * (a rule listing refs is just a pin).
 */
const SUGGEST_ORDER = [
  // Position fields first: they hold for a position before its recipe is built, so the
  // rule also catches the positions still waiting for these connectors.
  'DriverLocation', 'Family', 'Tags', 'SecondaryPowerType', 'ControlTypeRef', 'Recipe.Family',
  'Recipe.Manufacturer', 'RequiresControlLink', 'RequiresPrimaryPowerLink', 'RequiresSecondaryPowerLink',
  'UoM', 'IsCollection', 'ParentRef', 'Recipe.ElementType', 'Recipe.ProductCode',
]
const MAX_CONDITIONS = 4
const NO_NEGATIVE = new Set(['Recipe.ElementType', 'Recipe.ProductCode', 'ParentRef'])

const valuesOf = (rec, f) => {
  const v = rec?.[f]
  if (Array.isArray(v)) return v.map(x => String(x ?? '').trim()).filter(Boolean)
  const s = String(v ?? '').trim()
  return s ? [s] : []
}

/**
 * ruleFor(group, scope, recOf) → { rule, exact, outsiders, conditionsUsed } | null
 *
 * group: the refs that should match (they share the connectors); scope: every ref a
 * template could apply to; recOf(ref) → record. Greedy: a value every group position
 * shares, then whichever next condition (another shared value, or a value no group
 * position has, as "is not") leaves out the most other positions. Every condition keeps
 * the whole group, so the result never loses a member; `exact` says whether it also
 * leaves out everyone else.
 */
export function ruleFor(group, scope, recOf, opts = {}) {
  // Position fields first, alone: a rule on them also holds for positions whose recipe is
  // not built yet. Only when they cannot pick the group out are recipe fields used.
  const plain = ruleSearch(group, scope, recOf, { ...opts, fields: SUGGEST_ORDER.filter(f => !f.startsWith('Recipe.')) })
  if (plain?.exact) return plain
  const full = ruleSearch(group, scope, recOf, { ...opts, fields: SUGGEST_ORDER })
  return full && (full.exact || !plain || full.outsiders.length < plain.outsiders.length) ? full : plain
}

function ruleSearch(group, scope, recOf, { against = null, fields = SUGGEST_ORDER } = {}) {
  if (!group?.length) return null
  const inGroup = new Set(group)
  // Who the rule must leave out: by default everyone else; given `against`, only those
  // (positions with OTHER connectors). A position with no connectors yet is not evidence
  // against a rule — it may be one that should get them.
  const others = (against || scope).filter(r => !inGroup.has(r))
  const recs = new Map(scope.concat(group).map(r => [r, recOf(r) || {}]))

  // Candidates: shared values (positive) and values no group member has (negative).
  const cands = []
  fields.forEach((f, rank) => {
    const sets = group.map(r => new Set(valuesOf(recs.get(r), f).map(lc)))
    const first = valuesOf(recs.get(group[0]), f)
    for (const v of first) if (sets.every(s => s.has(lc(v)))) cands.push({ cond: { column: f, op: 'equals', value: v }, rank })
    // "Is not" on a per-position value (a ref, a code) is just listing positions: skip it.
    if (NO_NEGATIVE.has(f)) return
    const inGroupVals = new Set(sets.flatMap(s => [...s]))
    const seen = new Set()
    for (const r of others) for (const v of valuesOf(recs.get(r), f)) {
      if (inGroupVals.has(lc(v)) || seen.has(lc(v))) continue
      seen.add(lc(v))
      cands.push({ cond: { column: f, op: 'notEquals', value: v }, rank: rank + 0.5 })
    }
  })

  const holds = (cond, r) => conditionMatches(cond, recs.get(r))
  let left = others
  const chosen = []
  // The first condition must be positive: a rule of only "is not" reads as "everything else".
  const positives = cands.filter(c => c.cond.op === 'equals')
  while (chosen.length < MAX_CONDITIONS && (left.length > 0 || chosen.length === 0)) {
    const pool = chosen.length === 0 ? positives : cands.filter(c => !chosen.includes(c))
    let best = null
    for (const c of pool) {
      const keep = left.filter(r => holds(c.cond, r)).length
      if (chosen.length > 0 && keep === left.length) continue   // removes nobody
      if (!best || keep < best.keep || (keep === best.keep && c.rank < best.c.rank)) best = { c, keep }
    }
    if (!best) break
    chosen.push(best.c)
    left = left.filter(r => holds(best.c.cond, r))
  }
  if (chosen.length === 0) return null
  return {
    rule: { match: 'all', conditions: chosen.map(c => c.cond) },
    exact: left.length === 0,
    outsiders: left,
  }
}

/**
 * compareRule(rule, scope, recOf, hasParts) → { same, change, missed }
 * Against today's recipes: positions the rule matches that already have the template's
 * connectors (same), that would change (change), and positions that have them but the
 * rule leaves out (missed). hasParts(ref) → bool.
 */
export function compareRule(rule, scope, recOf, hasParts) {
  const out = { same: [], change: [], missed: [] }
  for (const r of scope) {
    const m = ruleMatchesRecord(rule, recOf(r) || {})
    const h = hasParts(r)
    if (m && h) out.same.push(r)
    else if (m) out.change.push(r)
    else if (h) out.missed.push(r)
  }
  return out
}
