/**
 * reviewFields.js — what Review recipes can filter on and show as columns.
 *
 * Each match (a PositionType or an ElementType) becomes a flat RECORD of field → value; a
 * value is a string, a number, or an array (tags, the ETs a recipe contains…). Filters are
 * tagRules' conditions ({ field, op, value }) with match 'all' | 'any', so the wildcard op
 * (`*`, `?`, comma = any of, leading `!` = not) and every other op work here too.
 *
 * On an array a positive condition holds when ANY element does; a negative one (is not,
 * doesn't contain, `!pattern`) when NO element holds its positive form. Pure.
 */
import { conditionMatches, wildcardMatch } from './tagRules'
import { familyOf } from './etRef'
import { positionFamilyOf } from './positionFamily'

const lc = s => String(s ?? '').toLowerCase()
const refOf = r => r.ElementTypeRef || r.elementTypeRef || ''
const uniq = a => [...new Set(a.filter(Boolean))]

/** Where each field comes from, in the order they are offered. */
export const FIELD_SOURCES = ['DesignDB', 'Product Spec', 'Recipes', 'Tags']

/** Built-in fields per unit; raw DesignDB columns are appended by `fieldsFor`. */
const BUILTIN = {
  position: [
    { key: 'Ref', label: 'Ref', source: 'DesignDB' },
    { key: 'Name', label: 'Name', source: 'DesignDB' },
    { key: 'Family', label: 'Family', source: 'DesignDB' },
    { key: 'Tags', label: 'Tags', list: true, source: 'Tags' },
    { key: 'Contains', label: 'Contains ET', list: true, source: 'Recipes' },
    { key: 'Manufacturer', label: 'Manufacturer', list: true, source: 'Product Spec' },
    { key: 'ProductCode', label: 'Product code', list: true, source: 'Product Spec' },
    { key: 'Rows', label: 'Recipe rows', numeric: true, source: 'Recipes' },
    { key: 'Status', label: 'Status', source: 'Recipes' },
  ],
  element: [
    { key: 'Ref', label: 'Ref', source: 'DesignDB' },
    { key: 'Family', label: 'Family', source: 'DesignDB' },
    { key: 'Manufacturer', label: 'Manufacturer', source: 'Product Spec' },
    { key: 'ProductCode', label: 'Product code', source: 'Product Spec' },
    { key: 'Description', label: 'Description', source: 'Product Spec' },
    { key: 'Tags', label: 'Tags', list: true, source: 'Tags' },
    { key: 'UsedIn', label: 'Used in', list: true, source: 'Recipes' },
    { key: 'UsedInCount', label: 'Used in (count)', numeric: true, source: 'Recipes' },
    { key: 'Contains', label: 'Contains ET', list: true, source: 'Recipes' },
  ],
}

/** The filter boxes a unit starts with; any other field can be added. */
export const DEFAULT_FILTER_FIELDS = {
  position: ['Ref', 'Family', 'Tags', 'Manufacturer', 'Contains'],
  element: ['Ref', 'Family', 'Manufacturer', 'UsedIn'],
}

export const DEFAULT_COLUMNS = {
  position: ['Ref', 'Name', 'Family', 'Status', 'Rows'],
  element: ['Ref', 'Family', 'Manufacturer', 'UsedInCount'],
}

const SKIP_RAW = /^_|^(PositionTypeRef|ElementTypeRef|Name|name|Family|family)$/

/** Fields for a unit: built-ins, then every other column the DesignDB rows carry. */
export function fieldsFor(unit, { positionTypes = [], elementTypes = [] } = {}) {
  const base = BUILTIN[unit]
  const have = new Set(base.map(f => f.key))
  const raw = new Set()
  for (const row of (unit === 'position' ? positionTypes : elementTypes)) {
    for (const [k, v] of Object.entries(row || {})) if (!SKIP_RAW.test(k) && !have.has(k) && (v == null || typeof v !== 'object')) raw.add(k)
  }
  return [...base, ...[...raw].sort((a, b) => a.localeCompare(b)).map(k => ({ key: k, label: k, raw: true, source: 'DesignDB' }))]
}

/**
 * Records for every candidate of a unit.
 * ctx: { positionTypes, elementTypes, recipes (live), psRows, positionUI, statusOf(pt) }
 * → [{ kind, ref, name, rec }]
 */
