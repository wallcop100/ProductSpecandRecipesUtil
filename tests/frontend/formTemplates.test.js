import { describe, test, expect, beforeEach, vi } from 'vitest'

vi.stubGlobal('window', {
  electronAPI: {
    db: {
      upsertPositionUI: vi.fn().mockResolvedValue({}),
      upsertTemplate: vi.fn().mockResolvedValue({}),
      setPref: vi.fn().mockResolvedValue(undefined),
      getPref: vi.fn().mockResolvedValue(null),
    },
  },
})
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(),
}))

const { default: useStore } = await import('../../src/store/useStore.js')

const et = (ref, Family) => ({ ElementTypeRef: ref, Family })
const row = (pos, ref, extra = {}) => ({
  _id: `${pos}-${ref}`, PositionTypeRef: pos, positionTypeRef: pos, ContextType: 'PositionType', contextType: 'PositionType',
  ElementTypeRef: ref, elementTypeRef: ref, Quantity: 1, ...extra,
})
const recipeOf = pos => useStore.getState().recipes
  .filter(r => (r.PositionTypeRef || r.positionTypeRef) === pos && (r.IsDeleted || r.isDeleted) !== 'Y')
  .map(r => r.ElementTypeRef || r.elementTypeRef).sort()

beforeEach(() => {
  useStore.setState({
    projectId: 1, templates: [], slotMappings: {}, positionUI: {}, psRows: [], psChanges: [], rsChanges: [], past: [], future: [],
    containerETRefs: new Set(), activeContextType: 'PositionType', activeETRef: null,
    positionTypes: [{ PositionTypeRef: 'A1' }, { PositionTypeRef: 'A2' }, { PositionTypeRef: 'A3' }],
    elementTypes: [et('ET-PS-01', 'ET-PS'), et('ET-PS-02', 'ET-PS'), et('ET-PS-03', 'ET-PS'), et('ET-DRIVER-01', 'ET-DRIVER'),
      et('ET-PS-ACCESSORIES-01', 'ET-PS-ACCESSORIES'), et('ET-PS-ACCESSORIES-02', 'ET-PS-ACCESSORIES')],
    recipes: [row('A1', 'ET-PS-01', { IsDesign: 'Y' }), row('A1', 'ET-PS-ACCESSORIES-01'), row('A1', 'ET-DRIVER-01')],
    formCaptures: { byPosition: {
      A1: [{ elementTypeRef: 'ET-PS-01', code: 'QC50', role: 'lead' }, { elementTypeRef: 'ET-PS-ACCESSORIES-01', code: 'GS1', role: 'extra' }],
      A2: [{ elementTypeRef: 'ET-PS-02', code: 'QC51', role: 'lead' }, { elementTypeRef: 'ET-PS-ACCESSORIES-02', code: 'GS2', role: 'extra' }],
      A3: [{ elementTypeRef: 'ET-PS-03', code: 'QC52', role: 'lead' }],
    } },
  })
})

describe('Form templates', () => {
  test("saving marks the position's Form products as slots", async () => {
    const t = await useStore.getState().saveAsTemplate('A1', { name: 'Spot' })
    const byRef = Object.fromEntries(t.ingredients.map(i => [i.slotLabel, i.fromForm || null]))
    expect(byRef).toEqual({ 'ET-PS-01': 'lead', 'ET-PS-ACCESSORIES-01': 'ACCESSORY', 'ET-DRIVER-01': null })
  })

  test("applied elsewhere, the slots take that position's own Form products; the rest comes as saved", async () => {
    const t = await useStore.getState().saveAsTemplate('A1', { name: 'Spot' })
    useStore.getState().applyTemplate('A2', t.id)
    expect(recipeOf('A2')).toEqual(['ET-DRIVER-01', 'ET-PS-02', 'ET-PS-ACCESSORIES-02'])
    useStore.getState().applyTemplate('A3', t.id)                     // no extras there: none added
    expect(recipeOf('A3')).toEqual(['ET-DRIVER-01', 'ET-PS-03'])
  })

})

