import { describe, test, expect, beforeEach, vi } from 'vitest'

/**
 * A wrapper's contents are copied onto every position that uses it. An edit made from ANY
 * view — Edit internals, Explode internals, the Review window — must reach every copy.
 * Until 2026-10-23 only Edit internals (activeContextType 'ElementType') propagated; the
 * exploded view and Review edited one position's copy and the copies silently diverged.
 */
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(),
}))

import useStore, { wrapperCopies } from '../../src/store/useStore.js'

const pos = (p, et, id) => ({
  _id: id, _row_num: null, PositionTypeRef: p, ContextType: 'PositionType', ContextRef: p,
  RecipeIndex: 1, ElementTypeRef: et, Quantity: 1, IsDesign: 'Y',
})
const inside = (p, et, ri, id, rowNum = null) => ({
  _id: id, _row_num: rowNum, PositionTypeRef: p, ContextType: 'ElementType', ContextRef: 'ET-LIN-01',
  RecipeIndex: ri, ElementTypeRef: et, Quantity: 1, IsContractItem: 'Y',
})

// C01r and C03r share ET-LIN-01 (profile + tape). C05r has its own, unrelated wrapper.
const SEED = () => [
  pos('C01r', 'ET-LIN-01', 'p1'),
  pos('C03r', 'ET-LIN-01', 'p3'),
  inside('C01r', 'ET-PROF-01', 1, 'a1', 5), inside('C01r', 'ET-TAPE-01', 2, 'a2', 6),
  inside('C03r', 'ET-PROF-01', 1, 'b1', 9), inside('C03r', 'ET-TAPE-01', 2, 'b2', 10),
  pos('C05r', 'ET-LIN-09', 'p5'),
  { ...inside('C05r', 'ET-PROF-01', 1, 'c1', 20), ContextRef: 'ET-LIN-09' },
]

const S = () => useStore.getState()
const row = id => S().recipes.find(r => r._id === id)
const of = p => S().recipes.filter(r => r.PositionTypeRef === p && r.ContextType === 'ElementType' && r.IsDeleted !== 'Y')

// Every mode a user can edit internals from. Explode and Review leave the store in position mode.
const MODES = {
  'position view (Explode / Review)': { activeContextType: 'PositionType', activeETRef: null },
  'Edit internals': { activeContextType: 'ElementType', activeETRef: 'ET-LIN-01' },
}

function seed(mode) {
  useStore.setState({
    recipes: SEED(), rsChanges: [], recipeError: null, psRows: [], elementTypes: [],
    containerETRefs: new Set(['et-lin-01', 'et-lin-09']), ...MODES[mode],
  })
}

describe.each(Object.keys(MODES))('from %s', mode => {
  beforeEach(() => seed(mode))

  test('a quantity edit changes every copy and queues each for export', () => {
    S().updateRecipeRow('C01r', 'a1', { Quantity: 3 })
    expect(row('a1').Quantity).toBe(3)
    expect(row('b1').Quantity).toBe(3)
    expect(row('a2').Quantity).toBe(1)          // the other part is untouched
    expect(row('c1').Quantity).toBe(1)          // the same ET in another wrapper is untouched
    expect(S().rsChanges.map(c => c._id).sort()).toEqual(['a1', 'b1'])
  })

  test('an edit made from the OTHER position reaches the first', () => {
    S().updateRecipeRow('C03r', 'b2', { IsContractItem: null, IsTBC: 'Y' })
    expect(row('a2')).toMatchObject({ IsContractItem: null, IsTBC: 'Y' })
  })

  test('a delete soft-deletes every copy that came from the sheet', () => {
    S().removeRecipeRow('C01r', 'a1')
    expect(row('a1').IsDeleted).toBe('Y')
    expect(row('b1').IsDeleted).toBe('Y')
    expect(row('c1').IsDeleted).toBeUndefined()
  })

  test('restore brings every copy back', () => {
    S().removeRecipeRow('C01r', 'a1')
    S().restoreRecipeRow('C03r', 'b1')
    expect(row('a1').IsDeleted).toBe('N')
    expect(row('b1').IsDeleted).toBe('N')
  })

  test('replace (swap) in one position replaces it in all', () => {
    S().swapElementType('ET-PROF-01', 'ET-PROF-02', { scope: 'position', posRef: 'C01r', rowId: 'a1' })
    expect(row('a1').ElementTypeRef).toBe('ET-PROF-02')
    expect(row('b1').ElementTypeRef).toBe('ET-PROF-02')
    expect(row('c1').ElementTypeRef).toBe('ET-PROF-01')
  })

  test('a new part is added to every copy at one shared RecipeIndex', () => {
    S().addRecipeRow('C01r', 'lin_internal', { elementTypeRef: 'ET-CLIP-01' })
    const clips = S().recipes.filter(r => r.ElementTypeRef === 'ET-CLIP-01')
    expect(clips.map(r => r.PositionTypeRef).sort()).toEqual(['C01r', 'C03r'])
    expect(clips.every(r => r.ContextRef === 'ET-LIN-01' && r.RecipeIndex === 3)).toBe(true)
    expect(of('C05r')).toHaveLength(1)
  })

  test('a part added then deleted is gone from every copy (never-exported rows are dropped)', () => {
    const added = S().addRecipeRow('C01r', 'lin_internal', { elementTypeRef: 'ET-CLIP-01' })
    S().removeRecipeRow('C01r', added._id)
    expect(S().recipes.filter(r => r.ElementTypeRef === 'ET-CLIP-01')).toHaveLength(0)
  })
})

