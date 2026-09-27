import { describe, test, expect } from 'vitest'
import { isObvious } from '../../src/utils/obviousRows.js'
import { makeRow } from '../../src/utils/productCodes.js'
import { applyRules, learnedSignals } from '../../src/utils/codeLearning.js'

const painted = (text, codes, extra = {}) => {
  const r = makeRow(0, text)
  const overrides = Object.fromEntries(r.tokens.map((t, i) => [i, codes.includes(t.text) ? 'code' : null]).filter(([, v]) => v))
  return applyRules([{ ...r, overrides, ...extra }])[0]
}

describe('an obvious row', () => {
  test('one code and plain words around it', () => {
    expect(isObvious(painted('QC5010 louvre', ['QC5010']))).toBe(true)
  })
  test('codes joined by "+" are the main product and its extras', () => {
    expect(isObvious(painted('QC5010 + QC5011', ['QC5010', 'QC5011']))).toBe(true)
  })
  test('codes on separate lines of the ProductCode cell need a look (one product or two?)', () => {
    expect(isObvious(painted('TRY-CONTINUITY-M-27K\nCM109274091', ['TRY-CONTINUITY-M-27K', 'CM109274091']))).toBe(false)
  })
  test('two code words side by side (one merged capture) are not obvious', () => {
    expect(isObvious(painted('QC5012 QC5013', ['QC5012', 'QC5013']))).toBe(false)
  })
  test('placeholder rows have nothing to add, so they are obvious', () => {
    for (const t of ['TBC', 'n/a', 'by specialist', 'Awaiting custom code', '*custom*', '']) expect(isObvious(painted(t, []))).toBe(true)
  })
  test('with nothing taught, a clean maker code is obvious on its own', () => {
    expect(isObvious(applyRules([makeRow(0, 'EYP-TA-R-CR-WT/WT-GENTN9-18/40-92-25-250')])[0])).toBe(true)
    expect(isObvious(applyRules([makeRow(0, 'NF240272009\nFPSN1013BG2000, clip FPSN1013MC')])[0], {}, {}, {})).toBe(false)
  })
  test('a stray slash beside the code does not make it doubtful', () => {
    expect(isObvious(painted('EYP-TA-R-CR-25-700 /', ['EYP-TA-R-CR-25-700', '/']))).toBe(true)
  })
  test('a second code hiding as a note is not obvious', () => {
    expect(isObvious(painted('QC5010 A00665.40', ['QC5010']))).toBe(false)
  })
  test('no code at all is not obvious; a confirmed row is not offered again', () => {
    expect(isObvious(painted('louvre', []))).toBe(false)          // a lone word is not a product
    expect(isObvious(painted('Light Sheet', []))).toBe(false)     // a product, but no code: look at it
    expect(isObvious(painted('QC5010', ['QC5010'], { confirmed: true }))).toBe(false)
  })
  test('a suggestion learned from your painting counts as the code', () => {
    const taught = { ...painted('QC5010 black', ['QC5010']), confirmed: true }
    const signals = learnedSignals([taught])
    expect(isObvious(painted('QC5011 louvre', []), {}, signals)).toBe(true)
  })
})
