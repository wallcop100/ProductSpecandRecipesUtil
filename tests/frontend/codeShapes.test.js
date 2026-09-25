import { describe, test, expect } from 'vitest'
import { shapeOf, buildShapes, matchShape } from '../../src/utils/codeShapes.js'
import shipped from '../../src/data/codeShapes.json'
import { CANON_FAMILIES, classifyText } from '../../src/data/etCanon.js'

describe('shapeOf', () => {
  test('fine keeps two letter runs, coarse one; a short leading number is a series', () => {
    expect(shapeOf('FPS2020BG2000', 'fine')).toBe('FPS9BG9')
    expect(shapeOf('FPS2020BG2000', 'coarse')).toBe('FPS9A9')
    expect(shapeOf('UN16TVC2715', 'fine')).toBe('UN9TVC9')
    expect(shapeOf('SL0240A3-260mA', 'fine')).toBe('SL9A9-9A')
    expect(shapeOf('770-252')).toBe('770-9')
    expect(shapeOf('V8356 000')).toBe('V9')
    expect(shapeOf('')).toBe('')
  })
})

describe('buildShapes', () => {
  const ex = (code, family, extra = {}) => ({ maker: 'LEDFlex', code, family, head: family, from: 'catalogue', ...extra })

  test('a shape is kept only when its examples agree', () => {
    const out = buildShapes([ex('FPS2020BG2000', 'ET-LIN-PROF'), ex('FPS1709BG2000', 'ET-LIN-PROF'), ex('FPS1616BB2000', 'ET-LIN-DIFF')])
    const fine = out.filter(s => s.level === 'fine')
    expect(fine).toEqual([expect.objectContaining({ shape: 'FPS9BG9', family: 'ET-LIN-PROF', n: 2, agree: 1 })])
  })

  test('words are not shapes; coarse shapes need 5 near-unanimous examples', () => {
    expect(buildShapes([ex('CUSTOM', 'ET-PS'), ex('CUSTOM', 'ET-PS')])).toEqual([])
    const three = buildShapes([ex('UN1A1', 'ET-LIN-MOUNT'), ex('UN2B2', 'ET-LIN-MOUNT'), ex('UN3C3', 'ET-LIN-MOUNT')])
    expect(three.filter(s => s.level === 'coarse')).toEqual([])
  })

  test('old numbering is kept on count alone, but never when a current catalogue code has the shape', () => {
    const out = buildShapes([
      ex('021-0202', 'ET-LIN-PROF', { status: 'superseded' }), ex('021-0411', 'ET-LIN-CAP', { status: 'superseded' }),
      ex('UN1030MPG1000', 'ET-LIN-MOUNT', { status: 'superseded' }), ex('UN1045MPG1000', 'ET-LIN-MOUNT', { status: 'superseded' }),
      ex('UN10FGP1414500', 'ET-LIN-MOUNT'), ex('UN16FGP1625500', 'ET-LIN-MOUNT'),
    ])
    expect(out.find(s => s.shape === '021-9' && s.status === 'superseded')).toMatchObject({ family: '' })
    expect(out.find(s => s.status === 'superseded' && s.level === 'coarse' && s.shape === 'UN9A9')).toBeUndefined()
  })
})

describe('the shipped table', () => {
  const shapes = shipped.shapes

  test('every family in it is a company family, and it holds no project data', () => {
    const canon = new Set(CANON_FAMILIES.map(f => f.ref))
    for (const s of shapes) {
      if (s.family) expect(canon.has(s.family)).toBe(true)
      expect(Object.keys(s).sort()).toEqual(['agree', 'example', 'family', 'head', 'level', 'maker', 'n', 'shape', 'status'])
    }
  })

  test('knows LEDFlex profiles from diffusers, EldoLED drivers, and old LEDFlex numbering', () => {
    expect(matchShape('FPS2020BG2000', 'LEDFlex', shapes).current).toMatchObject({ head: 'ET-LIN-PROF' })
    expect(matchShape('FPS2020PCOPD2000', 'LEDFlex', shapes).current).toMatchObject({ head: 'ET-LIN-DIFF' })
    expect(matchShape('SL0360A6-350mA', 'EldoLED', shapes).current).toMatchObject({ family: 'ET-DRIVER' })
    expect(matchShape('021-1102', 'LEDFlex', shapes).superseded).not.toBeNull()
    expect(matchShape('UN16TVC2715', 'LEDFlex', shapes).superseded).toBeNull()
  })

  test('the canon keyword order: caps and diffusers before profiles, neon profiles are mounts', () => {
    expect(classifyText('FLEX PROFILE SURFACE 1709 END CAP SET GREY')).toMatchObject({ head: 'ET-LIN-CAP' })
    expect(classifyText('FLEX PROFILE SURFACE 1709 PC SEMI CLEAR DIFFUSER')).toMatchObject({ head: 'ET-LIN-DIFF' })
    expect(classifyText('AQUA NEON 16 STANDARD PROFILE')).toMatchObject({ family: 'ET-LIN-MOUNT' })
    expect(classifyText('FLEX DRIVE 30W 24V IP20 1 CHANNEL DALI')).toMatchObject({ family: 'ET-DRIVER' })
    expect(classifyText('')).toBeNull()
  })
})
