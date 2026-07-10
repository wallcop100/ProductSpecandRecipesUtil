/**
 * productCodes.js — the "magic wand" mechanism for turning freehand ProductCode
 * fields into distinct product codes.
 *
 * CRITICAL: every project writes this column in a different dialect. There is no
 * consistent syntax. Rules about "+", parentheses, "old code", labels, or code
 * shape are one sheet's accident — this module encodes NONE of them.
 *
 * Two principles hold the design up:
 *
 *   1. Nothing is silently used, nothing is silently lost.
 *      'code' and 'discard' are explicit acts. Any token you have not classified
 *      defaults to 'note' — the safe sink. Ignoring a token can never drop data
 *      nor invent a code.
 *
 *   2. Separators need no meaning.
 *      A code is a run of ADJACENT tokens marked 'code'. "V6815"+"000" adjacent
 *      → one code. "NF240272009" and "021-7309-02" apart → two codes. "+", "(",
 *      ")" never have to mean anything; they are tokens you discard once.
 *
 * Roles come from the user's own decisions, replayed across the batch — see
 * codeLearning.js. This module is pure: it takes resolved roles and derives.
 */

/**
 * Split on whitespace, then peel LEADING/TRAILING punctuation into single-char
 * tokens. Purely mechanical — it ascribes no meaning to any character.
 *
 *   "(FPSN0809BG2000)"  -> "("  "FPSN0809BG2000"  ")"
 *   "021-1102))"        -> "021-1102"  ")"  ")"
 *   "021-7309-02"       -> "021-7309-02"      (hyphens are internal, kept whole)
 *   "name:"             -> "name"  ":"
 *   "+"                 -> "+"
 */
export function tokenize(rawText) {
  const text = rawText == null ? '' : String(rawText)
  const tokens = []
  const isAlnum = ch => /[A-Za-z0-9]/.test(ch)

  for (const m of text.matchAll(/\S+/g)) {
    const chunk = m[0]
    const base = m.index
    let lo = 0
    let hi = chunk.length - 1
    while (lo < chunk.length && !isAlnum(chunk[lo])) lo++
    while (hi >= 0 && !isAlnum(chunk[hi])) hi--

    if (lo > hi) {
      // no alphanumerics at all: every character is its own token ("+", "))")
      for (let i = 0; i < chunk.length; i++) {
        tokens.push({ text: chunk[i], start: base + i, end: base + i + 1 })
      }
      continue
    }
    for (let i = 0; i < lo; i++) tokens.push({ text: chunk[i], start: base + i, end: base + i + 1 })
    tokens.push({ text: chunk.slice(lo, hi + 1), start: base + lo, end: base + hi + 1 })
    for (let i = hi + 1; i < chunk.length; i++) tokens.push({ text: chunk[i], start: base + i, end: base + i + 1 })
  }
  return tokens
}

/**
 * A review row.
 *   roles        resolved from the learned rules + per-row overrides; all 'note'
 *                until something is classified (principle 1). See codeLearning.js.
 *   overrides    tokenIdx -> role, wins over a batch-wide rule ("only here")
 *   noteOverride code text -> free-text note, replacing the derived one entirely
 */
export function makeRow(id, rawText, extra = {}) {
  const tokens = tokenize(rawText)
  return {
    id,
    rawText: rawText == null ? '' : String(rawText),
    positionType: extra.positionType || '',
    manufacturer: extra.manufacturer || '',
    context: extra.context || {},
    tokens,
    roles: tokens.map(() => 'note'),
    overrides: {},
    noteOverride: {},
    confirmed: false,
  }
}

/**
 * Replace a code's note with free text. Only `null` restores the derived note —
 * an empty string is a deliberate "this code has no note".
 */
export function setNoteOverride(row, code, text) {
  const next = { ...row.noteOverride }
  if (text == null) delete next[code]
  else next[code] = text
  return { ...row, noteOverride: next }
}

