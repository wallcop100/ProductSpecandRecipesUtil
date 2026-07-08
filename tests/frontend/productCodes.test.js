import { describe, test, expect } from 'vitest'
import {
  tokenize, makeRow, codeRuns, deriveCaptures, deriveCodes, promoteNoteToCode,
  buildMaster, buildDistinct, hasNoteCollision, duplicateSet, classify,
  clusterSimilar, rowConfidence, sortByConfidence, setNoteOverride, segmentsOf,
} from '../../src/utils/productCodes.js'

// Real strings from samplefiles/5642 - Form V3.6.xlsx, sheet PositionTypeSpec.
const REAL = {
  A01:  'SP6569 - NL-INFDT-27-X-M-NA-AWB-54',
  A05E: 'NA-EY-TF-WT-STD3-27-90-30-1050 + NA-TFR-WT + EME-LED3/60/ST/3000/DALI',
  B04:  'TBC XAL 011-8000018M + MICRO FLIGHT CASE BY IW MLS',
  C01:  'Tape LL240272024 + Profile 2020 (FPS2020BG2000 (old code 021-1102)) + PC Opal (FPS2020PCOPD2000)',
  C06:  'UN16TVC2715 (new code UN16TVC2715G2 Generation 2),  Flexible Grip Silicone Profile UN16GFSLW1000 (new code UN16FGSCW2125 55mm)',
  C07:  'UN16TVC2715, Rigid profile',
  D02:  'Tape NF240272009 + Profile 021-7309-02 (new name: Flex Profile Nano 0809 - FPSN0809BG2000) + Diffuser 022-1169-02 (FPSN0809PCOPD2000) + End Cap 021-7309-11 (FPSN0809ECG) + Clips 021-7309-12 (FPSN0809MC)',
}

const texts = row => row.tokens.map(t => t.text)
const idxOf = (row, text) => texts(row).indexOf(text)
/** Mark the named tokens as `role`; everything else keeps its default. */
const mark = (row, role, ...names) => {
  const roles = [...row.roles]
  for (const n of names) roles[idxOf(row, n)] = role
  return { ...row, roles }
}

describe('principle 1 — nothing silently used, nothing silently lost', () => {
  test('every token defaults to note: no codes, no data loss', () => {
    const row = makeRow(0, REAL.D02)
    expect(row.roles.every(r => r === 'note')).toBe(true)
    const { captures, discarded, unattachedNote } = deriveCaptures(row)
    expect(captures).toEqual([])            // a code is never invented
    expect(discarded).toEqual([])           // nothing is dropped
    // every token survives in the unattached note
    expect(unattachedNote.split(' ')).toHaveLength(row.tokens.length)
  })

  test('a field with no code marks yields zero codes', () => {
    expect(deriveCodes(makeRow(0, REAL.B04))).toEqual([])
  })

  test('discard is explicit — only marked tokens are dropped', () => {
    let row = makeRow(0, 'Tape NF240272009 +')
    row = mark(row, 'discard', '+')
    expect(deriveCaptures(row).discarded).toEqual(['+'])
  })
})

describe('tokenize — mechanical, no syntax assumptions', () => {
  test('leading/trailing punctuation peels off; internal punctuation is kept', () => {
    expect(texts(makeRow(0, '(FPSN0809BG2000)'))).toEqual(['(', 'FPSN0809BG2000', ')'])
    expect(texts(makeRow(0, '021-7309-02'))).toEqual(['021-7309-02'])   // hyphens internal
    expect(texts(makeRow(0, 'name:'))).toEqual(['name', ':'])
    expect(texts(makeRow(0, 'UN16TVC2715,'))).toEqual(['UN16TVC2715', ','])
  })

  test('a punctuation-only chunk becomes one token per character', () => {
    expect(texts(makeRow(0, '021-1102))'))).toEqual(['021-1102', ')', ')'])
    expect(texts(makeRow(0, '+'))).toEqual(['+'])
  })

  test('NESTED parens expose both inner codes as ordinary tokens', () => {
    // "(FPS2020BG2000 (old code 021-1102))" — the old regex mis-parsed this
    const t = texts(makeRow(0, REAL.C01))
    expect(t).toContain('FPS2020BG2000')
    expect(t).toContain('021-1102')
    expect(t.filter(x => x === '(')).toHaveLength(3)
    expect(t.filter(x => x === ')')).toHaveLength(3)
  })

  test('"+", "(", ")" are ordinary tokens with no meaning', () => {
    expect(texts(makeRow(0, REAL.A05E)).filter(x => x === '+')).toHaveLength(2)
  })

  test('offsets map back into rawText', () => {
    const row = makeRow(0, REAL.A01)
    for (const t of row.tokens) expect(row.rawText.slice(t.start, t.end)).toBe(t.text)
  })
})

