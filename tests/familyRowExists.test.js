import { describe, it, expect } from 'vitest'
import { familyRowExists } from '../src/utils/collectionGuess'

describe('familyRowExists (report #59)', () => {
  it('finds a family row held only in the DesignDB collection_refs', () => {
    expect(familyRowExists(' et-ps ', [], ['ET-PS'])).toBe(true)
  })
  it('finds a family row among the ElementTypes', () => {
    expect(familyRowExists('ET-DL', [{ ElementTypeRef: 'et-dl' }], [])).toBe(true)
  })
  it('is false when neither has it, or the family is blank', () => {
    expect(familyRowExists('ET-X', [{ ElementTypeRef: 'ET-Y' }], ['ET-Z'])).toBe(false)
    expect(familyRowExists('  ', [], [])).toBe(false)
  })
})
