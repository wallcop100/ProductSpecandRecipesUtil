import { describe, test, expect } from 'vitest'
import { proposeRecipe, proposalContext, formGroups } from '../../src/utils/recipeProposal.js'
import { roleOf } from '../../src/utils/recipePatterns.js'

const et = (ref, Family) => ({ ElementTypeRef: ref, Family })
const PTS = [
  { PositionTypeRef: 'DOWNLIGHT', IsCollection: 'Y' },
  { PositionTypeRef: 'EXTERIOR', IsCollection: 'Y' },
  { PositionTypeRef: 'A1', ParentRef: 'DOWNLIGHT', DriverLocation: 'Local to fitting' },
  { PositionTypeRef: 'A2', ParentRef: 'DOWNLIGHT', DriverLocation: 'Local to fitting' },
  { PositionTypeRef: 'X1', ParentRef: 'EXTERIOR', DriverLocation: 'Remote' },
  { PositionTypeRef: 'C1', ParentRef: 'TAPE AND PROFILE', DriverLocation: 'Remote' },
]
const ETS = [
  et('ET-PS-01', 'ET-PS'), et('ET-PS-02', 'ET-PS'), et('ET-PS-03', 'ET-PS'),
  et('ET-LIN-TAPE-01', 'ET-LIN-TAPE'), et('ET-LIN-PROF-01', 'ET-LIN-PROF'), et('ET-LIN-DIFF-01', 'ET-LIN-PROF'),
  et('ET-LIN-CAP-01', 'ET-LIN-PROF'), et('ET-LIN-CLIP-01', 'ET-LIN-CLIP'),
]
const cap = (ref, role = 'extra') => ({ elementTypeRef: ref, code: ref, role })
const state = (extra = {}) => ({
  positionTypes: PTS, elementTypes: ETS, recipes: [], containerETRefs: new Set(),
  formCaptures: { byPosition: {
    A1: [cap('ET-PS-01', 'lead')], A2: [cap('ET-PS-02', 'lead')], X1: [cap('ET-PS-03', 'lead')],
    C1: [cap('ET-LIN-TAPE-01', 'lead'), cap('ET-LIN-PROF-01'), cap('ET-LIN-DIFF-01'), cap('ET-LIN-CAP-01'), cap('ET-LIN-CLIP-01')],
  } },
  ...extra,
})
const at = (p, section) => p.rows.filter(r => r.section === section).map(r => r.role)

describe('roles', () => {
  test('connectors keep their company name; products their kind', () => {
    expect(roleOf('ET-5Pin-Socket')).toBe('5PIN-SOCKET')
    expect(roleOf('ET-2Pin-Remote-Plug')).toBe('2PIN-REMOTE-PLUG')
    expect(roleOf('ET-CCL-D-700-1CH-01')).toBe('DRIVER')
    expect(roleOf('ET-DL-04')).toBe('WRAPPER')
    expect(roleOf('ET-LIN-CAP-1009-01')).toBe('CAP')
  })
})

describe('a first recipe from the Form and precedent (shipped: 4343)', () => {
  test('local interior downlight: DL wrapper, the PS inside as design, the rest as 4343 builds it', () => {
    const p = proposeRecipe('A1', proposalContext(state()))
    expect(p.kind).toMatchObject({ wk: 'DL', dl: 'LOCAL', env: 'INT' })
    expect(at(p, 'position')).toEqual(expect.arrayContaining(['WRAPPER', '5PIN-SOCKET', '5PIN-SR']))
    expect(at(p, 'internal')).toEqual(expect.arrayContaining(['PS', 'DRIVER', '5PIN-PLUG', '2PIN-SOCKET', '2PIN-PLUG']))
    const ps = p.rows.find(r => r.role === 'PS')
    expect(ps).toMatchObject({ section: 'internal', isDesign: 'Y', ref: 'ET-PS-01', from: 'the Form' })
    // nothing in this blank project to fill the parts with: empty and flagged, never guessed
    expect(p.rows.find(r => r.role === 'DRIVER')).toMatchObject({ ref: null, missing: true })
    expect(p.wrapper).toMatchObject({ isNew: true, family: 'ET-DL' })
  })

  test('remote exterior point source: the PS straight at position level, as on 4343', () => {
    const p = proposeRecipe('X1', proposalContext(state()))
    expect(p.kind).toMatchObject({ wk: 'PS', dl: 'REMOTE', env: 'EXT' })
    expect(p.wrapper).toBeNull()
    expect(p.rows.find(r => r.role === 'PS')).toMatchObject({ section: 'position', isDesign: 'Y' })
  })

  test('linear: LIN wrapper; tape, profile, diffuser inside ×length; caps ×2; clips at position level', () => {
    const p = proposeRecipe('C1', proposalContext(state()))
    expect(p.kind.wk).toBe('LIN')
    const r = role => p.rows.find(x => x.role === role)
    expect(r('TAPE')).toMatchObject({ section: 'internal', dimQtyMultiplier: 1 })
    expect(r('DIFF')).toMatchObject({ section: 'internal', dimQtyMultiplier: 1 })
    expect(r('CAP')).toMatchObject({ section: 'internal', quantity: 2 })
    expect(r('CLIP')).toMatchObject({ section: 'position', isInteger: 'Y' })
  })

  test("this project's own parts are used first", () => {
    const recipes = [
      { PositionTypeRef: 'A9', ContextType: 'PositionType', ElementTypeRef: 'ET-5Pin-Socket', IsContractItem: 'Y' },
    ]
    const s = state({ recipes, elementTypes: [...ETS, et('ET-5Pin-Socket', 'ET-CONNECTION')] })
    const p = proposeRecipe('A1', proposalContext(s))
    expect(p.rows.find(r => r.role === '5PIN-SOCKET')).toMatchObject({ ref: 'ET-5Pin-Socket', from: 'this project' })
  })

  test('the style library fills a part this project lacks', () => {
    const lib = { exemplars: [{ ref: 'ET-5Pin-SR', family: 'ET-CONNECTION', maker: 'WAGO', code: '770-505', source: '4343' }] }
    const p = proposeRecipe('A1', proposalContext(state(), lib))
    expect(p.rows.find(r => r.role === '5PIN-SR')).toMatchObject({ ref: 'ET-5Pin-SR', from: 'projects opened before (4343)' })
  })

  test('parents are never reciped; positions group by kind and product kinds', () => {
    const ctx = proposalContext(state())
    expect(proposeRecipe('DOWNLIGHT', { ...ctx, formCaptures: { byPosition: { DOWNLIGHT: [cap('ET-PS-01', 'lead')] } } }).skip).toMatch(/parent/)
    const { groups } = formGroups(['A1', 'A2', 'X1', 'C1'], ctx)
    expect(groups.map(g => g.positions)).toEqual([['A1', 'A2'], ['X1'], ['C1']])
  })
})