describe('principle 3 — separators need no meaning', () => {
  test('adjacent code tokens form ONE code', () => {
    let row = makeRow(0, 'V6815 000')
    row = mark(row, 'code', 'V6815', '000')
    expect(codeRuns(row)).toEqual([[0, 1]])
    expect(deriveCodes(row)).toEqual(['V6815 000'])   // original spacing survives
  })

  test('non-adjacent code tokens form TWO codes, with no separator rule', () => {
    let row = makeRow(0, REAL.D02)
    row = mark(row, 'code', 'NF240272009', '021-7309-02')
    expect(deriveCodes(row)).toEqual(['NF240272009', '021-7309-02'])
  })

  test('the "+" between them never had to be classified', () => {
    let row = makeRow(0, 'A1234 + B5678')
    row = mark(row, 'code', 'A1234', 'B5678')
    expect(deriveCodes(row)).toEqual(['A1234', 'B5678'])   // "+" is still a note
  })
})

describe('deriveCaptures — notes find their code by segment, then reading order', () => {
  /** Every token of `text` marked with `role`, everywhere it occurs. */
  const markAll = (row, role, text) => ({
    ...row,
    roles: row.roles.map((r, i) => (row.tokens[i].text === text ? role : r)),
  })

  test('D02: segmenting on the learned "+" attaches each note to its own ingredient', () => {
    let row = makeRow(0, REAL.D02)
    row = mark(row, 'code', 'NF240272009', '021-7309-02', '022-1169-02', '021-7309-11', '021-7309-12')
    for (const p of ['+', '(', ')', '-', ':']) row = markAll(row, 'discard', p)

    const opts = { delimiters: new Set(['+']), direction: 'forward' }
    const { captures } = deriveCaptures(row, opts)

    expect(captures[0].note).toBe('Tape')
    // the profile's own bracketed alt-code no longer drifts to the next ingredient
    expect(captures[1].note).toContain('FPSN0809BG2000')
    expect(captures[2].note).not.toContain('FPSN0809BG2000')
    expect(captures[2].note).toContain('Diffuser')
  })

  test('without the delimiter, that bracketed alt-code drifts to the nearer code', () => {
    let row = makeRow(0, REAL.D02)
    row = mark(row, 'code', 'NF240272009', '021-7309-02', '022-1169-02', '021-7309-11', '021-7309-12')
    for (const p of ['+', '(', ')', '-', ':']) row = markAll(row, 'discard', p)

    const { captures } = deriveCaptures(row)   // no delimiters learned yet
    expect(captures[2].note).toContain('FPSN0809BG2000')   // the old mis-attachment
  })

  test('segmentsOf splits only on discarded delimiter tokens', () => {
    let row = makeRow(0, 'A1234 + B5678')
    row = mark(row, 'code', 'A1234', 'B5678')
    row = markAll(row, 'discard', '+')
    const segs = segmentsOf(row, new Set(['+']))
    expect(segs[0]).toBe(0)                     // A1234
    expect(segs[segs.length - 1]).toBe(1)       // B5678
  })

  test('a leading note token reads forward onto its code', () => {
    let row = makeRow(0, 'Tape NF240272009')
    row = mark(row, 'code', 'NF240272009')
    expect(deriveCaptures(row).captures[0].note).toBe('Tape')
  })

  test('direction flips which code an ambiguous note reads with', () => {
    // one segment, two codes, one note between them
    let row = makeRow(0, 'A1234 mid B5678')
    row = mark(row, 'code', 'A1234', 'B5678')
    const fwd = deriveCaptures(row, { direction: 'forward' }).captures
    const bwd = deriveCaptures(row, { direction: 'backward' }).captures
    expect(fwd[1].note).toBe('mid')    // reads onto the following code
    expect(bwd[0].note).toBe('mid')    // reads back onto the preceding code
  })

  test('with no codes at all, notes are unattached rather than lost', () => {
    const { captures, unattachedNote } = deriveCaptures(makeRow(0, 'MICRO FLIGHT CASE'))
    expect(captures).toEqual([])
    expect(unattachedNote).toBe('MICRO FLIGHT CASE')
  })
})

