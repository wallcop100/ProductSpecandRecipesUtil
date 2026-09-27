
import { looksLikeContainer } from '../../src/utils/containerUtils.js'
describe('only a numbered DL / LIN is a wrapper by its name', () => {
  test('ET-DL-01 and ET-LIN-04 are; the parts that go inside one are not', () => {
    expect(looksLikeContainer('ET-DL-01')).toBe(true)
    expect(looksLikeContainer('ET-LIN-04')).toBe(true)
    for (const part of ['ET-LIN-CLIP-01', 'ET-LIN-TAPE-01', 'ET-LIN-PROF-01', 'ET-LIN-CAP-02', 'ET-DL-DRIVER-01']) {
      expect(looksLikeContainer(part)).toBe(false)
    }
  })
})
