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
const { planFormBuild } = await import('../../src/utils/formBuild.js')

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
    expect(byRef).toEqual({ 'ET-PS-01': 'lead', 'ET-PS-ACCESSORIES-01': 'extra', 'ET-DRIVER-01': null })
  })

  test("applied elsewhere, the slots take that position's own Form products; the rest comes as saved", async () => {
    const t = await useStore.getState().saveAsTemplate('A1', { name: 'Spot' })
    useStore.getState().applyTemplate('A2', t.id)
    expect(recipeOf('A2')).toEqual(['ET-DRIVER-01', 'ET-PS-02', 'ET-PS-ACCESSORIES-02'])
    useStore.getState().applyTemplate('A3', t.id)                     // no extras there: none added
    expect(recipeOf('A3')).toEqual(['ET-DRIVER-01', 'ET-PS-03'])
  })

  test('Build from the Form: the matching template for each position, one undo', async () => {
    const t = await useStore.getState().saveAsTemplate('A1', { name: 'Spot' })
    const s = useStore.getState()
    const plan = planFormBuild({ formCaptures: s.formCaptures, templates: s.templates, recipes: s.recipes, elementTypes: s.elementTypes })
    const choice = Object.fromEntries(plan.map(r => [r.posRef, r.choice]))
    expect(choice).toEqual({ A1: 'skip', A2: t.id, A3: t.id })       // A1 already has its recipe

    expect(useStore.getState().buildFromForm(plan)).toBe(2)
    expect(recipeOf('A2')).toEqual(['ET-DRIVER-01', 'ET-PS-02', 'ET-PS-ACCESSORIES-02'])
    useStore.getState().undo()
    expect(recipeOf('A2')).toEqual([])
    expect(recipeOf('A3')).toEqual([])
  })

  test('with no template, "Form products only" makes the main product the design element', () => {
    const plan = planFormBuild({ posRefs: ['A2'], formCaptures: useStore.getState().formCaptures, elementTypes: useStore.getState().elementTypes })
    expect(plan[0].choice).toBe('products')
    useStore.getState().buildFromForm(plan)
    const rows = useStore.getState().recipes.filter(r => (r.PositionTypeRef || r.positionTypeRef) === 'A2')
    expect(rows.map(r => [r.ElementTypeRef || r.elementTypeRef, r.IsDesign || r.isDesign || null]).sort())
      .toEqual([['ET-PS-02', 'Y'], ['ET-PS-ACCESSORIES-02', null]])
  })
})
