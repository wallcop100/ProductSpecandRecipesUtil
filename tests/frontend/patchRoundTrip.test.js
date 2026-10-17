// @vitest-environment node
/**
 * The patch round trip, end to end: real workbooks → edits in the app → the generated Office
 * Scripts run on those workbooks (an in-memory ExcelScript) → read back by the app's own parsers →
 * checkFiles. Every way a person runs (or half-runs) the patches must end with nothing pending,
 * nothing duplicated and nothing lost.
 */
import { describe, test, expect, beforeEach, vi } from 'vitest'
import * as XLSX from 'xlsx'
import { transformSync } from 'esbuild'

vi.stubGlobal('window', {
  electronAPI: { db: {
    upsertPositionUI: vi.fn().mockResolvedValue({}), upsertSlotMapping: vi.fn().mockResolvedValue({}),
    upsertTemplate: vi.fn().mockResolvedValue({}), setPref: vi.fn().mockResolvedValue(undefined), getPref: vi.fn().mockResolvedValue(null),
  } },
})
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(), registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(),
}))

const { importFiles } = await import('../../src/utils/backend.js')
const { default: useStore } = await import('../../src/store/useStore.js')
const { parseDb, parsePs, parseRs } = await import('../../src/platform/xlsx.js')
const { buildDbScript, buildPsScript, buildRsScript } = await import('../../src/utils/patchScript.js')

// ---- the workbooks -------------------------------------------------------------------------------
const NAMES = { db: '5642 - LIGHTING.DesignDB~V4.5.xlsx', ps: '5642 - Product Spec.xlsx', rs: '5642 - Recipes.xlsx' }
function workbooks() {
  return {
    db: {
      ElementTypes: [
        ['Ref', 'Name', 'Description', 'ParentRef', 'IsCollection', 'IsDeleted', 'SortOrder', 'Details'],
        ['ET-LIN', '', 'Assembled Linear LED Family', '', 'Y', '', 1, ''],
        ['ET-LIN-01', '', '', 'ET-LIN', 'Y', '', 2, ''],
        ['ET-LIN-TAPE', '', 'Linear LED Tape Family', '', 'Y', '', 3, ''],
        ['ET-LIN-TAPE-01', 'LEDFlex - LL240272024', 'Tape', 'ET-LIN-TAPE', '', '', 4, ''],
        ['ET-LIN-TAPE-06', 'LEDFlex - UN16TVC2715G2', '', 'ET-LIN-TAPE', '', '', 5, ''],
      ],
      PositionTypes: [['Ref', 'Name', 'ParentRef'], ['C01r', 'Linear', '']],
    },
    ps: { Form: [
      ['EntityType', 'EntityRef', 'Manufacturer', 'ProductCode', 'ComponentDescription', 'InternalNotesText', 'IsTBC', 'IsDeleted', 'IsPropertiesTBC'],
      ['ElementType', 'ET-LIN-01', 'Ideaworks', 'N/A', '', '', '', '', ''],
      ['ElementType', 'ET-LIN-TAPE-01', 'LEDFlex', 'LL240272024', '', '', '', '', ''],
      ['ElementType', 'ET-LIN-TAPE-06', 'LEDFlex', 'UN16TVC2715G2', '', '', '', '', ''],
    ] },
    rs: { Form: [
      ['EntityType', 'ContextType', 'ContextRef', 'RecipeIndex', 'EntityRef', 'Sort Order', 'Quantity', 'PackQuantity', 'IsDeleted', 'IsDesign', 'IsContractItem', 'IsTRItem', 'Dim_QuantityMultiplier', 'IsInteger'],
      ['ElementType', 'PositionType', 'C01r', 1, 'ET-LIN-01', 1, 1, '', '', 'Y', '', '', '', ''],
      ['ElementType', 'ElementType', 'ET-LIN-01', 1, 'ET-LIN-TAPE-01', 1, '', '', '', '', 'Y', '', 1, ''],
      ['ElementType', 'ElementType', 'ET-LIN-01', 2, 'ET-LIN-TAPE-06', 2, '', '', '', '', 'Y', '', 1, ''],
    ] },
  }
}

