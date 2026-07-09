import { describe, test, expect } from 'vitest'
import {
  formPresence, compareFormToRecipe, formCoverage, classifyExtra,
  diffCaptures, wrapperDivergence, associations, formWorklist, formProgress,
} from '../../src/utils/formSpec.js'
import { buildPresence } from '../../src/utils/recipePresence.js'

const pos = (posRef, ref, extra = {}) => ({
  _id: `${posRef}-p-${ref}`, PositionTypeRef: posRef, ContextType: 'PositionType',
  ContextRef: posRef, ElementTypeRef: ref, Quantity: 1, ...extra,
})
const inside = (posRef, container, ref, extra = {}) => ({
  _id: `${posRef}-${container}-${ref}`, PositionTypeRef: posRef, ContextType: 'ElementType',
  ContextRef: container, ElementTypeRef: ref, Quantity: 1, ...extra,
})
const ent = (ref, code, over = {}) => ({ elementTypeRef: ref, code, note: '', manufacturer: '', formRef: 'C01', ...over })

// C01r's design element is the wrapper ET-LIN-01, which holds the profile.
const c01r = () => [
  pos('C01r', 'ET-LIN-01', { IsDesign: 'Y' }),
  inside('C01r', 'ET-LIN-01', 'ET-PROF-01'),
  pos('C01r', 'ET-2PIN-SOCK'),
]

describe('the Form has no slot: presence is scope-wide', () => {
  test('a Form ET living INSIDE the wrapper is matched, never misplaced', () => {
    // The whole point. A section-aware check would call ET-PROF-01 'misplaced'.
    const r = compareFormToRecipe(c01r(), 'C01r', [ent('ET-PROF-01', 'FPS2020')], new Set())
    expect(r.matched.map(m => m.elementTypeRef)).toEqual(['ET-PROF-01'])
    expect(r.matched[0].foundIn).toBe('internal')
    expect(r.missing).toEqual([])
    expect(r).not.toHaveProperty('misplaced')
  })

  test('a Form ET at position level is matched too', () => {
    const r = compareFormToRecipe(c01r(), 'C01r', [ent('ET-2PIN-SOCK', 'SK1')], new Set())
    expect(r.matched[0].foundIn).toBe('position')
  })

  test('present in both slots reports both', () => {
    const rows = [...c01r(), inside('C01r', 'ET-LIN-01', 'ET-2PIN-SOCK')]
    const r = compareFormToRecipe(rows, 'C01r', [ent('ET-2PIN-SOCK', 'SK1')], new Set())
    expect(r.matched[0].foundIn).toBe('both')
    expect(r.matched[0].have).toBe(2)
  })

  test('a Form ET absent everywhere is missing', () => {
    const r = compareFormToRecipe(c01r(), 'C01r', [ent('ET-NOPE', 'X1')], new Set())
    expect(r.missing.map(m => m.elementTypeRef)).toEqual(['ET-NOPE'])
    expect(r.missing[0].have).toBe(0)
  })

  test('an ET inside a wrapper the position does NOT use does not satisfy the Form', () => {
    const rows = [pos('C01r', 'ET-LAMP', { IsDesign: 'Y' }), inside('C01r', 'ET-DL-99', 'ET-PROF-01')]
    const r = compareFormToRecipe(rows, 'C01r', [ent('ET-PROF-01', 'FPS2020')], new Set())
    expect(r.missing.map(m => m.elementTypeRef)).toEqual(['ET-PROF-01'])
  })

  test('matching ignores case, and the entry survives for display', () => {
    const r = compareFormToRecipe(c01r(), 'C01r', [ent('et-prof-01', 'FPS2020', { note: 'Profile' })], new Set())
    expect(r.matched).toHaveLength(1)
    expect(r.matched[0].note).toBe('Profile')
    expect(r.matched[0].code).toBe('FPS2020')
  })

  test('deleted rows never satisfy the Form', () => {
    const rows = [pos('C01r', 'ET-LIN-01', { IsDesign: 'Y' }), inside('C01r', 'ET-LIN-01', 'ET-PROF-01', { IsDeleted: 'Y' })]
    expect(compareFormToRecipe(rows, 'C01r', [ent('ET-PROF-01', 'F')], new Set()).missing).toHaveLength(1)
  })

  test('formPresence reads the raw index directly', () => {
    const p = buildPresence([pos('C01r', 'ET-X')], [])
    expect(formPresence(p, 'ET-X').have).toBe(1)
    expect(formPresence(p, 'ET-Y')).toMatchObject({ have: 0, foundIn: null })
  })
})