/** Maximal runs of adjacent 'code' tokens: [[startIdx, endIdx], ...]. */
export function codeRuns(row) {
  const runs = []
  let start = -1
  for (let i = 0; i < row.tokens.length; i++) {
    const isCode = row.roles[i] === 'code'
    if (isCode && start < 0) start = i
    if (!isCode && start >= 0) { runs.push([start, i - 1]); start = -1 }
  }
  if (start >= 0) runs.push([start, row.tokens.length - 1])
  return runs
}

/**
 * Segment index per token, split on the LEARNED delimiters (see
 * codeLearning.learnedDelimiters). With no delimiters learned, the whole field is
 * one segment. Delimiter tokens themselves belong to the segment they close.
 */
export function segmentsOf(row, delimiters = new Set()) {
  let seg = 0
  return row.tokens.map((t, i) => {
    const isDelim = row.roles?.[i] === 'discard' && delimiters.has(String(t.text).toLowerCase())
    const here = seg
    if (isDelim) seg++
    return here
  })
}

/** Reading-order pick: the code this note reads with, in the given direction. */
function directionalPick(runs, candidates, tokenIdx, direction) {
  if (candidates.length === 0) return -1
  if (candidates.length === 1) return candidates[0]
  const after = candidates.filter(ri => runs[ri][0] > tokenIdx)
  const before = candidates.filter(ri => runs[ri][1] < tokenIdx)
  const inside = candidates.find(ri => runs[ri][0] <= tokenIdx && tokenIdx <= runs[ri][1])
  if (inside != null) return inside

  if (direction === 'backward') {
    // a note reads after its code: "021-7309-02 (FPSN…)"
    return before.length ? before[before.length - 1] : after[0]
  }
  // 'forward' — a note reads before its code: "Profile 021-7309-02"
  return after.length ? after[0] : before[before.length - 1]
}

/**
 * Which code run a note token belongs to.
 *
 * Within a delimiter-segment there is normally exactly one code, so the note simply
 * belongs to it — that is what makes "(new name … FPSN0809BG2000)" attach to the
 * profile code it sits beside rather than drifting to whichever code is nearest.
 * Otherwise fall back to reading order: notes read toward their code, in the
 * direction the user has been correcting them.
 *
 * Returns -1 when the row has no codes at all.
 */
export function noteOwnerOf(row, tokenIdx, runs = codeRuns(row), opts = {}) {
  if (runs.length === 0) return -1
  const { delimiters = new Set(), direction = 'forward' } = opts

  if (delimiters.size > 0) {
    const segs = segmentsOf(row, delimiters)
    const sameSeg = runs.map((_, ri) => ri).filter(ri => segs[runs[ri][0]] === segs[tokenIdx])
    if (sameSeg.length > 0) return directionalPick(runs, sameSeg, tokenIdx, direction)
  }
  return directionalPick(runs, runs.map((_, ri) => ri), tokenIdx, direction)
}

/**
 * What this field yields. The read-out the user sees is exactly this:
 *   { captures: [{ code, note, range }], discarded: [text], unattachedNote }
 * A row with no 'code' tokens yields zero captures and loses no text — its notes
 * surface as `unattachedNote`.
 */
export function deriveCaptures(row, opts = {}) {
  const runs = codeRuns(row)
  const captures = runs.map(([a, b]) => ({
    code: row.rawText.slice(row.tokens[a].start, row.tokens[b].end).trim(),
    note: '',
    range: [a, b],
    noteTokens: [],
  }))
  const discarded = []
  const unattached = []

  for (let i = 0; i < row.tokens.length; i++) {
    const role = row.roles[i]
    if (role === 'code') continue
    if (role === 'discard') { discarded.push(row.tokens[i].text); continue }
    const owner = noteOwnerOf(row, i, runs, opts)
    if (owner < 0) unattached.push(row.tokens[i].text)
    else captures[owner].noteTokens.push(i)
  }

  for (const c of captures) {
    c.note = c.noteTokens.map(i => row.tokens[i].text).join(' ').trim()
    const edited = row.noteOverride && row.noteOverride[c.code]
    if (edited != null) { c.note = edited; c.noteEdited = true }
  }
  return { captures, discarded, unattachedNote: unattached.join(' ').trim() }
}

