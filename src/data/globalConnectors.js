/**
 * globalConnectors.js — the company's Wago connector set-ups as GLOBAL connector templates.
 *
 * Where it lives and how n8n updates it: docs/global-connector-templates.md.
 *
 * The data block at the bottom is copied from Kaizen page 101097 (Lighting Manufacturing -
 * Wago plugs) and is rewritten by an n8n job when the page changes: keep logic above the
 * markers and only plain data between them. Only the page's CURRENT parts ship; superseded
 * codes are listed so an existing project's old parts are recognised, never offered.
 *
 * One ElementType per Wago part. Site side (socket) parts go in the position section, driver
 * side (plug) parts inside the wrapper, as a project template's Ingredients do.
 *
 * suggestConnectors(rec) picks the templates that fit a position, from precedent (project
 * 4343: DALI with a local driver used 5-pin, DALI with a remote driver 2-pin, switched /
 * phase / local control 3-pin). DALI with a local driver is usually run as 2+3 core cable,
 * so the 2-pin DALI + 3-pin LEN pair comes first and 5-pin second. Pure.
 */
import { POSITION, INTERNAL } from '../utils/recipePresence'
import { ruleMatchesRecord } from '../utils/templateRules'

const norm = s => String(s ?? '').trim().toUpperCase().replace(/\s+/g, '')
export const WAGO = 'WAGO'

/** Every template and combo the library offers: { key, name, note, parts: [{ code, role, side, label }] }. */
export function globalConnectors() {
  const byKey = new Map(WAGO_TEMPLATES.map(t => [t.key, t]))
  const expand = t => [
    ...t.site.map(p => ({ ...p, side: 'site', pins: t.pins, variant: t.variant || '' })),
    ...t.driver.map(p => ({ ...p, side: 'driver', pins: t.pins, variant: t.variant || '' })),
  ]
  const singles = WAGO_TEMPLATES.map(t => ({ key: t.key, name: t.name, note: t.note || '', of: [t.key], parts: expand(t) }))
  const combos = WAGO_COMBOS.filter(c => c.of.every(k => byKey.has(k)))
    .map(c => ({ key: c.key, name: c.name, note: c.note || '', of: c.of, parts: c.of.flatMap(k => expand(byKey.get(k))) }))
  return [...combos, ...singles]
}

export const globalConnector = key => globalConnectors().find(g => g.key === key) || null

/** The recipe section a part sits in. */
export const sectionOf = part => (part.side === 'driver' ? INTERNAL : POSITION)

/**
 * The ElementType ref a new part gets: ET-<pins>PIN[-<variant>]-<SOCKET|PLUG>[-SR]. A strain
 * relief is named for its side, so the site and driver reliefs of one set never share a ref.
 */
export function suggestRef(part) {
  const end = part.side === 'driver' ? 'PLUG' : 'SOCKET'
  return ['ET', `${part.pins}PIN`, part.variant, end, part.role === 'sr' ? 'SR' : null].filter(Boolean).join('-')
}

/** A part's ElementType name: "Wago 770-105 5-pin socket". */
export const partName = part => `Wago ${part.code} ${part.label}`

/** The current code a superseded one became, or null. */
export const supersededBy = code => WAGO_SUPERSEDED[norm(code)] || WAGO_SUPERSEDED[String(code ?? '').trim()] || null

/** Is this code one the library knows (current or superseded)? */
export function isWagoCode(code) {
  const c = norm(code)
  if (!c) return false
  if (Object.keys(WAGO_SUPERSEDED).some(k => norm(k) === c)) return true
  return WAGO_TEMPLATES.some(t => [...t.site, ...t.driver].some(p => norm(p.code) === c))
}

/**
 * Which library entry a set of part codes is, if any — superseded codes read as their
 * replacements. codes: [{ code, section }]. → the entry or null.
 */
export function recogniseCodes(codes) {
  const key = list => list.map(x => `${x.section}|${norm(x.code)}`).sort().join(';')
  const have = key(codes.map(c => ({ section: c.section, code: supersededBy(c.code) || c.code })))
  if (!have) return null
  return globalConnectors().find(g => key(g.parts.map(p => ({ section: sectionOf(p), code: p.code }))) === have) || null
}

/**
 * suggestConnectors(rec) → [{ key, name, why, rule }], best first. rec is a position's
 * record (templateRules.templateRecords): its DesignDB columns.
 */
