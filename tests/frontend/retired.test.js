import { describe, it, expect } from 'vitest'
import { fitsRecipe } from '../../src/platform/retired'

const options = ['FPR2309PMOPD2000', 'FPS1709PMOPD2000', 'FPS1715PMOPD2000'].map(code => ({ code }))
const recipes = [
  { PositionTypeRef: 'C01r', ElementTypeRef: 'ET-DIFF-01' },
  { PositionTypeRef: 'C01r', ElementTypeRef: 'ET-PROF-01' },
  { PositionTypeRef: 'C02', ElementTypeRef: 'ET-PROF-02' },
]
const psRows = [
  { ElementTypeRef: 'ET-DIFF-01', ProductCode: '022-0102' },
  { ElementTypeRef: 'ET-PROF-01', ProductCode: 'FPS1709-BG2000' },
  { ElementTypeRef: 'ET-PROF-02', ProductCode: 'FPS1715BG2000' },
]

describe('fitsRecipe', () => {
  it('picks the successor that matches the profile beside it, ignoring separators', () => {
    expect(fitsRecipe(options, 'ET-DIFF-01', recipes, psRows)).toEqual({ code: 'FPS1709PMOPD2000', with: 'FPS1709-BG2000' })
  })
  it('is null when only a range matches, or two tie', () => {
    expect(fitsRecipe(options, 'ET-DIFF-01', recipes, psRows.map(r => r.ElementTypeRef === 'ET-PROF-01' ? { ...r, ProductCode: 'FPS1BG' } : r))).toBeNull()
    expect(fitsRecipe([{ code: 'FPS1709X' }, { code: 'FPS1709Y' }], 'ET-DIFF-01', recipes, psRows)).toBeNull()
  })
  it('ignores positions that do not use it', () => {
    expect(fitsRecipe(options, 'ET-NONE', recipes, psRows)).toBeNull()
  })
})