describe('teach one, repeat for the group', () => {
  const rowsOf = pos => useStore.getState().recipes
    .filter(r => (r.PositionTypeRef || r.positionTypeRef) === pos && (r.IsDeleted || r.isDeleted) !== 'Y')
  const brief = r => [r.ContextType || r.contextType, (r.ContextType || r.contextType) === 'PositionType' ? '' : (r.ContextRef || r.contextRef), r.ElementTypeRef || r.elementTypeRef, r.IsDesign || r.isDesign || '']

  beforeEach(() => {
    useStore.setState({
      recipes: [], psRows: [], containerETRefs: new Set(), library: { patterns: [], exemplars: [] },
      positionTypes: [
        { PositionTypeRef: 'B1', ParentRef: 'DOWNLIGHT', DriverLocation: 'Local to fitting' },
        { PositionTypeRef: 'B2', ParentRef: 'DOWNLIGHT', DriverLocation: 'Local to fitting' },
        { PositionTypeRef: 'B3', ParentRef: 'DOWNLIGHT', DriverLocation: 'Local to fitting' },
      ],
      elementTypes: [et('ET-PS-01', 'ET-PS'), et('ET-PS-02', 'ET-PS'), et('ET-CCL-700', 'ET-DRIVER'), et('ET-5Pin-Socket', 'ET-CONNECTION')],
      formCaptures: { byPosition: {
        B1: [{ elementTypeRef: 'ET-PS-01', code: 'QC50', role: 'lead' }],
        B2: [{ elementTypeRef: 'ET-PS-02', code: 'QC51', role: 'lead' }],
        B3: [{ elementTypeRef: 'ET-PS-01', code: 'QC50', role: 'lead' }],
      } },
    })
  })

  test('the first one: a new DL wrapper at position level, the PS inside it as design; empty parts are not written', () => {
    const res = useStore.getState().buildProposedRecipe('B1')
    expect(res.wrapperRef).toBe('ET-DL-01')
    const rows = rowsOf('B1').map(brief)
    expect(rows).toContainEqual(['PositionType', '', 'ET-DL-01', 'Y'])
    expect(rows).toContainEqual(['ElementType', 'ET-DL-01', 'ET-PS-01', 'Y'])
    expect(rows.some(r => r[2] === 'ET-5Pin-Socket')).toBe(false)               // only in the ET list: a suggestion, unticked
    expect(res.skipped.map(r => r.role)).toEqual(expect.arrayContaining(['5PIN-SR', '2PIN-PLUG', 'DRIVER']))  // nothing can vouch for them
    expect(useStore.getState().elementTypes.find(e => e.ElementTypeRef === 'ET-DL-01')).toMatchObject({ Family: 'ET-DL', IsCollection: 'Y' })
  })

  test('a suggestion is added only when ticked', () => {
    const sig = useStore.getState().proposeRecipeFor('B1').signature
    useStore.getState().setRecipeChoice(sig, { include: { '5PIN-SOCKET': true } })
    useStore.getState().buildProposedRecipe('B1')
    expect(rowsOf('B1').map(brief)).toContainEqual(['PositionType', '', 'ET-5Pin-Socket', ''])
    useStore.setState({ recipeChoices: {} })
  })

  test('parts made into wrappers by the old name test are found and put back', () => {
    useStore.setState({
      elementTypes: [...useStore.getState().elementTypes, { ElementTypeRef: 'ET-LIN-CLIP-01', Family: null, IsCollection: 'Y' }],
      psRows: [{ ElementTypeRef: 'ET-LIN-CLIP-01', Manufacturer: 'Ideaworks', ProductCode: 'N/A' }],
      formCaptures: { byPosition: { B1: [{ elementTypeRef: 'ET-LIN-CLIP-01', code: 'FPSN1013MC', manufacturer: 'LEDFlex', role: 'extra' }] } },
    })
    expect(useStore.getState().phantomWrappers().map(p => p.ref)).toEqual(['ET-LIN-CLIP-01'])
    expect(useStore.getState().repairPhantomWrappers()).toBe(1)
    expect(useStore.getState().elementTypes.find(e => e.ElementTypeRef === 'ET-LIN-CLIP-01').IsCollection).toBeNull()
    expect(useStore.getState().psRows.find(r => r.ElementTypeRef === 'ET-LIN-CLIP-01')).toMatchObject({ Manufacturer: 'LEDFlex', ProductCode: 'FPSN1013MC' })
    expect(useStore.getState().phantomWrappers()).toEqual([])
  })

  test('taught on B1 (after the person adds the driver): B2 gets its own PS; B3, same product, shares B1’s wrapper', async () => {
    useStore.getState().buildProposedRecipe('B1')
    useStore.getState().addRecipeRow('B1', 'dl_internal', { elementTypeRef: 'ET-CCL-700', isContractItem: 'Y' }, { asPosition: true })
    const t = await useStore.getState().saveAsTemplate('B1', { name: 'Local DL' })
    const res = useStore.getState().applyTaughtTemplate(t.id, ['B2', 'B3'])
    expect(res.built).toEqual(['B2', 'B3'])

    const b2 = rowsOf('B2').map(brief)
    expect(b2).toContainEqual(['PositionType', '', 'ET-DL-02', 'Y'])
    expect(b2).toContainEqual(['ElementType', 'ET-DL-02', 'ET-PS-02', 'Y'])
    expect(b2).toContainEqual(['ElementType', 'ET-DL-02', 'ET-CCL-700', ''])   // taught
    expect(b2.some(r => r[2] === 'ET-PS-01')).toBe(false)                       // never B1's product

    const b3 = rowsOf('B3').map(brief)
    expect(b3).toEqual([['PositionType', '', 'ET-DL-01', 'Y']])                  // shared: contents once
    useStore.getState().undo()
    expect(rowsOf('B2')).toEqual([]); expect(rowsOf('B3')).toEqual([])
  })
})

