/**
 * tagRules.js — user-defined tag derivation.
 *
 * Tags are free-form strings; a config owns a list of rules, plus per-position
 * add/remove exceptions.
 *
 * A rule is CONDITIONAL, like an email filter:
 *
 *   { id, tag, enabled, match: 'all' | 'any', conditions: [{ column, op, value }] }
 *
 * `match: 'all'` = every condition (AND); `match: 'any'` = at least one (OR). Several
 * rules producing the same tag union (OR), as before. So "X AND Y AND Z → tag" is one
 * rule with three conditions and match 'all'.
 *
 * The old single-condition shape { column, op, value, tag } is migrated on the way in
 * (see migrateRule), so nothing downstream ever sees it.
 */

/**
 * PositionType columns a rule can key off. Canonical mapped fields first, then
 * the rest of the DB PositionTypes schema (surfaced via the parser's include_all
 * pass, keyed by their raw header names).
 */
export const TAG_COLUMNS = [
  // Canonical / mapped
  'PositionTypeRef',
  'Name',
  'Description',
  'ParentRef',
  'DriverLocation',
  'SecondaryPowerType',
  'ControlTypeRef',
  'SecondaryPowerNodes_+ve',
  // Raw DB schema columns
  'ExtRef',
  'IsAdopted',
  'IsTBC',
  'IsCollection',
  'ParentDetails',
  'Details',
  'SortOrder',
  'InternalNotesText',
  'ExternalNotesText',
  'IsPropertiesTBC',
  'Parameters',
  'ExpandedEntities',
  'RequiresControlLink',
  'RequiresPrimaryPowerLink',
  'RequiresSecondaryPowerLink',
  'ControlAddressCount',
  'ThreadCountPerControlAddress',
  'SecondaryPowerNodes_-ve',
  'PowerPerUoM',
  'CurrentPerUoM',
  'VoltagePerUoM',
  'UoM',
  'BallastCountPerUoM',
]

/**
 * What a position's RECIPE holds (from the Product Spec and ElementTypes), so a rule can
 * say "tag positions using an iGuzzini product". Each is a list: a condition holds when
 * any item does (a negative one — is not, doesn't contain, !pattern — when none does).
 * Recomputed whenever tags are (Apply rules, opening the project).
 */
export const RECIPE_TAG_COLUMNS = [
  { key: 'Recipe.Manufacturer', label: 'Manufacturer (in recipe)' },
  { key: 'Recipe.ProductCode', label: 'Product code (in recipe)' },
  { key: 'Recipe.ElementType', label: 'ElementType (in recipe)' },
  { key: 'Recipe.Family', label: 'ElementType family (in recipe)' },
  { key: 'Recipe.Description', label: 'Product description (in recipe)' },
]

/**
 * recipeTagIndex({ recipes, psRows, elementTypes }) → Map(PositionTypeRef → the recipe
 * columns above). Build once per batch and pass to withRecipeFields.
 */
export function recipeTagIndex({ recipes = [], psRows = [], elementTypes = [] } = {}) {
  const lc = s => String(s ?? '').toLowerCase()
  const ps = new Map()
  for (const r of psRows) { const k = lc(r.ElementTypeRef || r.elementTypeRef); if (k && !ps.has(k)) ps.set(k, r) }
  const fam = new Map(elementTypes.map(e => [lc(e.ElementTypeRef || e.elementTypeRef), e.Family || e.family || '']))
  const out = new Map()
  const add = (m, k, v) => { const t = String(v ?? '').trim(); if (t && !m[k].includes(t)) m[k].push(t) }
  for (const r of recipes) {
    if ((r.IsDeleted || r.isDeleted) === 'Y') continue
    const pos = r.PositionTypeRef || r.positionTypeRef
    const ref = r.ElementTypeRef || r.elementTypeRef
    if (!pos || !ref) continue
    if (!out.has(pos)) out.set(pos, Object.fromEntries(RECIPE_TAG_COLUMNS.map(c => [c.key, []])))
    const m = out.get(pos)
    const spec = ps.get(lc(ref))
    add(m, 'Recipe.ElementType', ref)
    add(m, 'Recipe.Family', fam.get(lc(ref)))
    add(m, 'Recipe.Manufacturer', spec?.Manufacturer || spec?.manufacturer)
    add(m, 'Recipe.ProductCode', spec?.ProductCode || spec?.productCode)
    add(m, 'Recipe.Description', spec?.ComponentDescription || spec?.componentDescription)
  }
  return out
}

