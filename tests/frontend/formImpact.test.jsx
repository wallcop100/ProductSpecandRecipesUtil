import { describe, test, expect } from 'vitest'
import { formImpact } from '../../src/utils/formImpact.js'
import { buildMaster } from '../../src/utils/productCodes.js'
import { recipeSignature, sameRecipeGroups } from '../../src/utils/recipeSignature.js'

const ps = [
  { ElementTypeRef: 'ET-PS-01', Manufacturer: 'Orluna', ProductCode: 'ZH-OLD-1' },
  { ElementTypeRef: 'ET-PS-02', Manufacturer: 'Orluna', ProductCode: 'ZH-NEW-2' },
]
const master = buildMaster(ps)
const pos = (p, ref, x = {}) => ({ _id: `${p}-${ref}`, PositionTypeRef: p, ContextType: 'PositionType', ContextRef: p, ElementTypeRef: ref, Quantity: 1, ...x })
const inside = (p, w, ref) => ({ _id: `${p}-${w}-${ref}`, PositionTypeRef: p, ContextType: 'ElementType', ContextRef: w, ElementTypeRef: ref, Quantity: 1 })
const row = (pt, rawText) => ({ positionType: pt, formRef: pt, manufacturer: 'Orluna', rawText })
const run = (posRef, baseRows, newRows, recipes) => formImpact({ posRef, baseRows, newRows, recipes, master })

describe('formImpact', () => {
  test('a known code replaced by another known code is a swap', () => {
    const c = run('A1', [row('A1', 'ZH-OLD-1')], [row('A1', 'ZH-NEW-2')], [pos('A1', 'ET-PS-01')])
    expect(c).toMatchObject([{ kind: 'swap', fromEt: 'ET-PS-01', toEt: 'ET-PS-02', inRecipe: true, consistent: true }])
  })

  test('a known code replaced by an unknown one: update in place when every user changes and the old code is gone', () => {
    const recipes = [pos('A1', 'ET-PS-01'), pos('A2', 'ET-PS-01')]
    const c = run('A1', [row('A1', 'ZH-OLD-1'), row('A2', 'ZH-OLD-1')], [row('A1', 'ZH-BRAND-9'), row('A2', 'ZH-BRAND-9')], recipes)
    expect(c).toMatchObject([{ kind: 'respec', fromEt: 'ET-PS-01', toCode: 'ZH-BRAND-9', sharers: ['A2'], changing: ['A2'], consistent: true, stillInForm: false, canUpdate: true }])
  })

  test('shared, and another user keeps the old code: no update in place (fork / new)', () => {
    const recipes = [pos('A1', 'ET-PS-01'), pos('A2', 'ET-PS-01')]
    const c = run('A1', [row('A1', 'ZH-OLD-1'), row('A2', 'ZH-OLD-1')], [row('A1', 'ZH-BRAND-9'), row('A2', 'ZH-OLD-1')], recipes)
    expect(c[0]).toMatchObject({ kind: 'respec', notChanging: ['A2'], consistent: false, stillInForm: true, canUpdate: false })
  })

  test('not shared, but the old code is still in the Form elsewhere: still no update in place', () => {
    const c = run('A1', [row('A1', 'ZH-OLD-1')], [row('A1', 'ZH-BRAND-9'), row('B9', 'ZH-OLD-1')], [pos('A1', 'ET-PS-01')])
    expect(c[0]).toMatchObject({ kind: 'respec', consistent: true, stillInForm: true, canUpdate: false })
  })

  test('a code swap inside a shared wrapper names the wrapper and its other users', () => {
    const recipes = [pos('A1', 'ET-DL-01', { IsDesign: 'Y' }), inside('A1', 'ET-DL-01', 'ET-PS-01'), pos('A2', 'ET-DL-01', { IsDesign: 'Y' }), inside('A2', 'ET-DL-01', 'ET-PS-01')]
    const c = run('A1', [row('A1', 'ZH-OLD-1'), row('A2', 'ZH-OLD-1')], [row('A1', 'ZH-NEW-2'), row('A2', 'ZH-OLD-1')], recipes)
    expect(c[0]).toMatchObject({ kind: 'swap', container: 'ET-DL-01', wrapperUsers: ['A2'], notChanging: ['A2'], consistent: false })
  })

  test('added and removed codes; unchanged rows say nothing', () => {
    const c = run('A1', [row('A1', 'ZH-OLD-1'), row('A1', 'same thing')], [row('A1', 'same thing'), row('A1', 'ZH-NEW-2')], [pos('A1', 'ET-PS-01')])
    expect(c.map(x => x.kind)).toEqual(['swap'])
    const d = run('A1', [row('A1', 'ZH-OLD-1')], [], [pos('A1', 'ET-PS-01')])
    expect(d).toMatchObject([{ kind: 'remove', fromEt: 'ET-PS-01' }])
    const e = run('A1', [], [row('A1', 'ZH-NEW-2')], [])
    expect(e).toEqual([])   // no base: no diff
  })
})

describe('recipeSignature (A59TJK)', () => {
  test('identical recipes match; a different quantity does not', () => {
    const recipes = [pos('A1', 'ET-PS-01'), pos('A2', 'ET-PS-01'), pos('A3', 'ET-PS-01', { Quantity: 2 })]
    expect(recipeSignature(recipes, 'A1')).toBe(recipeSignature(recipes, 'A2'))
    const g = sameRecipeGroups(recipes, ['A1', 'A2', 'A3'])
    expect(g.get('A1')).toEqual(['A2'])
    expect(g.get('A3')).toEqual([])
  })
})
