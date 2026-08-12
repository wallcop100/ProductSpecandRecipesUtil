import { describe, test, expect } from 'vitest'
import { deadPositionRefs, retirableElementTypes } from '../../src/utils/deadPositions.js'

// Recipe-row helpers ---------------------------------------------------------
const pos = (posRef, etRef, extra = {}) => ({
  _id: `${posRef}:${etRef}`, PositionTypeRef: posRef, ContextType: 'PositionType',
  ContextRef: posRef, ElementTypeRef: etRef, ...extra,
})
const inside = (posRef, container, etRef) => ({
  _id: `${posRef}:${container}:${etRef}`, PositionTypeRef: posRef, ContextType: 'ElementType',
  ContextRef: container, ElementTypeRef: etRef,
})

describe('deadPositionRefs — the two signals, in recipe space', () => {
  // The Form says C02; the DesignDB row C02r claims it via ExtRef, and that is where the
  // recipe lives. Positions.TypeRef is the same recipe ref.
  const positionTypes = [
    { Ref: 'C01r', ExtRef: 'C01' },
    { Ref: 'C02r', ExtRef: 'C02' },
    { Ref: 'D07r', ExtRef: 'D07' },
  ]
  const recipes = [pos('C01r', 'ET-A'), pos('C02r', 'ET-B'), pos('D07r', 'ET-C')]

  test('ExcludeFromOutput resolves through ExtRef, not by naive name-match', () => {
    const dead = deadPositionRefs({
      recipes,
      positions: [{ TypeRef: 'C01r' }, { TypeRef: 'C02r' }, { TypeRef: 'D07r' }],
      positionTypes,
      formCaptures: { excludedFormRefs: ['C02'] },   // the BARE Form ref
    })
    expect(dead.has('c02r')).toBe(true)    // resolved to the recipe ref
    expect(dead.has('c02')).toBe(false)
    expect(dead.has('c01r')).toBe(false)
  })

  test('a position with no placed instance is dead', () => {
    const dead = deadPositionRefs({
      recipes,
      positions: [{ TypeRef: 'C01r' }, { TypeRef: 'C02r' }],   // D07r never placed
      positionTypes,
      formCaptures: null,
    })
    expect(dead.has('d07r')).toBe(true)
    expect(dead.has('c01r')).toBe(false)
  })

  // The catastrophic case: an older DesignDB with no Positions sheet must NOT flag everything.
  test('no Positions data → the zero-instance signal does not fire', () => {
    const dead = deadPositionRefs({ recipes, positions: [], positionTypes, formCaptures: null })
    expect(dead.size).toBe(0)
  })

  test('both signals combine; only recipe-bearing positions are considered', () => {
    const dead = deadPositionRefs({
      recipes,
      positions: [{ TypeRef: 'C01r' }],                    // C02r, D07r unplaced
      positionTypes,
      formCaptures: { excludedFormRefs: ['C01'] },         // C01r excluded too
    })
    expect([...dead].sort()).toEqual(['c01r', 'c02r', 'd07r'])
  })
})

describe('retirableElementTypes — solely-dead only', () => {
  test('an ET used only by a dead position is retirable; row ids and positions reported', () => {
    const recipes = [pos('DEAD', 'ET-ONLY'), pos('LIVE', 'ET-LIVE')]
    const out = retirableElementTypes({ recipes, deadRefs: new Set(['dead']) })
    expect(out).toHaveLength(1)
    expect(out[0].ref).toBe('ET-ONLY')
    expect(out[0].rsRowIds).toEqual(['DEAD:ET-ONLY'])
    expect(out[0].onlyIn).toEqual(['DEAD'])
  })

  test('an ET a LIVE position also uses is kept, even when a dead one uses it', () => {
    const recipes = [pos('DEAD', 'ET-SHARED'), pos('LIVE', 'ET-SHARED')]
    const out = retirableElementTypes({ recipes, deadRefs: new Set(['dead']) })
    expect(out).toHaveLength(0)
  })

  test('a wrapper and its internals retire together — only when the whole subtree is dead', () => {
    const recipes = [
      pos('DEAD', 'WRAP', { IsDesign: 'Y' }),
      inside('DEAD', 'WRAP', 'ET-TAPE'),
      inside('DEAD', 'WRAP', 'ET-PLUG'),
    ]
    const out = retirableElementTypes({ recipes, deadRefs: new Set(['dead']) })
    expect(out.map(o => o.ref).sort()).toEqual(['ET-PLUG', 'ET-TAPE', 'WRAP'])
  })

  test('an internal shared into a LIVE wrapper survives its dead wrapper', () => {
    const recipes = [
      pos('DEAD', 'WRAP-D', { IsDesign: 'Y' }),
      inside('DEAD', 'WRAP-D', 'ET-PLUG'),   // also lives in a live wrapper below
      pos('LIVE', 'WRAP-L', { IsDesign: 'Y' }),
      inside('LIVE', 'WRAP-L', 'ET-PLUG'),
    ]
    const out = retirableElementTypes({ recipes, deadRefs: new Set(['dead']) })
    // WRAP-D retires; ET-PLUG is kept because WRAP-L (live) holds it.
    expect(out.map(o => o.ref)).toEqual(['WRAP-D'])
  })

  test('nothing dead → nothing retirable', () => {
    const recipes = [pos('LIVE', 'ET-A')]
    expect(retirableElementTypes({ recipes, deadRefs: new Set() })).toEqual([])
  })
})
