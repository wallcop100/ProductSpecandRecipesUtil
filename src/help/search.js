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
    // An ET-… the workspace does not have binds nothing (no "Rename ET-NOPE"); with no workspace at
    // all (psr help) the shape is enough.
    if (!out.et && !ets.size && /^et-[a-z0-9-]+$/i.test(t)) { out.et = t.toUpperCase(); continue }
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

  // The workspace's own things: refs, product codes, makers, names, families, the Form's codes.
  const needle = norm(refs.rest.join(' ') || q).trim()
  const things = findThings(refs.et || refs.pos ? norm(refs.et || refs.pos) : needle, state)
  // A query that looks like a ref or a code (one word, a digit or a hyphen) is after a thing first.
  const refLike = !/\s/.test(q.trim()) && /[\d-]/.test(q)
  for (const t of things) results.push({ ...t, score: t.score * (refLike ? 1.6 : 0.8) })

  results.sort((x, y) => y.score - x.score)
  // Neither kind crowds the other out: up to 10 things, and room for the best actions.
  const acts = results.filter(r => r.kind === 'action').slice(0, Math.max(5, limit - 10))
  const found = results.filter(r => r.kind !== 'action').slice(0, refLike ? 12 : 8)
  return [...acts, ...found].sort((x, y) => y.score - x.score).slice(0, limit + 4)
}

/** How well a field holds the needle: the whole of it 10, its start 7, inside it 4. */
const fit = (field, needle) => {
  const f = norm(field).trim()
  if (!f || !needle) return 0
  if (f === needle) return 10
  if (f.startsWith(needle)) return 7
  if (f.includes(needle)) return 4
  // A code typed without its punctuation still finds it: 770503 → 770-503.
  const bare = x => x.replace(/[^a-z0-9]/g, '')
  if (needle.length >= 4 && bare(f).includes(bare(needle))) return 3
  // Several words, each somewhere in it: "dali plug" → ET-2Pin-DALI-Plug.
  const words = needle.split(/\s+/).filter(w => w.length >= 2)
  return words.length > 1 && words.every(w => f.includes(w)) ? 6 : 0
}

/**
 * The workspace's things matching a needle (case-blind, by whole / start / inside):
 *   ElementTypes by ref, product code, maker, name, description · positions by ref, ExtRef,
 *   description · families · the Form's codes (each opens the position that has it) · templates.
 */
export function findThings(needle, state = {}) {
  if (!needle || needle.length < 2) return []
  const out = []
  const psBy = new Map((state.psRows || []).filter(r => norm(r.IsDeleted) !== 'y').map(r => [norm(r.ElementTypeRef), r]))
  const families = new Map()
  for (const e of state.elementTypes || []) {
    const ps = psBy.get(norm(e.ElementTypeRef)) || {}
    const f = U(e.Family)
    if (f) families.set(f, (families.get(f) || 0) + 1)
    const best = Math.max(fit(e.ElementTypeRef, needle), fit(ps.ProductCode, needle) * 0.95,
      fit(e.Name, needle) * 0.5, fit(ps.ComponentDescription, needle) * 0.45, fit(e.Description, needle) * 0.4, fit(ps.Manufacturer, needle) * 0.35)
    if (!best) continue
    const code = [ps.Manufacturer, ps.ProductCode].filter(Boolean).join(' ')
    out.push({ kind: 'et', ref: e.ElementTypeRef, title: e.ElementTypeRef,
      sub: [code, e.Name && e.Name !== code ? e.Name : '', e.Family ? `in ${e.Family}` : ''].filter(Boolean).join(' · '), score: best / 2 })
  }
  for (const p of state.positionTypes || []) {
    const best = Math.max(fit(p.PositionTypeRef, needle), fit(p.ExtRef, needle) * 0.9, fit(p.Description, needle) * 0.45, fit(p.Name, needle) * 0.45)
    if (!best) continue
    out.push({ kind: 'position', ref: p.PositionTypeRef, title: p.PositionTypeRef,
      sub: [p.Description || p.Name, p.ExtRef && p.ExtRef !== p.PositionTypeRef ? `Form ref ${p.ExtRef}` : ''].filter(Boolean).join(' · '), score: best / 2 })
  }
  for (const [f, n] of families) {
    const best = fit(f, needle)
    if (best) out.push({ kind: 'family', ref: f, title: f, sub: `family · ${n} ElementType${n === 1 ? '' : 's'}`, score: best / 2.2 })
  }
  // The Form's codes: what a position asked for, even before it has an ElementType.
  const seen = new Set()
  for (const [pos, caps] of Object.entries(state.formCaptures?.byPosition || {})) {
    for (const c of caps || []) {
      const best = fit(c.code, needle)
      if (!best || seen.has(`${pos}|${c.code}`)) continue
      seen.add(`${pos}|${c.code}`)
      out.push({ kind: 'formcode', ref: pos, title: `${c.code}`, sub: `on the Form for ${pos}${c.elementTypeRef ? ` · ${c.elementTypeRef}` : ' · no ElementType yet'}`, score: best / 2.3 })
    }
  }
  for (const t of state.templates || []) {
    const best = fit(t.name, needle)
    if (best) out.push({ kind: 'template', ref: t.id, title: t.name, sub: 'template', score: best / 2.5 })
  }
  return out.sort((a, b) => b.score - a.score)
}

const U = s => String(s ?? '').trim().toUpperCase()