describe('extras are derived detail, never errors', () => {
  test('a connector absent from the Form lands in extra, not missing', () => {
    const r = compareFormToRecipe(c01r(), 'C01r', [ent('ET-PROF-01', 'FPS2020')], new Set())
    const refs = r.extra.map(e => e.elementTypeRef)
    expect(refs).toContain('ET-2PIN-SOCK')
    expect(refs).toContain('ET-LIN-01')       // the wrapper itself is not in the Form either
    expect(r.missing).toEqual([])
  })

  test('extras are classified by signals that already exist', () => {
    expect(classifyExtra(pos('C01r', 'ET-2PIN-SOCK'))).toBe('connector')
    expect(classifyExtra(pos('C01r', 'ET-CAP-01', { IsContractItem: 'Y' }))).toBe('contract')
    expect(classifyExtra(inside('C01r', 'ET-LIN-01', 'ET-BIT'))).toBe('internal')
    expect(classifyExtra(pos('C01r', 'ET-THING'))).toBe('other')
  })

  test('the wrapper itself is named as such, not lumped in with "other"', () => {
    expect(classifyExtra(pos('C01r', 'ET-LIN-01'), 'ET-LIN-01')).toBe('wrapper')
    const r = compareFormToRecipe(c01r(), 'C01r', [ent('ET-PROF-01', 'F')], new Set())
    expect(r.extra.find(e => e.elementTypeRef === 'ET-LIN-01').kind).toBe('wrapper')
  })

  test('a socket that is also a contract item reads as a connector', () => {
    // Both are true; "connector" is what says it was derived from a Form product.
    expect(classifyExtra(pos('C01r', 'ET-2PIN-SOCK', { IsContractItem: 'Y' }))).toBe('connector')
  })

  test('a ref the Form once had, and no longer has, is orphaned rather than extra', () => {
    const r = compareFormToRecipe(c01r(), 'C01r', [], new Set(), { orphanRefs: ['ET-PROF-01'] })
    expect(r.orphaned.map(o => o.elementTypeRef)).toEqual(['ET-PROF-01'])
    expect(r.extra.map(e => e.elementTypeRef)).not.toContain('ET-PROF-01')
  })
})

describe('coverage', () => {
  test('counts matched over specified', () => {
    const r = compareFormToRecipe(c01r(), 'C01r', [ent('ET-PROF-01', 'A'), ent('ET-NOPE', 'B')], new Set())
    expect(r.coverage).toEqual({ present: 1, total: 2 })
  })

  test('formCoverage is null when the Form says nothing about this position', () => {
    expect(formCoverage(c01r(), 'C01r', [], new Set())).toBeNull()
    expect(formCoverage(c01r(), 'C01r', undefined, new Set())).toBeNull()
  })
})

describe('diffCaptures — the manual compare, done for you', () => {
  const cap = byPosition => ({ version: 1, byPosition })
  const prev = cap({ C01r: [ent('ET-PROF-01', 'FPS2020', { note: 'Profile' })] })

  test('a new code is added', () => {
    const d = diffCaptures(prev, cap({ C01r: [ent('ET-PROF-01', 'FPS2020'), ent('ET-TAPE-01', 'LL240')] }))
    expect(d.added.map(a => a.entry.code)).toEqual(['LL240'])
  })

  test('a vanished code is removed', () => {
    const d = diffCaptures(prev, cap({ C01r: [] }))
    expect(d.removed.map(r => r.entry.code)).toEqual(['FPS2020'])
  })

  test('a re-mapped ElementType is a change, and names the field', () => {
    const d = diffCaptures(prev, cap({ C01r: [ent('ET-PROF-02', 'FPS2020', { note: 'Profile' })] }))
    expect(d.changed).toHaveLength(1)
    expect(d.changed[0].fields).toEqual(['elementTypeRef'])
    expect(d.changed[0].after.elementTypeRef).toBe('ET-PROF-02')
  })

  test('an edited note is a change', () => {
    const d = diffCaptures(prev, cap({ C01r: [ent('ET-PROF-01', 'FPS2020', { note: 'Rigid profile' })] }))
    expect(d.changed[0].fields).toEqual(['note'])
  })

  test('the same code under a different position has moved', () => {
    const d = diffCaptures(prev, cap({ C03r: [ent('ET-PROF-01', 'FPS2020', { note: 'Profile' })] }))
    expect(d.moved).toEqual([expect.objectContaining({ code: 'FPS2020', from: 'C01r', to: 'C03r' })])
    expect(d.added).toEqual([])
    expect(d.removed).toEqual([])
  })

  test('an unchanged capture produces nothing', () => {
    const d = diffCaptures(prev, prev)
    expect([d.added, d.removed, d.changed, d.moved].every(a => a.length === 0)).toBe(true)
  })

  test('a first import (no previous) is all additions', () => {
    const d = diffCaptures(null, prev)
    expect(d.added).toHaveLength(1)
    expect(d.removed).toHaveLength(0)
  })
})

