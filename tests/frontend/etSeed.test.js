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
