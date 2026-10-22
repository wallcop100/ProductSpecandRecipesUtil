import { describe, it, expect } from 'vitest'
import { positionMakeup, sameKindAs, matchKind, usuallyMissing, elementTypesForJob, sectionFor, rowFromSlot, powerOf } from '../../src/utils/recipeKinds'

const row = (pos, ref, ctx = 'PositionType', extra = {}) => ({
  PositionTypeRef: pos, ContextType: ctx, ContextRef: ctx === 'PositionType' ? pos : 'ET-LIN-01', ElementTypeRef: ref, ...extra })
const state = {
  positionTypes: ['C01r', 'C03r', 'C05r'].map(r => ({ PositionTypeRef: r, DriverLocation: 'Remote', SecondaryPowerType: 'CV' })),
  elementTypes: [
    { ElementTypeRef: 'ET-LIN-01', Family: 'ET-LIN' }, { ElementTypeRef: 'ET-LIN-TAPE-01', Family: 'ET-LIN-TAPE' },
    { ElementTypeRef: 'ET-LIN-PROF-01', Family: 'ET-LIN-PROF' }, { ElementTypeRef: 'ET-LIN-CAP-01', Family: 'ET-LIN-PROF' },
    { ElementTypeRef: 'ET-LIN-DIFF-01', Family: 'ET-LIN-PROF' },
  ],
  psRows: [{ ElementTypeRef: 'ET-LIN-PROF-01', Manufacturer: 'LEDFlex', ProductCode: '021-8810-02' }],
  recipes: [
    ...['C01r', 'C03r', 'C05r'].flatMap(p => [row(p, 'ET-LIN-01', 'PositionType', { IsDesign: 'Y' }),
      row(p, 'ET-LIN-TAPE-01', 'ElementType'), row(p, 'ET-LIN-PROF-01', 'ElementType')]),
    row('C01r', 'ET-LIN-CAP-01', 'ElementType'), row('C03r', 'ET-LIN-CAP-01', 'ElementType'),
    row('C01r', 'ET-2Pin-LIN-Socket'),
  ],
}
const KIND = { id: 2, name: 'Linear tape in profile — remote CV', design: 'LIN', driver: 'remote', secondary: 'CV', projects: 16,
  defining: ['PROFILE', 'TAPE:tape'],
  slots: [{ slot: 'PROFILE', core: true, share: 1 }, { slot: 'TAPE:tape', core: true, share: 1 },
    { slot: 'END_CAPS', core: false, share: 0.96, section: 'lin_internal', qty: 2, contract: 1, integer: 0 },
    { slot: 'DIFFUSER', core: false, share: 0.96, section: 'lin_internal', dim: 1, contract: 1, integer: 0 },
    { slot: 'CLIPS', core: false, share: 0.4, section: 'lin_internal' }] }

