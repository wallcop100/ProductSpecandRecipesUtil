import { describe, test, expect } from 'vitest'
import { buildPsScript, buildRsScript, buildDbScript } from '../../src/utils/patchScript.js'

/**
 * The scripts must never read the whole sheet. These templates pad the used range with
 * formatting to the bottom of the sheet, so getValues() on the full range materialises
 * tens of millions of cells and freezes Excel. The generator reads only a bounded header
 * row and the bounded key column(s), and does every lookup in memory.
 */
const noWholeGridRead = s => {
  expect(s).not.toContain('used.getValues()')     // never the whole grid
  expect(s).not.toContain('getEntireColumn')      // never a live column scan
  expect(s).not.toContain('getEntireRow')         // never a live header scan
  expect((s.match(/\.find\(/g) || []).length).toBe(0)
  expect(s).toContain('S.getUsedRange(true)')     // valuesOnly extent (metadata only)
  expect(s).toContain('getRangeByIndexes(0, 0, 1, nCols).getValues()[0]')  // bounded header
}

describe('buildPsScript', () => {
  test('wraps in a runnable Office Scripts main() with the Form worksheet, bounded reads only', () => {
    const s = buildPsScript([
      { elementTypeRef: 'ET-DL-01', updates: { ProductCode: 'ABC-123', IsTBC: 'Y' }, before: {} },
    ])
    expect(s).toContain('function main(workbook: ExcelScript.Workbook)')
    expect(s).toContain('workbook.getWorksheet("Form")')
    expect(s).toContain('const rowOf = keyIndex(S, col["EntityRef"], nRows)')
    expect(s).toContain('const r = (rowOf["ET-DL-01"] === undefined) ? -1 : rowOf["ET-DL-01"];')
    expect(s).toContain('writeCell(S, r, col["ProductCode"], "ABC-123")')
    expect(s).toContain('writeCell(S, r, col["IsTBC"], "Y")')
    expect(s).toContain('function colMap(header')
    expect(s).not.toContain('writeCell(S, apR')   // update-only: no appends
    noWholeGridRead(s)
  })

  test('new row appends past the real row count, keyed by the in-memory index', () => {
    const s = buildPsScript([
      { elementTypeRef: 'ET-NEW', _isNew: true, updates: { ProductCode: '0012' } },
    ])
    expect(s).toContain('const rowOf = keyIndex(S, col["EntityRef"], nRows);')
    expect(s).toContain('let apR = nRows;')
    expect(s).toContain('writeCell(S, apR, col["EntityRef"], "ET-NEW")')
    expect(s).toContain('writeCell(S, apR, col["EntityType"], "ElementType")')
    // leading-zero product code stays a quoted string, not a bare number
    expect(s).toContain('writeCell(S, apR, col["ProductCode"], "0012")')
    expect(s).toContain('rowOf["ET-NEW"] = apR; apR++;')
    noWholeGridRead(s)
  })

  test('soft-delete is an IsDeleted="Y" update', () => {
    const s = buildPsScript([{ elementTypeRef: 'ET-OLD', updates: { IsDeleted: 'Y' }, before: {} }])
    expect(s).toContain('writeCell(S, r, col["IsDeleted"], "Y")')
  })

  test('cleared field writes null (which .clear()s the cell)', () => {
    const s = buildPsScript([{ elementTypeRef: 'ET-C', updates: { Manufacturer: '' }, before: { Manufacturer: 'Acme' } }])
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
    expect(s).toContain('const rowOf = keyIndex(S, col["Ref"], nRows)')
    expect(s).toContain('writeCell(S, apR, col["Ref"], "ET-Z")')
    expect(s).toContain('writeCell(S, apR, col["Name"], "Zed")')
    expect(s).not.toContain('EntityType')
    noWholeGridRead(s)
  })
})

describe('buildRsScript', () => {
  const key = { ContextType: 'ElementType', ContextRef: 'ET-DL-01', RecipeIndex: 3, ElementTypeRef: 'ET-SOCK-5P' }
  const compositeKey = 'ElementType|ET-DL-01|3|ET-SOCK-5P'

  test('builds a composite key index and matches updates against it', () => {
    const s = buildRsScript([
      { _id: '1', positionTypeRef: 'P1', action: 'upsert',
        row: { _row_num: 5, ...key }, changedFields: { Quantity: 2 }, before: { ...key, Quantity: 1 } },
    ])
    expect(s).toContain('const rowOf = compositeIndex(S, [col["ContextType"], col["ContextRef"], col["RecipeIndex"], col["EntityRef"]], nRows);')
    expect(s).toContain(`rowOf["${compositeKey}"]`)
    expect(s).toContain('writeCell(S, r, col["Quantity"], 2)')   // bare number
    noWholeGridRead(s)
  })

  test('append writes EntityType + mapped fields past the real row count', () => {
    const s = buildRsScript([
      { _id: '2', positionTypeRef: 'P1', action: 'upsert',
        row: { ContextType: 'ElementType', ContextRef: 'ET-DL-01', RecipeIndex: 7, elementTypeRef: 'ET-CLIP', quantity: 1 } },
    ])
    expect(s).toContain('let apR = nRows;')
    expect(s).toContain('writeCell(S, apR, col["EntityType"], "ElementType")')
    expect(s).toContain('writeCell(S, apR, col["EntityRef"], "ET-CLIP")')
    expect(s).toContain('writeCell(S, apR, col["Quantity"], 1)')
    expect(s).toContain('apR++;')
  })

  test('delete tombstones the matched row via the composite key', () => {
    const s = buildRsScript([
      { _id: '3', positionTypeRef: 'P1', action: 'delete', row: { ...key }, before: { ...key } },
    ])
    expect(s).toContain(`rowOf["${compositeKey}"]`)
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
    expect(s).toContain('writeCell(S, r, col["Quantity"], 5)')   // last wins
    expect(s).not.toContain('col["Quantity"], 2')
  })
})

/**
 * `_isNew` is a belief about the workbook, not a fact. After you paste a patch the tool
 * still holds the OLD workbook in memory, so the next export re-declares the same rows as
 * new. The scripts used to append on that belief, duplicating every new row. Every "add"
 * is now an upsert against the in-memory key index — a second run is a no-op.
 */
describe('the patches are idempotent — a second run must not duplicate', () => {
  const dbNew = [{ elementTypeRef: 'ET-PS-01', updates: { ElementTypeRef: 'ET-PS-01', Name: 'XAL Move It' }, _isNew: true }]
  const psNew = [{ elementTypeRef: 'ET-PS-01', updates: { ProductCode: 'C-1' }, _isNew: true }]
  const rsNew = [{ _id: 'r1', positionTypeRef: 'C01r', action: 'upsert', row: {
    PositionTypeRef: 'C01r', ContextType: 'PositionType', ContextRef: 'C01r', ElementTypeRef: 'ET-X', RecipeIndex: 1,
  } }]

  test('the DesignDB patch looks the ref up before appending it', () => {
    const s = buildDbScript(dbNew)
    expect(s).toContain('const r = (rowOf["ET-PS-01"] === undefined) ? -1 : rowOf["ET-PS-01"];')
    expect(s).toContain('if (r < 0)')
    // the append is inside the not-found branch
    expect(s.indexOf('rowOf["ET-PS-01"]')).toBeLessThan(s.indexOf('writeCell(S, apR'))
  })

  test('an existing row is updated in place, and says so in Excel', () => {
    const s = buildDbScript(dbNew)
    expect(s).toContain('already present - updated in place, not duplicated')
    expect(s).toContain('writeCell(S, r, col["Name"], "XAL Move It")')
  })

  test('the Product Spec patch has the same guard', () => {
    const s = buildPsScript(psNew)
    expect(s).toContain('const r = (rowOf["ET-PS-01"] === undefined) ? -1 : rowOf["ET-PS-01"];')
    expect(s.indexOf('rowOf["ET-PS-01"]')).toBeLessThan(s.indexOf('writeCell(S, apR'))
  })

  test('the Recipe patch upserts on its composite key', () => {
    const s = buildRsScript(rsNew)
    expect(s).toContain('const rowOf = compositeIndex(S, [col["ContextType"]')
    expect(s.indexOf('compositeIndex')).toBeLessThan(s.indexOf('writeCell(S, apR'))
  })

  test('the key index is built before any append cursor is set', () => {
    const s = buildRsScript(rsNew)
    expect(s.indexOf('const rowOf =')).toBeLessThan(s.indexOf('let apR ='))
  })

  test('a blank value never clears a cell the sheet already has', () => {
    const s = buildDbScript([{ elementTypeRef: 'ET-A', updates: { ElementTypeRef: 'ET-A', Name: 'N', Description: '' }, _isNew: true }])
    expect(s).toContain('col["Name"]')
    expect(s).not.toContain('col["Description"]')
  })

  test('a row created then deleted is still a no-op', () => {
    expect(buildDbScript([{ elementTypeRef: 'ET-A', updates: { IsDeleted: 'Y' }, _isNew: true }])).toBe('')
  })
})

describe('a new ElementType records its product identity in Details', () => {
  test('Details maps to the Details column', () => {
    const s = buildDbScript([{ elementTypeRef: 'ET-A', updates: { ElementTypeRef: 'ET-A', Details: 'XAL 011-8000018M' }, _isNew: true }])
    expect(s).toContain('writeCell(S, apR, col["Details"], "XAL 011-8000018M")')
  })
})
