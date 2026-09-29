import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'

let nextId = 1
window.electronAPI = { db: {
  setPref: vi.fn().mockResolvedValue(undefined),
  getPref: vi.fn().mockResolvedValue(null),
  upsertCollection: vi.fn(async (_p, c) => ({ ...c, CollectionId: c.CollectionId || `c${nextId++}` })),
  deleteCollection: vi.fn().mockResolvedValue(undefined),
} }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))

const { default: useStore } = await import('../../src/store/useStore.js')
const G = await import('../../src/utils/connectorGroups.js')
const { default: ConnectorsScreen } = await import('../../src/screens/ConnectorsScreen.jsx')
const T = await import('../../src/utils/templateRules.js')
const { default: CollectionEditor } = await import('../../src/components/CollectionEditor.jsx')

let n = 0
const pos = (p, ref, extra = {}) => ({ _id: `r${n++}`, _row_num: 1, PositionTypeRef: p, ContextType: 'PositionType', ContextRef: p, ElementTypeRef: ref, Quantity: 1, ...extra })
const inside = (p, wrapper, ref, extra = {}) => ({ _id: `r${n++}`, _row_num: 1, PositionTypeRef: p, ContextType: 'ElementType', ContextRef: wrapper, ElementTypeRef: ref, Quantity: 1, ...extra })

// A01–A03: 5-pin local (site socket + SR, plug inside DL). A04: same but no SR (a near miss).
// B01–B02: remote (2-pin remote socket + plug inside).
function recipes() {
  const out = []
  for (const p of ['A01', 'A02', 'A03']) out.push(pos(p, `ET-DL-${p}`, { IsDesign: 'Y' }), pos(p, 'ET-5PIN-SOCKET'), pos(p, 'ET-5PIN-SR'), inside(p, `ET-DL-${p}`, 'ET-5PIN-PLUG'), inside(p, `ET-DL-${p}`, 'ET-PS-01'))
  out.push(pos('A04', 'ET-DL-A04', { IsDesign: 'Y' }), pos('A04', 'ET-5PIN-SOCKET'), inside('A04', 'ET-DL-A04', 'ET-5PIN-PLUG'))
  for (const p of ['B01', 'B02']) out.push(pos(p, `ET-DL-${p}`, { IsDesign: 'Y' }), inside(p, `ET-DL-${p}`, 'ET-2PIN-REMOTE-SOCKET'), inside(p, `ET-DL-${p}`, 'ET-2PIN-REMOTE-PLUG'))
  return out
}
const PTS = ['A01', 'A02', 'A03', 'A04', 'B01', 'B02'].map(r => ({ PositionTypeRef: r, DriverLocation: r.startsWith('A') ? 'LOCAL' : 'REMOTE' }))
const UI = { A01: { tags: ['Orluna'] }, A02: { tags: ['Orluna'] }, A03: { tags: ['Orluna'] }, A04: { tags: [] } }

function setup(over = {}) {
  useStore.setState({
    projectId: 1, positionTypes: PTS, recipes: recipes(), positionUI: UI, ignoredPositionFamilies: [],
    elementTypes: ['ET-5PIN-SOCKET', 'ET-5PIN-SR', 'ET-5PIN-SR-IP', 'ET-5PIN-PLUG', 'ET-2PIN-REMOTE-SOCKET', 'ET-2PIN-REMOTE-PLUG', 'ET-PS-01']
      .map(r => ({ ElementTypeRef: r, Family: r.startsWith('ET-PS') ? 'ET-PS' : 'ET-CONNECTORS' })),
    psRows: [], etCollections: [], connectorPins: {}, connectorExcludes: {}, connectorFamilies: [],
    past: [], future: [], rsChanges: [], psChanges: [], dbChanges: [], containerETRefs: new Set(),
    activeContextType: 'PositionType', activeETRef: null,
    ...over,
  })
}

const recOf = () => useStore.getState()._templateRecOf()
const ALL = PTS.map(p => p.PositionTypeRef)