describe('recipe make-up by job', () => {
  it('reads design, power and the defining jobs; connectors stay out', () => {
    const m = positionMakeup('C01r', state)
    expect([m.design, m.driver, m.secondary, m.defining]).toEqual(['LIN', 'remote', 'CV', ['PROFILE', 'TAPE:tape']])
    expect([...m.jobs.keys()].sort()).toEqual(['END_CAPS', 'PROFILE', 'TAPE:tape'])
  })
  it('"same as" names the position of the same make-up and what it adds', () => {
    const [s] = sameKindAs('C05r', state)
    expect(s.posRef).toBe('C01r')
    expect(s.adds.map(a => a.job)).toEqual(['END_CAPS'])
  })
  it('on another profile, one position\'s own extra (an emergency pack) is not offered to the rest', () => {
    const pts = ['A1', 'A2', 'A3E']
    const st = {
      positionTypes: pts.map(r => ({ PositionTypeRef: r, DriverLocation: 'Remote', SecondaryPowerType: 'CV' })),
      elementTypes: [...pts.map((p, i) => ({ ElementTypeRef: `ET-LIN-PROF-0${i + 1}`, Family: 'ET-LIN-PROF' })),
        { ElementTypeRef: 'ET-LIN-01', Family: 'ET-LIN' }, { ElementTypeRef: 'ET-LIN-TAPE-01', Family: 'ET-LIN-TAPE' },
        { ElementTypeRef: 'ET-EM-PACK-01', Family: 'ET-DRIVER' }],
      psRows: [],
      recipes: [...pts.flatMap((p, i) => [row(p, 'ET-LIN-01', 'PositionType', { IsDesign: 'Y' }),
        row(p, 'ET-LIN-TAPE-01', 'ElementType'), row(p, `ET-LIN-PROF-0${i + 1}`, 'ElementType')]),
        row('A3E', 'ET-EM-PACK-01', 'ElementType')],
    }
    expect(sameKindAs('A1', st)).toEqual([])
  })
  it('matches a kind and lists what positions like it usually also have', () => {
    const m = positionMakeup('C05r', state)
    expect(matchKind(m, [KIND]).id).toBe(2)
    expect(matchKind({ ...m, driver: 'local' }, [KIND])).toBeNull()
    expect(usuallyMissing(m, KIND).map(s => s.slot)).toEqual(['END_CAPS', 'DIFFUSER'])
  })
  it('offers the project\'s ElementTypes for a job, most used first, with the slot\'s rule', () => {
    expect(elementTypesForJob('DIFFUSER', state).map(e => e.ElementTypeRef)).toEqual(['ET-LIN-DIFF-01'])
    expect(sectionFor(KIND.slots[2], 'LIN')).toBe('lin_internal')
    expect(rowFromSlot(KIND.slots[2], 'ET-LIN-CAP-01')).toEqual({ elementTypeRef: 'ET-LIN-CAP-01', quantity: 2, dimQtyMultiplier: null, isContractItem: 'Y', isInteger: null })
    expect(powerOf({ DriverLocation: 'Local to fitting', SecondaryPowerType: 'CC' })).toEqual({ driver: 'local', secondary: 'CC' })
  })
})

describe('Form gaps against the kinds', async () => {
  const { formKindGaps } = await import('../../src/utils/recipeKinds')
  it('a linear Form position with tape and profile but no caps or diffuser says so, grouped', () => {
    const entries = [
      { text: 'NF240', manufacturers: ['LEDFlex'], positionTypes: ['C01r', 'C03r'], variants: [{ note: 'LED tape' }] },
      { text: '021-8810-02', manufacturers: ['LEDFlex'], positionTypes: ['C01r', 'C03r'], variants: [{ note: 'Aluminium profile' }] },
      { text: '021-8810-11', manufacturers: ['LEDFlex'], positionTypes: ['C03r'], variants: [{ note: 'End cap' }] },
    ]
    const gaps = formKindGaps(entries, { kinds: [KIND], positionTypes: state.positionTypes, pageTypeFor: () => 'Linear' })
    expect(gaps.map(g => [g.positions, g.missing.map(s => s.slot)])).toEqual([[['C01r'], ['END_CAPS', 'DIFFUSER']], [['C03r'], ['DIFFUSER']]])
    expect(formKindGaps(entries, { kinds: [], pageTypeFor: () => 'Linear' })).toEqual([])
    expect(formKindGaps(entries, { kinds: [KIND], pageTypeFor: () => 'Point' })).toEqual([])
  })
})

describe('usual connectors, on this project\'s own connector ElementTypes', async () => {
  const { usualConnectors, positionMakeup, indexes } = await import('../../src/utils/recipeKinds')
  it('maps the kind\'s usual set onto the project\'s refs, where the project puts them', () => {
    const st = { ...state, elementTypes: [...state.elementTypes, { ElementTypeRef: 'ET-2Pin-LIN-Socket', Family: 'ET-CONNECTION' }, { ElementTypeRef: 'ET-2Pin-LIN-Plug', Family: 'ET-CONNECTION' }],
      recipes: [...state.recipes, row('C01r', 'ET-2Pin-LIN-Plug', 'ElementType')] }
    const kind = { ...KIND, positions: 10, connectors: [{ set: [], positions: 5 }, { set: ['2pin-plug@lin', '2pin-socket@lin'], positions: 4 }] }
    const got = usualConnectors(positionMakeup('C05r', st), kind, st, indexes(st))
    expect(got.rows).toEqual([{ descriptor: '2pin-plug@lin', etRef: 'ET-2Pin-LIN-Plug', section: 'lin_internal' },
      { descriptor: '2pin-socket@lin', etRef: 'ET-2Pin-LIN-Socket', section: 'position' }])
    expect(usualConnectors(positionMakeup('C01r', st), kind, st, indexes(st))).toBeNull()   // has both already
    expect(usualConnectors(positionMakeup('C05r', st), { ...kind, connectors: [{ set: ['2pin-plug@lin'], positions: 1 }] }, st)).toBeNull()
  })
})

