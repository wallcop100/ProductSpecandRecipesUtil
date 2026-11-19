/**
 * Step 2 of the upgrade check (scripts/upgrade-check.sh): the work prod saved ($UPGRADE_SAVED,
 * from saveOnProd.test.js) is reopened by THIS build, as openProject does. Nothing may be lost,
 * changed or flagged as a conflict.
 */
import { test, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { base } from './base.js'

window.electronAPI = { db: { setPref: vi.fn(async () => {}), getPref: vi.fn(async () => null), setPendingChanges: vi.fn(async () => {}) } }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))
const { default: useStore } = await import('../../src/store/useStore.js')

const file = process.env.UPGRADE_SAVED
const prod = file ? JSON.parse(readFileSync(file, 'utf8')) : null
const live = rows => rows.filter(r => r.IsDeleted !== 'Y' && r.isDeleted !== 'Y')
const etKey = r => String(r.ElementTypeRef || r.elementTypeRef).toLowerCase()
const rsKey = r => [r.ContextRef, r.ElementTypeRef || r.elementTypeRef, r.RecipeIndex].join('|')
// Every field prod showed on a row, this build shows the same (dev may add fields, never change one).
function expectSameRows(prodRows, devRows, key) {
  const dev = new Map(live(devRows).map(r => [key(r), r]))
  expect([...dev.keys()].sort()).toEqual(live(prodRows).map(key).sort())
  for (const p of live(prodRows)) {
    const d = dev.get(key(p))
    for (const [f, v] of Object.entries(p)) if (!f.startsWith('_') && v != null && v !== '') expect([key(p), f, d[f]]).toEqual([key(p), f, v])
  }
}

test.skipIf(!prod)('dev reopens prod\'s saved work: every change kept, none in conflict', () => {
  useStore.setState(base())
  const counts = useStore.getState().restorePendingChanges(prod.saved)
  useStore.getState().queuePsOnlyETs?.()   // openProject runs it after the restore
  for (const c of Object.values(counts)) expect(c.conflicts ?? 0).toBe(0)
  const s = useStore.getState()
  expect(s.psChanges).toHaveLength(prod.saved.ps.length)
  expect(s.rsChanges).toHaveLength(prod.saved.rs.length)
  expect(s.dbChanges.length).toBeGreaterThanOrEqual(prod.saved.db.length)
  expectSameRows(prod.after.psRows, s.psRows, etKey)
  expectSameRows(prod.after.elementTypes, s.elementTypes, etKey)
  expectSameRows(prod.after.recipes, s.recipes, rsKey)
})

// The database prod wrote, opened by this build's schema exactly as openDatabase does: initDb runs
// this build's migrations over prod's file. Prod's rows must come through untouched (dev may add
// tables and columns, never drop, rename or rewrite one), and the work must reopen from the file.
test.skipIf(!prod?.sqlite)('dev opens prod\'s SQLite file: every row kept, the work reopens', async () => {
  const { openSqlite, dumpTables, dbApiOver } = await import('./sqlite.js')
  const { raw, conn, schema } = await openSqlite(Buffer.from(prod.sqlite, 'base64'))
  const before = dumpTables(raw)
  expect(before.pending_changes.length).toBeGreaterThan(0)   // the save really reached the file
  schema.initDb(conn)
  schema.initDb(conn)   // a second start must change nothing either
  const after = dumpTables(raw)
  for (const [table, rows] of Object.entries(before)) {
    expect([table, after[table]?.length]).toEqual([table, rows.length])
    rows.forEach((r, i) => { for (const [c, v] of Object.entries(r)) expect([table, i, c, after[table][i][c]]).toEqual([table, i, c, v]) })
  }

  // Reopen the way openProject does, through electronAPI.db over this build's schema.
  window.electronAPI = { db: dbApiOver(schema) }
  const id = prod.projectId
  expect(after.projects.find(p => p.id === id)?.project_number).toBe('U1')
  const pending = await window.electronAPI.db.getPendingChanges(id)
  const db = JSON.parse(await window.electronAPI.db.getPref(id, 'pending_db_changes') || '[]')
  expect({ ...pending, db }).toEqual(JSON.parse(JSON.stringify(prod.saved)))
  useStore.setState({ ...base(), projectId: id })
  const counts = useStore.getState().restorePendingChanges({ ...pending, db })
  for (const c of Object.values(counts)) expect(c.conflicts ?? 0).toBe(0)
  const s = useStore.getState()
  expectSameRows(prod.after.psRows, s.psRows, etKey)
  expectSameRows(prod.after.elementTypes, s.elementTypes, etKey)
  expectSameRows(prod.after.recipes, s.recipes, rsKey)
  // the rest of the session, read by this build's own queries
  expect(schema.getPositionUI(id, 'P1')).toMatchObject({ user_notes: 'ask about trim', tags: ['dl'], tag_add: ['x'] })
  expect(schema.getFavorites().map(f => f.id)).toContain('fav1')
  expect(schema.getLocalElementTypes(id).map(e => e.ElementTypeRef || e.elementTypeRef)).toContain('ET-B-03')
  expect(schema.getPref(id, 'some_ui_pref')).toBe('{"a":1}')
})