describe('no phantom wrappers', () => {
  test('a linear clip added to a recipe gets an ordinary spec row, not Ideaworks N/A, and is not a collection', () => {
    useStore.setState({ elementTypes: [et('ET-LIN-CLIP-01', 'ET-LIN-CLIP')], psRows: [], recipes: [], containerETRefs: new Set() })
    useStore.getState().addRecipeRow('A1', 'position', { elementTypeRef: 'ET-LIN-CLIP-01', isContractItem: 'Y' }, { asPosition: true })
    const ps = useStore.getState().psRows.find(r => r.ElementTypeRef === 'ET-LIN-CLIP-01')
    expect(ps?.Manufacturer).not.toBe('Ideaworks')
    expect(useStore.getState().elementTypes.find(e => e.ElementTypeRef === 'ET-LIN-CLIP-01').IsCollection).not.toBe('Y')
  })
})

describe('one group per kind of LIN, whatever its mix of ingredients', () => {
  test('a full tape-in-profile and a diffuser-only position share a group; each gets only its own parts', async () => {
    const { formGroups, proposalContext } = await import('../../src/utils/recipeProposal.js')
    useStore.setState({
      recipes: [], psRows: [], templates: [], containerETRefs: new Set(), recipeChoices: {}, library: { patterns: [], exemplars: [] },
      positionTypes: [
        { PositionTypeRef: 'L1', ParentRef: 'LINEAR', DriverLocation: 'Remote' },
        { PositionTypeRef: 'L2', ParentRef: 'LINEAR', DriverLocation: 'Remote' },
      ],
      elementTypes: [et('ET-LIN-DIFF-01', 'ET-LIN-PROF'), et('ET-LIN-TAPE-01', 'ET-LIN-TAPE'), et('ET-LIN-PROF-01', 'ET-LIN-PROF'), et('ET-LIN-DIFF-02', 'ET-LIN-PROF')],
      formCaptures: { byPosition: {
        L2: [{ elementTypeRef: 'ET-LIN-DIFF-02', code: 'D2', role: 'lead' }],
        L1: [{ elementTypeRef: 'ET-LIN-TAPE-01', code: 'T1', role: 'lead' }, { elementTypeRef: 'ET-LIN-PROF-01', code: 'P1', role: 'extra' }, { elementTypeRef: 'ET-LIN-DIFF-01', code: 'D1', role: 'extra' }],
      } },
    })
    const { groups } = formGroups(['L2', 'L1'], proposalContext(useStore.getState()))
    expect(groups).toHaveLength(1)
    expect(groups[0].first).toBe('L1')                                          // the richest is taught
    useStore.getState().buildProposedRecipe('L1')
    const t = await useStore.getState().saveAsTemplate('L1', { name: 'LIN' })
    useStore.getState().applyTaughtTemplate(t.id, ['L2'])
    const l2 = useStore.getState().recipes.filter(r => (r.PositionTypeRef || r.positionTypeRef) === 'L2' && (r.IsDeleted || r.isDeleted) !== 'Y')
      .map(r => r.ElementTypeRef || r.elementTypeRef)
    expect(l2).toContain('ET-LIN-DIFF-02')
    expect(l2.some(r => /TAPE|PROF-01|DIFF-01/.test(r))).toBe(false)             // nothing of L1's
  })
})