describe('note editing — re-attach, drop, rewrite', () => {
  /** The real D02 shape: two ingredient codes, each with its own note. */
  const twoCodes = () => {
    let row = makeRow(0, 'Tape NF240272009 + Profile 021-7309-02')
    row = mark(row, 'code', 'NF240272009', '021-7309-02')
    return mark(row, 'discard', '+')
  }

  test('notes derive by nearest code, ties to the following one', () => {
    const { captures } = deriveCaptures(twoCodes())
    expect(captures[0].note).toBe('Tape')
    expect(captures[1].note).toBe('Profile')
  })

  test('dragging a note onto another code merges it there and empties the source', () => {
    let row = twoCodes()
    const caps = deriveCaptures(row).captures
    // what the screen's handleMoveNote does: merge into target, clear source
    const merged = [caps[0].note, caps[1].note].filter(Boolean).join(' ')
    row = setNoteOverride(setNoteOverride(row, caps[0].code, merged), caps[1].code, '')

    const after = deriveCaptures(row).captures
    expect(after[0].note).toBe('Tape Profile')
    expect(after[1].note).toBe('')
  })

  test('setNoteOverride rewrites a code\'s note as free text', () => {
    let row = twoCodes()
    row = setNoteOverride(row, '021-7309-02', 'Flex Profile Nano 0809')
    const cap = deriveCaptures(row).captures[1]
    expect(cap.note).toBe('Flex Profile Nano 0809')
    expect(cap.noteEdited).toBe(true)
    // the other code is untouched
    expect(deriveCaptures(row).captures[0].note).toBe('Tape')
  })

  test('an empty override is a deliberate empty note; only null resets it', () => {
    let row = setNoteOverride(twoCodes(), 'NF240272009', '')
    expect(deriveCaptures(row).captures[0].note).toBe('')
    expect(deriveCaptures(row).captures[0].noteEdited).toBe(true)

    row = setNoteOverride(row, 'NF240272009', null)
    expect(deriveCaptures(row).captures[0].note).toBe('Tape')     // derived note returns
    expect(deriveCaptures(row).captures[0].noteEdited).toBeUndefined()
  })

  test('an edited note flows into the distinct list, so it can resolve a collision', () => {
    let a = makeRow('r1', 'V8397 000', { positionType: 'P1' })
    a = mark(a, 'code', 'V8397', '000')
    let b = makeRow('r2', 'V8397 000 BLACK', { positionType: 'P2' })
    b = mark(b, 'code', 'V8397', '000')
    expect(hasNoteCollision(buildDistinct([a, b])[0])).toBe(true)

    // rewrite b's note to match a's (empty) -> one variant, collision gone
    b = setNoteOverride(b, 'V8397 000', '')
    expect(hasNoteCollision(buildDistinct([a, b])[0])).toBe(false)
  })
})

describe('promoteNoteToCode', () => {
  test('flips a note token to code, extending the adjacent run', () => {
    let row = makeRow(0, 'V8397 COPPER')
    row = mark(row, 'code', 'V8397')
    expect(deriveCodes(row)).toEqual(['V8397'])

    row = promoteNoteToCode(row, idxOf(row, 'COPPER'))
    expect(deriveCodes(row)).toEqual(['V8397 COPPER'])   // adjacent -> one code
  })
})