describe('template rules', () => {
  beforeEach(() => setup())

  test('old included / excluded tags read as rule conditions', () => {
    expect(T.templateRule({ ApplicableTags: ['A', 'B'], ExcludedTags: ['X'] })).toEqual({ match: 'all', conditions: [
      { column: 'Tags', op: 'matches', value: 'A, B' }, { column: 'Tags', op: 'notEquals', value: 'X' },
    ] })
    const m = G.membership(['A01', 'A04'], [{ CollectionId: 'o', ApplicableTags: ['Orluna'], ExcludedTags: [] }], {}, recOf())
    expect(m.get('A01').templates).toEqual(['o'])
    expect(m.get('A04').templates).toEqual([])
  })

  test('records hold DesignDB columns, tags, and the recipe without its connectors', () => {
    const r = recOf()('A01')
    expect(r.DriverLocation).toBe('LOCAL')
    expect(r.Tags).toEqual(['Orluna'])
    expect(r['Recipe.ElementType']).toContain('ET-PS-01')
    expect(r['Recipe.ElementType']).not.toContain('ET-5PIN-SOCKET')
  })

  test('the most specific rule wins; equal ones clash', () => {
    const local = { CollectionId: 'local', Rule: { match: 'all', conditions: [{ column: 'DriverLocation', op: 'equals', value: 'LOCAL' }] } }
    const orluna = { CollectionId: 'orluna', Rule: { match: 'all', conditions: [
      { column: 'DriverLocation', op: 'equals', value: 'LOCAL' }, { column: 'Tags', op: 'equals', value: 'Orluna' },
    ] } }
    const m = G.membership(ALL, [local, orluna], {}, recOf())
    expect(m.get('A01')).toMatchObject({ templates: ['orluna'], clash: false, alsoMatched: ['local'] })
    expect(m.get('A04')).toMatchObject({ templates: ['local'], clash: false })
    expect(m.get('B01').templates).toEqual([])
    const twin = { ...orluna, CollectionId: 'twin' }
    expect(G.membership(['A01'], [local, orluna, twin], {}, recOf()).get('A01')).toMatchObject({ templates: ['orluna', 'twin'], clash: true })
    // An OR rule counts as one condition.
    const any = { CollectionId: 'any', Rule: { ...orluna.Rule, match: 'any' } }
    expect(T.ruleSpecificity(any.Rule)).toBe(1)
  })

  test('a rule is suggested from the positions with the same connectors, precedent fields first', () => {
    const b = T.ruleFor(['B01', 'B02'], ALL, recOf())
    expect(b).toMatchObject({ exact: true, outsiders: [] })
    expect(b.rule.conditions).toEqual([{ column: 'DriverLocation', op: 'equals', value: 'REMOTE' }])
    // A01–A03 share LOCAL with A04; their tag tells them apart.
    const a = T.ruleFor(['A01', 'A02', 'A03'], ALL, recOf())
    expect(a.exact).toBe(true)
    expect(T.compareRule(a.rule, ALL, recOf(), r => ['A01', 'A02', 'A03'].includes(r))).toEqual({ same: ['A01', 'A02', 'A03'], change: [], missed: [] })
  })

  test('when nothing picks the group out exactly, the others it catches are listed', () => {
    setup({ positionUI: {} })
    const a = T.ruleFor(['A01', 'A02'], ALL, recOf())
    expect(a.exact).toBe(false)
    // Their Product Spec family already leaves out A04 and the B's; nothing but a ref separates A03.
    expect(a.outsiders).toEqual(['A03'])
    expect(a.rule.conditions).toEqual([{ column: 'Recipe.Family', op: 'equals', value: 'ET-PS' }])
  })

  test('Make template saves an exact rule instead of pinning', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('Remote 2-pin')
    render(<ConnectorsScreen onBack={() => {}} />)
    const card = screen.getAllByTestId('found-group').find(c => c.textContent.includes('B01'))
    await act(async () => { fireEvent.click(within(card).getByRole('button', { name: /Make template/ })) })
    const t = useStore.getState().etCollections.find(c => c.Name === 'Remote 2-pin')
    expect(t.Rule.conditions).toEqual([{ column: 'DriverLocation', op: 'equals', value: 'REMOTE' }])
    expect(useStore.getState().connectorPins[t.CollectionId]).toBeUndefined()
    expect(screen.getAllByTestId('template-rule-summary').some(e => /DriverLocation is REMOTE/.test(e.textContent))).toBe(true)
  })

  test('editor: suggest a rule from the positions that have these connectors, compare, save', async () => {
    const parts = G.connectorSignature(useStore.getState().recipes, 'A01')
    const saved = await useStore.getState().createCollection('5-pin', G.partsToIngredients(parts), [], [])
    render(<CollectionEditor show onHide={vi.fn()} collection={saved} />)
    fireEvent.click(screen.getByTestId('suggest-rule'))
    expect(screen.getByTestId('suggest-result')).toHaveTextContent('Matches all 3 positions with these connectors and none with other connectors')
    expect(screen.getByTestId('rule-compare')).toHaveTextContent('3 match and already have these connectors')
    expect(screen.getByTestId('rule-compare')).toHaveTextContent('0 match and would change')
    // Loosen it by hand: A04 would change.
    fireEvent.click(screen.getByRole('button', { name: 'Remove condition' }))
    fireEvent.click(screen.getByRole('button', { name: /Add condition/ }))
    const rule = screen.getByTestId('template-rule')
    fireEvent.change(within(rule).getByLabelText('Column'), { target: { value: 'DriverLocation' } })
    fireEvent.change(within(rule).getByLabelText('Value'), { target: { value: 'LOCAL' } })
    expect(screen.getByTestId('rule-compare')).toHaveTextContent('1 match and would change')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save changes' })) })
    const t = useStore.getState().etCollections.find(c => c.CollectionId === saved.CollectionId)
    expect(t.Rule).toEqual({ match: 'all', conditions: [{ column: 'DriverLocation', op: 'equals', value: 'LOCAL' }] })
  })
})