/** Convenience: just the code strings this row yields. */
export function deriveCodes(row, opts = {}) {
  return deriveCaptures(row, opts).captures.map(c => c.code)
}

/** Flip a note token to 'code' — the "promote into code" action. Returns a new row. */
export function promoteNoteToCode(row, tokenIdx) {
  const roles = [...row.roles]
  roles[tokenIdx] = 'code'
  return { ...row, roles }
}

export const norm = c => String(c || '').trim().toUpperCase()

// ---------------------------------------------------------------------------
// Product identity
//
// A product is (MANUFACTURER, PRODUCT CODE) — never the code alone. Codes are only
// unique inside a maker's catalogue: this project's Product Spec has "PLASTER IN
// KIT" from both Orluna and Phos, which are two different things to buy. Treating
// the code as the identity reports that as a duplicate, which it is not.
// ---------------------------------------------------------------------------

/** The identity of a product. Blank manufacturer is a value, not a wildcard. */
export const productKey = (manufacturer, code) => `${norm(manufacturer)} ${norm(code)}`

/**
 * Does this code identify a product at all?
 *
 * Two placeholders do not, and a blank does not.
 *
 *   "N/A" — there is nothing to buy: a virtual wrapper, a container, an Ideaworks
 *           assembly. EVERY such row carries it, so matching on it says nothing.
 *           This project has four, and all four are drivers. Treating it as a code
 *           let a pendant wrapper silently adopt a driver's ElementType, because
 *           both were `Ideaworks / N/A`.
 *
 *   "TBC"  — not decided yet. The app already says so elsewhere (the IsTBC flag,
 *           and a TBC row reads "partial" in the spec browser). As a code it once
 *           matched the literal word "TBC" wherever it appeared in a Form field.
 *
 * Only the WHOLE code is a placeholder: "TBC-1000" is a real product code.
 */
const PLACEHOLDER_CODES = new Set(['N/A', 'TBC'])

export const hasProductIdentity = code => {
  const n = norm(code)
  return n !== '' && !PLACEHOLDER_CODES.has(n)
}

const notAProduct = code => !hasProductIdentity(code)

const mfrOf = r => r.Manufacturer || r.manufacturer || ''
const codeOf = r => r.ProductCode || r.productCode || ''
const etOfRow = r => r.ElementTypeRef || r.elementTypeRef || ''

/**
 * The product identities that appear on more than one live spec row — a genuine
 * duplicate, i.e. the SAME maker's SAME code entered twice.
 */
export function duplicateProductKeys(psRows) {
  const counts = new Map()
  for (const r of psRows || []) {
    if ((r.IsDeleted || r.isDeleted) === 'Y') continue
    if (notAProduct(codeOf(r))) continue
    const k = productKey(mfrOf(r), codeOf(r))
    counts.set(k, (counts.get(k) || 0) + 1)
  }
  return new Set([...counts].filter(([, n]) => n > 1).map(([k]) => k))
}

/**
 * findProductET(psRows, manufacturer, code) → the ElementType already specified for
 * this product, or null.
 *
 * The shopping-list lookup: you have a maker and a code, and the spec may already
 * name the thing you want. Exact identity wins. Failing that, a code matching
 * exactly one row is unambiguous enough to offer — but a code shared by two makers
 * is not, and returns null rather than guessing.
 */
export function findProductET(psRows, manufacturer, code) {
  if (notAProduct(code)) return null
  const live = (psRows || []).filter(r => (r.IsDeleted || r.isDeleted) !== 'Y' && etOfRow(r))
  const key = productKey(manufacturer, code)

  const exact = live.find(r => productKey(mfrOf(r), codeOf(r)) === key)
  if (exact) return etOfRow(exact)

  const sameCode = live.filter(r => norm(codeOf(r)) === norm(code))
  return sameCode.length === 1 ? etOfRow(sameCode[0]) : null
}

