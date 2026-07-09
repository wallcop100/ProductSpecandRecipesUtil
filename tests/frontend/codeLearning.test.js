import { describe, test, expect } from 'vitest'
import { makeRow, deriveCodes } from '../../src/utils/productCodes.js'
import {
  shapeOf, isPunctuation, setRule, revokeRule, resolveRoles, applyRules,
  ruleImpact, learnedRules, tokenFrequency, learnedCodeShapes, learnedSignals,
  suggestCodes, acceptSuggestions, punctuationSuggestion, acceptPunctuationSuggestion,
  learnedDelimiters, roleTally, discardsFromNoteEdit, pickExamples,
  isTaught, teachingRows, learnCodeTokens,
} from '../../src/utils/codeLearning.js'

// Real ingredient rows — "Tape"/"Profile" are this project's dialect, not a spec.
const D02 = 'Tape NF240272009 + Profile 021-7309-02 (FPSN0809BG2000)'
const D07 = 'Tape NF240272009 + Profile 021-7309-11 (FPSN0809ECG)'
const C01 = 'Tape LL240272024 + Profile 2020 (FPS2020BG2000)'

const batch = () => [makeRow('D02', D02), makeRow('D07', D07), makeRow('C01', C01)]
const idxOf = (row, text) => row.tokens.findIndex(t => t.text === text)

describe('shapeOf / isPunctuation', () => {
  test('digits and letters normalise; other characters survive', () => {
    expect(shapeOf('FPSN0809BG2000')).toBe('AAAA####AA####')
    expect(shapeOf('021-7309-02')).toBe('###-####-##')
  })

  test('punctuation is punctuation', () => {
    expect(isPunctuation('+')).toBe(true)
    expect(isPunctuation('(')).toBe(true)
    expect(isPunctuation('021-1102')).toBe(false)
  })
})

describe('rules replay across the batch', () => {
  test('classifying "Tape" once applies to every row containing it', () => {
    const rows = batch()
    const rules = setRule({}, 'Tape', 'note')
    for (const row of applyRules(rows, rules)) {
      expect(row.roles[idxOf(row, 'Tape')]).toBe('note')
    }
    expect(ruleImpact(rows, 'Tape')).toBe(3)
  })

  test('a code rule replays: "NF240272009" becomes a code in both rows using it', () => {
    const rules = setRule({}, 'NF240272009', 'code')
    const rows = applyRules(batch(), rules)
    expect(deriveCodes(rows[0])).toEqual(['NF240272009'])
    expect(deriveCodes(rows[1])).toEqual(['NF240272009'])
    expect(deriveCodes(rows[2])).toEqual([])   // C01 has no such token
  })

  test('rules are case-insensitive on the token text', () => {
    const rows = applyRules(batch(), setRule({}, 'tape', 'discard'))
    expect(rows[0].roles[idxOf(rows[0], 'Tape')]).toBe('discard')
  })

  test('revoking a rule reverts every row to the note default', () => {
    let rules = setRule({}, 'Tape', 'discard')
    rules = revokeRule(rules, 'Tape')
    const rows = applyRules(batch(), rules)
    expect(rows[0].roles[idxOf(rows[0], 'Tape')]).toBe('note')
  })

  test('a per-row override beats the batch rule ("only here")', () => {
    const rules = setRule({}, '2020', 'code')
    const row = { ...makeRow('C01', C01), overrides: { [idxOf(makeRow('C01', C01), '2020')]: 'note' } }
    expect(resolveRoles(row, rules)[idxOf(row, '2020')]).toBe('note')
  })

  test('unclassified tokens in a MULTI-token field stay note — the safe sink', () => {
    const roles = resolveRoles(makeRow('D02', D02), {})
    expect(roles.every(r => r === 'note')).toBe(true)
  })

  test('a single-token field IS the code — it is a ProductCode column, after all', () => {
    for (const raw of ['SP6971', 'P304.43', '310-4012', '733685.(RAL9011)Y', 'JSBLJL270920OP45BR']) {
      const row = makeRow('x', raw)
      expect(row.tokens).toHaveLength(1)
      expect(resolveRoles(row, {})).toEqual(['code'])
      expect(deriveCodes({ ...row, roles: resolveRoles(row, {}) })).toEqual([raw])
    }
  })

  test('the single-token default is still overridable — nothing is forced', () => {
    const row = makeRow('x', 'TBC')
    expect(resolveRoles(row, {})).toEqual(['code'])                       // default
    expect(resolveRoles(row, { tbc: 'discard' })).toEqual(['discard'])    // painted away
    expect(resolveRoles({ ...row, overrides: { 0: 'note' } }, {})).toEqual(['note'])
  })

  test('the moment a field has two tokens, nothing is assumed', () => {
    const row = makeRow('x', 'UN16TVC2715, Rigid profile')
    expect(row.tokens.length).toBeGreaterThan(1)
    expect(resolveRoles(row, {}).every(r => r === 'note')).toBe(true)
    expect(deriveCodes({ ...row, roles: resolveRoles(row, {}) })).toEqual([])
  })

  test('learnedRules reports each rule with its reach, most-used first', () => {
    let rules = setRule({}, 'Tape', 'note')
    rules = setRule(rules, 'FPSN0809BG2000', 'note')
    expect(learnedRules(batch(), rules)).toEqual([
      { text: 'tape', role: 'note', rows: 3 },
      { text: 'fpsn0809bg2000', role: 'note', rows: 1 },
    ])
  })
})

