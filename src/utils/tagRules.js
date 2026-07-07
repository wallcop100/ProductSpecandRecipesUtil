/**
 * tagRules.js — user-defined tag derivation.
 *
 * Replaces the old hardcoded heuristics (tagEngine.js + TAG_GROUPS). Tags are
 * free-form strings; a config owns a list of rules that map a PositionType
 * column value to a tag, plus per-position add/remove exceptions.
 *
 * Rule shape: { id, column, op: 'equals' | 'contains', value, tag, enabled }
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

export const TAG_OPS = ['equals', 'contains']

function fieldValue(pt, column) {
  const v = pt?.[column]
  return v == null ? '' : String(v)
}

/** True if a single rule matches a PositionType. */
export function ruleMatches(rule, pt) {
  if (!rule || rule.enabled === false || !rule.tag || !rule.column) return false
  const fv = fieldValue(pt, rule.column).toLowerCase()
  const target = String(rule.value ?? '').toLowerCase()
  if (rule.op === 'contains') return target !== '' && fv.includes(target)
  // default: equals
  return fv === target
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
  return [...new Set((rules || []).map(r => r.column).filter(Boolean))]
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
  for (const c of cols) fields[c] = pt?.[c] == null ? '' : String(pt[c])
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
