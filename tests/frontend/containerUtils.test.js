
import { looksLikeContainer, getInternalItems, getUsedIn } from '../../src/utils/containerUtils.js'
describe('only a numbered DL / LIN is a wrapper by its name', () => {
  test('ET-DL-01 and ET-LIN-04 are; the parts that go inside one are not', () => {
    expect(looksLikeContainer('ET-DL-01')).toBe(true)
    expect(looksLikeContainer('ET-LIN-04')).toBe(true)
    for (const part of ['ET-LIN-CLIP-01', 'ET-LIN-TAPE-01', 'ET-LIN-PROF-01', 'ET-LIN-CAP-02', 'ET-DL-DRIVER-01']) {
      expect(looksLikeContainer(part)).toBe(false)
    }
  })
})

describe('ZCHMHE: deleted rows are not contents', () => {
  const recipes = [
    { ContextType: 'ElementType', ContextRef: 'ET-DL-05', ElementTypeRef: 'ET-2Pin-Remote-Plug', IsDeleted: 'Y', PositionTypeRef: 'A05' },
    { ContextType: 'ElementType', ContextRef: 'ET-DL-05', ElementTypeRef: 'ET-A05', PositionTypeRef: 'A05' },
    { ContextType: 'PositionType', ContextRef: 'A06', ElementTypeRef: 'ET-2Pin-Remote-Plug', IsDeleted: 'Y', PositionTypeRef: 'A06' },
  ]
  test('the card lists what Edit internals lists', () => {
    expect(getInternalItems('ET-DL-05', recipes).map(i => i.ref)).toEqual(['ET-A05'])
  })
  test('a deleted row is not a use', () => {
    expect(getUsedIn('ET-2Pin-Remote-Plug', recipes, 'X')).toEqual([])
  })
})
