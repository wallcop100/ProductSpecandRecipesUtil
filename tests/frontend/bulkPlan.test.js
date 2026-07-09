import { describe, test, expect } from 'vitest'
import { planCollectionBulk, effectiveActions } from '../../src/utils/collectionStatus.js'

/**
 * Bulk apply used to push every ingredient into every target, so a half-done
 * position collected duplicates and a short quantity was never noticed. The plan
 * resolves each (position, ingredient) against the real recipe first.
 */

const pos = (posRef, ref, extra = {}) => ({
  PositionTypeRef: posRef, ContextType: 'PositionType', ContextRef: posRef,
  ElementTypeRef: ref, Quantity: 1, _id: `${posRef}-${ref}`, ...extra,
})
const inside = (posRef, container, ref, extra = {}) => ({
  PositionTypeRef: posRef, ContextType: 'ElementType', ContextRef: container,
  ElementTypeRef: ref, Quantity: 1, _id: `${posRef}-${container}-${ref}`, ...extra,
})

const collection = {
  CollectionId: 'c1', Name: 'Site kit',
  Ingredients: [
    { ElementTypeRef: 'ET-SOCK', section: 'position' },
    { ElementTypeRef: 'ET-PLUG', section: 'dl_internal' },
  ],
}
const containers = new Set(['et-dl-04', 'et-dl-07'])
const actionFor = (plan, posRef, ref) => plan.actions.find(a => a.posRef === posRef && a.ref === ref)

describe('planCollectionBulk', () => {
  test('an empty position gets an add for each ingredient', () => {
    const recipes = [pos('P1', 'ET-DL-04', { IsDesign: 'Y' })]
    const plan = planCollectionBulk(recipes, ['P1'], collection, containers)
    expect(actionFor(plan, 'P1', 'ET-SOCK').action).toBe('add')
    expect(actionFor(plan, 'P1', 'ET-PLUG')).toMatchObject({ action: 'add', container: 'ET-DL-04' })
  })

  test('a PARTIAL position is not given a duplicate of what it already has', () => {
    // This was the bug: bulk targeted 'partial' positions and re-added everything.
    const recipes = [
      pos('P1', 'ET-DL-04', { IsDesign: 'Y' }),
      pos('P1', 'ET-SOCK'),
      inside('P1', 'ET-DL-04', 'ET-PLUG'),
    ]
    const plan = planCollectionBulk(recipes, ['P1'], collection, containers)
    expect(plan.actions.every(a => a.action === 'skip')).toBe(true)
    expect(effectiveActions(plan)).toEqual([])
  })

  test('a short quantity is topped up, not appended', () => {
    const coll = { ...collection, Ingredients: [{ ElementTypeRef: 'ET-CAP', section: 'position', quantity: 2 }] }
    const recipes = [pos('P1', 'ET-CAP', { Quantity: 1 })]
    const a = actionFor(planCollectionBulk(recipes, ['P1'], coll, containers), 'P1', 'ET-CAP')
    expect(a).toMatchObject({ action: 'topUp', have: 1, need: 2 })
    expect(a.rows[0]._id).toBe('P1-ET-CAP')          // raise THIS row
  })

  test('a misplaced ingredient is moved, not duplicated', () => {
    const recipes = [
      pos('P1', 'ET-DL-04', { IsDesign: 'Y' }),
      pos('P1', 'ET-PLUG'),                            // wants to be inside the wrapper
    ]
    const a = actionFor(planCollectionBulk(recipes, ['P1'], collection, containers), 'P1', 'ET-PLUG')
    expect(a.action).toBe('move')
    expect(a.foundAt).toEqual({ section: 'position', container: null })
    expect(a.rows[0]._id).toBe('P1-ET-PLUG')
  })

  test('an internal ingredient on a position with no wrapper is blocked, never added', () => {
    const recipes = [pos('P1', 'ET-LAMP', { IsDesign: 'Y' })]   // not a container
    const a = actionFor(planCollectionBulk(recipes, ['P1'], collection, containers), 'P1', 'ET-PLUG')
    expect(a).toMatchObject({ action: 'blocked', container: null })
    expect(effectiveActions(planCollectionBulk(recipes, ['P1'], collection, containers))
      .some(x => x.ref === 'ET-PLUG')).toBe(false)
  })
})

describe('a wrapper shared by several positions', () => {
  // P1 and P2 both use ET-DL-04. Its internals are one shared assembly.
  const recipes = [
    pos('P1', 'ET-DL-04', { IsDesign: 'Y' }),
    pos('P2', 'ET-DL-04', { IsDesign: 'Y' }),
  ]

  test('the internal ingredient is planned ONCE, and the other position says why', () => {
    const plan = planCollectionBulk(recipes, ['P1', 'P2'], collection, containers)
    expect(actionFor(plan, 'P1', 'ET-PLUG').action).toBe('add')
    expect(actionFor(plan, 'P2', 'ET-PLUG')).toMatchObject({
      action: 'skip', reason: 'sharedWrapper', sharedWith: 'P1',
    })
  })

  test('but the position-level ingredient is added to BOTH — it is not shared', () => {
    const plan = planCollectionBulk(recipes, ['P1', 'P2'], collection, containers)
    expect(actionFor(plan, 'P1', 'ET-SOCK').action).toBe('add')
    expect(actionFor(plan, 'P2', 'ET-SOCK').action).toBe('add')
  })

  test('positions with DIFFERENT wrappers each get their own internal copy', () => {
    const rows = [pos('P1', 'ET-DL-04', { IsDesign: 'Y' }), pos('P2', 'ET-DL-07', { IsDesign: 'Y' })]
    const plan = planCollectionBulk(rows, ['P1', 'P2'], collection, containers)
    expect(actionFor(plan, 'P1', 'ET-PLUG')).toMatchObject({ action: 'add', container: 'ET-DL-04' })
    expect(actionFor(plan, 'P2', 'ET-PLUG')).toMatchObject({ action: 'add', container: 'ET-DL-07' })
  })

  test('a wrapper already holding the ingredient covers every position using it', () => {
    const rows = [...recipes, inside('P1', 'ET-DL-04', 'ET-PLUG')]
    const plan = planCollectionBulk(rows, ['P1', 'P2'], collection, containers)
    expect(actionFor(plan, 'P1', 'ET-PLUG').action).toBe('skip')
    expect(actionFor(plan, 'P2', 'ET-PLUG').action).toBe('skip')   // wrapper-aware coverage
  })
})

describe('counts drive the confirmation footer', () => {
  test('every action is tallied', () => {
    const recipes = [
      pos('P1', 'ET-DL-04', { IsDesign: 'Y' }), pos('P1', 'ET-PLUG'),  // move
      pos('P2', 'ET-DL-07', { IsDesign: 'Y' }), pos('P2', 'ET-SOCK'),  // sock skip, plug add
    ]
    const { counts } = planCollectionBulk(recipes, ['P1', 'P2'], collection, containers)
    expect(counts).toMatchObject({ add: 2, move: 1, skip: 1 })
  })
})
