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
// Batch-level derivation — the distinct list and the holistic comparison
// ---------------------------------------------------------------------------

/** Master index from the Product Spec: a code both flags green AND names its ET. */
export function buildMaster(psRows) {
  const out = []
  for (const r of psRows || []) {
    const code = (r.ProductCode || r.productCode || '').trim()
    const ref = r.ElementTypeRef || r.elementTypeRef || ''
    if (code && ref) out.push({ code, ref })
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
export function classify(code, { master = [], duplicates = new Set() } = {}) {
  const n = norm(code)
  const duplicate = duplicates.has(n)

  const exact = master.find(m => norm(m.code) === n)
  if (exact) return { status: 'green', elementTypeRef: exact.ref, base: exact.code, duplicate }

  let best = null
  for (const m of master) {
    const mn = norm(m.code)
    if (mn === n) continue
    if (n.startsWith(mn) || mn.startsWith(n)) {
      if (!best || mn.length > norm(best.code).length) best = m
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

/**
 * 'high' when the row yields exactly one code and that code already exists in the
 * Product Spec — batch-confirmable. 'none' when it yields no codes at all.
 */
export function rowConfidence(row, ctx) {
  const codes = deriveCodes(row)
  if (codes.length === 0) return 'none'
  if (codes.length === 1 && classify(codes[0], ctx).status === 'green') return 'high'
  return 'low'
}

const ORDER = { high: 0, low: 1, none: 2 }

/** Queue order: easy greens first, then ambiguous, then rows with no codes. */
export function sortByConfidence(rows, ctx) {
  return [...rows].sort((a, b) => ORDER[rowConfidence(a, ctx)] - ORDER[rowConfidence(b, ctx)])
}
