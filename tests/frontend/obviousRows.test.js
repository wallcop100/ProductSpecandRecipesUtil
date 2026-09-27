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
  test('two codes is not obvious', () => {
    expect(isObvious(painted('QC5010 + QC5011', ['QC5010', 'QC5011']))).toBe(false)
  })
  test('two code words side by side (one merged capture) are not obvious', () => {
    expect(isObvious(painted('QC5012 QC5013', ['QC5012', 'QC5013']))).toBe(false)
  })
  test('a stray slash beside the code does not make it doubtful', () => {
    expect(isObvious(painted('EYP-TA-R-CR-25-700 /', ['EYP-TA-R-CR-25-700', '/']))).toBe(true)
  })
  test('a second code hiding as a note is not obvious', () => {
    expect(isObvious(painted('QC5010 A00665.40', ['QC5010']))).toBe(false)
  })
  test('no code at all is not obvious; a confirmed row is not offered again', () => {
    expect(isObvious(painted('louvre', []))).toBe(false)          // a lone word is not a product
    expect(isObvious(painted('TBC', []))).toBe(false)
    expect(isObvious(painted('QC5010', ['QC5010'], { confirmed: true }))).toBe(false)
  })
  test('a suggestion learned from your painting counts as the code', () => {
    const taught = { ...painted('QC5010 black', ['QC5010']), confirmed: true }
    const signals = learnedSignals([taught])
    expect(isObvious(painted('QC5011 louvre', []), {}, signals)).toBe(true)
  })
})
