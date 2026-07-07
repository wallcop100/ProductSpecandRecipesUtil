import { describe, test, expect } from 'vitest'
import { buildPsScript, buildRsScript, buildDbScript } from '../../src/utils/patchScript.js'

describe('buildPsScript', () => {
  test('wraps in a runnable Office Scripts main() with the Form worksheet', () => {
    const s = buildPsScript([
      { elementTypeRef: 'ET-DL-01', updates: { ProductCode: 'ABC-123', IsTBC: 'Y' }, before: {} },
    ])
    expect(s).toContain('function main(workbook: ExcelScript.Workbook)')
    expect(s).toContain('workbook.getWorksheet("Form")')
    expect(s).toContain('const col = colMap(S, ["EntityRef"') // key header always in the used list
    expect(s).toContain('const r = rowByKey(S, col["EntityRef"], "ET-DL-01")')
    expect(s).toContain('writeCell(S, r, col["ProductCode"], "ABC-123")')
    expect(s).toContain('writeCell(S, r, col["IsTBC"], "Y")')
    expect(s).toContain('function colMap(S: ExcelScript.Worksheet') // helpers appended
    expect(s).not.toContain('apR') // no appends
  })

  test('new row appends with an append cursor and EntityType', () => {
    const s = buildPsScript([
      { elementTypeRef: 'ET-NEW', _isNew: true, updates: { ProductCode: '0012' } },
    ])
    expect(s).toContain('let apR = S.getUsedRange().getRowCount();')
    expect(s).toContain('writeCell(S, apR, col["EntityRef"], "ET-NEW")')
    expect(s).toContain('writeCell(S, apR, col["EntityType"], "ElementType")')
    // leading-zero product code stays a quoted string, not a bare number
    expect(s).toContain('writeCell(S, apR, col["ProductCode"], "0012")')
    expect(s).toContain('apR++;')
  })

  test('soft-delete is an IsDeleted="Y" update', () => {
    const s = buildPsScript([
      { elementTypeRef: 'ET-OLD', updates: { IsDeleted: 'Y' }, before: {} },
    ])
    expect(s).toContain('writeCell(S, r, col["IsDeleted"], "Y")')
  })

  test('cleared field writes null (which .clear()s the cell)', () => {
    const s = buildPsScript([
      { elementTypeRef: 'ET-C', updates: { Manufacturer: '' }, before: { Manufacturer: 'Acme' } },
    ])
    expect(s).toContain('writeCell(S, r, col["Manufacturer"], null)')
  })

  test('created-then-deleted is a no-op (empty script)', () => {
    expect(buildPsScript([{ elementTypeRef: 'X', _isNew: true, updates: { IsDeleted: 'Y' } }])).toBe('')
  })

  test('empty registry → empty string', () => {
    expect(buildPsScript([])).toBe('')
  })
})

describe('buildDbScript', () => {
  test('targets the ElementTypes sheet keyed on Ref, no EntityType column', () => {
    const s = buildDbScript([{ elementTypeRef: 'ET-Z', _isNew: true, updates: { Name: 'Zed' } }])
    expect(s).toContain('workbook.getWorksheet("ElementTypes")')
    expect(s).toContain('writeCell(S, apR, col["Ref"], "ET-Z")')
    expect(s).toContain('writeCell(S, apR, col["Name"], "Zed")')
    expect(s).not.toContain('EntityType')
  })
})

describe('buildRsScript', () => {
  const key = { ContextType: 'ElementType', ContextRef: 'ET-DL-01', RecipeIndex: 3, ElementTypeRef: 'ET-SOCK-5P' }

  test('update matches the composite key and sets changed fields (numbers bare)', () => {
    const s = buildRsScript([
      { _id: '1', positionTypeRef: 'P1', action: 'upsert',
        row: { _row_num: 5, ...key }, changedFields: { Quantity: 2 }, before: { ...key, Quantity: 1 } },
    ])
    expect(s).toContain('const data = S.getUsedRange().getValues();')
    expect(s).toContain('rowWhere(data, [{ c: col["ContextType"], v: "ElementType" }, { c: col["ContextRef"], v: "ET-DL-01" }, { c: col["RecipeIndex"], v: "3" }, { c: col["EntityRef"], v: "ET-SOCK-5P" }])')
    expect(s).toContain('writeCell(S, r, col["Quantity"], 2)') // bare number
  })

  test('append writes EntityType + mapped fields with a cursor', () => {
    const s = buildRsScript([
      { _id: '2', positionTypeRef: 'P1', action: 'upsert',
        row: { ContextType: 'ElementType', ContextRef: 'ET-DL-01', RecipeIndex: 7, elementTypeRef: 'ET-CLIP', quantity: 1 } },
    ])
    expect(s).toContain('let apR = S.getUsedRange().getRowCount();')
    expect(s).toContain('writeCell(S, apR, col["EntityType"], "ElementType")')
    expect(s).toContain('writeCell(S, apR, col["EntityRef"], "ET-CLIP")')
    expect(s).toContain('writeCell(S, apR, col["Quantity"], 1)')
    expect(s).toContain('apR++;')
  })

  test('delete tombstones the matched row', () => {
    const s = buildRsScript([
      { _id: '3', positionTypeRef: 'P1', action: 'delete', row: { ...key }, before: { ...key } },
    ])
    expect(s).toContain('rowWhere(data,')
    expect(s).toContain('writeCell(S, r, col["IsDeleted"], "Y")')
  })

  test('unresolved template slots are skipped', () => {
    const s = buildRsScript([
      { _id: '4', positionTypeRef: 'P1', action: 'upsert', row: { resolved: false, slotKey: 'S', ContextType: 'PositionType', ContextRef: 'P1', RecipeIndex: 1, elementTypeRef: '' } },
    ])
    expect(s).toBe('')
  })

  test('two entries on the same natural key coalesce to one op', () => {
    const s = buildRsScript([
      { _id: 'a', positionTypeRef: 'P1', action: 'upsert', row: { _row_num: 9, ...key }, changedFields: { Quantity: 2 }, before: { ...key } },
      { _id: 'b', positionTypeRef: 'P1', action: 'upsert', row: { _row_num: 9, ...key }, changedFields: { Quantity: 5 }, before: { ...key } },
    ])
    expect(s).toContain('writeCell(S, r, col["Quantity"], 5)') // last wins
    expect(s).not.toContain('col["Quantity"], 2')
  })
})
