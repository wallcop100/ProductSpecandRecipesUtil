import { describe, test, expect } from 'vitest'
import {
  proposeElementTypes, pickFamily, familyRefFor, familyDescription, nextRef, refamily, seedName, ACCESSORIES,
} from '../../src/utils/etSeed.js'

// Shaped like 5452 early on: only cable and driver families, and Phos already has a DRIVER.
const ETS = [
  { ElementTypeRef: 'LC1', Name: 'DMX Data', Family: 'ET-CABLES' },
  { ElementTypeRef: 'ET-CCR-L-1050-1CH-01', Name: 'Phos - INF105006D', Family: 'ET-REMOTE-DRIVERS' },
  { ElementTypeRef: 'ET-CCR-D-180-1CH-01', Name: 'EldoLED - SoloDrive 360/A', Family: 'ET-REMOTE-DRIVERS' },
]
const PS = [
  { ElementTypeRef: 'ET-CCR-L-1050-1CH-01', Manufacturer: 'Phos', ProductCode: 'INF105006D' },
  { ElementTypeRef: 'ET-CCR-D-180-1CH-01', Manufacturer: 'EldoLED', ProductCode: 'SOLODRIVE360A' },
]
const PTS = [
  { PositionTypeRef: 'A1b', ParentRef: 'DOWNLIGHT' },
  { PositionTypeRef: 'A2a', ParentRef: 'DOWNLIGHT' },
  { PositionTypeRef: 'W1', ParentRef: 'WALL-LIGHT' },
  { PositionTypeRef: 'Z1', ParentRef: 'FF&E' },
]
const COLL = ['ET-CABLES', 'ET-DRIVERS', 'ET-REMOTE-DRIVERS']
const entry = (text, maker, pts = [], extra = {}) => ({ text, manufacturers: [maker], positionTypes: pts, variants: [{ note: '' }], rowRefs: [], ...extra })
const base = { elementTypes: ETS, psRows: PS, positionTypes: PTS, collectionRefs: COLL }

