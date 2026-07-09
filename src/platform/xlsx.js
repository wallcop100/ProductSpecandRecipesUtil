/**
 * xlsx.js — browser xlsx parsing. A faithful port of `backend/parser.py`.
 *
 * Parses the three workbooks (DesignDB, Product Spec, Recipe Spec) plus an
 * arbitrary sheet, entirely in the browser via SheetJS. Replaces the Flask
 * `/detect-files`, `/import` and `/read-sheet` routes.
 *
 * All parsers use header-based column matching, so they are robust to column
 * reordering. Each data row carries `_row_num` (1-based ABSOLUTE Excel row,
 * header = row 1) so patch scripts can target the right row.
 *
 * Fidelity notes (openpyxl parity):
 *  - openpyxl always iterates from absolute row 1 / column A, so the cell grid
 *    is anchored at A1 even when the sheet's used range starts lower down.
 *  - `data_only=True` reads cached formula results; SheetJS's `cell.v` is the
 *    same cached value.
 *  - Dates become ISO strings (Flask serialised datetimes to strings too).
 */

import * as XLSX from 'xlsx'

// --- Column maps  {excel_header: output_field_name} -------------------------

const ET_COLUMN_MAP = {
  Ref: 'ElementTypeRef',
  Name: 'Name',
  Description: 'Description',
  ParentRef: 'Family',
  IsCollection: 'IsCollection',
  IsDeleted: 'IsDeleted',
  SortOrder: 'SortOrder',
}

const PT_COLUMN_MAP = {
  Ref: 'PositionTypeRef',
  Name: 'Name',
  Description: 'Description',
  ParentRef: 'ParentRef',
  IsCollection: 'IsCollection',
  IsDeleted: 'IsDeleted',
  DriverLocation: 'DriverLocation',
  SecondaryPowerType: 'SecondaryPowerType',
  ControlTypeRef: 'ControlTypeRef',
  'SecondaryPowerNodes_+ve': 'SecondaryPowerNodes_+ve',
}

const PS_COLUMN_MAP = {
  EntityRef: 'ElementTypeRef',
  Manufacturer: 'Manufacturer',
  ProductCode: 'ProductCode',
  ComponentDescription: 'ComponentDescription',
  InternalNotesText: 'InternalNotesText',
  IsTBC: 'IsTBC',
  IsDeleted: 'IsDeleted',
  IsPropertiesTBC: 'IsPropertiesTBC',
}

const RS_COLUMN_MAP = {
  ContextType: 'ContextType',
  ContextRef: 'ContextRef',
  RecipeIndex: 'RecipeIndex',
  EntityRef: 'ElementTypeRef',
  'Sort Order': 'SortOrder',
  Quantity: 'Quantity',
  PackQuantity: 'PackQuantity',
  IsDeleted: 'IsDeleted',
  IsDesign: 'IsDesign',
  IsContractItem: 'IsContractItem',
  IsTRItem: 'IsTRItem',
  Dim_QuantityMultiplier: 'Dim_QuantityMultiplier',
  IsInteger: 'IsInteger',
}

const ET_FLAG_COLS = new Set(['IsCollection', 'IsDeleted'])
const PT_FLAG_COLS = new Set(['IsCollection', 'IsDeleted'])
const PS_FLAG_COLS = new Set(['IsTBC', 'IsDeleted', 'IsPropertiesTBC'])
const RS_FLAG_COLS = new Set(['IsDesign', 'IsContractItem', 'IsTRItem', 'IsInteger', 'IsDeleted'])

// --- Internal helpers -------------------------------------------------------

/** Read a workbook from bytes (ArrayBuffer / Uint8Array / Node Buffer). */
export function readWorkbook(data) {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data
  return XLSX.read(bytes, { type: 'array', cellDates: true })
}

/**
 * SheetJS reports a formula-error cell as a numeric code (`t:'e'`); openpyxl
 * reports the cached error text. Map back so the two agree.
 */
const ERROR_TEXT = {
  0x00: '#NULL!', 0x07: '#DIV/0!', 0x0F: '#VALUE!', 0x17: '#REF!',
  0x1D: '#NAME?', 0x24: '#NUM!', 0x2A: '#N/A', 0x2B: '#GETTING_DATA',
}

function cellValue(cell) {
  if (cell === undefined || cell.v === undefined) return null
  const v = cell.v
  if (cell.t === 'e') return ERROR_TEXT[v] ?? `#ERR:${v}`
  if (v instanceof Date) return v.toISOString()
  // SheetJS surfaces explicit empty-string cells; openpyxl reports them as None.
  if (v === '') return null
  return v
}

/**
 * Dense cell grid anchored at A1 — openpyxl iterates from absolute row 1 /
 * column A regardless of where the used range starts, and `_row_num` depends
 * on that. Returns rows of raw values (null for empty).
 */