describe('parts made for a profile', async () => {
  const { sameKindAs, fitFor, anchorOf, positionMakeup, indexes, pickRangePart, rangeStem } = await import('../../src/utils/recipeKinds')
  const st = {
    ...state,
    positionTypes: [...state.positionTypes, { PositionTypeRef: 'C10r', DriverLocation: 'Remote', SecondaryPowerType: 'CV' }],
    elementTypes: [...state.elementTypes, { ElementTypeRef: 'ET-LIN-PROF-09', Family: 'ET-LIN-PROF' }, { ElementTypeRef: 'ET-LIN-CLIP-03', Family: 'ET-LIN-CLIP' },
      { ElementTypeRef: 'ET-LIN-DIFF-02', Family: 'ET-LIN-PROF' }],
    psRows: [...state.psRows, { ElementTypeRef: 'ET-LIN-PROF-09', Manufacturer: 'LEDFlex', ProductCode: 'FPS1709BG2000' },
      { ElementTypeRef: 'ET-LIN-CLIP-03', Manufacturer: 'LEDFlex', ProductCode: 'FPS1709MC' },
      { ElementTypeRef: 'ET-LIN-DIFF-02', Manufacturer: 'LEDFlex', ProductCode: 'FPS2021PCOPD2000' }],
    recipes: [...state.recipes, row('C10r', 'ET-LIN-01', 'PositionType', { IsDesign: 'Y' }), row('C10r', 'ET-LIN-TAPE-01', 'ElementType'),
      row('C10r', 'ET-LIN-PROF-09', 'ElementType')],
  }
  const idx = indexes(st)
  it('"same as" on another profile is "built like" and never carries its caps', () => {
    expect(sameKindAs('C10r', st)).toEqual([])
    expect(sameKindAs('C05r', st)[0]).toMatchObject({ posRef: 'C01r', basis: 'profile', anchor: { ref: 'ET-LIN-PROF-01' } })
  })
  it('fits by use with the same profile, then by the maker range', () => {
    expect(fitFor('END_CAPS', anchorOf(positionMakeup('C05r', st, idx), idx), st, idx)).toEqual({ etRef: 'ET-LIN-CAP-01', why: 'used with ET-LIN-PROF-01 on C01r' })
    const a = anchorOf(positionMakeup('C10r', st, idx), idx)
    expect(rangeStem(a.code)).toBe('FPS1709')
    expect(fitFor('CLIPS', a, st, idx)).toEqual({ etRef: 'ET-LIN-CLIP-03', why: 'FPS1709 range' })
    expect(fitFor('END_CAPS', a, st, idx)).toBeNull()
  })
  it('picks the range part in the profile\'s finish, or the variant the project already uses', () => {
    const a = anchorOf(positionMakeup('C10r', st, idx), idx)
    const part = c => ({ code: c })
    expect(pickRangePart([part('FPS1709ECB'), part('FPS1709ECG')], a, 'END_CAPS', st, idx).code).toBe('FPS1709ECG')
    expect(pickRangePart([part('FPS1709PCCD2000'), part('FPS1709PCOPD2000')], a, 'DIFFUSER', st, idx).code).toBe('FPS1709PCOPD2000')
  })
  it('with codes still TBC, the words say which profile a part is for', () => {
    const t = { ...st,
      elementTypes: [...st.elementTypes, { ElementTypeRef: 'ET-LIN-PROF-08', Family: 'ET-LIN-PROF', Name: 'LEDFlex - Flex Profile Surface Opal Half Moon 0808' },
        { ElementTypeRef: 'ET-LIN-CLIP-09', Family: 'ET-LIN-CLIP', Name: 'LEDFlex - Half Moon 0808 clips' }],
      psRows: [...st.psRows, { ElementTypeRef: 'ET-LIN-PROF-08', ProductCode: 'TBC' }, { ElementTypeRef: 'ET-LIN-CLIP-09', ProductCode: 'TBC' }] }
    const i = indexes(t)
    expect(fitFor('CLIPS', { ref: 'ET-LIN-PROF-08', code: '', maker: 'LEDFlex' }, t, i)).toEqual({ etRef: 'ET-LIN-CLIP-09', why: 'named for the 0808 profile' })
  })
})
