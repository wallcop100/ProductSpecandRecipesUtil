import { describe, it, expect } from 'vitest'
import { reconcileAll, stampExported, same } from '../../src/utils/reconcile'

const ps = (ref, f = {}) => ({ ElementTypeRef: ref, _row_num: 2, ...f })
const rsRow = (ctx, ref, idx = 1, f = {}) => ({ ContextType: 'PositionType', ContextRef: ctx, RecipeIndex: idx, ElementTypeRef: ref, _row_num: 5, ...f })

describe('reconcile: the file decides', () => {
  it('cell equality is Excel\'s', () => {
    expect(same(1, '1')).toBe(true); expect(same('', null)).toBe(true); expect(same('Y ', 'Y')).toBe(true); expect(same('Y', 'N')).toBe(false)
  })

  it('applied leaves the queue, not-yet stays, someone else\'s edit is a conflict', () => {
    const pending = { ps: [
      { elementTypeRef: 'ET-A', updates: { ProductCode: 'NEW' }, before: { ProductCode: 'OLD' } },
      { elementTypeRef: 'ET-B', updates: { ProductCode: 'NEW' }, before: { ProductCode: 'OLD' } },
      { elementTypeRef: 'ET-C', updates: { ProductCode: 'NEW' }, before: { ProductCode: 'OLD' } },
    ] }
    const r = reconcileAll(pending, { psRows: [ps('ET-A', { ProductCode: 'NEW' }), ps('ET-B', { ProductCode: 'OLD' }), ps('ET-C', { ProductCode: 'HAND' })] })
    expect(r.ps.applied.map(e => e.elementTypeRef)).toEqual(['ET-A'])
    expect(r.ps.keep.map(e => e.elementTypeRef)).toEqual(['ET-B', 'ET-C'])
    expect(r.ps.conflicts[0].fields).toEqual([{ field: 'ProductCode', mine: 'NEW', file: 'HAND', base: 'OLD' }])
    expect(r.counts.ps).toEqual({ applied: 1, pending: 1, conflicts: 1 })
  })

  it('a new row: pending until the file has it, then applied, never appended twice', () => {
    const e = { elementTypeRef: 'ET-NEW', updates: { Manufacturer: 'WAGO', ProductCode: '770-503' }, before: {}, _isNew: true }
    expect(reconcileAll({ ps: [e] }, { psRows: [] }).ps.keep).toHaveLength(1)
    expect(reconcileAll({ ps: [e] }, { psRows: [ps('ET-NEW', { Manufacturer: 'WAGO', ProductCode: '770-503' })] }).ps.applied).toHaveLength(1)
  })

  it('a rename is applied when the new ref is there and the old is gone', () => {
    const e = { elementTypeRef: 'ET-LIN-TAPE-06', updates: { Family: 'ET-LIN-FLEX', ElementTypeRef: 'ET-LIN-FLEX-01' }, before: { Family: 'ET-LIN-TAPE' } }
    expect(reconcileAll({ db: [e] }, { elementTypes: [ps('ET-LIN-FLEX-01', { Family: 'ET-LIN-FLEX' })] }).db.applied).toHaveLength(1)
    const notYet = reconcileAll({ db: [e] }, { elementTypes: [ps('ET-LIN-TAPE-06', { Family: 'ET-LIN-TAPE' })] }).db
    expect(notYet.keep[0]).toMatchObject({ elementTypeRef: 'ET-LIN-TAPE-06', updates: { ElementTypeRef: 'ET-LIN-FLEX-01' } })
    expect(notYet.conflicts).toEqual([])
  })

  it('SortOrder never decides: the DesignDB patch re-sorts the sheet', () => {
    const e = { elementTypeRef: 'ET-X', updates: { Family: 'ET-DL', SortOrder: 12 }, before: {}, _isNew: true }
    expect(reconcileAll({ db: [e] }, { elementTypes: [ps('ET-X', { Family: 'ET-DL', SortOrder: 99 })] }).db.applied).toHaveLength(1)
  })

  it('a field exported, then edited again: the batch landed, the newer value stays pending on a new base', () => {
    const [e] = stampExported({ ps: [{ elementTypeRef: 'ET-A', updates: { ProductCode: 'V1' }, before: { ProductCode: 'OLD' } }] }, 1).ps
    const edited = { ...e, updates: { ProductCode: 'V2' } }
    const r = reconcileAll({ ps: [edited] }, { psRows: [ps('ET-A', { ProductCode: 'V1' })] }).ps
    expect(r.conflicts).toEqual([])
    expect(r.keep[0]).toMatchObject({ updates: { ProductCode: 'V2' }, before: { ProductCode: 'V1' } })
    expect(r.keep[0].exported).toBeUndefined()
  })

  it('recipes: an appended row, an update and a delete, each by the patch\'s own key', () => {
    const add = { _id: 'a', action: 'upsert', row: { ...rsRow('C10r', 'ET-LIN-08'), _row_num: null, Quantity: 1, IsDesign: 'Y' } }
    const upd = { _id: 'u', action: 'upsert', row: rsRow('C01r', 'ET-LIN-CAP-04', 3), changedFields: { Quantity: 2 }, before: { Quantity: 1 } }
    const del = { _id: 'd', action: 'delete', row: rsRow('C01r', 'ET-LIN-DIFF-01', 4) }
    const before = reconcileAll({ rs: [add, upd, del] }, { recipes: [rsRow('C01r', 'ET-LIN-CAP-04', 3, { Quantity: 1 }), rsRow('C01r', 'ET-LIN-DIFF-01', 4)] }).rs
    expect(before.applied).toEqual([])
    expect(before.keep.map(e => e._id)).toEqual(['a', 'u', 'd'])
    const after = reconcileAll({ rs: [add, upd, del] }, { recipes: [rsRow('C10r', 'ET-LIN-08', 1, { Quantity: 1, IsDesign: 'Y' }),
      rsRow('C01r', 'ET-LIN-CAP-04', 3, { Quantity: 2 }), rsRow('C01r', 'ET-LIN-DIFF-01', 4, { IsDeleted: 'Y' })] }).rs
    expect(after.applied.map(e => e._id)).toEqual(['a', 'u', 'd'])
    expect(after.keep).toEqual([])
  })

  it('a recipe row edited by hand in the file is a conflict, not overwritten or lost', () => {
    const upd = { _id: 'u', action: 'upsert', row: rsRow('C01r', 'ET-LIN-CAP-04', 3), changedFields: { Quantity: 2 }, before: { Quantity: 1 } }
    const r = reconcileAll({ rs: [upd] }, { recipes: [rsRow('C01r', 'ET-LIN-CAP-04', 3, { Quantity: 4 })] }).rs
    expect(r.conflicts[0].fields).toEqual([{ field: 'Quantity', mine: 2, file: 4, base: 1 }])
    expect(r.keep).toHaveLength(1)
  })

  it('a conflict stays a conflict on the next check, until a person settles it', () => {
    const add = { _id: 'a', action: 'upsert', row: { ...rsRow('C10r', 'ET-LIN-08'), _row_num: null, Quantity: 1, IsContractItem: 'Y' } }
    const file = { recipes: [rsRow('C10r', 'ET-LIN-08', 1, { Quantity: '' })] }
    const first = reconcileAll({ rs: [add] }, file).rs
    expect(first.conflicts).toHaveLength(1)
    const again = reconcileAll({ rs: first.keep }, file).rs
    expect(again.conflicts).toHaveLength(1)
    const pe = { elementTypeRef: 'ET-A', updates: { ProductCode: 'MINE' }, before: { ProductCode: 'OLD' } }
    const k1 = reconcileAll({ ps: [pe] }, { psRows: [ps('ET-A', { ProductCode: 'HAND' })] }).ps
    expect(reconcileAll({ ps: k1.keep }, { psRows: [ps('ET-A', { ProductCode: 'HAND' })] }).ps.conflicts).toHaveLength(1)
  })
})

test('a queued new row with no ContextRef leaves the queue: it can never be written', () => {
  const phantom = { _id: 'x', action: 'upsert', row: { ContextType: 'PositionType', ContextRef: undefined, RecipeIndex: 1, ElementTypeRef: 'ET-A', IsContractItem: 'Y' } }
  const r = reconcileAll({ rs: [phantom] }, { recipes: [] })
  expect(r.rs.keep).toEqual([])
  expect(r.rs.dropped).toEqual([phantom])
})

it('report #55: a DesignDB ET created then deleted does not wait once the file lacks it', () => {
  const e = { elementTypeRef: 'ET-GONE', updates: { Name: 'x', IsDeleted: 'Y' }, before: {}, _isNew: true, batch: 1, exported: { Name: 'x', IsDeleted: 'Y' } }
  const r = reconcileAll({ db: [e] }, { elementTypes: [], collectionRefs: [] })
  expect(r.db.keep).toEqual([])
  expect(r.db.applied).toEqual([e])
})
