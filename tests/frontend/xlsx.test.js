import { describe, test, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseDb, parsePs, parseRs, readSheet, detectFileType, detectFiles } from '../../src/platform/xlsx.js'

/**
 * The browser xlsx parser is a port of the old backend/parser.py. Its output was
 * verified field-for-field against the Python parser on the real project
 * workbooks; these tests pin the individual rules so a regression is caught
 * without needing those files.
 *
 * Every workbook is built in memory: the sample xlsx are gitignored (generated,
 * not committed), so a test that read them would pass locally and fail in CI.
 */
const wbOf = sheets => {
  const wb = XLSX.utils.book_new()
  for (const [name, ws] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, ws, name)
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}
const aoa = rows => XLSX.utils.aoa_to_sheet(rows)

describe('parseSheetByHeaders rules (via parsePs)', () => {
  const ps = rows => parsePs(wbOf({ Form: aoa([['EntityRef', 'ProductCode', 'IsTBC', 'IsDeleted'], ...rows]) }))

  test('_row_num is the absolute Excel row (header = row 1)', () => {
    const rows = ps([['ET-1', 'C1', null, null], ['ET-2', 'C2', null, null]])
    expect(rows.map(r => r._row_num)).toEqual([2, 3])
  })

  test('flag columns normalise to "Y" or null, case-insensitively', () => {
    const [a, b, c] = ps([['ET-1', 'x', 'y', null], ['ET-2', 'x', 'N', null], ['ET-3', 'x', 1, null]])
    expect(a.IsTBC).toBe('Y')   // 'y' → 'Y'
    expect(b.IsTBC).toBeNull()  // anything else → null
    expect(c.IsTBC).toBeNull()  // a non-string is never a flag
  })

  test('strings are trimmed; empty becomes null', () => {
    const [r] = ps([['  ET-1  ', '   ', null, null]])
    expect(r.ElementTypeRef).toBe('ET-1')
    expect(r.ProductCode).toBeNull()
  })

  test('fully blank rows are skipped', () => {
    expect(ps([['ET-1', 'C1', null, null], [null, null, null, null], ['ET-2', 'C2', null, null]])).toHaveLength(2)
  })

  test('parsePs drops rows without an ElementTypeRef', () => {
    expect(ps([['ET-1', 'C1', null, null], [null, 'orphan', null, null]]).map(r => r.ElementTypeRef)).toEqual(['ET-1'])
  })

  test('an absent column is simply missing, not an error', () => {
    const rows = parsePs(wbOf({ Form: aoa([['EntityRef'], ['ET-1']]) }))
    expect(rows[0].ElementTypeRef).toBe('ET-1')
    expect(rows[0].ProductCode).toBeUndefined()
  })

  test('a missing Form sheet throws', () => {
    expect(() => parsePs(wbOf({ Other: aoa([['x']]) }))).toThrow(/Form/)
  })
})

describe('parseDb', () => {
  const db = () => parseDb(wbOf({
    ElementTypes: aoa([
      ['Ref', 'Name', 'ParentRef', 'IsCollection', 'IsDeleted', 'SortOrder'],
      ['ET-FAM', 'Family', null, 'Y', null, 1],     // parent of ET-A → a true collection
      ['ET-A', 'Alpha', 'ET-FAM', null, null, 2],
      ['ET-DEL', 'Gone', null, null, 'Y', 3],       // IsDeleted
      ['ET-WRAP', 'Wrapper', null, 'Y', null, 4],   // IsCollection but childless → survives
    ]),
    PositionTypes: aoa([
      ['Ref', 'Name', 'ParentRef', 'IsCollection', 'IsDeleted', 'DriverLocation', 'CustomCol', 'PositionTypeRef'],
      ['PT-FAM', 'Fam', null, 'Y', null, null, null, null],
      ['PT-1', 'One', 'PT-FAM', null, null, 'Remote', 'hello', 'SHOULD-NOT-WIN'],
    ]),
  }))

  test('a ref used as another row ParentRef is a collection and is filtered out', () => {
    expect(db().element_types.map(e => e.ElementTypeRef)).toEqual(['ET-A', 'ET-WRAP'])
  })

  test('IsCollection alone does not filter — childless wrapper ETs survive', () => {
    expect(db().element_types.find(e => e.ElementTypeRef === 'ET-WRAP')).toBeTruthy()
  })

  test('IsDeleted rows are dropped, and IsDeleted is stripped from survivors', () => {
    const ets = db().element_types
    expect(ets.find(e => e.ElementTypeRef === 'ET-DEL')).toBeUndefined()
    expect('IsDeleted' in ets[0]).toBe(false)
  })

  test('ElementTypes keep _row_num (writable); PositionTypes strip it (read-only)', () => {
    const { element_types, position_types } = db()
    expect(element_types.find(e => e.ElementTypeRef === 'ET-A')._row_num).toBe(3)
    expect('_row_num' in position_types[0]).toBe(false)
    expect('IsCollection' in position_types[0]).toBe(false)
  })

  test('include_all passes extra columns through, but never clobbers a mapped output name', () => {
    const pt = db().position_types[0]
    expect(pt.PositionTypeRef).toBe('PT-1')      // from the 'Ref' column, not the decoy header
    expect(pt.CustomCol).toBe('hello')           // genuine pass-through
    expect(pt.DriverLocation).toBe('Remote')
  })

  test('a missing sheet throws', () => {
    expect(() => parseDb(wbOf({ ElementTypes: aoa([['Ref']]) }))).toThrow(/PositionTypes/)
  })
})