describe('why a position does or does not match (F59FQV)', () => {
  beforeEach(() => setup())

  test('a suggestion keeps positions with no connectors yet: they are the ones to gain them', () => {
    // A05: a position like A01–A03 with no recipe yet. A04 (other connectors) differs by control.
    const ctl = r => ({ ...r, ControlTypeRef: r.PositionTypeRef === 'A04' ? 'DALI' : 'PHASE' })
    setup({ positionTypes: [...PTS.map(ctl), ctl({ PositionTypeRef: 'A05', DriverLocation: 'LOCAL' })], positionUI: {} })
    const scope = [...ALL, 'A05']
    const sigs = G.signatures(useStore.getState().positionTypes, useStore.getState().recipes, useStore.getState()._connectorOpts())
    const a = T.ruleFor(['A01', 'A02', 'A03'], scope, recOf(), { against: scope.filter(r => sigs.has(r)) })
    expect(a.exact).toBe(true)
    expect(a.rule.conditions.some(c => c.column.startsWith('Recipe.'))).toBe(false)
    expect(T.ruleMatchesRecord(a.rule, recOf()('A05'))).toBe(true)
  })

  test('equals ignores stray spaces', () => {
    expect(T.ruleMatchesRecord({ match: 'all', conditions: [{ column: 'DriverLocation', op: 'equals', value: 'LOCAL ' }] }, { DriverLocation: ' Local' })).toBe(true)
  })

  test('Check a position shows each condition against its values, and who takes it', async () => {
    const parts = G.connectorSignature(useStore.getState().recipes, 'A01')
    const other = await useStore.getState().createCollection('Orluna local', G.partsToIngredients(parts), [], [], { match: 'all', conditions: [
      { column: 'DriverLocation', op: 'equals', value: 'LOCAL' }, { column: 'Tags', op: 'equals', value: 'Orluna' },
    ] })
    const saved = await useStore.getState().createCollection('Local', G.partsToIngredients(parts), [], [], { match: 'all', conditions: [
      { column: 'DriverLocation', op: 'equals', value: 'LOCAL' },
    ] })
    render(<CollectionEditor show onHide={vi.fn()} collection={saved} />)
    expect(screen.getByTestId('rule-taken')).toHaveTextContent('3 match but go elsewhere')
    expect(screen.getByTestId('rule-taken')).toHaveTextContent(`${other.Name} has a more specific rule`)
    fireEvent.change(screen.getByLabelText('Check a position'), { target: { value: 'B01' } })
    const box = screen.getByTestId('check-position')
    expect(box).toHaveTextContent('✗ DriverLocation equals “LOCAL” — it has REMOTE')
    fireEvent.change(screen.getByLabelText('Check a position'), { target: { value: 'A04' } })
    expect(box).toHaveTextContent('→ this template applies to it')
  })
})