describe('an early project: company families, from the Form and the shape table', () => {
  const point = { ...base, pageTypeFor: () => 'Point' }
  const linear = { ...base, pageTypeFor: () => 'Linear' }

  test('a Phos downlight on a Point page is ET-PS, not a remote driver because Phos makes a driver', () => {
    const { proposals, newFamilies } = proposeElementTypes([entry('EYP-TA-R-CR-WT', 'Phos', ['A1b'])], point)
    expect(proposals[0]).toMatchObject({ family: 'ET-PS', ref: 'ET-PS-01', why: 'canon', checkRef: false, name: 'Phos - EYP-TA-R-CR-WT' })
    expect(newFamilies).toEqual([{ ref: 'ET-PS', description: 'Point Source Family', parent: null, include: true, from: null }])
  })

  test('the other codes in a Point cell are point-source accessories, unless their words say more', () => {
    const acc = proposeElementTypes([entry('A00665.40', 'DGA', ['W1'])], { ...point, roleOf: () => 'extra' })
    expect(acc.proposals[0]).toMatchObject({ family: ACCESSORIES, ref: 'ET-PS-ACCESSORIES-01', why: 'canon' })
    const frame = proposeElementTypes([entry('FR-1', 'DGA', ['W1'])], { ...point, roleOf: () => 'extra', contextFor: () => 'Plaster-in frame' })
    expect(frame.proposals[0]).toMatchObject({ family: 'ET-PS-MOUNTING-FRAME', why: 'canon' })
    // …and a missing parent family is proposed with it
    expect(frame.newFamilies.map(f => f.ref)).toEqual(['ET-PS-MOUNTING-FRAME', 'ET-PS-MOUNTING'])
  })

  test('a Linear page files by keyword; the ref carries the keyword even under a shared family', () => {
    const { proposals, newFamilies } = proposeElementTypes([entry('X-DIFF', 'Acme', ['W1'])], { ...linear, contextFor: () => 'Opal diffuser 2m' })
    expect(proposals[0]).toMatchObject({ family: 'ET-LIN-PROF', ref: 'ET-LIN-DIFF-01', why: 'canon' })
    expect(newFamilies.map(f => f.ref)).toEqual(['ET-LIN-PROF', 'ET-LIN-INGREDIENTS'])
  })

  test('a Linear page with no keyword falls to ET-LIN-INGREDIENTS and is flagged', () => {
    const { proposals } = proposeElementTypes([entry('X-1', 'Acme', ['W1'])], linear)
    expect(proposals[0]).toMatchObject({ family: 'ET-LIN-INGREDIENTS', checkRef: true })
  })

  test('the shipped shape table knows a maker\'s code shapes', () => {
    const { proposals } = proposeElementTypes([entry('FPS2020PCOPD2000', 'LEDFlex', ['W1'])], base)
    expect(proposals[0]).toMatchObject({ family: 'ET-LIN-PROF', ref: 'ET-LIN-DIFF-01', why: 'shape' })
  })

  test('old supplier numbering is flagged', () => {
    const { proposals } = proposeElementTypes([entry('021-1102', 'LEDFlex', ['W1'])], linear)
    expect(proposals[0].superseded).toMatchObject({ shape: '021-9' })
  })

  test('with no Form page type, the position parent is a flagged last resort', () => {
    const { proposals, newFamilies } = proposeElementTypes([entry('EYP-TA-R-CR-WT', 'Phos', ['A1b'])], base)
    expect(proposals[0]).toMatchObject({ family: 'ET-DOWNLIGHT', why: 'parent', checkRef: true })
    expect(newFamilies[0]).toMatchObject({ ref: 'ET-DOWNLIGHT', description: 'Downlight family' })
  })

  test('the same product line wins: a stem-sharing code joins its sibling\'s family', () => {
    const { proposals, newFamilies } = proposeElementTypes([entry('INF105008D', 'Phos', ['A1b'])], base)
    expect(proposals[0]).toMatchObject({ family: 'ET-REMOTE-DRIVERS', why: 'stem' })
    expect(newFamilies).toEqual([])   // an existing family is never proposed as new
  })

  test('once recipes exist, the position\'s design element family wins over the parent', () => {
    const recipes = [{ PositionTypeRef: 'A1b', ElementTypeRef: 'LC1', IsDesign: 'Y' }]
    const { proposals } = proposeElementTypes([entry('NEW-1', 'Acme', ['A1b'])], { ...base, recipes })
    expect(proposals[0]).toMatchObject({ family: 'ET-CABLES', why: 'design' })
  })

  test('a Form ref resolves through ptTarget before its parent is read', () => {
    const { proposals } = proposeElementTypes([entry('X-1', 'Acme', ['C01'])], { ...base, ptTarget: r => (r === 'C01' ? 'W1' : r) })
    expect(proposals[0].family).toBe('ET-WALL-LIGHT')
  })

  test('mixed parents: the most common wins, and the spread is reported', () => {
    const { proposals } = proposeElementTypes([entry('X-1', 'Acme', ['A1b', 'A2a', 'W1'])], base)
    expect(proposals[0]).toMatchObject({ family: 'ET-DOWNLIGHT', spread: 2 })
  })

  test('no parent (a PositionType missing from the DB) → no family, never a guess', () => {
    const { proposals, newFamilies } = proposeElementTypes([entry('X-1', 'Phos', ['XB1b'])], base)
    expect(proposals[0]).toMatchObject({ family: '', ref: '', why: null })
    expect(newFamilies).toEqual([])
  })

  test('N/A and TBC are skipped, not proposed', () => {
    const { proposals } = proposeElementTypes([entry('n/a', 'Feed TBC', ['A1b'])], base)
    expect(proposals[0]).toMatchObject({ action: 'skip', include: false, ref: '' })
  })

  test('a known product is a reuse, and proposes no family', () => {
    const { proposals, newFamilies } = proposeElementTypes(
      [entry('EYP-1', 'Phos', ['A1b'], { reuse: [{ ref: 'ET-X-01', kind: 'same' }] })], base)
    expect(proposals[0]).toMatchObject({ action: 'reuse', reuseRef: 'ET-X-01', ref: '', family: '' })
    expect(newFamilies).toEqual([])
  })

  test('refs never collide within a batch', () => {
    const { proposals } = proposeElementTypes([entry('X-1', 'Acme', ['A1b']), entry('X-2', 'Acme', ['A2a'])], base)
    expect(proposals.map(p => p.ref)).toEqual(['ET-DOWNLIGHT-01', 'ET-DOWNLIGHT-02'])
  })
})

