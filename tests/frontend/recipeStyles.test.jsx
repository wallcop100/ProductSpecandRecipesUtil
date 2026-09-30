import { describe, test, expect } from 'vitest'
import { styleRecords, recipeShape, findStyleGroups, styleRuleOf, matchStyle, groupKeyFor, ruleForDims, suggestStyleRule } from '../../src/utils/recipeStyles.js'
import { ruleMatchesRecord } from '../../src/utils/templateRules.js'

let n = 0
const pos = (p, ref, extra = {}) => ({ _id: `r${n++}`, PositionTypeRef: p, ContextType: 'PositionType', ContextRef: p, ElementTypeRef: ref, Quantity: 1, ...extra })
const inside = (p, w, ref) => ({ _id: `r${n++}`, PositionTypeRef: p, ContextType: 'ElementType', ContextRef: w, ElementTypeRef: ref, Quantity: 1 })

// A05/A05E: remote, same downlight; A05E adds an EM pack. B01: remote, other downlight, built like A05.
const positionTypes = [
  { PositionTypeRef: 'A05', DriverLocation: 'Remote' }, { PositionTypeRef: 'A05E', DriverLocation: 'Remote' },
  { PositionTypeRef: 'B01', DriverLocation: 'Remote' }, { PositionTypeRef: 'C01', DriverLocation: 'Local' },
]
const elementTypes = [
  { ElementTypeRef: 'ET-PS-01', Family: 'ET-PS-DOWNLIGHT' }, { ElementTypeRef: 'ET-PS-02', Family: 'ET-PS-DOWNLIGHT' },
  { ElementTypeRef: 'ET-EM-01', Family: 'ET-EM' }, { ElementTypeRef: 'ET-DL-01' }, { ElementTypeRef: 'ET-DL-02' }, { ElementTypeRef: 'ET-DL-03' },
]
const formCaptures = { byPosition: {
  A05: [{ elementTypeRef: 'ET-PS-01', role: 'lead', manufacturer: 'iGuzzini' }],
  A05E: [{ elementTypeRef: 'ET-PS-01', role: 'lead', manufacturer: 'iGuzzini' }, { elementTypeRef: 'ET-EM-01', role: 'extra' }],
  B01: [{ elementTypeRef: 'ET-PS-02', role: 'lead', manufacturer: 'Orluna' }],
  C01: [{ elementTypeRef: 'ET-PS-02', role: 'lead', manufacturer: 'Orluna' }],
} }
const recipes = [
  pos('A05', 'ET-DL-01', { IsDesign: 'Y' }), inside('A05', 'ET-DL-01', 'ET-PS-01'), inside('A05', 'ET-DL-01', 'ET-2PIN-REMOTE-PLUG'),
  pos('A05E', 'ET-DL-02', { IsDesign: 'Y' }), inside('A05E', 'ET-DL-02', 'ET-PS-01'), inside('A05E', 'ET-DL-02', 'ET-2PIN-REMOTE-PLUG'), inside('A05E', 'ET-DL-02', 'ET-EM-01'),
  pos('B01', 'ET-DL-03', { IsDesign: 'Y' }), inside('B01', 'ET-DL-03', 'ET-PS-02'), inside('B01', 'ET-DL-03', 'ET-2PIN-REMOTE-PLUG'),
]
const recs = styleRecords({ positionTypes, elementTypes, formCaptures })
const recOf = r => recs.get(r)