/** A PositionType with its recipe columns, ready for evaluateTags / ruleMatches. */
export function withRecipeFields(pt, index) {
  if (!pt || !index) return pt
  const empty = Object.fromEntries(RECIPE_TAG_COLUMNS.map(c => [c.key, []]))
  return { ...pt, ...empty, ...(index.get(pt.PositionTypeRef) || {}) }
}

/**
 * Operators a condition can use. `needsValue: false` ops (isEmpty/isNotEmpty) ignore
 * `value`; the numeric ops parse both sides as numbers. `label` drives the UI.
 */
export const TAG_OPS = [
  { op: 'equals', label: 'equals', needsValue: true },
  { op: 'notEquals', label: 'is not', needsValue: true },
  { op: 'contains', label: 'contains', needsValue: true },
  { op: 'notContains', label: "doesn't contain", needsValue: true },
  { op: 'startsWith', label: 'starts with', needsValue: true },
  { op: 'matches', label: 'matches (* ?)', needsValue: true },
  { op: 'isEmpty', label: 'is empty', needsValue: false },
  { op: 'isNotEmpty', label: 'is not empty', needsValue: false },
  { op: 'gt', label: '>', needsValue: true, numeric: true },
  { op: 'lt', label: '<', needsValue: true, numeric: true },
  { op: 'between', label: 'between', needsValue: true, numeric: true, twoValues: true },
]
const OP_SET = new Map(TAG_OPS.map(o => [o.op, o]))

function fieldValue(pt, column) {
  const v = pt?.[column]
  return v == null ? '' : String(v)
}

/**
 * Wildcard match, whole value, case-insensitive: `*` any run, `?` one character.
 * A comma separates alternatives (any of); a leading `!` negates the whole pattern.
 *   wildcardMatch('ET-DL-*', 'et-dl-04') → true · wildcardMatch('!*TBC*', 'X') → true
 */
export function wildcardMatch(pattern, value) {
  let p = String(pattern ?? '').trim()
  if (p.startsWith('!')) return !wildcardMatch(p.slice(1), value)
  const v = String(value ?? '')
  return p.split(',').map(x => x.trim()).filter(Boolean).some(alt => {
    const re = alt.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
    return new RegExp(`^${re}$`, 'i').test(v)
  })
}

const num = s => {
  const n = Number(String(s ?? '').trim())
  return Number.isFinite(n) ? n : null
}

/** True if one condition holds for a PositionType. Unknown ops never match. */
const NEGATIVE = { notEquals: 'equals', notContains: 'contains' }

export function conditionMatches(cond, pt) {
  if (!cond || !cond.column) return false
  // A list (the recipe columns): any item for a positive op, none for a negative one.
  const listed = pt?.[cond.column]
  if (Array.isArray(listed)) {
    if (cond.op === 'isEmpty') return listed.length === 0
    if (cond.op === 'isNotEmpty') return listed.length > 0
    const one = (op, value) => listed.some(x => conditionMatches({ column: 'x', op, value }, { x }))
    if (NEGATIVE[cond.op]) return !one(NEGATIVE[cond.op], cond.value)
    if (cond.op === 'matches' && String(cond.value ?? '').trim().startsWith('!')) return !one('matches', String(cond.value).trim().slice(1))
    return one(cond.op, cond.value)
  }
  const raw = fieldValue(pt, cond.column)
  const fv = raw.toLowerCase()
  const target = String(cond.value ?? '').toLowerCase()

  switch (cond.op) {
    case 'equals': return fv === target
    case 'notEquals': return fv !== target
    case 'contains': return target !== '' && fv.includes(target)
    case 'notContains': return target === '' || !fv.includes(target)
    case 'startsWith': return target !== '' && fv.startsWith(target)
    case 'matches': return target !== '' && wildcardMatch(cond.value, raw)
    case 'isEmpty': return raw.trim() === ''
    case 'isNotEmpty': return raw.trim() !== ''
    case 'gt': { const a = num(raw), b = num(cond.value); return a !== null && b !== null && a > b }
    case 'lt': { const a = num(raw), b = num(cond.value); return a !== null && b !== null && a < b }
    case 'between': {
      // value holds the two bounds, comma-separated: "10,20". Order-independent.
      const a = num(raw)
      const [loS, hiS] = String(cond.value ?? '').split(',')
      const lo = num(loS), hi = num(hiS)
      return a !== null && lo !== null && hi !== null && a >= Math.min(lo, hi) && a <= Math.max(lo, hi)
    }
    default: return false
  }
}

/** The conditions of a rule, whatever shape it arrived in. */
export function ruleConditions(rule) {
  if (!rule) return []
  if (Array.isArray(rule.conditions)) return rule.conditions
  // Legacy single-condition rule.
  if (rule.column) return [{ column: rule.column, op: rule.op || 'equals', value: rule.value }]
  return []
}

