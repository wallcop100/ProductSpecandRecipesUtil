import { describe, test, expect } from 'vitest'
import { indexKnownCodes, matchKnownCodes, applyKnownCodes, knownTokenIndices } from '../../src/utils/knownCodes.js'
import { makeRow, buildMaster, deriveCodes } from '../../src/utils/productCodes.js'
import { applyRules } from '../../src/utils/codeLearning.js'

const psRow = (ref, mfr, code) => ({ ElementTypeRef: ref, Manufacturer: mfr, ProductCode: code })

// Real shapes from the project's Product Spec: single-token AND multi-token codes.
const spec = [
  psRow('ET-TAPE-01', 'Nichia', 'LL240272024'),
  psRow('ET-PROF-01', 'Flexalighting', 'FPS2020BG2000'),
  psRow('ET-A01', 'Nordic', 'SP6569 - NL-INFDT-27-X-M-NA-AWB-54'),
  psRow('ET-XAL-01', 'XAL', 'XAL 011-8000018M'),
  psRow('ET-CASE-01', 'IW', 'MICRO FLIGHT CASE BY IW MLS'),
  psRow('ET-WRAP-01', 'Ideaworks', 'N/A'),
]
const index = () => indexKnownCodes(buildMaster(spec))
const match = text => matchKnownCodes(makeRow(0, text), index())
const codesOf = (text, master = buildMaster(spec)) => {
  const { rows } = applyKnownCodes([makeRow(0, text)], master)
  return deriveCodes(applyRules(rows, {})[0])
}

describe('indexKnownCodes', () => {
  test('indexes every real product, and no N/A', () => {
    const idx = index()
    expect(idx.has('LL240272024')).toBe(true)
    expect(idx.has('N/A')).toBe(false)
    expect(idx.size).toBe(5)
  })

  test('carries the ElementType and maker for each code', () => {
    expect(index().get('LL240272024')).toMatchObject({ ref: 'ET-TAPE-01', manufacturer: 'Nichia' })
  })
})

describe('matching is span-aware — real spec codes are multi-token', () => {
  test('a single-token code matches', () => {
    const { exact } = match('Tape LL240272024 + Profile')
    expect(exact).toHaveLength(1)
    expect(exact[0]).toMatchObject({ code: 'LL240272024', ref: 'ET-TAPE-01' })
  })

  test('a multi-token code matches across its tokens', () => {
    const { exact } = match('SP6569 - NL-INFDT-27-X-M-NA-AWB-54')
    expect(exact).toHaveLength(1)
    expect(exact[0].code).toBe('SP6569 - NL-INFDT-27-X-M-NA-AWB-54')
  })

  test('a six-word code matches', () => {
    const { exact } = match('TBC XAL 011-8000018M + MICRO FLIGHT CASE BY IW MLS')
    expect(exact.map(e => e.code).sort()).toEqual(['MICRO FLIGHT CASE BY IW MLS', 'XAL 011-8000018M'])
  })

  test('longest match wins: "XAL 011-8000018M" beats a bare "XAL"', () => {
    const { exact, variants } = match('XAL 011-8000018M')
    expect(exact).toHaveLength(1)
    expect(exact[0].range[1]).toBeGreaterThan(exact[0].range[0])
    // and the first word is NOT then reported as a variant of the whole
    expect(variants).toEqual([])
  })

  test('matched spans do not overlap', () => {
    const { exact } = match('LL240272024 LL240272024')
    expect(exact).toHaveLength(2)
    expect(exact[0].range[1]).toBeLessThan(exact[1].range[0])
  })

  test('matching ignores case', () => {
    expect(match('ll240272024').exact[0].ref).toBe('ET-TAPE-01')
  })

  test('nothing known, nothing matched', () => {
    expect(match('WHOLLY UNKNOWN THING')).toEqual({ exact: [], variants: [] })
    expect(matchKnownCodes(makeRow(0, 'x'), new Map())).toEqual({ exact: [], variants: [] })
  })
})

describe('variants — "same code with a bit more on the end"', () => {
  test('a known code with a suffix is flagged, never painted', () => {
    const { exact, variants } = match('Profile FPS2020BG2000-EM')
    expect(exact).toEqual([])
    expect(variants).toHaveLength(1)
    expect(variants[0]).toMatchObject({ base: 'FPS2020BG2000', ref: 'ET-PROF-01', extra: '-EM' })
  })

  test('the variant names the ElementType of the code it resembles', () => {
    expect(match('LL240272024X').variants[0]).toMatchObject({ base: 'LL240272024', ref: 'ET-TAPE-01' })
  })

  test('an exact hit is never also a variant', () => {
    const { exact, variants } = match('LL240272024')
    expect(exact).toHaveLength(1)
    expect(variants).toEqual([])
  })

  test('a short token is not a variant of anything — that is coincidence', () => {
    expect(match('FPS').variants).toEqual([])   // 3 chars
  })

  test('N/A never matches and never spawns a variant', () => {
    expect(match('N/A')).toEqual({ exact: [], variants: [] })
  })

  test('the longest shared base wins', () => {
    const master = buildMaster([psRow('ET-1', 'M', 'ABC12'), psRow('ET-2', 'M', 'ABC12345')])
    const { variants } = matchKnownCodes(makeRow(0, 'ABC12345X'), indexKnownCodes(master))
    expect(variants[0].base).toBe('ABC12345')
  })
})

