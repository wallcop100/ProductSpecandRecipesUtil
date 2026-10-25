import { describe, test, expect, vi, beforeEach } from 'vitest'

const contribute = vi.fn()
vi.mock('../../src/platform/companion', () => ({ getCompanion: () => Promise.resolve({ contribute }), useCompanion: () => null }))

const { codesAlike, noteCodeChange } = await import('../../src/components/Corrections')

describe('a changed code: correction or a different product (UZBVDG)', () => {
  beforeEach(() => { contribute.mockReset() })

  test('alike: a slip, a renumbering, a shared stem; not a different product', () => {
    expect(codesAlike('FPS2021ECG', 'FPS2012ECG')).toBe(true)
    expect(codesAlike('770-105', '770-205')).toBe(true)
    expect(codesAlike('20025310', '20025311')).toBe(true)
    expect(codesAlike('FPS2021ECG', 'LUM-88')).toBe(false)
  })

  test('a correction is sent; a different product is not', async () => {
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true).mockReturnValueOnce(false)
    await noteCodeChange('FPS2021ECG', 'FPS2012ECG', 'LEDFlex')
    expect(contribute).toHaveBeenCalledWith(expect.objectContaining({ kind: 'supersession', code: 'FPS2021ECG', replacement: 'FPS2012ECG', manufacturer: 'LEDFlex' }))
    await noteCodeChange('FPS2021ECG', 'FPS2022ECG', 'LEDFlex')
    expect(contribute).toHaveBeenCalledTimes(1)
  })

  test('an unlike code or a TBC asks nothing', async () => {
    const ask = vi.spyOn(window, 'confirm')
    await noteCodeChange('FPS2021ECG', 'LUM-88', 'LEDFlex')
    await noteCodeChange('TBC', 'FPS2021ECG', 'LEDFlex')
    expect(ask).not.toHaveBeenCalled()
    expect(contribute).not.toHaveBeenCalled()
  })
})