// ---- an ExcelScript workbook over those grids ---------------------------------------------------
function excel(name, sheets) {
  const ws = {}
  for (const [sheet, grid] of Object.entries(sheets)) {
    const range = (r, c, h, w) => ({
      getValues: () => grid.slice(r, r + h).map(row => row.slice(c, c + w).map(v => v ?? '')),
      setValues: vals => vals.forEach((row, i) => row.forEach((v, j) => { grid[r + i][c + j] = v })),
      getFormulas: () => grid.slice(r, r + h).map(row => row.slice(c, c + w).map(v => v ?? '')),
      setFormulas: vals => vals.forEach((row, i) => row.forEach((v, j) => { grid[r + i][c + j] = v })),
      getFormat: () => ({ getFill: () => ({ setColor() {}, clear() {} }), getFont: () => ({ setColor() {}, setBold() {} }) }),
    })
    ws[sheet] = {
      getUsedRange: () => ({ getRowCount: () => grid.length, getColumnCount: () => grid[0].length }),
      getRangeByIndexes: range,
      getCell: (r, c) => ({
        setValue: v => { while (grid.length <= r) grid.push(grid[0].map(() => '')); grid[r][c] = v },
        clear: () => { if (grid[r]) grid[r][c] = '' },
      }),
    }
  }
  return { getName: () => name, getWorksheet: n => ws[n] }
}
function run(script, wb) {
  if (!script) return []
  const log = []
  const js = transformSync(script, { loader: 'ts' }).code
  new Function('workbook', 'ExcelScript', 'console', `${js}\nmain(workbook)`)(wb, { ClearApplyTo: { contents: 'contents' } }, { log: m => log.push(m) })
  return log
}
const bytes = sheets => {
  const wb = XLSX.utils.book_new()
  for (const [n, grid] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(grid.map(r => r.map(v => (v === '' ? null : v)))), n)
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }))
}
const parsed = files => ({ db: parseDb(bytes(files.db)), ps: parsePs(bytes(files.ps)), rs: parseRs(bytes(files.rs)) })

// ---- the app on them ----------------------------------------------------------------------------
function open(files) {
  const p = parsed(files)
  useStore.getState().loadProject({
    projectId: 1, projectNumber: '5642', paths: { db: NAMES.db, dbs: [NAMES.db], ps: NAMES.ps, rs: NAMES.rs },
    elementTypes: p.db.element_types, positionTypes: p.db.position_types, psRows: p.ps, recipes: p.rs,
    dbCollectionRefs: p.db.collection_refs, templates: [], slotMappings: {}, positionUI: {},
  })
}
function edit() {
  const s = useStore.getState()
  s.updatePSRow('ET-LIN-TAPE-01', { ProductCode: 'LL240272024B' })
  s.createElementType({ ref: 'ET-LIN-CAP-01', name: 'LEDFlex - FPS1709ECG', family: 'ET-LIN-CAPS' })
  s.addPSRow('ET-LIN-CAP-01', { Manufacturer: 'LEDFlex', ProductCode: 'FPS1709ECG' })
  s.moveElementTypesToFamily(['ET-LIN-TAPE-06'], 'ET-LIN-FLEX')                       // renumbered: a rename
  s.addRecipeRow('C01r', 'lin_internal', { elementTypeRef: 'ET-LIN-CAP-01', quantity: 2, isContractItem: 'Y' }, { asPosition: true })
  const tape = useStore.getState().recipes.find(r => r.ElementTypeRef === 'ET-LIN-TAPE-01')
  useStore.getState().updateRecipeRow('C01r', tape._id, { Dim_QuantityMultiplier: 2 })
}
function exportBatch() {
  const s = useStore.getState()
  s.markExported()
  const t = useStore.getState(), o = { project: '5642' }
  return { db: buildDbScript(t.dbChanges, undefined, o), ps: buildPsScript(t.psChanges, undefined, o), rs: buildRsScript(t.rsChanges, undefined, o) }
}
const patch = (files, scripts, which = ['db', 'ps', 'rs']) => Object.fromEntries(which.map(k => [k, run(scripts[k], excel(NAMES[k], files[k]))]))
async function check(files) {
  importFiles.mockResolvedValueOnce(parsed(files))
  return useStore.getState().checkFiles()
}
const pendingCount = () => { const s = useStore.getState(); return s.psChanges.length + s.rsChanges.length + s.dbChanges.length }
const refsOf = (grid, col) => grid.slice(1).map(r => r[grid[0].indexOf(col)])
const dupes = list => list.filter((x, i) => x && list.indexOf(x) !== i)