describe('frequency ranking (advisory only)', () => {
  test('a label recurs across rows; a code is rare', () => {
    const freq = tokenFrequency(batch())
    expect(freq.get('tape')).toBe(3)
    expect(freq.get('profile')).toBe(3)
    expect(freq.get('nf240272009')).toBe(2)
    expect(freq.get('ll240272024')).toBe(1)
  })
})

describe('suggestions are learned continuously, never applied silently', () => {
  /** Rows with roles resolved — what the screen always passes to the learners. */
  const resolved = rules => applyRules(batch(), rules)

  test('learnedCodeShapes reads the RESOLVED ROLES, not the rules', () => {
    // "SP6971" is a code by default (single-token field) and creates NO rule…
    const rows = applyRules([makeRow('x', 'SP6971')], {})
    expect(rows[0].roles).toEqual(['code'])
    expect(learnedCodeShapes([])).toEqual(new Set())               // nothing painted, nothing learned
    expect(learnedCodeShapes(rows)).toEqual(new Set(['AA####']))   // …the ROLE is what it reads
    // learnedSignals is the gate: it feeds this only the rows the user taught, so an
    // untouched default like the one above never becomes evidence. See isTaught.
    expect(learnedSignals(rows).shapes).toEqual(new Set())
  })

  test('a painted code suggests same-shaped tokens elsewhere', () => {
    const rules = setRule({}, 'NF240272009', 'code')      // shape AA#########
    const rows = resolved(rules)
    const sig = learnedSignals(rows)
    expect(sig.shapes.has('AA#########')).toBe(true)

    const c01 = rows.find(r => r.id === 'C01')
    expect(suggestCodes(c01, rules, sig).map(i => c01.tokens[i].text)).toContain('LL240272024')
  })

  test('neighbour context is learned: "the token after Profile is a code"', () => {
    const rules = setRule({}, '021-7309-02', 'code')      // painted after "Profile"
    const sig = learnedSignals(resolved(rules))
    expect(sig.contexts.has('profile')).toBe(true)
  })

  test('context suggestions are held to the learned code profile, killing junk', () => {
    const rules = setRule({}, 'NF240272009', 'code')      // after "Tape"; has digits, len 11
    const sig = learnedSignals(resolved(rules))
    expect(sig.profile.requireDigit).toBe(true)

    // "Profile 2020" — 2020 follows a learned context but is too short to be a code here
    const c01 = resolved(rules).find(r => r.id === 'C01')
    const names = suggestCodes(c01, rules, sig).map(i => c01.tokens[i].text)
    expect(names).not.toContain('2020')
    expect(names).toContain('LL240272024')
  })

  test('a suggestion does NOT change any role until accepted', () => {
    const rules = setRule({}, 'NF240272009', 'code')
    const sig = learnedSignals(resolved(rules))
    const c01 = resolved(rules).find(r => r.id === 'C01')
    expect(deriveCodes(c01)).toEqual([])                  // still nothing captured

    const accepted = acceptSuggestions(c01, rules, sig)
    expect(deriveCodes({ ...accepted, roles: resolveRoles(accepted, rules) })).toEqual(['LL240272024'])
  })

  test('tokens already covered by a rule or an override are never suggested', () => {
    let rules = setRule({}, 'NF240272009', 'code')
    rules = setRule(rules, 'LL240272024', 'note')         // user said: not a code
    const sig = learnedSignals(resolved(rules))
    const c01 = resolved(rules).find(r => r.id === 'C01')
    expect(suggestCodes(c01, rules, sig).map(i => c01.tokens[i].text)).not.toContain('LL240272024')
  })

  test('with nothing learned there are no suggestions', () => {
    const rows = applyRules([makeRow('D02', D02)], {})    // multi-token: all note
    expect(suggestCodes(rows[0], {}, learnedSignals(rows))).toEqual([])
  })
})