describe('recipe styles', () => {
  test('records carry what the Form says and the kind', () => {
    expect(recOf('A05E')).toMatchObject({ 'Form.Main': 'ET-PS-01', 'Form.MainFamily': 'ET-PS-DOWNLIGHT', 'Form.Extras': ['ET-EM'], 'Kind.Driver': 'REMOTE', 'Kind.Product': 'point' })
  })

  test('a shape abstracts the Form products: A05 and B01 alike, A05E (EM) not', () => {
    const shape = p => recipeShape(recipes, p, { formRefs: formCaptures.byPosition[p].map(c => c.elementTypeRef), leadRef: formCaptures.byPosition[p][0].elementTypeRef })
    expect(shape('A05')).toBe(shape('B01'))
    expect(shape('A05E')).not.toBe(shape('A05'))
    const groups = findStyleGroups(['A05', 'A05E', 'B01', 'C01'], { recipes, formCaptures, elementTypes })
    expect(groups.map(g => g.positions)).toEqual([['A05', 'B01'], ['A05E']])
  })

  test('a suggested rule tells A05 and B01 apart from A05E', () => {
    const s = suggestStyleRule(['A05', 'B01'], ['A05', 'A05E', 'B01', 'C01'], recOf, ['A05E'])
    expect(s.exact).toBe(true)
    expect(ruleMatchesRecord(s.rule, recOf('A05E'))).toBe(false)
    expect(ruleMatchesRecord(s.rule, recOf('B01'))).toBe(true)
  })

  test('most specific style wins; a legacy form-group tag reads as a rule', () => {
    const general = { id: 'g', applicable_tags: ['form-group:point|REMOTE|INT'] }
    const em = { id: 'em', rule: { match: 'all', conditions: [
      { column: 'Kind.Driver', op: 'equals', value: 'REMOTE' }, { column: 'Kind.Product', op: 'equals', value: 'point' },
      { column: 'Kind.Env', op: 'equals', value: 'INT' }, { column: 'Form.Extras', op: 'equals', value: 'ET-EM' },
    ] } }
    expect(styleRuleOf(general).conditions).toHaveLength(3)
    expect(matchStyle(recOf('A05E'), [general, em]).id).toBe('em')
    expect(matchStyle(recOf('A05'), [general, em]).id).toBe('g')
    expect(matchStyle(recOf('C01'), [general, em])).toBeNull()
  })

  test('groups by the chosen dimensions; a rule prefilled from them', () => {
    const all = ['A05', 'A05E', 'B01'].map(p => groupKeyFor(recOf(p)).key)
    expect(new Set(all).size).toBe(3)                                     // main + kind + extras: all apart
    const kindOnly = ['A05', 'A05E', 'B01'].map(p => groupKeyFor(recOf(p), ['kind']).key)
    expect(new Set(kindOnly).size).toBe(1)                                // today's coarse group
    const r = ruleForDims(recOf('A05'))
    expect(ruleMatchesRecord(r, recOf('A05'))).toBe(true)
    expect(ruleMatchesRecord(r, recOf('A05E'))).toBe(false)               // no accessories vs EM
    expect(ruleMatchesRecord(r, recOf('B01'))).toBe(true)                 // same family, same kind
  })
})