describe('wrapperDivergence — can the shared wrapper absorb this?', () => {
  // C01r and C03r both use ET-LIN-01 as their design element.
  const shared = () => [
    pos('C01r', 'ET-LIN-01', { IsDesign: 'Y' }),
    pos('C03r', 'ET-LIN-01', { IsDesign: 'Y' }),
    inside('C01r', 'ET-LIN-01', 'ET-PROF-01'),
    inside('C03r', 'ET-LIN-01', 'ET-PROF-01'),
  ]
  const change = posRef => ({ posRef, before: ent('ET-PROF-01', 'FPS2020'), after: ent('ET-PROF-02', 'FPS2525'), fields: ['elementTypeRef'] })

  test('all sharers changed alike → consistent, edit in place', () => {
    const d = wrapperDivergence(shared(), { changed: [change('C01r'), change('C03r')] }, new Set())
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ wrapper: 'ET-LIN-01', consistent: true, unchangedPositions: [] })
    expect(d[0].sharers.sort()).toEqual(['C01r', 'C03r'])
  })

  test('only one sharer changed → inconsistent, the wrapper must fork', () => {
    const d = wrapperDivergence(shared(), { changed: [change('C01r')] }, new Set())
    expect(d[0]).toMatchObject({
      wrapper: 'ET-LIN-01', consistent: false,
      changedPositions: ['C01r'], unchangedPositions: ['C03r'],
    })
  })

  test('a wrapper used by one position can never diverge', () => {
    const rows = [pos('C01r', 'ET-LIN-01', { IsDesign: 'Y' }), inside('C01r', 'ET-LIN-01', 'ET-PROF-01')]
    expect(wrapperDivergence(rows, { changed: [change('C01r')] }, new Set())[0].consistent).toBe(true)
  })

  test('a position with no wrapper reports nothing — the change is position-level', () => {
    const rows = [pos('C01r', 'ET-LAMP', { IsDesign: 'Y' })]
    expect(wrapperDivergence(rows, { changed: [change('C01r')] }, new Set())).toEqual([])
  })

  test('an empty diff reports nothing', () => {
    expect(wrapperDivergence(shared(), { changed: [] }, new Set())).toEqual([])
    expect(wrapperDivergence(shared(), {}, new Set())).toEqual([])
  })
})

describe('associations — "X consistently has Y"', () => {
  // P1 and P2 both specify the profile; both also hold a socket the Form never mentions.
  // P3 specifies something else and holds no socket.
  const recipes = [
    pos('P1', 'ET-PROF-01'), pos('P1', 'ET-2PIN-SOCK'),
    pos('P2', 'ET-PROF-01'), pos('P2', 'ET-2PIN-SOCK'),
    pos('P3', 'ET-LAMP'),
  ]
  const captures = {
    byPosition: {
      P1: [ent('ET-PROF-01', 'A')],
      P2: [ent('ET-PROF-01', 'A')],
      P3: [ent('ET-LAMP', 'B')],
    },
  }

  test('a derived row present with X everywhere, and never without it, is associated', () => {
    const a = associations(recipes, captures)
    expect(a.get('et-prof-01')).toEqual([{ ref: 'et-2pin-sock', support: 2 }])
  })

  test('a row that also appears WITHOUT X is not associated — it means nothing', () => {
    const rows = [...recipes, pos('P3', 'ET-2PIN-SOCK')]
    expect(associations(rows, captures).get('et-prof-01')).toBeUndefined()
  })

  test('a row missing from one position holding X is not associated', () => {
    const rows = recipes.filter(r => !(r.PositionTypeRef === 'P2' && r.ElementTypeRef === 'ET-2PIN-SOCK'))
    expect(associations(rows, captures).get('et-prof-01')).toBeUndefined()
  })

  test('support below the threshold is ignored', () => {
    expect(associations(recipes, captures, { minSupport: 3 }).size).toBe(0)
    expect(associations(recipes, captures, { minSupport: 2 }).size).toBe(1)
  })

  test('an ET the Form itself specifies is never suggested as derived', () => {
    const caps = { byPosition: { P1: [ent('ET-PROF-01', 'A'), ent('ET-2PIN-SOCK', 'C')], P2: [ent('ET-PROF-01', 'A'), ent('ET-2PIN-SOCK', 'C')] } }
    expect(associations(recipes, caps).get('et-prof-01')).toBeUndefined()
  })

  test('no captures, no associations', () => {
    expect(associations(recipes, { byPosition: {} }).size).toBe(0)
    expect(associations(recipes, null).size).toBe(0)
  })
})

