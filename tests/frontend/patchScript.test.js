// @vitest-environment node
import { describe, test, expect } from 'vitest'
import { buildPsScript, buildRsScript, buildDbScript, buildPtAddScript } from '../../src/utils/patchScript.js'

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

describe('buildPtAddScript — Form PositionTypes missing from the DesignDB', () => {
  test('adds a bare Ref-only row per ref, on the PositionTypes sheet, idempotently', () => {
    const s = buildPtAddScript(['XB1b', 'XB1c', 'XB1b', ''])
    expect(s).toContain('"PositionTypes"')
    expect((s.match(/\/\/ add /g) || []).length).toBe(2)
    expect(s).toContain('already present - updated in place')
    expect(s).not.toMatch(/"Name"|"ParentRef"|"DriverLocation"/)
  })

  test('nothing to add → no script', () => {
    expect(buildPtAddScript([])).toBe('')
  })
})

describe('the DesignDB patch keeps ElementTypes in line', () => {
  test('writes a tree-order SortOrder, sorts by it, paints only family rows purple, and un-paints wrappers', () => {
    const s = buildDbScript([{ elementTypeRef: 'ET-PS-01', updates: { ElementTypeRef: 'ET-PS-01', Family: 'ET-PS' }, _isNew: true }])
    expect(s).not.toMatch(/getSort\(\)/)                                         // never Excel's sort
    expect(s).toMatch(/block\.setFormulas\(sorted\)/)                              // whole rows, moved by the script
    expect(s).toMatch(/setColor\("#7030A0"\)/)
    expect(s).toMatch(/getFont\(\)\.setColor\("#FFFFFF"\)/)
    expect(s).toMatch(/if \(!parents\[String\(sorted\[r\]\[cRef\]\)\.trim\(\)\]\) continue;/)   // only rows named as a ParentRef
    expect(s).toMatch(/getFill\(\)\.clear\(\)/)                                // a wrapper painted earlier is cleared
    expect(s).toMatch(/setBold\(true\)/)
    expect(s).toMatch(/colMap\([^)]*\["Ref", "ParentRef", "SortOrder", "IsCollection"\]|"SortOrder"/)
  })
  test('nothing to patch, no script', () => {
    expect(buildDbScript([])).toBe('')
  })
})

// Run the generated Office Script for real, against an in-memory sheet.
import { transformSync } from 'esbuild'

function fakeSheet(rows) {                          // rows[0] is the header
  const grid = rows.map(r => [...r])
  const fmt = new Map()                              // row -> { fill, color, bold }
  const range = (r, c, h, w) => ({
    getValues: () => grid.slice(r, r + h).map(row => row.slice(c, c + w).map(v => v ?? '')),
    setValues: vals => vals.forEach((row, i) => row.forEach((v, j) => { grid[r + i][c + j] = v })),
    getFormulas: () => grid.slice(r, r + h).map(row => row.slice(c, c + w).map(v => v ?? '')),
    setFormulas: vals => vals.forEach((row, i) => row.forEach((v, j) => { grid[r + i][c + j] = v })),
    getSort: () => ({ apply: fields => {
      const body = grid.slice(r, r + h)
      body.sort((a, b) => { for (const f of fields) { const x = a[c + f.key], y = b[c + f.key]; if (x < y) return f.ascending ? -1 : 1; if (x > y) return f.ascending ? 1 : -1 } return 0 })
      body.forEach((row, i) => { grid[r + i] = row })
    } }),
    getFormat: () => {
      const rowsOf = () => grid.slice(r, r + h).map(row => { const f = fmt.get(row[0]) || {}; fmt.set(row[0], f); return f })
      const each = fn => rowsOf().forEach(fn)
      return { getFill: () => ({ setColor: v => each(f => { f.fill = v }), clear: () => each(f => { f.fill = null }) }),
        getFont: () => ({ setColor: v => each(f => { f.color = v }), setBold: v => each(f => { f.bold = v }) }) }
    },
  })
  const S = {
    getUsedRange: () => ({ getRowCount: () => grid.length, getColumnCount: () => grid[0].length }),
    getRangeByIndexes: range,
    getCell: (r, c) => ({ setValue: v => { while (grid.length <= r) grid.push(grid[0].map(() => '')); grid[r][c] = v }, clear: () => { grid[r][c] = '' } }),
  }
  return { grid, fmt, workbook: { getWorksheet: () => S } }
}
function run(script, sheet) {
  const js = transformSync(script, { loader: 'ts' }).code
  const ExcelScript = { ClearApplyTo: { contents: 'contents' } }
  new Function('workbook', 'ExcelScript', 'console', `${js}\nmain(workbook)`)(sheet.workbook, ExcelScript, { log: () => {} })
}

