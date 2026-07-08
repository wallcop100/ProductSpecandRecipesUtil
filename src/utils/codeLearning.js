/**
 * codeLearning.js — the syntax-free accelerator.
 *
 * The tool ships with NO knowledge of how a project writes its ProductCode column.
 * It learns that project's dialect from the user's own decisions and replays them
 * across the batch: classify "Tape" as a note once, and every "Tape" follows.
 *
 * Three learned signals, in descending strength:
 *   1. exact token text   — a rule; applied immediately, batch-wide, revocable
 *   2. neighbour context  — "the token after `Profile` is a code"
 *   3. token shape        — "looks like a code I already marked"
 *
 * (2) and (3) only ever produce *suggestions*. They are advisory, visibly marked,
 * and never assign a role on their own.
 */

const lower = t => String(t || '').toLowerCase()

/** Digit/letter-normalised shape: "FPSN0809BG2000" -> "AAAA####AA####". */
export const shapeOf = text =>
  String(text || '').replace(/[A-Za-z]/g, 'A').replace(/[0-9]/g, '#')

export const isPunctuation = text => !/[A-Za-z0-9]/.test(String(text || ''))

/** Shapes shorter than this are too generic to be a useful signal ("####"). */
const MIN_SHAPE_LEN = 5

// ---------------------------------------------------------------------------
// Rules: Map<lowercased token text -> role>. Batch-wide, always revocable.
// ---------------------------------------------------------------------------

export function setRule(rules, text, role) {
  return { ...rules, [lower(text)]: role }
}

export function revokeRule(rules, text) {
  const next = { ...rules }
  delete next[lower(text)]
  return next
}

/**
 * Resolve a row's roles. Precedence: per-row override > batch rule > default.
 *
 * The default is 'note' — the safe sink — EXCEPT when the whole field is a single
 * token. This is a ProductCode column: a field holding one token ("SP6971",
 * "P304.43") is that code, and making the user mark it by hand is ceremony. The
 * moment a field has more than one token its meaning is genuinely ambiguous, so
 * nothing is assumed and every token stays a note until painted.
 */
export function resolveRoles(row, rules = {}) {
  const lone = row.tokens.length === 1
  return row.tokens.map((t, i) => {
    const o = row.overrides && row.overrides[i]
    if (o) return o
    return rules[lower(t.text)] || (lone ? 'code' : 'note')
  })
}

/** Apply the rules across the batch, returning rows with fresh `roles`. */
export function applyRules(rows, rules = {}) {
  return rows.map(row => ({ ...row, roles: resolveRoles(row, rules) }))
}

/** How many rows a rule touches — shown in the Learned panel. */
export function ruleImpact(rows, text) {
  const t = lower(text)
  return rows.filter(r => r.tokens.some(tok => lower(tok.text) === t)).length
}

/** Every learned rule with its reach, for the Learned panel. */
export function learnedRules(rows, rules = {}) {
  return Object.entries(rules)
    .map(([text, role]) => ({ text, role, rows: ruleImpact(rows, text) }))
    .sort((a, b) => b.rows - a.rows || a.text.localeCompare(b.text))
}

// ---------------------------------------------------------------------------
// Suggestions — learned continuously from the ROLES, never applied silently
// ---------------------------------------------------------------------------

/** Token text -> number of rows containing it. A frequent token is likely a label. */
export function tokenFrequency(rows) {
  const freq = new Map()
  for (const row of rows) {
    for (const t of new Set(row.tokens.map(tok => lower(tok.text)))) {
      freq.set(t, (freq.get(t) || 0) + 1)
    }
  }
  return freq
}

/**
 * Shapes of every token currently playing the role of a code — including the
 * single-token fields that are codes by default. Reading the RESOLVED ROLES (not
 * just the rules) is what makes the tool learn continuously: each code you paint,
 * and each single-token field, immediately sharpens the next suggestion.
 */
export function learnedCodeShapes(rows) {
  const shapes = new Set()
  for (const row of rows || []) {
    row.tokens.forEach((t, i) => {
      if (row.roles?.[i] !== 'code') return
      if (t.text.length < MIN_SHAPE_LEN) return
      shapes.add(shapeOf(t.text))
    })
  }
  return shapes
}

/**
 * Words that precede a code — "the token after `Profile` is a code". Learned
 * purely from what the user painted, so it captures this project's label dialect
 * without any rule about what a label looks like. Punctuation never teaches a
 * context (an opening bracket precedes far too much to mean anything).
 */
export function learnedCodeContexts(rows) {
  const contexts = new Set()
  for (const row of rows || []) {
    for (let i = 1; i < row.tokens.length; i++) {
      if (row.roles?.[i] !== 'code') continue
      if (row.roles[i - 1] === 'code') continue          // mid-code, not a lead-in
      const prev = row.tokens[i - 1].text
      if (isPunctuation(prev)) continue
      contexts.add(lower(prev))
    }
  }
  return contexts
}

