import { describe, test, expect } from 'vitest'
import { elementTypeUsage, productUsage, wrapperUsage, unmatchedFormPositions, divergingRefs } from '../../src/utils/usage.js'

const pos = (posRef, ref, extra = {}) => ({
  PositionTypeRef: posRef, ContextType: 'PositionType', ContextRef: posRef, ElementTypeRef: ref, ...extra,
})
const inside = (posRef, container, ref, extra = {}) => ({
  PositionTypeRef: posRef, ContextType: 'ElementType', ContextRef: container, ElementTypeRef: ref, ...extra,
})
const psRow = (ref, mfr, code) => ({ ElementTypeRef: ref, Manufacturer: mfr, ProductCode: code })

// C01r and C03r share the wrapper ET-LIN-01, which holds the profile.
const recipes = [
  pos('C01r', 'ET-LIN-01', { IsDesign: 'Y' }),
  pos('C03r', 'ET-LIN-01', { IsDesign: 'Y' }),
  inside('C01r', 'ET-LIN-01', 'ET-PROF-01'),
  pos('C01r', 'ET-2PIN-SOCK'),
]
const psRows = [psRow('ET-PROF-01', 'Flexalighting', 'FPS2020BG2000'), psRow('ET-LIN-01', 'Ideaworks', 'N/A')]
const containerETRefs = new Set(['et-lin-01'])
const ctx = { recipes, psRows, elementTypes: [], containerETRefs }

describe('recipe usage — what is actually built', () => {
  test('names the positions holding the ET, at any level', () => {
    expect(elementTypeUsage('ET-PROF-01', ctx).recipe.positions).toEqual(['C01r'])
    expect(elementTypeUsage('ET-LIN-01', ctx).recipe.positions).toEqual(['C01r', 'C03r'])
  })

  test('names the wrapper an internal row sits inside', () => {
    expect(elementTypeUsage('ET-PROF-01', ctx).recipe.containers).toEqual(['ET-LIN-01'])
    expect(elementTypeUsage('ET-2PIN-SOCK', ctx).recipe.containers).toEqual([])
  })

  test('a wrapper reports what it contains', () => {
    const u = elementTypeUsage('ET-LIN-01', ctx)
    expect(u.recipe.isContainer).toBe(true)
    expect(u.recipe.contains.map(c => c.ref)).toEqual(['ET-PROF-01'])
  })

  test('a non-wrapper contains nothing', () => {
    expect(elementTypeUsage('ET-PROF-01', ctx).recipe.contains).toEqual([])
  })

  test('deleted rows are not usage', () => {
    const rows = [...recipes, pos('D01r', 'ET-PROF-01', { IsDeleted: 'Y' })]
    expect(elementTypeUsage('ET-PROF-01', { ...ctx, recipes: rows }).recipe.positions).toEqual(['C01r'])
  })

  test('the spec row travels with it', () => {
    expect(elementTypeUsage('ET-PROF-01', ctx).spec).toEqual({ manufacturer: 'Flexalighting', productCode: 'FPS2020BG2000' })
    expect(elementTypeUsage('ET-NOWHERE', ctx).spec).toBeNull()
  })
})

describe('Form usage and recipe usage are never conflated', () => {
  // The Form asks C01r AND C03r for the profile; only C01r's recipe holds it.
  const formCaptures = {
    byPosition: {
      C01r: [{ elementTypeRef: 'ET-PROF-01', code: 'FPS2020BG2000' }],
      C03r: [{ elementTypeRef: 'ET-PROF-01', code: 'FPS2020BG2000' }],
    },
  }
  const withForm = { ...ctx, formCaptures }

  test('the two sources are reported separately', () => {
    const u = elementTypeUsage('ET-PROF-01', withForm)
    expect(u.form.positions).toEqual(['C01r', 'C03r'])
    expect(u.recipe.positions).toEqual(['C01r'])
  })

  test('the difference is spelled out in both directions', () => {
    const u = elementTypeUsage('ET-PROF-01', withForm)
    expect(u.onlyInForm).toEqual(['C03r'])     // stage 3 still to do
    expect(u.onlyInRecipe).toEqual([])
    expect(u.differs).toBe(true)
  })

  test('a recipe row the Form never named is not a difference — it is derived detail', () => {
    // ET-2PIN-SOCK is in C01r's recipe and in no Form entry at all.
    const u = elementTypeUsage('ET-2PIN-SOCK', withForm)
    expect(u.form.positions).toEqual([])
    expect(u.recipe.positions).toEqual(['C01r'])
    expect(u.differs).toBe(false)              // the Form has no opinion about it
  })

  test('agreement is not a difference', () => {
    const caps = { byPosition: { C01r: [{ elementTypeRef: 'ET-PROF-01', code: 'X' }] } }
    expect(elementTypeUsage('ET-PROF-01', { ...ctx, formCaptures: caps }).differs).toBe(false)
  })

  test('with no Form attached nothing ever differs', () => {
    expect(elementTypeUsage('ET-PROF-01', ctx).differs).toBe(false)
    expect(elementTypeUsage('ET-PROF-01', ctx).form.positions).toEqual([])
  })

  test('the captured codes are carried, for display beside the ref', () => {
    expect(elementTypeUsage('ET-PROF-01', withForm).form.codes).toEqual(['FPS2020BG2000'])
  })
})