function matrix(ws) {
  if (!ws || !ws['!ref']) return []
  const range = XLSX.utils.decode_range(ws['!ref'])
  const out = []
  for (let r = 0; r <= range.e.r; r++) {
    const row = new Array(range.e.c + 1)
    for (let c = 0; c <= range.e.c; c++) row[c] = cellValue(ws[XLSX.utils.encode_cell({ r, c })])
    out.push(row)
  }
  return out
}

const headerRowOf = grid => (grid[0] || []).map(h => (h === null || h === undefined ? '' : String(h).trim()))

/**
 * Parse a worksheet by matching actual column headers to output field names.
 *
 * columnMap  : {excel_header: output_field_name}
 * flagCols   : output field names that must normalise to 'Y' or null
 * includeAll : also expose every raw column under its own header name (used for
 *              PositionTypes, so tag rules can key off any DB schema column)
 *
 * Fully-blank rows are skipped.
 */
function parseSheetByHeaders(ws, columnMap, flagCols = new Set(), includeAll = false) {
  const grid = matrix(ws)
  const headers = headerRowOf(grid)

  const colIndex = new Map()   // outputName -> column index (first match wins)
  for (const [excelName, outputName] of Object.entries(columnMap)) {
    const idx = headers.indexOf(excelName)
    if (idx !== -1) colIndex.set(outputName, idx)
  }

  // Pass-through columns: every header that isn't already a mapped OUTPUT name.
  const extraIndex = new Map()
  if (includeAll) {
    const mappedOutputs = new Set(Object.values(columnMap))
    headers.forEach((header, idx) => {
      if (header && !mappedOutputs.has(header) && !colIndex.has(header)) extraIndex.set(header, idx)
    })
  }

  const rows = []
  for (let r = 1; r < grid.length; r++) {
    const values = grid[r]
    const rowDict = { _row_num: r + 1 }
    let allNone = true

    for (const [outputName, idx] of colIndex) {
      const raw = idx < values.length ? values[idx] : null
      let value
      if (raw === null) value = null
      else if (flagCols.has(outputName)) {
        value = (typeof raw === 'string' && raw.trim().toUpperCase() === 'Y') ? 'Y' : null
      } else if (typeof raw === 'string') value = raw.trim() || null
      else value = raw

      rowDict[outputName] = value
      if (value !== null) allNone = false
    }

    for (const [header, idx] of extraIndex) {
      let raw = idx < values.length ? values[idx] : null
      if (typeof raw === 'string') raw = raw.trim() || null
      rowDict[header] = raw
      if (raw !== null) allNone = false
    }

    if (!allNone) rows.push(rowDict)
  }
  return rows
}

/**
 * A "true collection" is any Ref that appears as another row's ParentRef — a
 * grouping node with children. Leaf refs are real entities (including wrapper
 * ETs, which may carry IsCollection='Y' but have no children, so they survive).
 */
function collectionRefs(rawRows, parentField) {
  const parents = new Set()
  for (const r of rawRows) {
    const p = r[parentField]
    if (p) parents.add(p)
  }
  return parents
}

// --- Public parsers ---------------------------------------------------------

/**
 * Parse a DesignDB workbook → { element_types, position_types }.
 * Collections and IsDeleted rows are filtered out. ElementTypes keep `_row_num`
 * (that sheet is writable); PositionTypes are read-only, so theirs is stripped.
 */
export function parseDb(data) {
  const wb = readWorkbook(data)
  if (!wb.SheetNames.includes('ElementTypes')) throw new Error("Sheet 'ElementTypes' not found")
  if (!wb.SheetNames.includes('PositionTypes')) throw new Error("Sheet 'PositionTypes' not found")

  const rawEts = parseSheetByHeaders(wb.Sheets.ElementTypes, ET_COLUMN_MAP, ET_FLAG_COLS)
  const etCollections = collectionRefs(rawEts, 'Family')
  const element_types = []
  for (const r of rawEts) {
    if (!r.ElementTypeRef) continue
    if (r.IsDeleted === 'Y') continue
    if (etCollections.has(r.ElementTypeRef)) continue
    delete r.IsDeleted
    element_types.push(r)
  }

  const rawPts = parseSheetByHeaders(wb.Sheets.PositionTypes, PT_COLUMN_MAP, PT_FLAG_COLS, true)
  const ptCollections = collectionRefs(rawPts, 'ParentRef')
  const position_types = []
  for (const r of rawPts) {
    if (!r.PositionTypeRef) continue
    if (r.IsDeleted === 'Y') continue
    if (ptCollections.has(r.PositionTypeRef)) continue
    delete r.IsCollection
    delete r.IsDeleted
    delete r._row_num
    position_types.push(r)
  }

  return { element_types, position_types }
}

