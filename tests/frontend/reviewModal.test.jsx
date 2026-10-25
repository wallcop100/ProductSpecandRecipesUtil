import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

window.electronAPI = { db: { setPref: vi.fn().mockResolvedValue(undefined), getPref: vi.fn().mockResolvedValue(null) } }
Element.prototype.scrollIntoView = vi.fn()
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))

const { default: useStore } = await import('../../src/store/useStore.js')
const { default: ReviewModal, ruleOfSet } = await import('../../src/components/ReviewModal.jsx')
const { default: PositionRail } = await import('../../src/components/PositionRail.jsx')
const { queryRefs, partMatches, wordRule } = await import('../../src/utils/positionQuery.js')
const { find, positionsHolding } = await import('../../src/help/search.js')

const pos = (posRef, ref) => ({ _id: `${posRef}-${ref}`, PositionTypeRef: posRef, ContextType: 'PositionType', ContextRef: posRef, ElementTypeRef: ref, Quantity: 1 })
const psRows = [{ ElementTypeRef: 'ET-X', Manufacturer: 'Acme', ProductCode: 'AC-1' }, { ElementTypeRef: 'ET-Y', Manufacturer: 'Bolt', ProductCode: 'BO-2', ComponentDescription: 'Acme driver' }]

function setup() {
  localStorage.clear()
  useStore.setState({
    projectId: 1, positionTypes: [{ PositionTypeRef: 'A1' }, { PositionTypeRef: 'A2' }, { PositionTypeRef: 'A3' }],
    recipes: [pos('A1', 'ET-X'), pos('A2', 'ET-X'), pos('A3', 'ET-Y')],
    containerETRefs: new Set(), psRows, elementTypes: [], positionUI: {}, formCaptures: null,
    validationResults: [], ignoredPositionFamilies: [], tagDrift: {}, activePositionRef: 'A3',
    positionList: { text: '', tags: [], formOnly: false, emptyOnly: false, showIgnored: false, showTags: false, sort: 'ref', collapsed: [], query: null },
  })
}
const byMaker = { match: 'all', conditions: [{ column: 'Recipe.Manufacturer', op: 'equals', value: 'Acme' }] }

describe('positionQuery', () => {
  test('a rule picks the positions whose recipe holds it; refs pass through', () => {
    setup()
    expect([...queryRefs({ rule: byMaker }, useStore.getState())].sort()).toEqual(['A1', 'A2'])
    expect([...queryRefs({ refs: ['A3'] }, useStore.getState())]).toEqual(['A3'])
    expect(queryRefs(null, useStore.getState())).toBeNull()
  })
  test('a part is highlighted when it satisfies a positive recipe condition', () => {
    expect(partMatches(byMaker, 'ET-X', { psRows })).toBe(true)
    expect(partMatches(byMaker, 'ET-Y', { psRows })).toBe(false)
    expect(partMatches({ match: 'all', conditions: [{ column: 'Recipe.Manufacturer', op: 'notEquals', value: 'Bolt' }] }, 'ET-X', { psRows })).toBe(false)
    expect(partMatches(wordRule('bo-2'), 'ET-Y', { psRows })).toBe(true)
  })
})

describe('Review recipes → the rail', () => {
  test('Show in list filters the rail, opens a match, and the chip clears it', async () => {
    setup()
    const onHide = vi.fn()
    useStore.setState({ positionList: { ...useStore.getState().positionList, query: { rule: byMaker } } })
    render(<><ReviewModal show onHide={onHide} /><PositionRail /></>)
    expect(await screen.findByText('2 positions match')).toBeInTheDocument()
    fireEvent.click(screen.getByText(/Show 2 in list/))
    expect(onHide).toHaveBeenCalled()
    expect(useStore.getState().activePositionRef).toBe('A1')
    expect(screen.getByTestId('rail-A1')).toBeInTheDocument()
    expect(screen.queryByTestId('rail-A3')).toBeNull()
    fireEvent.click(screen.getByTitle('Clear the filter'))
    expect(screen.getByTestId('rail-A3')).toBeInTheDocument()
  })
  test('old saved sets read across', () => {
    expect(ruleOfSet({ unit: 'position', filter: { match: 'all', conditions: [{ field: 'Contains', op: 'text', value: 'DL' }, { field: 'Rows', op: 'gt', value: 1 }] } }))
      .toEqual({ match: 'all', conditions: [{ column: 'Recipe.ElementType', op: 'matches', value: '*DL*' }] })
  })
})

describe('Find', () => {
  test('a word some recipe holds offers to filter the list', () => {
    setup()
    expect(positionsHolding('acme', useStore.getState())).toBe(3)   // A3 by its description, as the rule reads it
    expect(queryRefs({ rule: wordRule('acme') }, useStore.getState()).size).toBe(3)
    const r = find('acme', { state: useStore.getState() }).find(x => x.kind === 'filter')
    expect(r.title).toBe('Show positions with “acme”')
    expect(r.sub).toMatch(/^3 positions/)
    expect(find('zzz', { state: useStore.getState() }).some(x => x.kind === 'filter')).toBe(false)
  })
})