describe('parseRs — two-pass PositionTypeRef derivation', () => {
  const rs = parseRs(wbOf({
    Form: aoa([
      ['ContextType', 'ContextRef', 'RecipeIndex', 'EntityRef', 'IsDesign'],
      ['PositionType', 'PT-1', 1, 'ET-DL', 'Y'],     // ET-DL is design for PT-1
      ['PositionType', 'PT-2', 1, 'ET-DL', 'Y'],     // …and for PT-2
      ['ElementType', 'ET-DL', 1, 'ET-LAMP', null],  // internal row → duplicated to both
      ['ElementType', 'ET-ORPHAN', 1, 'ET-X', null], // no position claims it → dropped
    ]),
  }))

  test('PositionType rows take PositionTypeRef from ContextRef', () => {
    const pos = rs.filter(r => r.ContextType === 'PositionType')
    expect(pos.map(r => r.PositionTypeRef)).toEqual(['PT-1', 'PT-2'])
  })

  test('an ElementType row is duplicated once per position using it as design', () => {
    const dup = rs.filter(r => r.ElementTypeRef === 'ET-LAMP')
    expect(dup.map(r => r.PositionTypeRef)).toEqual(['PT-1', 'PT-2'])
  })

  test('duplicates retain the original _row_num so edits map back to one Excel row', () => {
    const dup = rs.filter(r => r.ElementTypeRef === 'ET-LAMP')
    expect(dup.map(r => r._row_num)).toEqual([4, 4])
  })

  test('orphan ElementType rows are dropped', () => {
    expect(rs.find(r => r.ElementTypeRef === 'ET-X')).toBeUndefined()
    expect(rs).toHaveLength(4)
  })
})

describe('readSheet — arbitrary sheet, no schema', () => {
  const ws = aoa([['A', '', 'C'], ['1', null, 'x'], [null, null, null], ['2', null, 'y']])
  // an errored formula and an explicit empty-string cell, as the real forms contain
  ws.D1 = { t: 's', v: 'Err' }
  ws.D2 = { t: 'e', v: 0x1D }
  ws.E1 = { t: 's', v: 'Empty' }
  ws.E2 = { t: 's', v: '' }
  ws['!ref'] = 'A1:E4'
  const out = readSheet(wbOf({ S1: ws, S2: aoa([['z']]) }))

  test('reports every sheet name and defaults to the first', () => {
    expect(out.sheets).toEqual(['S1', 'S2'])
    expect(out.sheet).toBe('S1')
  })

  test('blank rows are skipped and _row_num stays absolute', () => {
    expect(out.rows.map(r => r._row_num)).toEqual([2, 4])
  })

  test('blank headers are omitted from row objects', () => {
    expect(Object.keys(out.rows[0])).not.toContain('')
    expect(out.rows[0].A).toBe('1')
    expect(out.rows[0].C).toBe('x')
  })

  test('a formula-error cell becomes its error text, not a numeric code', () => {
    expect(out.rows[0].Err).toBe('#NAME?')   // SheetJS gives 0x1D; openpyxl gives '#NAME?'
  })

  test('an explicit empty-string cell becomes null, as openpyxl reports it', () => {
    expect(out.rows[0].Empty).toBeNull()
  })

  test('an unknown sheet name throws', () => {
    expect(() => readSheet(wbOf({ S1: aoa([['a']]) }), 'Nope')).toThrow(/not found/)
  })
})

describe('detection', () => {
  // Detection keys off sheet names and the Form header row — the same three
  // shapes the real workbooks have. Built in memory so CI needs no binaries.
  const dbWb = wbOf({ ElementTypes: aoa([['Ref']]), PositionTypes: aoa([['Ref']]) })
  const psWb = wbOf({ Form: aoa([['EntityRef', 'ProductCode']]) })
  const rsWb = wbOf({ Form: aoa([['ContextType', 'ContextRef']]) })

  test('classifies db / ps / rs by sheet names and header markers', () => {
    expect(detectFileType(dbWb)).toBe('db')
    expect(detectFileType(psWb)).toBe('ps')
    expect(detectFileType(rsWb)).toBe('rs')
  })

  test('db wins even when it also has a Form sheet', () => {
    const both = wbOf({ ElementTypes: aoa([['Ref']]), PositionTypes: aoa([['Ref']]), Form: aoa([['ProductCode']]) })
    expect(detectFileType(both)).toBe('db')
  })

  test('a Form sheet with neither marker, and unreadable bytes, are unclassified', () => {
    expect(detectFileType(wbOf({ Form: aoa([['Something']]) }))).toBeNull()
    expect(detectFileType(new Uint8Array([1, 2, 3]))).toBeNull()
  })

  test('detectFiles ignores non-xlsx, sorts, and takes the first match of each type', () => {
    const out = detectFiles([
      { name: 'notes.txt', data: dbWb },
      { name: 'b_second.xlsx', data: dbWb },
      { name: 'a_first.xlsx', data: dbWb },
      { name: 'ps.xlsx', data: psWb },
    ])
    expect(out.all_xlsx).toEqual(['a_first.xlsx', 'b_second.xlsx', 'ps.xlsx'])
    expect(out.db).toBe('a_first.xlsx')   // sorted order → deterministic
    expect(out.ps).toBe('ps.xlsx')
    expect(out.rs).toBeNull()
  })
})