// ── The windows ───────────────────────────────────────────────────────────────────────────
import { vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react'
let tid = 1
window.electronAPI = { db: {
  upsertTemplate: vi.fn(async t => ({ ...t, id: t.id || `t${tid++}` })), deleteTemplate: vi.fn(),
  setPref: vi.fn().mockResolvedValue(undefined), getPref: vi.fn().mockResolvedValue(null),
  getRecipePatterns: vi.fn().mockResolvedValue([]), getStyleExemplars: vi.fn().mockResolvedValue([]),
} }
const { default: useStore } = await import('../../src/store/useStore.js')
const { default: FormRecipesModal } = await import('../../src/components/FormRecipesModal.jsx')
const { default: RecipeStylesWindow } = await import('../../src/components/RecipeStylesWindow.jsx')

function project(recs = []) {
  useStore.setState({
    projectId: 1, recipes: recs, psRows: [], templates: [], containerETRefs: new Set(), past: [], future: [], psChanges: [], rsChanges: [], dbChanges: [],
    positionUI: {}, library: { patterns: [], exemplars: [] }, recipeChoices: {}, recipeSource: null, lastTaught: null,
    positionTypes: [
      { PositionTypeRef: 'B1', ParentRef: 'DOWNLIGHT', DriverLocation: 'Remote' },
      { PositionTypeRef: 'B2', ParentRef: 'DOWNLIGHT', DriverLocation: 'Remote' },
      { PositionTypeRef: 'B3', ParentRef: 'DOWNLIGHT', DriverLocation: 'Remote' },
    ],
    elementTypes: [
      { ElementTypeRef: 'ET-PS-01', Family: 'ET-PS' }, { ElementTypeRef: 'ET-EM-01', Family: 'ET-EM' },
      { ElementTypeRef: 'ET-DL-01' }, { ElementTypeRef: 'ET-DL-02' }, { ElementTypeRef: 'ET-DL-03' },
    ],
    formCaptures: { byPosition: {
      B1: [{ elementTypeRef: 'ET-PS-01', code: 'QC50', role: 'lead' }],
      B2: [{ elementTypeRef: 'ET-PS-01', code: 'QC50', role: 'lead' }],
      B3: [{ elementTypeRef: 'ET-PS-01', code: 'QC50', role: 'lead' }, { elementTypeRef: 'ET-EM-01', code: 'EM3', role: 'extra' }],
    } },
  })
}

describe('Build recipes with styles', () => {
  beforeEach(() => project())

  test('a new project builds from the style guide; groups split by the chips, and merge when one is off', async () => {
    render(<FormRecipesModal show posRefs={[]} onHide={vi.fn()} onOpenPosition={vi.fn()} />)
    await waitFor(() => expect(useStore.getState().recipeSource).toBe('guide'))
    expect(screen.getAllByTestId('form-group')).toHaveLength(2)                 // B1+B2 · B3 (EM)
    expect(screen.getByTestId('group-count')).toHaveTextContent('2 groups')
    fireEvent.click(screen.getByRole('button', { name: 'Accessories' }))
    expect(screen.getAllByTestId('form-group')).toHaveLength(1)
  })

  test('the first checked recipe is saved as a style; its rule picks the group, not the EM one', async () => {
    useStore.getState().buildProposedRecipe('B1')
    render(<FormRecipesModal show posRefs={[]} onHide={vi.fn()} onOpenPosition={vi.fn()} />)
    const g = (await screen.findAllByTestId('form-group')).find(x => /no accessories/.test(x.textContent))
    fireEvent.click(within(g).getByText(/no accessories/))
    await act(async () => { fireEvent.click(within(g).getByRole('button', { name: 'Use it for the other 1' })) })
    const t = useStore.getState().templates.at(-1)
    expect(t.rule.conditions).toEqual(expect.arrayContaining([{ column: 'Form.Extras', op: 'isEmpty', value: '' }]))
    const sg = screen.getAllByTestId('form-group').find(x => /style/.test(x.textContent))
    expect(sg).toHaveTextContent('2 positions')                                   // B1, B2 — not B3
    expect(screen.getByRole('button', { name: 'Edit its rule' })).toBeInTheDocument()
  })
})

describe('Recipe styles from existing recipes', () => {
  const recs = [
    pos('B1', 'ET-DL-01', { IsDesign: 'Y' }), inside('B1', 'ET-DL-01', 'ET-PS-01'), inside('B1', 'ET-DL-01', 'ET-2PIN-REMOTE-PLUG'),
    pos('B2', 'ET-DL-02', { IsDesign: 'Y' }), inside('B2', 'ET-DL-02', 'ET-PS-01'), inside('B2', 'ET-DL-02', 'ET-2PIN-REMOTE-PLUG'),
    pos('B3', 'ET-DL-03', { IsDesign: 'Y' }), inside('B3', 'ET-DL-03', 'ET-PS-01'), inside('B3', 'ET-DL-03', 'ET-2PIN-REMOTE-PLUG'), inside('B3', 'ET-DL-03', 'ET-EM-01'),
  ]
  beforeEach(() => project(recs))

  test('shapes found in the recipes; Make style suggests a rule that tells them apart', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('Remote DL')
    render(<RecipeStylesWindow show onHide={vi.fn()} />)
    const found = screen.getAllByTestId('found-style')
    expect(found.map(f => f.textContent.match(/^\d+/)[0])).toEqual(['2', '1'])
    await act(async () => { fireEvent.click(within(found[0]).getByRole('button', { name: 'Make style' })) })
    const t = useStore.getState().templates.find(x => x.name === 'Remote DL')
    expect(t.rule.conditions.length).toBeGreaterThan(0)
    expect(await screen.findByTestId('style-compare')).toHaveTextContent('2 match and are built like it')
    fireEvent.change(screen.getByLabelText('Check a position'), { target: { value: 'B3' } })
    expect(screen.getByTestId('style-check')).toHaveTextContent('✗')
  })
})