/**
 * What the codes in THIS project look like, learned from the ones playing that
 * role — not hardcoded. A context signal ("token after `Profile`") is otherwise
 * far too loose: on the real data it happily suggests `Flex`, `Nano`, `PC`, `set`
 * and `2020`. Holding it to the learned profile drops all of those.
 *
 * If a project's codes genuinely contain no digits, `requireDigit` learns false
 * and the profile falls back to length alone.
 */
export function learnedCodeProfile(rows) {
  const codes = []
  for (const row of rows || []) {
    row.tokens.forEach((t, i) => { if (row.roles?.[i] === 'code') codes.push(t.text) })
  }
  if (codes.length === 0) return { requireDigit: false, minLen: 0 }

  const withDigit = codes.filter(c => /[0-9]/.test(c))
  // Digits are a real signal only if they hold for most of what the user calls a code.
  const requireDigit = withDigit.length >= Math.max(1, Math.ceil(codes.length * 0.6))
  const sample = requireDigit ? withDigit : codes
  return { requireDigit, minLen: Math.min(...sample.map(c => c.length)) }
}

/** Does this token look like the codes the user has been painting? */
export function fitsProfile(text, { requireDigit = false, minLen = 0 } = {}) {
  if (requireDigit && !/[0-9]/.test(text)) return false
  return text.length >= minLen
}

/** Number of separate code RUNS among these token indices. */
function runsIn(row, from, to) {
  let n = 0
  for (let i = from; i <= to; i++) {
    if (row.roles?.[i] === 'code' && row.roles[i - 1] !== 'code') n++
  }
  return n
}

/**
 * Which discarded symbols is the user actually using to separate items?
 *
 * A delimiter is not declared, it is *tested*: split the field on the candidate and
 * see whether every resulting segment holds exactly one code. On the real data `+`
 * passes (each segment is one ingredient) while `(` fails (it produces a segment
 * with no code in it at all). So `+` and `,` are learned as separators and brackets
 * are not — with no rule about what any character means.
 *
 * Candidates are punctuation the user chose to discard. Nothing else is considered.
 */
export function learnedDelimiters(rows, minScore = 0.8) {
  const candidates = new Set()
  for (const row of rows || []) {
    row.tokens.forEach((t, i) => {
      if (row.roles?.[i] === 'discard' && isPunctuation(t.text)) candidates.add(lower(t.text))
    })
  }

  const found = new Set()
  for (const d of candidates) {
    let segments = 0
    let clean = 0
    let split = false

    for (const row of rows) {
      const isDelim = i => lower(row.tokens[i].text) === d && row.roles?.[i] === 'discard'
      if (runsIn(row, 0, row.tokens.length - 1) < 2) continue   // need >1 code to judge
      if (!row.tokens.some((_, i) => isDelim(i))) continue

      const bounds = [-1]
      row.tokens.forEach((_, i) => { if (isDelim(i)) bounds.push(i) })
      bounds.push(row.tokens.length)
      if (bounds.length > 2) split = true

      for (let b = 0; b < bounds.length - 1; b++) {
        segments++
        if (runsIn(row, bounds[b] + 1, bounds[b + 1] - 1) === 1) clean++
      }
    }
    if (split && segments > 1 && clean / segments >= minScore) found.add(d)
  }
  return found
}

/** What the user is keeping vs throwing away, for the Learned panel. */
export function roleTally(rows) {
  const tally = { code: 0, note: 0, discard: 0 }
  for (const row of rows || []) for (const r of row.roles || []) tally[r] = (tally[r] || 0) + 1
  return tally
}

/** All learned signals in one pass. */
export function learnedSignals(rows) {
  return {
    shapes: learnedCodeShapes(rows),
    contexts: learnedCodeContexts(rows),
    profile: learnedCodeProfile(rows),
    delimiters: learnedDelimiters(rows),
  }
}

/**
 * Indices of tokens that look like codes you've already painted, and that nothing
 * has classified yet. Purely advisory: the caller renders these green-dashed, and
 * only `acceptSuggestions` ever changes a role.
 */
export function suggestCodes(row, rules = {}, signals = {}) {
  const shapes = signals.shapes || new Set()
  const contexts = signals.contexts || new Set()
  const profile = signals.profile || { requireDigit: false, minLen: 0 }
  if (shapes.size === 0 && contexts.size === 0) return []

  const out = []
  row.tokens.forEach((t, i) => {
    if (row.roles?.[i] !== 'note') return             // already decided
    if (row.overrides && row.overrides[i]) return
    if (rules[lower(t.text)]) return
    if (isPunctuation(t.text)) return

    // Shape already asserts strong similarity to a code the user picked.
    const byShape = t.text.length >= MIN_SHAPE_LEN && shapes.has(shapeOf(t.text))

    // Context is loose, so it must also look like this project's codes.
    const prev = i > 0 ? row.tokens[i - 1].text : null
    const byContext = prev && !isPunctuation(prev) && contexts.has(lower(prev))
      && fitsProfile(t.text, profile)

    if (byShape || byContext) out.push(i)
  })
  return out
}