describe('helpers', () => {
  test('family refs and descriptions from a parent name', () => {
    expect(familyRefFor('SURFACE MOUNTED POINT SOURCE')).toBe('ET-SURFACE-MOUNTED-POINT-SOURCE')
    expect(familyRefFor('FF&E')).toBe('ET-FF-E')
    expect(familyRefFor('')).toBe('')
    expect(familyDescription('LINEAR-JOINERY')).toBe('Linear joinery family')
    expect(familyDescription('FF&E')).toBe('FF&E family')
  })

  test('pickFamily with nothing to go on', () => {
    expect(pickFamily({ code: 'X', manufacturer: '', role: 'lead', designFamilies: [], parents: [] }, { products: [] }))
      .toEqual({ family: '', head: '', why: null, flag: false, spread: 0 })
  })

  test('nextRef, seedName, refamily', () => {
    expect(nextRef('ET-PS', ['ET-PS-01', 'ET-PS-9', 'ET-PSX-50'])).toBe('ET-PS-10')
    expect(seedName('', 'ABC')).toBe('ABC')
    const { proposals } = proposeElementTypes([entry('X-1', 'Acme', ['A1b']), entry('X-2', 'Acme', ['A1b'])], base)
    const moved = refamily(proposals, [0, 1], 'ET-TRACK', ETS)
    expect(moved.map(p => p.ref)).toEqual(['ET-TRACK-01', 'ET-TRACK-02'])
    expect(moved[0].why).toBe('you')
  })
})

describe('the tool-wide style library', () => {
  const library = [{ maker: 'LEDFlex', code: 'NFS160-27-2009', ref: 'ET-LIN-TAPE-NANO160-01', family: 'ET-LIN-TAPE', name: '', description: '', source: 'P2' }]

  test('a product line seen on another project is named the same way, before the Form rules', () => {
    const { proposals, newFamilies } = proposeElementTypes([entry('NFS160-27-5404', 'LEDFlex', ['A1b'])], { ...base, library })
    expect(proposals[0]).toMatchObject({
      family: 'ET-LIN-TAPE', ref: 'ET-LIN-TAPE-NANO160-01', why: 'style', checkRef: false,
      styledOn: { ref: 'ET-LIN-TAPE-NANO160-01', code: 'NFS160-27-2009', source: 'P2' },
    })
    expect(newFamilies.map(f => f.ref)).toEqual(['ET-LIN-TAPE', 'ET-LIN-INGREDIENTS'])   // with its canon parent
  })

  test('this project\'s own product line still wins over the library', () => {
    const lib = [{ maker: 'Phos', code: 'INF105006D', ref: 'ET-ELSEWHERE-01', family: 'ET-ELSEWHERE', name: '', description: '', source: 'P9' }]
    const { proposals } = proposeElementTypes([entry('INF105008D', 'Phos', ['A1b'])], { ...base, library: lib })
    expect(proposals[0]).toMatchObject({ family: 'ET-REMOTE-DRIVERS', why: 'stem' })
  })
})

describe('the code beats the description', () => {
  test('LEDFlex NFS tape with "profile" in its note is still tape', async () => {
    const shipped = (await import('../../src/data/codeShapes.json')).default
    const r = pickFamily({ code: 'NFS240272009', manufacturer: 'LEDFlex', text: 'LED tape in aluminium profile', pageType: 'linear', role: 'lead' },
      { shapes: shipped.shapes || shipped })
    expect(r.family).toBe('ET-LIN-TAPE')
  })
  test('a description naming two kinds of product is flagged', () => {
    const r = pickFamily({ code: 'ZZ1', manufacturer: 'Nobody', text: 'LED tape in aluminium profile', pageType: 'linear', role: 'lead' }, {})
    expect(r.flag).toBe(true)
  })
})

