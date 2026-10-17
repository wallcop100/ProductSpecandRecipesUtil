/**
 * search.js — Find's matching. Pure: the app's palette and `psr help <query>` both use it.
 *
 *   find(query, { actions, state, screen, limit }) → [result]
 *     result: { kind: 'action', action, ref, pos, title, score }
 *           | { kind: 'et' | 'position' | 'template', ref, title, sub, score }
 *
 * The query is read for refs first: an ElementType or position ref named in it binds the actions
 * that take one ("rename ET-PS-MINI-TINI" → Rename ET-PS-MINI-TINI), and the rest of the words
 * pick the action. Words match an action's title and its `words` (whole, by prefix, or one typo
 * off); a few synonyms widen them (amend → rename). Without a ref, the current position stands in.
 */

const STOP = new Set(['a', 'an', 'the', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'is', 'it', 'i', 'my', 'me', 'do',
  'does', 'how', 'can', 'what', 'where', 'which', 'this', 'that', 'with', 'want', 'just', 'please', 'there', 'way',
  'rather', 'than', 'one', 'some', 'be', 'get', 'onto', 'into', 'from', 'at', 'by', 'are', 'was', 'had', 'have', 'so', 'as', 'if'])

// What people type → words the actions use.
const SYNONYMS = {
  amend: ['rename', 'change', 'edit'], modify: ['change', 'edit'], alter: ['change', 'edit'], fix: ['correct', 'fix'],
  rename: ['rename', 'ref'], renumber: ['rename'], retitle: ['rename'], number: ['rename', 'renumber'],
  et: ['elementtype'], ets: ['elementtypes'], element: ['elementtype'], elementtype: ['elementtype'], component: ['part', 'elementtype'],
  part: ['part', 'elementtype'], product: ['product', 'code'], sku: ['code'], pn: ['code'],
  ref: ['ref', 'reference'], reference: ['ref'], name: ['name', 'rename'],
  remove: ['remove', 'delete'], delete: ['delete', 'remove'], bin: ['delete'], erase: ['delete'],
  copy: ['copy', 'duplicate', 'fork'], duplicate: ['duplicate', 'fork', 'copy'], clone: ['fork', 'copy'],
  replace: ['swap', 'replace'], swap: ['swap'], substitute: ['swap'], change: ['change', 'swap', 'edit'],
  save: ['save', 'export'], push: ['export'], upload: ['export'], publish: ['export'], excel: ['export', 'workbook', 'form'],
  reload: ['check', 'sync'], refresh: ['check', 'sync'], sync: ['check', 'sync'],
  position: ['position'], pos: ['position'], fitting: ['position', 'part'], recipe: ['recipe'],
  family: ['family'], families: ['family'], parent: ['family', 'parentref'],
  tbc: ['tbc'], unknown: ['tbc'], spec: ['spec', 'product'], help: ['how', 'help'],
}

const norm = s => String(s ?? '').toLowerCase()
const tokens = s => norm(s).split(/[^a-z0-9+/×#.-]+/).map(t => t.replace(/^[-.]+|[-.]+$/g, '')).filter(t => t && !STOP.has(t))

function lev1(a, b) {                // within one edit, or two neighbouring letters swapped?
  if (a.length === b.length) {
    const d = [...a].map((ch, i) => (ch === b[i] ? -1 : i)).filter(i => i >= 0)
    if (d.length === 2 && d[1] === d[0] + 1 && a[d[0]] === b[d[1]] && a[d[1]] === b[d[0]]) return true
  }
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0, j = 0, edits = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue }
    if (++edits > 1) return false
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++ }
  }
  return edits + (a.length - i) + (b.length - j) <= 1
}

/** How well one query word matches a bag of words: whole 3, prefix 2, one typo 1. */
function wordScore(t, bag) {
  let best = 0
  for (const w of bag) {
    if (w === t) return 3
    if (w.startsWith(t) && t.length >= 2) best = Math.max(best, 2)
    else if (t.length >= 5 && lev1(t, w)) best = Math.max(best, 1)
  }
  return best
}