export function suggestConnectors(rec) {
  if (!rec) return []
  const out = []
  for (const s of SUGGESTIONS) {
    if (!ruleMatchesRecord(s.rule, rec)) continue
    for (const key of s.keys) {
      const g = globalConnector(key)
      if (g && !out.some(o => o.key === key)) out.push({ key, name: g.name, why: s.why, rule: s.rule })
    }
  }
  return out
}

const cond = (column, op, value = '') => ({ column, op, value })
const DALI = cond('ControlTypeRef', 'contains', 'DALI')
const REMOTE = cond('DriverLocation', 'contains', 'remote')
const NOT_REMOTE = cond('DriverLocation', 'notContains', 'remote')
const HAS_DRIVER_LOCATION = cond('DriverLocation', 'isNotEmpty')

/** From precedent; the first rule that matches decides, in this order. */
export const SUGGESTIONS = [
  { why: 'DALI · local driver', keys: ['dali-2+3', '5pin-dali-perm'], rule: { match: 'all', conditions: [DALI, HAS_DRIVER_LOCATION, NOT_REMOTE] } },
  { why: 'DALI · remote driver', keys: ['2pin-dali'], rule: { match: 'all', conditions: [DALI, REMOTE] } },
  { why: 'switched / phase · local driver', keys: ['3pin-len'],
    rule: { match: 'all', conditions: [cond('ControlTypeRef', 'isNotEmpty'), cond('ControlTypeRef', 'notContains', 'DALI'), cond('ControlTypeRef', 'notContains', 'DMX'), HAS_DRIVER_LOCATION, NOT_REMOTE] } },
]

// <<< WAGO-TEMPLATES (generated from Kaizen page 101097 — do not hand-edit) >>>
export const WAGO_PAGE = { pageId: 101097, title: 'Lighting Manufacturing - Wago plugs', syncedAt: '2026-10-03' }
export const WAGO_TEMPLATES = [
  { key: '5pin-dali-perm', name: 'Wago 5-pin DALI + perm', pins: 5, note: 'Needs 57mm minimum cut-out, else use 3-pin + 2-pin',
    site: [{ code: '770-105', role: 'socket', label: '5-pin socket' }],
    driver: [{ code: '770-215', role: 'plug', label: '5-pin plug' }, { code: '770-505/023-000', role: 'sr', label: '5-pin plug strain relief' }] },
  { key: '4pin-switched-perm', name: 'Wago 4-pin switched + perm', pins: 4, note: 'Switched live plus permanent feed',
    site: [{ code: '770-244', role: 'socket', label: '4-pin socket' }, { code: '770-504', role: 'sr', label: '4-pin socket strain relief' }],
    driver: [{ code: '770-254', role: 'plug', label: '4-pin plug' }, { code: '770-504/023-000', role: 'sr', label: '4-pin plug strain relief' }] },
  { key: '3pin-len', name: 'Wago 3-pin LEN', pins: 3, note: 'Live, earth, neutral',
    site: [{ code: '770-203', role: 'socket', label: '3-pin socket' }, { code: '770-503', role: 'sr', label: '3-pin socket strain relief' }],
    driver: [{ code: '770-213', role: 'plug', label: '3-pin plug' }, { code: '770-503/023-000', role: 'sr', label: '3-pin plug strain relief' }] },
  { key: '2pin-dali', name: 'Wago 2-pin DALI', pins: 2, variant: 'DALI', note: 'Blue, coding I: will not mate with mains connectors',
    site: [{ code: '770-1102', role: 'socket', label: '2-pin DALI socket' }, { code: '770-502/041-000', role: 'sr', label: '2-pin DALI socket strain relief' }],
    driver: [{ code: '770-1112', role: 'plug', label: '2-pin DALI plug' }, { code: '770-502/042-000', role: 'sr', label: '2-pin DALI plug strain relief' }] },
]
export const WAGO_COMBOS = [
  { key: 'dali-2+3', name: 'Wago 2-pin DALI + 3-pin LEN', of: ['2pin-dali', '3pin-len'], note: 'For 2 + 3 core cable' },
]
export const WAGO_SUPERSEDED = {
  '770-243': '770-203', '770-253': '770-213',
  '770-242': '770-1102', '770-252': '770-1112',
}
// <<< /WAGO-TEMPLATES >>>