// ---------------------------------------------------------------------------
// Batch-level derivation — the distinct list and the holistic comparison
// ---------------------------------------------------------------------------

/**
 * Master index from the Product Spec: a product both flags green AND names its ET.
 *
 * Rows with no product identity ("N/A", blank) are excluded. They are not products,
 * and indexing them made every captured "N/A" match the first wrapper in the sheet.
 */
export function buildMaster(psRows) {
  const out = []
  for (const r of psRows || []) {
    const code = codeOf(r).trim()
    const ref = etOfRow(r)
    if (ref && hasProductIdentity(code)) out.push({ code, ref, manufacturer: mfrOf(r).trim() })
  }
  return out
}

/** One capture per (row, code run), carrying its note and the row's context. */
export function buildCaptures(rows, opts = {}) {
  const out = []
  for (const row of rows) {
    for (const c of deriveCaptures(row, opts).captures) {
      if (!c.code) continue
      out.push({
        code: c.code, note: c.note, rowId: row.id,
        positionType: row.positionType, manufacturer: row.manufacturer,
      })
    }
  }
  return out
}

/**
 * Canonical distinct entries, keyed on the code string. Rows hold references;
 * nothing is stored twice. `variants` splits by note — the same code captured
 * with two different notes is the collision that may demand a new ref.
 */
export function buildDistinct(rows, opts = {}) {
  const map = new Map()
  for (const cap of buildCaptures(rows, opts)) {
    const key = norm(cap.code)
    if (!map.has(key)) {
      map.set(key, { text: cap.code, rowRefs: [], manufacturers: [], positionTypes: [], variants: [] })
    }
    const e = map.get(key)
    if (!e.rowRefs.includes(cap.rowId)) e.rowRefs.push(cap.rowId)
    if (cap.manufacturer && !e.manufacturers.includes(cap.manufacturer)) e.manufacturers.push(cap.manufacturer)
    if (cap.positionType && !e.positionTypes.includes(cap.positionType)) e.positionTypes.push(cap.positionType)

    let v = e.variants.find(v => v.note === cap.note)
    if (!v) { v = { note: cap.note, rowRefs: [], positionTypes: [] }; e.variants.push(v) }
    if (!v.rowRefs.includes(cap.rowId)) v.rowRefs.push(cap.rowId)
    if (cap.positionType && !v.positionTypes.includes(cap.positionType)) v.positionTypes.push(cap.positionType)
  }
  return [...map.values()]
}

/**
 * The same code captured with differing notes. Only knowable holistically — a
 * little note may distinguish it in a way that demands its own ref.
 */
export function hasNoteCollision(entry) {
  return entry.variants.length > 1
}

/** Normalised codes appearing in more than one row of the batch. */
export function duplicateSet(rows) {
  return new Set(buildDistinct(rows).filter(e => e.rowRefs.length > 1).map(e => norm(e.text)))
}

/**
 * classify(code, { master, duplicates }) -> { status, elementTypeRef, base, duplicate }
 *   green  exact match in the Product Spec — carries that row's ElementTypeRef
 *   amber  a master code is a prefix of this one (or vice versa) — the suffix may
 *          make it a genuinely different code. `base` is the matched master code.
 *   blue   novel, but appears in more than one row of THIS batch
 *   grey   novel
 */
