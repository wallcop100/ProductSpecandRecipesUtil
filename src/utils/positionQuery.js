/**
 * positionQuery.js — the question the rail is filtered by (REVIEW_PLAN.md).
 *
 *   query: { rule?, refs?, label? }
 *     rule  a template rule (templateRules.js), matched on each position's templateRecords
 *     refs  a plain list of PositionTypeRefs (the Form's "these positions" hand-off)
 *
 * Review recipes builds a rule; Find builds one from a single word. Pure.
 */
import { templateRecords, ruleMatchesRecord, ruleConditionsOf, describeRule } from './templateRules'
import { conditionMatches, recipeTagIndex } from './tagRules'

const NOT_A_PART = new Set(['notEquals', 'notContains', 'isEmpty'])
const RECIPE_COLUMNS = ['Recipe.ElementType', 'Recipe.ProductCode', 'Recipe.Manufacturer', 'Recipe.Description']

/** A one-word search as a rule: any part whose ref, code, maker or description holds it. */
export const wordRule = word => ({ match: 'any', conditions: RECIPE_COLUMNS.map(column => ({ column, op: 'contains', value: word })) })

/** The query in words, for the rail's chip. */
export const describeQuery = q => q?.label || (q?.rule ? describeRule(q.rule) : `${q?.refs?.length || 0} positions`)

/** The PositionTypeRefs a query lets through, or null for no query. */
export function queryRefs(query, state) {
  if (!query) return null
  if (query.refs) return new Set(query.refs)
  if (!ruleConditionsOf(query.rule).length) return null
  const recs = templateRecords(state)
  return new Set([...recs].filter(([, rec]) => ruleMatchesRecord(query.rule, rec)).map(([ref]) => ref))
}

// One index per (rule, recipes, psRows, elementTypes): every card asks, and they all ask the same.
let cache = { key: [], hits: null }
/**
 * Does this part (an ElementTypeRef) satisfy any positive recipe condition of the rule? That is
 * what the recipe highlights. A rule about tags or DesignDB columns names no part.
 */
export function partMatches(rule, etRef, { psRows = [], elementTypes = [] } = {}) {
  const conds = ruleConditionsOf(rule).filter(c => c.column.startsWith('Recipe.') && !NOT_A_PART.has(c.op)
    && !String(c.value ?? '').trim().startsWith('!'))
  if (!conds.length || !etRef) return false
  const key = [rule, psRows, elementTypes]
  if (!cache.hits || key.some((k, i) => k !== cache.key[i])) cache = { key, hits: new Map() }
  const k = String(etRef).toLowerCase()
  if (!cache.hits.has(k)) {
    const rec = recipeTagIndex({ recipes: [{ PositionTypeRef: k, ElementTypeRef: etRef }], psRows, elementTypes }).get(k)
    cache.hits.set(k, conds.some(c => conditionMatches(c, rec)))
  }
  return cache.hits.get(k)
}