describe('position-mode specifics', () => {
  beforeEach(() => seed('position view (Explode / Review)'))

  test('a position-level row is never propagated', () => {
    S().updateRecipeRow('C01r', 'p1', { Quantity: 2 })
    expect(row('p3').Quantity).toBe(1)
  })

  test('an unshared wrapper changes alone', () => {
    S().updateRecipeRow('C05r', 'c1', { Quantity: 4 })
    expect(row('a1').Quantity).toBe(1)
    expect(row('b1').Quantity).toBe(1)
  })

  test('a copy whose order has drifted is never overwritten with another part', () => {
    // C03r's index 1 holds the tape, not the profile: matching on index alone would retype it.
    useStore.setState({ recipes: SEED().map(r => r._id === 'b1' ? { ...r, ElementTypeRef: 'ET-TAPE-01' } : r) })
    S().updateRecipeRow('C01r', 'a1', { Quantity: 7 })
    expect(row('b1').Quantity).toBe(1)
  })

  test('a Form-pane add (asPosition) also fills every copy, without copying the Form provenance', () => {
    S().addRecipeRow('C01r', 'lin_internal', { elementTypeRef: 'ET-CLIP-01', _origin: 'form', _formCode: 'X1' }, { asPosition: true })
    const [mine, theirs] = ['C01r', 'C03r'].map(p => S().recipes.find(r => r.PositionTypeRef === p && r.ElementTypeRef === 'ET-CLIP-01'))
    expect(mine._origin).toBe('form')
    expect(theirs).toBeTruthy()
    expect(theirs._origin).toBeUndefined()
  })

  test('the shared RecipeIndex clears the highest index on ANY copy', () => {
    useStore.setState({ recipes: [...SEED(), inside('C03r', 'ET-EXTRA', 4, 'b4')] })
    S().addRecipeRow('C01r', 'lin_internal', { elementTypeRef: 'ET-CLIP-01' })
    expect(S().recipes.filter(r => r.ElementTypeRef === 'ET-CLIP-01').map(r => r.RecipeIndex)).toEqual([5, 5])
  })

  test('wrapperCopies finds only the same part, same wrapper, other positions', () => {
    expect(wrapperCopies(S().recipes, row('a1')).map(r => r._id)).toEqual(['b1'])
    expect(wrapperCopies(S().recipes, row('p1'))).toEqual([])
    expect(wrapperCopies(S().recipes, row('c1'))).toEqual([])
  })
})

describe('changes that would split a shared wrapper are refused', () => {
  beforeEach(() => seed('position view (Explode / Review)'))

  const unchanged = () => {
    expect(S().recipeError).toMatch(/shared with C03r/)
    expect(S().recipes).toEqual(SEED())
    expect(S().rsChanges).toEqual([])
  }

  // reorderIngredients picks rows by sectionOfRow, which files ET-PROF/ET-TAPE under dl_internal.
  test('reordering inside it', () => {
    S().reorderIngredients('C01r', 'dl_internal', 0, 1)
    unchanged()
  })

  test('moving a part out of it to the position', () => {
    S().moveIngredientAcrossSections('C01r', 'a2', 'position')
    unchanged()
  })

  test('moving a position part into it', () => {
    useStore.setState({ recipes: [...SEED(), pos('C01r', 'ET-DRV-01', 'p9')] })
    S().moveRecipeRowToSection('C01r', 'p9', 'lin_internal')
    expect(S().recipeError).toMatch(/shared with C03r/)
    expect(row('p9').ContextType).toBe('PositionType')
  })

  test('an unshared wrapper can still be reordered', () => {
    useStore.setState({ recipes: [...SEED(), { ...inside('C05r', 'ET-TAPE-01', 2, 'c2'), ContextRef: 'ET-LIN-09' }] })
    S().reorderIngredients('C05r', 'dl_internal', 0, 1)
    expect(S().recipeError).toBeNull()
    expect(row('c2').RecipeIndex).toBe(1)
  })
})