describe('the patch round trip', () => {
  let files
  beforeEach(() => { files = workbooks(); open(files); edit() })

  test('all three patched: nothing pending, the batch is done, the files say what the app said', async () => {
    const before = pendingCount()
    expect(before).toBeGreaterThan(5)
    const logs = patch(files, exportBatch())
    expect(logs.db.at(-1)).toMatch(/patch complete: \d+ added, \d+ updated, 0 already there, 0 not found/)
    const counts = await check(files)
    expect(pendingCount()).toBe(0)
    expect(counts.ps.conflicts + counts.rs.conflicts + counts.db.conflicts).toBe(0)
    expect(useStore.getState().patchBatch).toBeNull()
    // The rename reached every file; nothing doubled.
    expect(refsOf(files.db.ElementTypes, 'Ref')).toContain('ET-LIN-FLEX-01')
    expect(refsOf(files.db.ElementTypes, 'Ref')).not.toContain('ET-LIN-TAPE-06')
    expect(refsOf(files.ps.Form, 'EntityRef')).toContain('ET-LIN-FLEX-01')
    expect(refsOf(files.rs.Form, 'EntityRef')).toContain('ET-LIN-FLEX-01')
    expect(dupes(refsOf(files.db.ElementTypes, 'Ref'))).toEqual([])
    expect(dupes(refsOf(files.ps.Form, 'EntityRef'))).toEqual([])
    // What is on screen is what the files hold.
    const s = useStore.getState()
    expect(s.psRows.find(r => r.ElementTypeRef === 'ET-LIN-TAPE-01').ProductCode).toBe('LL240272024B')
    expect(s.elementTypes.filter(e => e.ElementTypeRef === 'ET-LIN-FLEX-01')).toHaveLength(1)
  })

  test('only the DesignDB patched: its changes leave, the rest wait; the rest patched later: done', async () => {
    const scripts = exportBatch()
    patch(files, scripts, ['db'])
    const counts = await check(files)
    expect(counts.db.pending).toBe(0)
    expect(useStore.getState().psChanges.length + useStore.getState().rsChanges.length).toBeGreaterThan(0)
    expect(useStore.getState().patchBatch).not.toBeNull()
    patch(files, scripts, ['ps', 'rs'])
    await check(files)
    expect(pendingCount()).toBe(0)
  })

  test('every patch run twice is the same as once', async () => {
    const scripts = exportBatch()
    patch(files, scripts)
    const once = JSON.stringify(files)
    const logs = patch(files, scripts)
    expect(JSON.stringify(files)).toBe(once)
    expect(logs.ps.at(-1)).toMatch(/0 added/)
    await check(files)
    expect(pendingCount()).toBe(0)
  })

  test('edits after the export are the next batch: kept, never lost, never mixed in', async () => {
    const scripts = exportBatch()
    useStore.getState().updatePSRow('ET-LIN-TAPE-01', { ProductCode: 'LL240272024C' })
    patch(files, scripts)
    const counts = await check(files)
    expect(counts.ps.conflicts).toBe(0)
    expect(useStore.getState().psChanges).toEqual([expect.objectContaining({
      elementTypeRef: 'ET-LIN-TAPE-01', updates: { ProductCode: 'LL240272024C' }, before: expect.objectContaining({ ProductCode: 'LL240272024B' }) })])
    expect(pendingCount()).toBe(1)
    patch(files, exportBatch())
    await check(files)
    expect(pendingCount()).toBe(0)
    expect(files.ps.Form.find(r => r[1] === 'ET-LIN-TAPE-01')[3]).toBe('LL240272024C')
  })

  test('patched while the app was closed: reopening settles, nothing is pushed back in', async () => {
    const scripts = exportBatch()
    const s = useStore.getState()
    const saved = JSON.parse(JSON.stringify({ ps: s.psChanges, rs: s.rsChanges, db: s.dbChanges }))
    patch(files, scripts)
    open(files)                                        // the app reopens on the patched workbooks
    const counts = useStore.getState().restorePendingChanges(saved)
    expect(Object.values(counts).reduce((n, c) => n + c.pending + c.conflicts, 0)).toBe(0)
    expect(pendingCount()).toBe(0)
  })

  test('a cell edited by hand in the workbook is a conflict; nothing is overwritten until a person picks', async () => {
    exportBatch()
    files.ps.Form.find(r => r[1] === 'ET-LIN-TAPE-01')[3] = 'HANDEDIT'     // no patch run; someone typed instead
    await check(files)
    const { conflicts } = useStore.getState().syncStatus
    expect(conflicts).toMatchObject([{ file: 'ps', key: 'ET-LIN-TAPE-01', fields: [{ field: 'ProductCode', mine: 'LL240272024B', file: 'HANDEDIT' }] }])
    useStore.getState().resolveConflict('ps', 'ET-LIN-TAPE-01', 'mine')
    patch(files, exportBatch(), ['ps'])
    expect(files.ps.Form.find(r => r[1] === 'ET-LIN-TAPE-01')[3]).toBe('LL240272024B')
  })

  test('a patch pasted into another project\'s workbook changes nothing', () => {
    const scripts = exportBatch()
    const other = JSON.stringify(files.ps)
    const log = run(scripts.ps, excel('9999 - Product Spec.xlsx', files.ps.Form ? files.ps : files.ps))
    expect(log.join('\n')).toMatch(/STOP: this patch is for project 5642/)
    expect(JSON.stringify(files.ps)).toBe(other)
  })

  test('a workbook that cannot be read yet (still syncing) changes nothing and says so', async () => {
    exportBatch()
    const before = pendingCount()
    importFiles.mockRejectedValueOnce(new Error('Unsupported file'))
    expect(await useStore.getState().checkFiles()).toBeNull()
    expect(pendingCount()).toBe(before)
    expect(useStore.getState().syncStatus.error).toMatch(/Unsupported/)
  })
})