export function recordsFor(unit, ctx) {
  const { positionTypes = [], elementTypes = [], recipes = [], psRows = [], positionUI = {}, statusOf } = ctx
  const psByRef = new Map()
  for (const r of psRows) { const k = lc(refOf(r)); if (k && !psByRef.has(k)) psByRef.set(k, r) }
  const mfrOf = ref => String(psByRef.get(lc(ref))?.Manufacturer || psByRef.get(lc(ref))?.manufacturer || '').trim()
  const rowsByPos = new Map()
  for (const r of recipes) {
    const p = r.PositionTypeRef || r.positionTypeRef
    if (!rowsByPos.has(p)) rowsByPos.set(p, [])
    rowsByPos.get(p).push(r)
  }

  if (unit === 'position') {
    return positionTypes.map(pt => {
      const ref = pt.PositionTypeRef
      const rows = rowsByPos.get(ref) || []
      const ets = uniq(rows.map(refOf))
      const rec = {}
      for (const [k, v] of Object.entries(pt)) if (!k.startsWith('_') && (v == null || typeof v !== 'object')) rec[k] = v
      Object.assign(rec, {
        Ref: ref, Name: pt.Name || pt.name || '', Family: positionFamilyOf(pt) || '',
        Tags: positionUI[ref]?.tags || [], Contains: ets, Manufacturer: uniq(ets.map(mfrOf)),
        ProductCode: uniq(ets.map(r => String(psByRef.get(lc(r))?.ProductCode || psByRef.get(lc(r))?.productCode || '').trim())),
        Rows: rows.length, Status: statusOf ? statusOf(pt) : '',
      })
      return { kind: 'position', ref, name: rec.Name || null, rec }
    })
  }

  const etObj = new Map(elementTypes.map(e => [lc(refOf(e)), e]))
  const all = new Map()
  const add = ref => { const k = lc(ref); if (k && !all.has(k)) all.set(k, ref) }
  for (const e of elementTypes) add(refOf(e))
  for (const r of psRows) add(refOf(r))
  for (const r of recipes) add(refOf(r))
  const usedIn = new Map(), tags = new Map(), internals = new Map()
  for (const r of recipes) {
    const k = lc(refOf(r)), p = r.PositionTypeRef || r.positionTypeRef
    if (!usedIn.has(k)) usedIn.set(k, new Set())
    if (p) usedIn.get(k).add(p)
    if (!tags.has(k)) tags.set(k, new Set())
    for (const t of positionUI[p]?.tags || []) tags.get(k).add(t)
    if ((r.ContextType || r.contextType) === 'ElementType') {
      const c = lc(r.ContextRef || r.contextRef)
      if (!internals.has(c)) internals.set(c, new Set())
      internals.get(c).add(refOf(r))
    }
  }
  return [...all.values()].map(ref => {
    const k = lc(ref), e = etObj.get(k)
    const rec = {}
    for (const [f, v] of Object.entries(e || {})) if (!f.startsWith('_') && (v == null || typeof v !== 'object')) rec[f] = v
    const ps = psByRef.get(k)
    Object.assign(rec, {
      Ref: ref, Family: familyOf(ref, e) || '', Manufacturer: mfrOf(ref),
      Description: ps?.ComponentDescription || ps?.componentDescription || '',
      ProductCode: ps?.ProductCode || ps?.productCode || '',
      Tags: [...(tags.get(k) || [])], UsedIn: [...(usedIn.get(k) || [])], UsedInCount: usedIn.get(k)?.size || 0,
      Contains: [...(internals.get(k) || [])],
    })
    return { kind: 'element', ref, name: rec.Description || null, rec }
  })
}

const NEGATIVE = { notEquals: 'equals', notContains: 'contains' }

/** One condition { field, op, value } against a record. */
/**
 * Free text, as typed in a filter box: part of the value (case-insensitive), or with `*` /
 * `?` a wildcard over the whole value; commas mean any of; a leading `!` means not.
 * "dl" finds ET-DL-04 · "ET-DL-*, ET-LIN-*" · "!*TBC*".
 */
export function textMatches(query, value) {
  const q = String(query ?? '').trim()
  if (!q) return true
  if (q.startsWith('!')) return !textMatches(q.slice(1), value)
  const v = String(value ?? '').toLowerCase()
  return q.split(',').map(x => x.trim()).filter(Boolean).some(alt => (/[*?]/.test(alt)
    ? wildcardMatch(alt, v)
    : v.includes(alt.toLowerCase())))
}

export function recordMatches(cond, rec) {
  if (!cond?.field || !cond.op) return true   // a half-built row filters nothing
  const v = rec[cond.field]
  if (cond.op === 'text') {
    const q = String(cond.value ?? '').trim()
    if (!q) return true
    if (!Array.isArray(v)) return textMatches(q, cellText(v))
    // A list: "not" means none of its items; otherwise any item.
    if (q.startsWith('!')) return !v.some(x => textMatches(q.slice(1), x))
    return v.some(x => textMatches(q, x))
  }
  if (!Array.isArray(v)) return conditionMatches({ column: cond.field, op: cond.op, value: cond.value }, rec)
  if (cond.op === 'isEmpty') return v.length === 0
  if (cond.op === 'isNotEmpty') return v.length > 0
  const one = (op, value) => v.some(x => conditionMatches({ column: 'x', op, value }, { x }))
  if (NEGATIVE[cond.op]) return !one(NEGATIVE[cond.op], cond.value)
  if (cond.op === 'matches' && String(cond.value ?? '').trim().startsWith('!')) return !one('matches', String(cond.value).trim().slice(1))
  return one(cond.op, cond.value)
}

/** A filter set { match: 'all'|'any', conditions } against a record. No conditions = everything. */
export function filterMatches(filter, rec) {
  const conds = (filter?.conditions || []).filter(c => c.field && c.op)
  if (conds.length === 0) return true
  return filter.match === 'any' ? conds.some(c => recordMatches(c, rec)) : conds.every(c => recordMatches(c, rec))
}

/** A value as a cell. */
export const cellText = v => (Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v))

/**
 * The old fixed filters ({ family, manufacturer, tag, containsET }) from a filter set's
 * plain `equals` conditions — Add-anywhere still primes itself from that shape.
 */
export function legacyFilters(filter) {
  const out = { family: '', manufacturer: '', tag: '', containsET: '' }
  const map = { Family: 'family', Manufacturer: 'manufacturer', Tags: 'tag', Contains: 'containsET' }
  if (filter?.match === 'any') return out
  for (const c of filter?.conditions || []) if (c.op === 'equals' && map[c.field]) out[map[c.field]] = c.value
  return out
}
