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

import { accessoriesFrom, leadOf } from '../../src/utils/accessories.js'
import { deriveCaptures } from '../../src/utils/productCodes.js'

describe('the main product of a cell', () => {
  const paint = (row, words) => ({ ...row, roles: row.tokens.map(t => (words.includes(t.text) ? 'code' : 'note')) })

  test('accessories start after the product code', () => {
    expect(accessoriesFrom('QC50', 'QC50\nUN22')).toBe(5)
    expect(accessoriesFrom('QC50', 'QC50')).toBeNull()
    expect(accessoriesFrom('', 'UN22')).toBe(0)
  })

  test('the ProductCode cell leads; accessories are extras even when painted first', () => {
    const joined = joinAccessories('UN22SVDW214012G2', 'UN223DFP25241000')
    const row = paint({ ...makeRow(0, joined), accFrom: accessoriesFrom('UN22SVDW214012G2', joined) }, ['UN22SVDW214012G2', 'UN223DFP25241000'])
    expect(leadOf(row, deriveCaptures(row).captures).code).toBe('UN22SVDW214012G2')
  })

  test('a chosen main code wins', () => {
    const joined = joinAccessories('A1', 'B2')
    const row = { ...paint(makeRow(0, joined), ['A1', 'B2']), accFrom: 3, leadCode: 'B2' }
    expect(leadOf(row, deriveCaptures(row).captures).code).toBe('B2')
  })
})

describe('notes stay on their side of the Accessories boundary', () => {
  const paint = (row, words) => ({ ...row, roles: row.tokens.map(t => (words.includes(t.text) ? 'code' : 'note')) })

  test('accessories prose never lands on the main code', () => {
    const joined = joinAccessories('CTM209TW5091', 'Fixing clips')
    const row = paint({ ...makeRow(0, joined), accFrom: accessoriesFrom('CTM209TW5091', joined) }, ['CTM209TW5091'])
    const { captures, unattachedNote } = deriveCaptures(row)
    expect(captures[0].note).toBe('')
    expect(unattachedNote).toBe('Fixing clips')
  })

  test('accessories prose attaches to an accessory code', () => {
    const joined = joinAccessories('QC50', 'glare shield GS70')
    const row = paint({ ...makeRow(0, joined), accFrom: accessoriesFrom('QC50', joined) }, ['QC50', 'GS70'])
    const caps = deriveCaptures(row).captures
    expect(caps.find(c => c.code === 'GS70').note).toBe('glare shield')
    expect(caps.find(c => c.code === 'QC50').note).toBe('')
  })
})