describe('classify', () => {
  const master = buildMaster([
    { ElementTypeRef: 'ET-A', ProductCode: 'ZH-INFD-27-D-M-NA-AWB-54' },
  ])

  test('green resolves the ElementTypeRef from the Product Spec', () => {
    const r = classify('ZH-INFD-27-D-M-NA-AWB-54', { master })
    expect(r.status).toBe('green')
    expect(r.elementTypeRef).toBe('ET-A')
  })

  test('amber when a suffix may make it a different code, with the base returned', () => {
    const r = classify('ZH-INFD-27-D-M-NA-AWB-54-EM', { master })
    expect(r.status).toBe('amber')
    expect(r.base).toBe('ZH-INFD-27-D-M-NA-AWB-54')
  })

  test('blue = novel but twice in this batch; grey = novel', () => {
    expect(classify('X1', { master, duplicates: new Set(['X1']) }).status).toBe('blue')
    expect(classify('X1', { master }).status).toBe('grey')
  })
})

describe('holistic view — distinct, collisions, clusters', () => {
  /** Two rows that both capture the same code, one carrying a distinguishing note. */
  const collidingRows = () => {
    let a = makeRow('r1', 'V8397 000', { positionType: 'PT-DL-01' })
    a = mark(a, 'code', 'V8397', '000')
    let b = makeRow('r2', 'V8397 000 BLACK', { positionType: 'PT-DL-07' })
    b = mark(b, 'code', 'V8397', '000')
    return [a, b]
  }

  test('the same code with differing notes is a collision', () => {
    const entry = buildDistinct(collidingRows())[0]
    expect(entry.text).toBe('V8397 000')
    expect(entry.rowRefs).toEqual(['r1', 'r2'])
    expect(entry.variants.map(v => v.note)).toEqual(['', 'BLACK'])
    expect(hasNoteCollision(entry)).toBe(true)
  })

  test('promoting the note into the code clears the collision and splits the entry', () => {
    const [a, b0] = collidingRows()
    const b = promoteNoteToCode(b0, idxOf(b0, 'BLACK'))
    const entries = buildDistinct([a, b])
    expect(entries.map(e => e.text).sort()).toEqual(['V8397 000', 'V8397 000 BLACK'])
    expect(entries.every(e => !hasNoteCollision(e))).toBe(true)
  })

  test('positionTypes aggregate across the rows a code is used by', () => {
    const entry = buildDistinct(collidingRows())[0]
    expect(entry.positionTypes).toEqual(['PT-DL-01', 'PT-DL-07'])
  })

  test('clusterSimilar puts prefix-related codes side by side', () => {
    const entries = [
      { text: 'ZH-INFD-27-D-M-NA-AWB-54' },
      { text: 'ZH-INFD-27-D-M-NA-AWB-54-EM' },
      { text: 'ZH-INFD-27-D-M-NA-AWB-54H' },
      { text: 'NF240272009' },
    ]
    const clusters = clusterSimilar(entries)
    const big = clusters.find(c => c.length > 1)
    expect(big.map(e => e.text)).toEqual([
      'ZH-INFD-27-D-M-NA-AWB-54', 'ZH-INFD-27-D-M-NA-AWB-54-EM', 'ZH-INFD-27-D-M-NA-AWB-54H',
    ])
    expect(clusters.find(c => c.length === 1)[0].text).toBe('NF240272009')
  })

  test('duplicateSet catches a code captured in more than one row', () => {
    expect(duplicateSet(collidingRows()).has('V8397 000')).toBe(true)
  })
})

describe('rowConfidence / sortByConfidence', () => {
  const master = buildMaster([{ ElementTypeRef: 'ET-A', ProductCode: 'NF240272009' }])
  const ctx = { master }

  test('a lone green code is high; an unmarked row is none', () => {
    let easy = makeRow(1, 'Tape NF240272009')
    easy = mark(easy, 'code', 'NF240272009')
    expect(rowConfidence(easy, ctx)).toBe('high')
    expect(rowConfidence(makeRow(2, REAL.C07), ctx)).toBe('none')
  })

  test('easy greens sort first, rows with no codes last', () => {
    let easy = makeRow(1, 'Tape NF240272009')
    easy = mark(easy, 'code', 'NF240272009')
    let novel = makeRow(2, 'Tape LL240272024')
    novel = mark(novel, 'code', 'LL240272024')
    const sorted = sortByConfidence([makeRow(3, REAL.C07), novel, easy], ctx)
    expect(sorted.map(r => r.id)).toEqual([1, 2, 3])
  })
})