describe('track', () => {
  const trackState = () => state({
    positionTypes: [...PTS,
      { PositionTypeRef: 'TRACK', IsCollection: 'Y' },
      { PositionTypeRef: 'K1', ParentRef: 'TRACK', DriverLocation: 'Remote' },
      { PositionTypeRef: 'J1', ParentRef: 'TRACK', DriverLocation: 'Remote' }],
    elementTypes: [...ETS, et('ET-TRACK-01', 'ET-TRACK'), et('ET-TRACK-PS-01', 'ET-TRACK-PS')],
    formCaptures: { byPosition: { K1: [cap('ET-TRACK-01', 'lead')], J1: [cap('ET-TRACK-PS-01', 'lead')] } },
  })

  test('a track run is the design element at position level, by length, with its LIN socket and plug (4343 K1)', () => {
    const p = proposeRecipe('K1', proposalContext(trackState()))
    expect(p.kind.wk).toBe('TRACK')
    expect(p.wrapper).toBeNull()
    expect(p.rows.find(r => r.role === 'TRACK')).toMatchObject({ section: 'position', isDesign: 'Y', dimQtyMultiplier: 1 })
    expect(at(p, 'position')).toEqual(expect.arrayContaining(['2PIN-LIN-SOCKET', '2PIN-LIN-PLUG']))
  })

  test('a fitting on track is the design element itself (4343 S1)', () => {
    const p = proposeRecipe('J1', proposalContext(trackState()))
    expect(p.kind.wk).toBe('TRACKPS')
    expect(p.rows).toEqual([expect.objectContaining({ role: 'TRACK-PS', section: 'position', isDesign: 'Y' })])
  })
})

describe('the wrapper is your call per group; precedent only sets the default', () => {
  test('a remote exterior PS can go in a DL: the PS ships inside as design; IP connectors are never proposed', () => {
    const base = proposeRecipe('X1', proposalContext(state()))
    expect(base.wrapper).toBeNull()
    const s = { ...state(), recipeChoices: { [base.signature]: { wrap: 'DL' } } }
    const p = proposeRecipe('X1', proposalContext(s))
    expect(p.signature).toBe(base.signature)                         // same group
    expect(p.wrapper).toMatchObject({ family: 'ET-DL' })
    expect(p.rows.find(r => r.role === 'PS')).toMatchObject({ section: 'internal', isDesign: 'Y' })
    expect(p.rows.some(r => /IP/.test(r.role))).toBe(false)
    expect(p.kind).toMatchObject({ wkSource: 'you', precedentWk: 'PS' })
  })

  test('each part can be flipped inside or separate', () => {
    const s0 = state({ positionTypes: [...PTS, { PositionTypeRef: 'R1', ParentRef: 'DOWNLIGHT', DriverLocation: 'Remote' }],
      formCaptures: { byPosition: { R1: [cap('ET-PS-01', 'lead')] } } })
    const base = proposeRecipe('R1', proposalContext(s0))
    const s1 = { ...s0, recipeChoices: { [base.signature]: { wrap: 'DL', place: { '2PIN-REMOTE-PLUG': 'internal' } } } }
    expect(proposeRecipe('R1', proposalContext(s1)).rows.find(r => r.role === '2PIN-REMOTE-PLUG')).toMatchObject({ section: 'internal', placedBy: 'you' })
  })

  test('a local downlight can go unwrapped: the PS is the design element at position level', () => {
    const base = proposeRecipe('A1', proposalContext(state()))
    const s = { ...state(), recipeChoices: { [base.signature]: { wrap: 'none' } } }
    const p = proposeRecipe('A1', proposalContext(s))
    expect(p.wrapper).toBeNull()
    expect(p.rows.find(r => r.role === 'PS')).toMatchObject({ section: 'position', isDesign: 'Y' })
  })
})

describe('exterior means the DesignDB says exterior', () => {
  test('in-ground and IP-rated families are interior unless the family says EXTERIOR', async () => {
    const { envOf } = await import('../../src/utils/recipePatterns.js')
    expect(envOf({ PositionTypeRef: 'G1', ParentRef: 'INGROUND' })).toBe('INT')
    expect(envOf({ PositionTypeRef: 'W1', ParentRef: 'IP65-WALL' })).toBe('INT')
    expect(envOf({ PositionTypeRef: 'X1', ParentRef: 'EXTERIOR-DOWNLIGHT' })).toBe('EXT')
    expect(envOf({ PositionTypeRef: 'Z1', ParentRef: 'TEXTURED-WALL' })).toBe('INT')
  })
})
