import { describe, test, expect } from 'vitest'
import { makeRow } from '../../src/utils/productCodes.js'
import { applyRules, prePaint, setRule } from '../../src/utils/codeLearning.js'
import { applyKnownCodes } from '../../src/utils/knownCodes.js'
import { proposeElementTypes } from '../../src/utils/etSeed.js'

const ready = (text, opts) => applyRules([makeRow(0, text, opts)], {})[0]

describe('pre-selection', () => {
  test('confident guesses start painted, in their own layer', () => {
    const row = applyRules([prePaint(ready('Palco QC50 with louvre'))], {})[0]
    expect(row.roles[1]).toBe('code')
    expect(row.pre).toEqual({ 1: 'code' })
    expect(row.overrides?.[1]).toBeUndefined()
  })

  test('a taught rule and your own paint both beat a pre-selection', () => {
    const row = prePaint(ready('Palco QC50 with louvre'))
    expect(applyRules([row], setRule({}, 'QC50', 'note'))[0].roles[1]).toBe('note')
    expect(applyRules([{ ...row, overrides: { 1: 'discard' } }], {})[0].roles[1]).toBe('discard')
  })

  test('placeholders and plain words are never pre-selected', () => {
    expect(prePaint(ready('TBC by specialist')).pre).toBeUndefined()
  })
})

describe('codes known from earlier projects', () => {
  const library = [{ maker: 'Phos', code: 'EYP-TA-R-CR', ref: 'ET-PS-EYP-01', family: 'ET-PS', name: 'Eyeconic Pro', description: 'Trimless downlight', source: '5224' }]

  test('are painted like spec codes, and counted apart', () => {
    const { rows, exactCount, libraryCount } = applyKnownCodes([makeRow(0, 'EYP-TA-R-CR white', { manufacturer: 'Phos' })], [], library)
    expect(exactCount).toBe(1)
    expect(libraryCount).toBe(1)
    expect(rows[0].overrides[0]).toBe('code')
  })

  test('only for the same maker', () => {
    const { exactCount } = applyKnownCodes([makeRow(0, 'EYP-TA-R-CR', { manufacturer: 'Orluna' })], [], library)
    expect(exactCount).toBe(0)
  })

  test('bring their ElementType: family, ref, name and description', () => {
    const { proposals } = proposeElementTypes([{ text: 'EYP-TA-R-CR', manufacturers: ['Phos'], positionTypes: [], variants: [{ note: '' }] }], { library })
    expect(proposals[0]).toMatchObject({ family: 'ET-PS', ref: 'ET-PS-EYP-01', name: 'Eyeconic Pro', description: 'Trimless downlight', why: 'library' })
  })

  test('take a fresh ref when this project already uses that one', () => {
    const { proposals } = proposeElementTypes([{ text: 'EYP-TA-R-CR', manufacturers: ['Phos'], positionTypes: [], variants: [{ note: '' }] }],
      { library, elementTypes: [{ ElementTypeRef: 'ET-PS-EYP-01', Family: 'ET-PS' }] })
    expect(proposals[0].ref).not.toBe('ET-PS-EYP-01')
    expect(proposals[0].family).toBe('ET-PS')
  })
})

test("this project's own ElementTypes win over an earlier project's", () => {
  const library = [{ maker: 'Phos', code: 'EYP-TA-R-CR-20', ref: 'ET-DL-EYP-01', family: 'ET-DL', name: 'Other job', description: '', source: '5224' }]
  const { proposals } = proposeElementTypes(
    [{ text: 'EYP-TA-R-CR-20', manufacturers: ['Phos'], positionTypes: [], variants: [{ note: '' }] }],
    { library, elementTypes: [{ ElementTypeRef: 'ET-PS-07', Family: 'ET-PS' }],
      psRows: [{ ElementTypeRef: 'ET-PS-07', ProductCode: 'EYP-TA-R-CR-25', Manufacturer: 'Phos' }] })
  expect(proposals[0].family).toBe('ET-PS')
  expect(proposals[0].why).toBe('stem')
  expect(proposals[0].name).not.toBe('Other job')
})