describe('families from words and old shapes', () => {
  test('a rail is a mount; a casing is point mounting; a louvre is an accessory', () => {
    expect(pickFamily({ code: 'A4431', text: 'aluminium rail', pageType: 'linear' }, {}).family).toBe('ET-LIN-MOUNT')
    expect(pickFamily({ code: 'WC4020', text: 'Outer casing', pageType: 'point', role: 'extra' }, {}).family).toBe('ET-PS-MOUNTING')
    expect(pickFamily({ code: 'AR413', text: 'Hex Louvre', pageType: 'point', role: 'extra' }, {}).family).toBe('ET-PS-ACCESSORIES')
  })
  test('a superseded shape still names the kind of product', () => {
    const shapes = [{ maker: 'LEDFlex', shape: 'UN9FGSLW9', level: 'fine', family: 'ET-LIN-MOUNT', head: 'ET-LIN-MOUNT', status: 'superseded' }]
    expect(pickFamily({ code: 'UN22FGSLW1000', manufacturer: 'LEDFlex', text: 'ULTIMO NEON 22', pageType: 'linear' }, { shapes }).family).toBe('ET-LIN-MOUNT')
  })
})

test('a researched product line files its main code; its extras keep their own words', () => {
  expect(pickFamily({ code: 'A4331.7.927.IP67.DALI', manufacturer: 'Atea', text: 'Neo Top Mini', pageType: 'linear' }, {}).family).toBe('ET-LIN-FLEX')
  expect(pickFamily({ code: 'G4961000-9527RD0010', manufacturer: 'Forma Lighting', text: 'Microline 7x5 Dotless', pageType: 'linear' }, {}).family).toBe('ET-LIN-FIXED')
  expect(pickFamily({ code: 'A4331.FS', manufacturer: 'Atea', text: 'Neo 3D Wall Washer Fixing set Wall Brackets', pageType: 'linear', role: 'extra' }, {}).family).toBe('ET-LIN-MOUNT')
  expect(pickFamily({ code: 'X1234', manufacturer: 'Atea', text: 'something else', pageType: 'linear' }, {}).family).toBe('ET-LIN-INGREDIENTS')
})

describe('track families', () => {
  test('on a track position: the track itself is ET-TRACK, a fitting on it ET-TRACK-PS — before code shapes', () => {
    const shapes = [{ maker: 'Flos', shape: '05.9.9ADA', level: 'fine', family: 'ET-PS', head: 'ET-PS', status: 'current' }]
    expect(pickFamily({ code: '05.5171.14ADA', manufacturer: 'Flos', text: 'Light Shadow Spot', pageType: 'point', parents: ['TRACK'] }, { shapes }).family).toBe('ET-TRACK-PS')
    expect(pickFamily({ code: 'TRA-9500', manufacturer: 'Phos', text: 'DecoTrack MS Evo Track', pageType: 'linear', parents: ['TRACK'] }, {}).family).toBe('ET-TRACK')
  })
  test('"track" in the text files as ET-TRACK anywhere; a mounting track stays a linear mount', () => {
    expect(pickFamily({ code: 'X1', text: 'DecoTrack MS Evo Track', pageType: 'linear' }, {}).family).toBe('ET-TRACK')
    expect(pickFamily({ code: 'X2', text: 'mounting track', pageType: 'linear', role: 'extra' }, {}).family).toBe('ET-LIN-MOUNT')
  })
})