describe('formWorklist — what is left to reconcile', () => {
  // C01r holds the profile inside its wrapper; C03r has a plain design element and
  // holds nothing; D01r is complete. NOTE C03r must NOT share ET-LIN-01 — a shared
  // wrapper's internals count for every position using it (see below).
  const recipes = [
    pos('C01r', 'ET-LIN-01', { IsDesign: 'Y' }), inside('C01r', 'ET-LIN-01', 'ET-PROF-01'),
    pos('C03r', 'ET-LAMP', { IsDesign: 'Y' }),
    pos('D01r', 'ET-TAPE-01'),
  ]
  const captures = {
    byPosition: {
      C01r: [ent('ET-PROF-01', 'A'), ent('ET-TAPE-01', 'B')],   // 1 of 2
      C03r: [ent('ET-PROF-01', 'A')],                            // 0 of 1
      D01r: [ent('ET-TAPE-01', 'B')],                            // complete
    },
    orphansByPosition: {},
  }

  test('only incomplete positions appear, ref-sorted', () => {
    const w = formWorklist(recipes, captures, new Set())
    expect(w.map(x => x.posRef)).toEqual(['C01r', 'C03r'])
  })

  test('each entry carries its coverage and how many products are missing', () => {
    const [c01, c03] = formWorklist(recipes, captures, new Set())
    expect(c01).toMatchObject({ coverage: { present: 1, total: 2 }, missing: 1, orphans: 0 })
    expect(c03).toMatchObject({ coverage: { present: 0, total: 1 }, missing: 1 })
  })

  test('a position with only orphans appears, but its coverage is complete', () => {
    const caps = { byPosition: { D01r: [ent('ET-TAPE-01', 'B')] }, orphansByPosition: { D01r: ['ET-GONE'] } }
    const rows = [...recipes, pos('D01r', 'ET-GONE')]
    const [d] = formWorklist(rows, caps, new Set())
    expect(d).toMatchObject({ posRef: 'D01r', orphans: 1, missing: 0 })
    expect(d.coverage).toEqual({ present: 1, total: 1 })
  })

  test('no Form attached, no worklist', () => {
    expect(formWorklist(recipes, null, new Set())).toEqual([])
    expect(formWorklist(recipes, { byPosition: {} }, new Set())).toEqual([])
  })

  test('everything reconciled, empty worklist', () => {
    const caps = { byPosition: { D01r: [ent('ET-TAPE-01', 'B')] } }
    expect(formWorklist(recipes, caps, new Set())).toEqual([])
  })

  test('a Form ET inside the wrapper counts as present here too', () => {
    // C01r's profile lives inside ET-LIN-01: it must not appear as missing.
    const caps = { byPosition: { C01r: [ent('ET-PROF-01', 'A')] } }
    expect(formWorklist(recipes, caps, new Set())).toEqual([])
  })

  test('a SHARED wrapper satisfies every position that uses it', () => {
    // C03r uses ET-LIN-01 too; the profile inside it is genuinely present for C03r,
    // even though the row is stored under C01r. Neither position is on the worklist.
    const shared = [...recipes.filter(r => r.PositionTypeRef !== 'C03r'), pos('C03r', 'ET-LIN-01', { IsDesign: 'Y' })]
    const caps = { byPosition: { C01r: [ent('ET-PROF-01', 'A')], C03r: [ent('ET-PROF-01', 'A')] } }
    expect(formWorklist(shared, caps, new Set())).toEqual([])
  })
})

describe('formProgress — the header roll-up', () => {
  const recipes = [pos('C01r', 'ET-PROF-01'), pos('C03r', 'ET-X')]
  const captures = {
    byPosition: { C01r: [ent('ET-PROF-01', 'A')], C03r: [ent('ET-PROF-01', 'A'), ent('ET-TAPE-01', 'B')] },
    orphansByPosition: {},
  }

  test('counts positions complete and products still missing', () => {
    expect(formProgress(recipes, captures, new Set())).toEqual({ total: 2, complete: 1, missing: 2, orphans: 0 })
  })

  test('silent when no Form is attached', () => {
    expect(formProgress(recipes, null, new Set())).toBeNull()
    expect(formProgress(recipes, { byPosition: {} }, new Set())).toBeNull()
  })

  test('orphans are counted but never make a position incomplete', () => {
    const caps = { byPosition: { C01r: [ent('ET-PROF-01', 'A')] }, orphansByPosition: { C01r: ['ET-X'] } }
    const rows = [pos('C01r', 'ET-PROF-01'), pos('C01r', 'ET-X')]
    expect(formProgress(rows, caps, new Set())).toEqual({ total: 1, complete: 1, missing: 0, orphans: 1 })
  })
})