/** Parse a Product Spec workbook → rows that have an ElementTypeRef. */
export function parsePs(data) {
  const wb = readWorkbook(data)
  if (!wb.SheetNames.includes('Form')) throw new Error("Sheet 'Form' not found")
  return parseSheetByHeaders(wb.Sheets.Form, PS_COLUMN_MAP, PS_FLAG_COLS)
    .filter(r => r.ElementTypeRef)
}

/**
 * Parse a Recipe Spec workbook, adding PositionTypeRef to every row:
 *   - PositionType-level rows: PositionTypeRef = ContextRef
 *   - ElementType-level rows:  PositionTypeRef = each position using that ET as
 *     its IsDesign element (rows are duplicated, one copy per position, each
 *     keeping the original `_row_num`)
 * Orphan ElementType rows (no position claims them) are dropped.
 */
export function parseRs(data) {
  const wb = readWorkbook(data)
  if (!wb.SheetNames.includes('Form')) throw new Error("Sheet 'Form' not found")
  const rawRows = parseSheetByHeaders(wb.Sheets.Form, RS_COLUMN_MAP, RS_FLAG_COLS)

  // Pass 1: {ET ref -> [position refs]} from IsDesign='Y' PositionType rows
  const etToPositions = new Map()
  for (const row of rawRows) {
    if (row.ContextType === 'PositionType' && row.IsDesign === 'Y' && row.ElementTypeRef && row.ContextRef) {
      if (!etToPositions.has(row.ElementTypeRef)) etToPositions.set(row.ElementTypeRef, [])
      etToPositions.get(row.ElementTypeRef).push(row.ContextRef)
    }
  }

  // Pass 2: assign PositionTypeRef
  const result = []
  for (const row of rawRows) {
    if (row.ContextType === 'PositionType') {
      row.PositionTypeRef = row.ContextRef
      result.push(row)
    } else if (row.ContextType === 'ElementType') {
      for (const posRef of etToPositions.get(row.ContextRef) || []) {
        result.push({ ...row, PositionTypeRef: posRef })
      }
    }
  }
  return result
}

/**
 * Read an ARBITRARY sheet — no fixed schema. Exposes raw headers and rows so
 * the caller maps columns itself (the product-code import).
 * → { sheets, sheet, headers, rows }
 */
export function readSheet(data, sheet = null) {
  const wb = readWorkbook(data)
  const names = wb.SheetNames.slice()
  if (names.length === 0) throw new Error('No worksheets in workbook')

  const target = sheet || names[0]
  if (!names.includes(target)) throw new Error(`Sheet '${target}' not found`)

  const grid = matrix(wb.Sheets[target])
  const headers = headerRowOf(grid)

  const rows = []
  for (let r = 1; r < grid.length; r++) {
    const values = grid[r]
    const blank = values.every(v => v === null || (typeof v === 'string' && !v.trim()))
    if (blank) continue
    const row = { _row_num: r + 1 }
    headers.forEach((header, i) => { if (header) row[header] = i < values.length ? values[i] : null })
    rows.push(row)
  }
  return { sheets: names, sheet: target, headers, rows }
}

// --- File detection ---------------------------------------------------------

/**
 * Classify a workbook as 'db' | 'ps' | 'rs' | null.
 *   db → sheets ElementTypes AND PositionTypes
 *   ps → sheet Form whose header row contains 'ProductCode'
 *   rs → sheet Form whose header row contains 'ContextRef'
 */
export function detectFileType(data) {
  let wb
  try {
    wb = readWorkbook(data)
  } catch {
    return null
  }
  const names = wb.SheetNames
  if (names.includes('ElementTypes') && names.includes('PositionTypes')) return 'db'
  if (names.includes('Form')) {
    const headers = headerRowOf(matrix(wb.Sheets.Form))
    if (headers.includes('ProductCode')) return 'ps'
    if (headers.includes('ContextRef')) return 'rs'
  }
  return null
}

/**
 * Classify a folder's xlsx files.
 * files: [{ name, data }] — the caller (platform/fs) supplies the bytes.
 * → { db, ps, rs, all_xlsx }   (first match of each type wins)
 *
 * Files are visited in sorted order, so detection is deterministic (Python's
 * os.listdir order was arbitrary).
 */
export function detectFiles(files) {
  const xlsx = (files || [])
    .filter(f => f.name.toLowerCase().endsWith('.xlsx'))
    .sort((a, b) => a.name.localeCompare(b.name))

  const result = { db: null, ps: null, rs: null, all_xlsx: xlsx.map(f => f.name) }
  for (const f of xlsx) {
    const type = detectFileType(f.data)
    if (type && result[type] === null) result[type] = f.name
  }
  return result
}