describe('productUsage — the same question asked of a product', () => {
  test('a maker + code resolves to its ElementType, then to that ET usage', () => {
    const u = productUsage('Flexalighting', 'FPS2020BG2000', ctx)
    expect(u.ref).toBe('ET-PROF-01')
    expect(u.recipe.positions).toEqual(['C01r'])
    expect(u.matchedBy).toEqual({ manufacturer: 'Flexalighting', code: 'FPS2020BG2000' })
  })

  test('an unknown product resolves to nothing', () => {
    expect(productUsage('Acme', 'NOPE', ctx)).toBeNull()
  })

  test('"N/A" names no product, so it has no usage', () => {
    expect(productUsage('Ideaworks', 'N/A', ctx)).toBeNull()
  })
})

describe('wrapperUsage', () => {
  test('a wrapper used by two positions is shared — editing it ripples', () => {
    const u = wrapperUsage('ET-LIN-01', ctx)
    expect(u.shared).toBe(true)
    expect(u.recipe.positions).toEqual(['C01r', 'C03r'])
  })

  test('a wrapper used by one position is not shared', () => {
    const rows = recipes.filter(r => r.PositionTypeRef !== 'C03r')
    expect(wrapperUsage('ET-LIN-01', { ...ctx, recipes: rows }).shared).toBe(false)
  })
})

describe('unmatchedFormPositions — what the Form names that nothing has', () => {
  const resolutions = [
    { formRef: 'C01', target: 'C01r', rows: 3 },      // resolved and has a recipe
    { formRef: 'D01', target: 'D01r', rows: 1 },      // resolved, but no recipe rows
    { formRef: 'MIRROR', target: null, rows: 2 },     // not in the DB at all
  ]

  test('splits "not in the DB" from "in the DB but no recipe"', () => {
    const out = unmatchedFormPositions(resolutions, recipes.concat(pos('C01r', 'ET-X')))
    expect(out).toEqual([
      { formRef: 'D01', target: 'D01r', rows: 1, reason: 'noRecipe' },
      { formRef: 'MIRROR', target: null, rows: 2, reason: 'notInDb' },
    ])
  })

  test('a resolved ref whose position has a recipe is not reported', () => {
    const out = unmatchedFormPositions([resolutions[0]], recipes)
    expect(out).toEqual([])
  })

  test('nothing resolved, everything reported', () => {
    expect(unmatchedFormPositions(resolutions, [])).toHaveLength(3)
  })
})

describe('divergingRefs — the whole set in one pass', () => {
  const rec = (posRef, ref) => ({
    _id: `${posRef}-${ref}`, PositionTypeRef: posRef, ContextType: 'PositionType',
    ContextRef: posRef, ElementTypeRef: ref, Quantity: 1,
  })
  const captures = {
    byPosition: {
      C01r: [{ elementTypeRef: 'ET-TAPE-01' }],
      C03r: [{ elementTypeRef: 'ET-TAPE-01' }],
    },
  }

  test('the Form asks somewhere the recipe has not got it', () => {
    const set = divergingRefs({ recipes: [rec('C01r', 'ET-TAPE-01')], formCaptures: captures })
    expect(set.has('et-tape-01')).toBe(true)   // C03r asks, nothing built
  })

  test('the recipe has it somewhere the Form does not ask', () => {
    const recipes = [rec('C01r', 'ET-TAPE-01'), rec('C03r', 'ET-TAPE-01'), rec('A02m', 'ET-TAPE-01')]
    expect(divergingRefs({ recipes, formCaptures: captures }).has('et-tape-01')).toBe(true)
  })

  test('agreement is not divergence', () => {
    const recipes = [rec('C01r', 'ET-TAPE-01'), rec('C03r', 'ET-TAPE-01')]
    expect(divergingRefs({ recipes, formCaptures: captures }).size).toBe(0)
  })

  // Otherwise every connector and kit in the project would light up as a disagreement.
  test('an ET the Form never mentions cannot diverge — it is derived detail', () => {
    const recipes = [rec('C01r', 'ET-TAPE-01'), rec('C03r', 'ET-TAPE-01'), rec('C01r', 'ET-2PIN-SOCK')]
    const set = divergingRefs({ recipes, formCaptures: captures })
    expect(set.has('et-2pin-sock')).toBe(false)
  })

  test('a deleted row is not evidence of anything', () => {
    const recipes = [
      rec('C01r', 'ET-TAPE-01'), rec('C03r', 'ET-TAPE-01'),
      { ...rec('A02m', 'ET-TAPE-01'), IsDeleted: 'Y' },
    ]
    expect(divergingRefs({ recipes, formCaptures: captures }).size).toBe(0)
  })

  test('no Form attached: nothing can diverge', () => {
    expect(divergingRefs({ recipes: [rec('C01r', 'ET-TAPE-01')], formCaptures: null }).size).toBe(0)
  })

  // The same predicate elementTypeUsage() has always used, now computed for every ref at once.
  test('agrees with elementTypeUsage().differs', () => {
    const recipes = [rec('C01r', 'ET-TAPE-01')]
    const set = divergingRefs({ recipes, formCaptures: captures })
    const one = elementTypeUsage('ET-TAPE-01', { recipes, formCaptures: captures })
    expect(set.has('et-tape-01')).toBe(one.differs)
  })
})