/** The refs a query names: ElementTypes and positions this project has (or an ET-… it does not). */
export function refsIn(query, state = {}) {
  const ets = new Map((state.elementTypes || []).map(e => [norm(e.ElementTypeRef), e.ElementTypeRef]))
  const pts = new Map((state.positionTypes || []).map(p => [norm(p.PositionTypeRef), p.PositionTypeRef]))
  const out = { et: null, pos: null, rest: [] }
  for (const raw of String(query || '').split(/\s+/).filter(Boolean)) {
    const t = raw.replace(/[,.;:?!'"()]+$/g, '').replace(/^['"(]+/, '')
    const k = norm(t)
    if (!out.et && ets.has(k)) { out.et = ets.get(k); continue }
    if (!out.pos && pts.has(k)) { out.pos = pts.get(k); continue }
    if (!out.et && /^et-[a-z0-9-]+$/i.test(t)) { out.et = t.toUpperCase(); continue }
    out.rest.push(t)
  }
  return out
}

function scoreAction(a, qTokens, phrase, bound, state) {
  const title = norm(a.title(bound.ref, state))
  const titleBag = tokens(title)
  const wordBag = [...new Set(a.words.flatMap(w => tokens(w)))]
  let score = 0, hits = 0
  for (const t of qTokens) {
    const alts = [t, ...(SYNONYMS[t] || [])]
    let best = 0
    for (const x of alts) {
      const inTitle = wordScore(x, titleBag)
      best = Math.max(best, Math.max(wordScore(x, wordBag), inTitle ? inTitle + 0.5 : 0) * (x === t ? 1 : 0.8))
    }
    if (best > 0) hits++
    score += best
  }
  if (phrase.length >= 4) {
    if (a.words.some(w => norm(w).includes(phrase))) score += 4
    else if (title.includes(phrase)) score += 3
  }
  if (qTokens.length && !hits) return 0
  // Most of the words should land somewhere: a query that half-matches ranks below one that fully does.
  if (qTokens.length > 1) score *= 0.5 + 0.5 * (hits / qTokens.length)
  if (a.tutorial) score *= 0.6
  return score
}

export function find(query, { actions = [], state = {}, screen = '', limit = 14 } = {}) {
  const q = String(query || '').trim()
  if (!q) return []
  const refs = refsIn(q, state)
  const qTokens = tokens(refs.rest.join(' '))
  const phrase = norm(refs.rest.join(' ')).trim()
  const results = []

  for (const a of actions) {
    if (a.when && !a.when(state)) continue
    const bound = {
      ref: a.needs === 'et' ? refs.et : null,
      pos: a.needs === 'position' ? (refs.pos || (qTokens.length ? state.activePositionRef || null : null)) : null,
    }
    let score = qTokens.length ? scoreAction(a, qTokens, phrase, bound, state) : 0
    // A ref and nothing else: every action that takes that kind of ref, a little apart.
    if (!qTokens.length) {
      if ((a.needs === 'et' && refs.et) || (a.needs === 'position' && refs.pos)) score = 1 + (a.id.endsWith('.open') || a.id === 'et.usedin' ? 1 : 0)
      else continue
    }
    if (score <= 0) continue
    if (a.needs === 'et' && refs.et) score += 2
    if (a.needs === 'position' && refs.pos) score += 2
    if (a.needs === 'et' && !refs.et && refs.pos) score -= 1
    if (a.screen && a.screen === screen) score += 0.5
    results.push({ kind: 'action', action: a, ref: bound.ref, pos: bound.pos, title: a.title(bound.ref || bound.pos, state), score })
  }

  // The project's own things, by ref, name, maker or code.
  const needle = norm(refs.rest.join(' ') || q)
  if (needle.length >= 2) {
    const psBy = new Map((state.psRows || []).map(r => [norm(r.ElementTypeRef), r]))
    for (const e of state.elementTypes || []) {
      const ps = psBy.get(norm(e.ElementTypeRef)) || {}
      const hay = [e.ElementTypeRef, e.Name, e.Description, ps.Manufacturer, ps.ProductCode].map(norm)
      const at = hay.findIndex(h => h.includes(needle))
      if (at < 0) continue
      results.push({ kind: 'et', ref: e.ElementTypeRef, title: e.ElementTypeRef,
        sub: [e.Name, [ps.Manufacturer, ps.ProductCode].filter(Boolean).join(' ')].filter(Boolean).join(' · '),
        score: (at === 0 ? (hay[0] === needle ? 6 : 3) : 2) - 0.01 * results.length })
    }
    for (const p of state.positionTypes || []) {
      const hay = [p.PositionTypeRef, p.Description, p.Name].map(norm)
      const at = hay.findIndex(h => h.includes(needle))
      if (at < 0) continue
      results.push({ kind: 'position', ref: p.PositionTypeRef, title: p.PositionTypeRef, sub: p.Description || p.Name || '',
        score: (at === 0 ? (hay[0] === needle ? 6 : 3) : 1.5) - 0.01 * results.length })
    }
    for (const t of state.templates || []) {
      if (!norm(t.name).includes(needle)) continue
      results.push({ kind: 'template', ref: t.id, title: t.name, sub: 'template', score: 1.5 })
    }
  }
  // A named ref is itself a result, at the top.
  if (refs.et && !results.some(r => r.kind === 'et' && norm(r.ref) === norm(refs.et)) && (state.elementTypes || []).some(e => norm(e.ElementTypeRef) === norm(refs.et))) {
    results.push({ kind: 'et', ref: refs.et, title: refs.et, sub: '', score: 2 })
  }

  results.sort((x, y) => y.score - x.score)
  // Entities after the best actions, but never crowding them out.
  const acts = results.filter(r => r.kind === 'action').slice(0, Math.max(6, limit - 6))
  const things = results.filter(r => r.kind !== 'action').slice(0, 6)
  return [...acts, ...things].sort((x, y) => y.score - x.score).slice(0, limit)
}
