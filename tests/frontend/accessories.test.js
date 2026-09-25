import { describe, test, expect } from 'vitest'
import { joinAccessories, isPlaceholder } from '../../src/utils/accessories.js'
import { makeRow } from '../../src/utils/productCodes.js'

describe('the Accessories column is more codes for the same position', () => {
  test('a placeholder adds nothing', () => {
    for (const p of ['-', ' - ', '', null, 'N/A', 'none', 'TBC']) expect(isPlaceholder(p)).toBe(true)
    expect(joinAccessories('QC50', '-')).toBe('QC50')
  })

  test('an accessory code is read on its own line, after the product code', () => {
    expect(joinAccessories('UN22SVDW214012G2', 'UN223DFP25241000')).toBe('UN22SVDW214012G2\nUN223DFP25241000')
  })

  test('a code already in the ProductCode cell is not read twice; its words stay', () => {
    expect(joinAccessories('7A3194.4XG + A00665.40', 'A00665.40 glare snoot')).toBe('7A3194.4XG + A00665.40\nglare snoot')
  })

  test('words only still come through, as context for the row', () => {
    expect(joinAccessories('QC50', 'Barn doors and honeycomb louvre')).toBe('QC50\nBarn doors and honeycomb louvre')
  })

  test('a row with only accessories is not dropped', () => {
    expect(joinAccessories('', 'UN22FGSLW1000')).toBe('UN22FGSLW1000')
  })

  test('the accessory becomes its own token, so it is its own code', () => {
    const row = makeRow(0, joinAccessories('UN22SVDW214012G2', 'UN223DFP25241000'))
    const words = row.tokens.map(t => t.text ?? t)
    expect(words).toContain('UN223DFP25241000')
    expect(words).toContain('UN22SVDW214012G2')
  })
})