describe('applyKnownCodes paints exact runs and counts them', () => {
  test('an exact run becomes a code, verbatim', () => {
    expect(codesOf('Tape LL240272024 + Profile')).toEqual(['LL240272024'])
  })

  test('a multi-token code paints as ONE code, spacing preserved', () => {
    expect(codesOf('TBC XAL 011-8000018M here')).toEqual(['XAL 011-8000018M'])
  })

  test('a variant is not painted — it awaits a human', () => {
    expect(codesOf('Profile FPS2020BG2000-EM')).toEqual([])
  })

  test('counts and per-row detail are reported', () => {
    const rows = [makeRow(0, 'Tape LL240272024'), makeRow(1, 'Profile FPS2020BG2000-EM'), makeRow(2, 'nothing here')]
    const r = applyKnownCodes(rows, buildMaster(spec))
    expect(r.exactCount).toBe(1)
    expect(r.variantCount).toBe(1)
    expect([...r.byRow.keys()].sort()).toEqual([0, 1])
    expect(r.rows[2]).toBe(rows[2])   // untouched rows are not even copied
  })

  test('painting is a per-row override, not a batch rule', () => {
    const { rows } = applyKnownCodes([makeRow(0, 'Tape LL240272024')], buildMaster(spec))
    expect(rows[0].overrides).toEqual({ 1: 'code' })
  })

  test('it is idempotent', () => {
    const once = applyKnownCodes([makeRow(0, 'Tape LL240272024')], buildMaster(spec))
    const twice = applyKnownCodes(once.rows, buildMaster(spec))
    expect(twice.rows[0].overrides).toEqual(once.rows[0].overrides)
  })

  test('an empty spec paints nothing and returns the rows untouched', () => {
    const rows = [makeRow(0, 'Tape LL240272024')]
    const r = applyKnownCodes(rows, [])
    expect(r.rows).toBe(rows)
    expect(r.exactCount).toBe(0)
  })

  test('knownTokenIndices covers every token of every exact run', () => {
    const idx = knownTokenIndices(match('TBC XAL 011-8000018M'))
    expect([...idx].sort((a, b) => a - b)).toEqual([1, 2])
  })
})

describe('placeholders and touching runs never invent a code', () => {
  test('a spec ProductCode of "TBC" is a placeholder, not a code to match', () => {
    // ET-LIN-PROF-05 in the real spec has ProductCode "TBC". Matching it painted the
    // literal word TBC wherever a Form field said "to be confirmed".
    const master = buildMaster([psRow('ET-LIN-PROF-05', 'X', 'TBC'), psRow('ET-XAL-01', 'XAL', 'XAL 011-8000018M')])
    expect(indexKnownCodes(master).has('TBC')).toBe(false)
    expect(codesOf('TBC XAL 011-8000018M', master)).toEqual(['XAL 011-8000018M'])
  })

  test('"TBC-1000" is a real code — only the whole placeholder is rejected', () => {
    const master = buildMaster([psRow('ET-1', 'M', 'TBC-1000')])
    expect(codesOf('unit TBC-1000', master)).toEqual(['TBC-1000'])
  })

  test('two exact matches that TOUCH are painted neither, and reported', () => {
    // Painting both merges them into one run: a code in no spec anywhere.
    const master = buildMaster([psRow('ET-1', 'M', 'AAA111'), psRow('ET-2', 'M', 'BBB222')])
    const { rows, exactCount, adjacentCount, byRow } = applyKnownCodes([makeRow(0, 'AAA111 BBB222')], master)
    expect(exactCount).toBe(0)
    expect(adjacentCount).toBe(2)
    expect(rows[0].overrides).toEqual({})
    expect(byRow.get(0).adjacent.map(a => a.code)).toEqual(['AAA111', 'BBB222'])
  })

  test('a separator between them makes both safe to paint', () => {
    const master = buildMaster([psRow('ET-1', 'M', 'AAA111'), psRow('ET-2', 'M', 'BBB222')])
    expect(codesOf('AAA111 + BBB222', master)).toEqual(['AAA111', 'BBB222'])
  })

  test('a lone match is never "touching"', () => {
    const master = buildMaster([psRow('ET-1', 'M', 'AAA111')])
    const r = applyKnownCodes([makeRow(0, 'x AAA111 y')], master)
    expect(r.exactCount).toBe(1)
    expect(r.adjacentCount).toBe(0)
  })
})