describe('delimiters are detected from what the user discards', () => {
  /** D02/D07/C01 with the ingredient codes painted and punctuation discarded. */
  const painted = () => {
    let rules = acceptPunctuationSuggestion(batch(), {})
    for (const c of ['NF240272009', '021-7309-02', '021-7309-11', 'LL240272024', 'FPS2020BG2000']) {
      rules = setRule(rules, c, 'code')
    }
    return { rows: applyRules(batch(), rules), rules }
  }

  test('"+" is learned as a separator; brackets are not', () => {
    const delims = learnedDelimiters(painted().rows)
    expect(delims.has('+')).toBe(true)
    // splitting on "(" leaves a segment holding no code at all, so it fails the test
    expect(delims.has('(')).toBe(false)
    expect(delims.has(')')).toBe(false)
  })

  test('a delimiter must actually split codes apart — nothing is assumed', () => {
    // punctuation discarded but never between two codes teaches nothing
    const rows = applyRules([makeRow('x', 'ONE1234 (note)')], setRule({}, 'one1234', 'code'))
    expect(learnedDelimiters(rows).size).toBe(0)
  })

  test('roleTally reports what is being kept and thrown away', () => {
    const t = roleTally(painted().rows)
    expect(t.code).toBeGreaterThan(0)
    expect(t.discard).toBeGreaterThan(0)
    expect(t.code + t.note + t.discard).toBe(
      painted().rows.reduce((n, r) => n + r.tokens.length, 0)
    )
  })

  test('learnedSignals carries the delimiters through', () => {
    expect(learnedSignals(painted().rows).delimiters.has('+')).toBe(true)
  })
})

describe('editing a note teaches discards — with guards', () => {
  const derived = 'Profile new name Flex Nano FPSN0809BG2000'
  const signals = { profile: { requireDigit: true, minLen: 6 } }

  test('words deleted from a note become discards — kept in neither code nor note', () => {
    expect(discardsFromNoteEdit(derived, 'Profile', signals)).toEqual(['new', 'name', 'Flex', 'Nano'])
  })

  test('a code-lookalike is NEVER auto-discarded — you may be about to paint it', () => {
    const drop = discardsFromNoteEdit(derived, 'Profile', signals)
    expect(drop).not.toContain('FPSN0809BG2000')
  })

  test('rewriting (typing a new word) teaches nothing — you are authoring, not curating', () => {
    expect(discardsFromNoteEdit(derived, 'Profile something else', signals)).toEqual([])
  })

  test('reordering the same words is still a pure deletion of none', () => {
    expect(discardsFromNoteEdit('a1 b2', 'b2 a1', signals)).toEqual([])
  })

  test('clearing a note discards everything that is not code-shaped', () => {
    const drop = discardsFromNoteEdit(derived, '', signals)
    expect(drop).toContain('Profile')
    expect(drop).not.toContain('FPSN0809BG2000')
  })

  test('with no profile learned yet, nothing is protected but punctuation', () => {
    expect(discardsFromNoteEdit('foo ( bar', 'foo', {})).toEqual(['bar'])
  })
})

describe('pickExamples — a few rows covering the most dialect', () => {
  const rowsOf = (...texts) => applyRules(texts.map((t, i) => makeRow(i, t)), {})

  test('picks rows that between them introduce the most punctuation and structure', () => {
    const rows = rowsOf(
      'SP6971',                                  // lone code
      'Tape NF240272009 + Profile 021-7309-02',  // "+" delimiter
      'UN16TVC2715, Rigid profile',              // "," delimiter
      'Tape NF240272009 + Profile 021-7309-11',  // same dialect as #2 — adds nothing
    )
    const picked = pickExamples(rows, 5).map(r => r.id)
    expect(picked).toContain(0)
    expect(picked).toContain(2)
    expect(picked).not.toContain(3)   // duplicate dialect is not worth teaching twice
  })

  test('stops once the dialect is covered rather than padding to the maximum', () => {
    const rows = rowsOf('AAA111', 'BBB222', 'CCC333')   // all the same shape
    expect(pickExamples(rows, 5).length).toBe(1)
  })

  test('the hardest row comes first, so the mechanism is met head on', () => {
    const rows = rowsOf('SP6971', 'Tape NF240272009 + Profile 021-7309-02 (alt)')
    expect(pickExamples(rows, 5)[0].id).toBe(1)
  })

  test('an empty batch yields no examples', () => {
    expect(pickExamples([], 5)).toEqual([])
  })
})