describe('the ElementTypes tidy, run', () => {
  test('tree order: each family then its members, sub-families nested; SortOrder 1..N; families purple, wrappers plain', () => {
    const sheet = fakeSheet([
      ['Ref', 'ParentRef', 'IsCollection', 'SortOrder', 'InternalNotesText'],
      ['ET-DL-01', 'ET-DL', 'Y', 9, 'note DL-01'],
      ['LC2', 'ET-CABLES', '', 5, 'note LC2'],
      ['LC11', 'ET-CABLES', '', 12, ''],
      ['ET-LIN-TAPE', 'ET-LIN-INGREDIENTS', 'Y', 3, ''],
      ['ET-CABLES', '', 'Y', 40, ''],
      ['LC1', 'ET-CABLES', '', 7, 'Final LightShape Profile TBC'],
      ['ET-LIN-INGREDIENTS', '', 'Y', 1, ''],
      ['ET-DL', '', 'Y', 2, ''],
      ['ET-LIN-TAPE-01', 'ET-LIN-TAPE', '', 8, 'note tape'],
      ['ET-LIN-CLIP-01', 'ET-LIN-CLIP', '', 6, ''],
      ['ET-LIN-CLIP', 'ET-LIN-INGREDIENTS', 'Y', 4, ''],
    ])
    run(buildDbScript([{ elementTypeRef: 'ET-DL-02', updates: { ElementTypeRef: 'ET-DL-02', Family: 'ET-DL', IsCollection: 'Y' }, _isNew: true }]), sheet)
    expect(sheet.grid.slice(1).map(r => [r[0], r[3]])).toEqual([
      ['ET-CABLES', 1], ['LC1', 2], ['LC2', 3], ['LC11', 4],                           // natural order
      ['ET-DL', 5], ['ET-DL-01', 6], ['ET-DL-02', 7],
      ['ET-LIN-INGREDIENTS', 8], ['ET-LIN-CLIP', 9], ['ET-LIN-CLIP-01', 10], ['ET-LIN-TAPE', 11], ['ET-LIN-TAPE-01', 12],
    ])
    // every column travels with its row — notes stay beside their own Ref
    const note = ref => sheet.grid.find(r => r[0] === ref)[4]
    expect([note('LC1'), note('LC2'), note('ET-DL-01'), note('ET-LIN-TAPE-01'), note('ET-CABLES')])
      .toEqual(['Final LightShape Profile TBC', 'note LC2', 'note DL-01', 'note tape', ''])
    expect(sheet.fmt.get('ET-CABLES')).toMatchObject({ fill: '#7030A0', color: '#FFFFFF', bold: true })
    expect(sheet.fmt.get('ET-LIN-TAPE')).toMatchObject({ fill: '#7030A0' })
    expect(sheet.fmt.get('ET-DL-01')).toMatchObject({ fill: null, bold: false })     // a wrapper: never purple
    expect(sheet.fmt.get('LC1')).toMatchObject({ fill: null, bold: false })          // ordinary rows plain
  })
})

describe('Office Scripts rules', () => {
  test('array methods only ever take an inline arrow function (never a named function)', () => {
    const scripts = [
      buildDbScript([{ elementTypeRef: 'ET-PS-01', updates: { ElementTypeRef: 'ET-PS-01', Family: 'ET-PS', Name: 'n' }, _isNew: true },
        { elementTypeRef: 'ET-PS-02', updates: { Name: 'm' } }]),
      buildPsScript([{ elementTypeRef: 'ET-PS-01', updates: { Manufacturer: 'M', ProductCode: 'C' }, _isNew: true }]),
    ]
    const bad = /\.(sort|map|forEach|filter|find|findIndex|some|every|reduce)\(\s*[A-Za-z_$][\w$.]*\s*\)/g
    for (const s of scripts) {
      expect(s.length).toBeGreaterThan(0)
      expect(s.match(bad)).toBeNull()
    }
  })
})
