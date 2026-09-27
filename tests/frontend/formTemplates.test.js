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
    expect(rows).toContainEqual(['PositionType', '', 'ET-5Pin-Socket', ''])      // this project's own part
    expect(res.skipped.map(r => r.role)).toEqual(expect.arrayContaining(['5PIN-SR', '2PIN-PLUG', 'DRIVER']))  // nothing can vouch for them
    expect(useStore.getState().elementTypes.find(e => e.ElementTypeRef === 'ET-DL-01')).toMatchObject({ Family: 'ET-DL', IsCollection: 'Y' })
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
    expect(b3).toEqual([['PositionType', '', 'ET-DL-01', 'Y'], ['PositionType', '', 'ET-5Pin-Socket', '']])  // shared: contents once
    useStore.getState().undo()
    expect(rowsOf('B2')).toEqual([]); expect(rowsOf('B3')).toEqual([])
  })
})