/**
 * True if a rule matches. `match: 'any'` needs one condition; anything else means ALL
 * (the safe default — a multi-condition rule is an AND unless it says otherwise). An
 * empty condition list never matches, so a half-built rule tags nothing.
 */
export function ruleMatches(rule, pt) {
  if (!rule || rule.enabled === false || !rule.tag) return false
  const conds = ruleConditions(rule)
  if (conds.length === 0) return false
  return rule.match === 'any'
    ? conds.some(c => conditionMatches(c, pt))
    : conds.every(c => conditionMatches(c, pt))
}

/** Normalise any rule (legacy or partial) into the conditional shape. */
export function migrateRule(rule) {
  if (!rule) return rule
  if (Array.isArray(rule.conditions)) {
    return { match: 'all', enabled: true, ...rule }
  }
  const { column, op, value, ...rest } = rule
  return {
    match: 'all',
    enabled: rule.enabled !== false,
    ...rest,
    conditions: column ? [{ column, op: op || 'equals', value: value ?? '' }] : [],
  }
}

/** Migrate a whole rule set. Idempotent — already-conditional rules pass through. */
export function migrateRules(rules) {
  return (rules || []).map(migrateRule)
}

/**
 * evaluateTags(pt, rules) → string[] of tags produced by the rules (deduped,
 * insertion-ordered).
 */
export function evaluateTags(pt, rules) {
  const out = []
  const seen = new Set()
  for (const rule of (rules || [])) {
    if (ruleMatches(rule, pt) && !seen.has(rule.tag)) {
      seen.add(rule.tag)
      out.push(rule.tag)
    }
  }
  return out
}

/**
 * effectiveTags(ruleTags, tagAdd, tagRemove) → final tag list:
 * (ruleTags ∪ tagAdd) − tagRemove, deduped, order-stable.
 */
export function effectiveTags(ruleTags = [], tagAdd = [], tagRemove = []) {
  const removeSet = new Set(tagRemove)
  const out = []
  const seen = new Set()
  for (const t of [...ruleTags, ...tagAdd]) {
    if (removeSet.has(t) || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

/** All PositionType columns referenced by a rule set (for drift detection). */
export function columnsUsedByRules(rules) {
  const cols = new Set()
  for (const r of rules || []) {
    for (const c of ruleConditions(r)) if (c.column) cols.add(c.column)
  }
  return [...cols]
}

// ---------------------------------------------------------------------------
// Drift detection — alert when the DB data behind a position's tags changes.
// ---------------------------------------------------------------------------

function sameTags(a = [], b = []) {
  if (a.length !== b.length) return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  return sa.every((t, i) => t === sb[i])
}

/**
 * snapshotForPosition(pt, rules) → { ruleTags, fields }
 * Captures the rule-derived tags plus the values of every rule-relevant column,
 * so a later reimport can tell what changed.
 */
export function snapshotForPosition(pt, rules) {
  const cols = columnsUsedByRules(rules)
  const fields = {}
  for (const c of cols) fields[c] = pt?.[c] == null ? '' : Array.isArray(pt[c]) ? pt[c].join(', ') : String(pt[c])
  return { ruleTags: evaluateTags(pt, rules), fields }
}

/**
 * computeTagDrift(positionTypes, rules, snapshots)
 * Compares each position's current rule snapshot against its stored baseline.
 *
 * @returns {{ drift: Object, newBaselines: Object }}
 *   drift[ref]        = { tagsBefore, tagsAfter, changedFields: [{column, from, to}] }
 *   newBaselines[ref] = snapshot for positions seen for the first time (baseline)
 */
export function computeTagDrift(positionTypes, rules, snapshots = {}) {
  const drift = {}
  const newBaselines = {}
  for (const pt of (positionTypes || [])) {
    const ref = pt.PositionTypeRef
    if (!ref) continue
    const curr = snapshotForPosition(pt, rules)
    const prev = snapshots[ref]
    if (!prev) { newBaselines[ref] = curr; continue }  // first sight → baseline, no drift

    const changedFields = []
    const cols = new Set([...Object.keys(prev.fields || {}), ...Object.keys(curr.fields)])
    for (const c of cols) {
      const from = (prev.fields || {})[c] ?? ''
      const to = curr.fields[c] ?? ''
      if (from !== to) changedFields.push({ column: c, from, to })
    }
    const tagsChanged = !sameTags(prev.ruleTags || [], curr.ruleTags)
    if (tagsChanged || changedFields.length > 0) {
      drift[ref] = { tagsBefore: prev.ruleTags || [], tagsAfter: curr.ruleTags, changedFields }
    }
  }
  return { drift, newBaselines }
}