describe('punctuation is suggested, never assumed', () => {
  test('punctuationSuggestion lists the punctuation tokens present', () => {
    expect(punctuationSuggestion(batch())).toEqual(['(', ')', '+'])
  })

  test('accepting it discards "+ ( )" batch-wide, leaving codes untouched', () => {
    let rules = acceptPunctuationSuggestion(batch(), {})
    rules = setRule(rules, 'NF240272009', 'code')
    const row = applyRules(batch(), rules)[0]

    expect(row.roles[idxOf(row, '+')]).toBe('discard')
    expect(row.roles[idxOf(row, '(')]).toBe('discard')
    expect(deriveCodes(row)).toEqual(['NF240272009'])
  })

  test('until accepted, punctuation is just a note — nothing is assumed', () => {
    const row = applyRules(batch(), {})[0]
    expect(row.roles[idxOf(row, '+')]).toBe('note')
  })
})

describe('the tool learns only from the user, never from its own defaults', () => {
  test('an untouched multi-token row teaches nothing', () => {
    const row = applyRules([makeRow('D02', D02)], {})[0]
    expect(isTaught(row)).toBe(false)
  })

  test('an untouched LONE-token row teaches nothing, though it reads as a code', () => {
    // The lone-token 'code' default is a convenience, not evidence. Learning from it
    // would let the tool's own guess define what a code looks like here.
    const row = applyRules([makeRow('x', 'SP6971')], {})[0]
    expect(row.roles).toEqual(['code'])
    expect(isTaught(row)).toBe(false)
    expect(learnedSignals([row]).profile.minLen).toBe(0)
  })

  test('confirming a lone-token row makes it teach', () => {
    const row = { ...applyRules([makeRow('x', 'SP6971')], {})[0], confirmed: true }
    expect(isTaught(row)).toBe(true)
    expect(learnedSignals([row]).profile.minLen).toBe(6)
  })

  test('a batch rule makes the rows it REACHES teach, and only those', () => {
    const rules = setRule({}, 'NF240272009', 'code')
    const rows = applyRules(batch(), rules)
    // D02 and D07 hold that token; C01 does not, so it stays an untouched default.
    expect(teachingRows(rows).map(r => r.id)).toEqual(['D02', 'D07'])
    expect(learnedCodeShapes(rows).has(shapeOf('NF240272009'))).toBe(true)
  })

  test('a per-row override teaches only that row', () => {
    const rows = applyRules(batch(), {})
    const touched = { ...rows[0], overrides: { 1: 'code' } }
    expect(teachingRows([touched, rows[1], rows[2]])).toHaveLength(1)
  })

  test('an untouched row cannot pollute the code profile', () => {
    const rules = setRule({}, '021-7309-02', 'code')        // a short-ish real code
    const rows = applyRules(batch(), rules)
    const taught = teachingRows(rows)
    // D07/C01 lack that token, so only D02 teaches; nothing else contributes a shape.
    expect(taught.map(r => r.id)).toEqual(['D02'])
    expect(learnedSignals(rows).profile.minLen).toBe('021-7309-02'.length)
  })

  test('editing a note marks the row as teaching', () => {
    const row = { ...applyRules(batch(), {})[0], noteOverride: { 'X': 'trimmed' } }
    expect(isTaught(row)).toBe(true)
  })
})

describe('learnCodeTokens — an ElementType decision teaches the batch', () => {
  test('every alphanumeric token of the code becomes a code rule', () => {
    const rules = learnCodeTokens({}, 'NF240272009')
    expect(rules['nf240272009']).toBe('code')
  })

  test('a multi-token code teaches each of its tokens', () => {
    const rules = learnCodeTokens({}, 'V6815 000')
    expect(rules['v6815']).toBe('code')
    expect(rules['000']).toBe('code')
  })

  test('punctuation inside the code is never turned into a code rule', () => {
    const rules = learnCodeTokens({}, '(FPSN0809BG2000)')
    expect(rules['(']).toBeUndefined()
    expect(rules[')']).toBeUndefined()
    expect(rules['fpsn0809bg2000']).toBe('code')
  })

  test('the learned rule reaches every other row holding that token', () => {
    const rules = learnCodeTokens({}, 'NF240272009')
    const rows = applyRules(batch(), rules)
    expect(deriveCodes(rows[0])).toContain('NF240272009')
    expect(deriveCodes(rows[1])).toContain('NF240272009')   // D07, never visited
  })

  test('existing rules survive', () => {
    const rules = learnCodeTokens(setRule({}, '+', 'discard'), 'ABC123')
    expect(rules['+']).toBe('discard')
    expect(rules['abc123']).toBe('code')
  })
})