/** Accept a row's suggestions as row-local overrides (the `A` key, and Confirm). */
export function acceptSuggestions(row, rules = {}, signals) {
  const idxs = suggestCodes(row, rules, signals)
  if (idxs.length === 0) return row
  const overrides = { ...row.overrides }
  for (const i of idxs) overrides[i] = 'code'
  return { ...row, overrides }
}

// ---------------------------------------------------------------------------
// Learning from note edits, and picking teaching examples
// ---------------------------------------------------------------------------

const words = s => String(s || '').split(/\s+/).filter(Boolean)

/**
 * When you delete words out of a note, they are being kept in neither the code nor
 * the note — so they are noise, and the tool learns to discard them everywhere.
 *
 * Two guards make this safe:
 *   · only a PURE DELETION teaches. If you typed anything that wasn't already in
 *     the derived note you are authoring free text, not curating, so nothing is
 *     learned.
 *   · a removed word that fits the learned code profile is never discarded — you
 *     may have deleted it precisely because you are about to paint it as a code.
 *
 * Returns the token texts to discard (possibly empty).
 */
export function discardsFromNoteEdit(derivedNote, editedNote, signals = {}) {
  const derived = words(derivedNote)
  const edited = words(editedNote)
  if (derived.length === 0) return []

  const derivedLower = derived.map(lower)
  // Pure deletion: every remaining word came from the derived note.
  if (!edited.every(w => derivedLower.includes(lower(w)))) return []

  const kept = new Set(edited.map(lower))
  const profile = signals.profile || { requireDigit: false, minLen: 0 }
  // Until a code has been painted there is no profile, and `fitsProfile` would
  // match every word — which would silently block all learning. Only guard once
  // we actually know what a code looks like here.
  const knowsCodes = profile.minLen > 0

  const out = []
  for (const w of derived) {
    if (kept.has(lower(w))) continue
    if (isPunctuation(w)) continue
    if (knowsCodes && fitsProfile(w, profile)) continue   // looks like a code — never auto-discard
    if (!out.includes(w)) out.push(w)
  }
  return out
}

/**
 * A row's "dialect fingerprint": the distinct punctuation it uses, plus coarse
 * structure. Two rows sharing a fingerprint teach roughly the same lesson.
 */
function fingerprint(row) {
  const f = new Set()
  let alnum = 0
  for (const t of row.tokens) {
    if (isPunctuation(t.text)) f.add('p:' + t.text)
    else alnum++
  }
  f.add(alnum === 1 ? 'lone' : alnum <= 4 ? 'short' : 'long')
  return f
}

/**
 * Pick 2–5 rows that between them show the most of this project's dialect, so a
 * few paints teach the most. Greedy maximum coverage over the fingerprints: each
 * pick is the row adding the most punctuation/structure not yet seen.
 *
 * The first pick is the richest row, so the user immediately meets the hard case.
 */
export function pickExamples(rows, max = 5) {
  const pool = (rows || []).filter(r => r.tokens.length > 0)
  if (pool.length === 0) return []

  const prints = new Map(pool.map(r => [r.id, fingerprint(r)]))
  const covered = new Set()
  const chosen = []

  while (chosen.length < Math.min(max, pool.length)) {
    let best = null
    let bestGain = 0
    for (const r of pool) {
      if (chosen.includes(r)) continue
      let gain = 0
      for (const f of prints.get(r.id)) if (!covered.has(f)) gain++
      // tie-break toward the richer row: it exercises more of the mechanism
      if (gain > bestGain || (gain === bestGain && best && gain > 0 && r.tokens.length > best.tokens.length)) {
        best = r; bestGain = gain
      }
    }
    if (!best || bestGain === 0) break        // nothing new left to teach
    chosen.push(best)
    for (const f of prints.get(best.id)) covered.add(f)
  }
  return chosen
}

/**
 * The punctuation-only token texts present in the batch, offered as a
 * pre-suggested (NOT applied) "→ discard" rule set. One click clears "+ ( )"
 * batch-wide. Suggested, never assumed.
 */
export function punctuationSuggestion(rows) {
  const set = new Set()
  for (const row of rows) {
    for (const t of row.tokens) if (isPunctuation(t.text)) set.add(t.text)
  }
  return [...set].sort()
}

/** Apply the punctuation suggestion as real rules. */
export function acceptPunctuationSuggestion(rows, rules = {}) {
  let next = rules
  for (const t of punctuationSuggestion(rows)) next = setRule(next, t, 'discard')
  return next
}