describe('never a wrapper family, and extras are not the luminaire', () => {
  const ETS2 = [
    ...ETS,
    { ElementTypeRef: 'ET-DL-01', Family: 'ET-DL' },
    { ElementTypeRef: 'ET-PS-01', Family: 'ET-PS' },
  ]
  const PS2 = [...PS, { ElementTypeRef: 'ET-PS-01', Manufacturer: 'DGA', ProductCode: 'DL-100' }]
  // A1b is built: ET-DL-01 at position level (design), ET-PS-01 inside it (design).
  const RECIPES = [
    { PositionTypeRef: 'A1b', ContextType: 'PositionType', ContextRef: 'A1b', ElementTypeRef: 'ET-DL-01', IsDesign: 'Y' },
    { PositionTypeRef: 'A1b', ContextType: 'ElementType', ContextRef: 'ET-DL-01', ElementTypeRef: 'ET-PS-01', IsDesign: 'Y' },
  ]
  const proj = { ...base, elementTypes: ETS2, psRows: PS2, recipes: RECIPES, collectionRefs: [...COLL, 'ET-DL', 'ET-PS'] }

  test('a new luminaire on a position built in a DL is filed by the PS inside, not ET-DL', () => {
    const { proposals } = proposeElementTypes([entry('XYZ-9', 'Other', ['A1b'])], proj)
    expect(proposals[0].family).toBe('ET-PS')
  })

  test('an extra on that position is not the luminaire', () => {
    const { proposals } = proposeElementTypes([entry('LV-9', 'Other', ['A1b'])], { ...proj, pageTypeFor: () => 'Point', roleOf: () => 'extra' })
    expect(proposals[0].family).toBe(ACCESSORIES)
  })

  test('an extra sharing the luminaire\'s stem is not filed with it', () => {
    const { proposals } = proposeElementTypes([entry('DL-100-FR', 'DGA', ['W1'], { variants: [{ note: 'frame' }] })],
      { ...proj, recipes: [], pageTypeFor: () => 'Point', roleOf: () => 'extra' })
    expect(proposals[0].family).toBe('ET-PS-MOUNTING-FRAME')
  })

  test('a frame on a row of its own is still a frame', () => {
    const { proposals } = proposeElementTypes([entry('FR-2', 'DGA', ['W1'])],
      { ...base, pageTypeFor: () => 'Point', contextFor: () => 'Plaster-in frame' })
    expect(proposals[0].family).toBe('ET-PS-MOUNTING-FRAME')
    const lum = proposeElementTypes([entry('DL-2', 'DGA', ['W1'])],
      { ...base, pageTypeFor: () => 'Point', contextFor: () => 'Downlight with plaster-in frame' })
    expect(lum.proposals[0].family).toBe('ET-PS')
  })

  test('a library match in ET-DL is not taken', () => {
    const library = [{ code: 'Q-1', maker: 'Other', family: 'ET-DL', ref: 'ET-DL-07', source: 'x' }]
    const { proposals } = proposeElementTypes([entry('Q-1', 'Other', ['W1'])], { ...base, library })
    expect(proposals[0].family).not.toBe('ET-DL')
  })
})

describe('planFamilyMove', () => {
  test('numbers after what the family already has; members and collection rows keep their refs', async () => {
    const { planFamilyMove } = await import('../../src/utils/etSeed.js')
    const ets = [
      { ElementTypeRef: 'ET-PS-ACCESSORIES', IsCollection: 'Y' },
      { ElementTypeRef: 'ET-PS-ACCESSORIES-04', Family: 'ET-PS-ACCESSORIES' },
      { ElementTypeRef: 'ET-PS-05', Family: 'ET-PS' },
      { ElementTypeRef: 'ET-PS-06', Family: 'ET-PS' },
    ]
    const { moves, newFamilies } = planFamilyMove(['ET-PS-05', 'ET-PS-06', 'ET-PS-ACCESSORIES-04'], 'ET-PS-ACCESSORIES', ets)
    expect(moves.map(m => m.to)).toEqual(['ET-PS-ACCESSORIES-05', 'ET-PS-ACCESSORIES-06', 'ET-PS-ACCESSORIES-04'])
    expect(newFamilies).toEqual([])
  })
})