export function classify(code, { master = [], duplicates = new Set() } = {}, manufacturer = '') {
  const n = norm(code)
  const m = norm(manufacturer)
  const duplicate = duplicates.has(n)

  // "N/A" and blanks name no product, so they can match no product. Without this a
  // captured "N/A" went green against whichever wrapper happened to sort first.
  if (!hasProductIdentity(code)) {
    return { status: duplicate ? 'blue' : 'grey', elementTypeRef: null, base: null, duplicate }
  }

  // A product is (maker, code). A blank maker on either side cannot distinguish
  // anything, so it matches — but two NAMED makers sharing a code are two products.
  const sameMaker = other => !norm(other) || !m || norm(other) === m

  const exact = master.find(x => norm(x.code) === n && sameMaker(x.manufacturer))
  if (exact) {
    return { status: 'green', elementTypeRef: exact.ref, base: exact.code, manufacturer: exact.manufacturer, duplicate }
  }

  // Same code, a different maker: NOT this product. Say so rather than matching it.
  const otherMaker = master.find(x => norm(x.code) === n)
  if (otherMaker) {
    return {
      status: duplicate ? 'blue' : 'grey', elementTypeRef: null, base: null, duplicate,
      otherMaker: { ref: otherMaker.ref, manufacturer: otherMaker.manufacturer },
    }
  }

  let best = null
  for (const x of master) {
    const mn = norm(x.code)
    if (mn === n) continue
    if (!sameMaker(x.manufacturer)) continue
    if (n.startsWith(mn) || mn.startsWith(n)) {
      if (!best || mn.length > norm(best.code).length) best = x
    }
  }
  if (best) return { status: 'amber', elementTypeRef: null, base: best.code, masterRef: best.ref, duplicate }

  return { status: duplicate ? 'blue' : 'grey', elementTypeRef: null, base: null, duplicate }
}

/**
 * Group distinct entries whose codes stand in a prefix relation, so near-identical
 * codes sit side by side (ZH-INFD-...-54 / ...-54H / ...-54-EM). This is where
 * "it depends" gets adjudicated.
 */
export function clusterSimilar(entries) {
  const parent = entries.map((_, i) => i)
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])))
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb }

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = norm(entries[i].text)
      const b = norm(entries[j].text)
      if (a.startsWith(b) || b.startsWith(a)) union(i, j)
    }
  }
  const groups = new Map()
  entries.forEach((e, i) => {
    const r = find(i)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r).push(e)
  })
  return [...groups.values()].map(g => g.sort((x, y) => x.text.localeCompare(y.text)))
}

/** Stable identity for a similar-group, so "keep separate" can be remembered. */
export const groupKey = entries => entries.map(e => norm(e.text)).sort().join('|')

/**
 * What is blocking the batch, split into the two questions the user actually faces.
 *
 *   collisions — one code, several notes. Same product, or not?
 *   similar    — near-miss codes. One ElementType, or several?
 *
 * A similar-group stops being a question once the user dismisses it ("keep
 * separate") or once every code in it already resolves to the SAME ElementType —
 * there is nothing left to consolidate. A group whose codes sit on different ETs
 * is likewise settled: the user has already said they differ.
 */
export function pendingResolutions(entries, dismissed = new Set()) {
  const collisions = entries.filter(hasNoteCollision)

  const similar = clusterSimilar(entries)
    .filter(g => g.length > 1)
    .filter(g => !dismissed.has(groupKey(g)))
    .filter(g => !g.some(hasNoteCollision))          // resolve the collision first
    .filter(g => {
      const refs = g.map(e => e.etRef)
      if (refs.every(Boolean)) return false          // all assigned: the user has decided
      return true
    })

  return { collisions, similar }
}

/**
 * 'high' when the row yields exactly one code and that code already exists in the
 * Product Spec — batch-confirmable. 'none' when it yields no codes at all.
 */
export function rowConfidence(row, ctx) {
  const codes = deriveCodes(row)
  if (codes.length === 0) return 'none'
  // The row's own manufacturer decides whether its code really is the spec's product.
  if (codes.length === 1 && classify(codes[0], ctx, row.manufacturer).status === 'green') return 'high'
  return 'low'
}

const ORDER = { high: 0, low: 1, none: 2 }

/** Queue order: easy greens first, then ambiguous, then rows with no codes. */
export function sortByConfidence(rows, ctx) {
  return [...rows].sort((a, b) => ORDER[rowConfidence(a, ctx)] - ORDER[rowConfidence(b, ctx)])
}