const { collectionStatusForPosition, positionRecipeWithWrapperInternals } = await import('../../src/utils/collectionStatus.js')
describe('Complete partial with one ref in two places (4QS68H)', () => {
  beforeEach(() => setup())
  const statusOf = (posRef, coll) => {
    const { combined, wrapperRefs } = positionRecipeWithWrapperInternals(useStore.getState().recipes, posRef)
    return collectionStatusForPosition(posRef, [], combined, [coll], wrapperRefs)[0].status
  }

  test('the missing copy is added, not the present one moved back and forth', async () => {
    setup({ elementTypes: [{ ElementTypeRef: 'ET-PHOS-2PIN', Family: 'ET-CONNECTORS' }, { ElementTypeRef: 'ET-5PIN-SR', Family: 'ET-CONNECTORS' }] })
    // A01 has ET-PHOS-2PIN on site only; the template wants it on site AND inside the wrapper.
    useStore.setState(s => ({ recipes: [...s.recipes, pos('A01', 'ET-PHOS-2PIN')], activeContextType: 'ElementType', activeETRef: 'ET-DL-B01' }))
    const coll = await useStore.getState().createCollection('Phos', [
      { ElementTypeRef: 'ET-PHOS-2PIN', section: 'position', quantity: 1 },
      { ElementTypeRef: 'ET-PHOS-2PIN', section: 'dl_internal', quantity: 1 },
    ], [], [])
    expect(statusOf('A01', coll)).toBe('partial')
    const plan = useStore.getState().planBulk(['A01'], coll.CollectionId)
    expect(plan.actions.filter(a => a.action !== 'skip').map(a => [a.action, a.section])).toEqual([['add', 'internal']])
    useStore.getState().applyCollectionBulk(['A01'], coll.CollectionId)
    expect(statusOf('A01', coll)).toBe('complete')
    // The open ElementType (ET-DL-B01) did not swallow the row.
    expect(useStore.getState().recipes.some(r => r.ContextRef === 'ET-DL-B01' && r.ElementTypeRef === 'ET-PHOS-2PIN')).toBe(false)
  })

  test('connectors the template does not ask for are listed, and can be removed with it', async () => {
    const coll = await useStore.getState().createCollection('Plug only', [{ ElementTypeRef: 'ET-5PIN-PLUG', section: 'dl_internal', quantity: 1 }], [], [])
    const plan = useStore.getState().planBulk(['A01'], coll.CollectionId)
    expect(plan.extras.get('A01').map(x => [x.ref, x.section])).toEqual([['ET-5PIN-SOCKET', 'position'], ['ET-5PIN-SR', 'position']])
    useStore.getState().applyCollectionBulk(['A01'], coll.CollectionId, { removeExtras: true })
    const live = useStore.getState().recipes.filter(r => r.PositionTypeRef === 'A01' && r.IsDeleted !== 'Y').map(r => r.ElementTypeRef)
    expect(live).not.toContain('ET-5PIN-SOCKET')
    expect(live).toContain('ET-5PIN-PLUG')
  })
})
