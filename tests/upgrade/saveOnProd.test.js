/**
 * Step 1 of the upgrade check (scripts/upgrade-check.sh): run inside a checkout of the PROD
 * code. Makes ordinary edits and saves them the way that build saves them, to $UPGRADE_OUT.
 * Only actions prod has may be used here; this file is copied into the prod tree to run.
 */
import { test, vi } from 'vitest'
import { writeFileSync } from 'node:fs'
import { base } from './base.js'
import { openSqlite, dbApiOver } from './sqlite.js'

// Saved through prod's own schema into a real SQLite file, as the browser build saves it.
const { raw, conn, schema } = await openSqlite()
schema.initDb(conn)
window.electronAPI = { db: dbApiOver(schema) }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))
const store = await import('../../src/store/useStore.js')
const useStore = store.default

test.skipIf(!process.env.UPGRADE_OUT)('prod: edit and save', async () => {
  const project = schema.upsertProject('/bed/U1', 'Base', 'U1', 'Upgrade bed', 'U1 DesignDB.xlsx', 'U1 PS.xlsx', 'U1 RS.xlsx')
  useStore.setState({ ...base(), projectId: project.id })
  const S = () => useStore.getState()
  S().updatePSRow('ET-A-01', { ProductCode: 'A1-NEW', InternalNotesText: 'check the CCT', IsTBC: 'Y' })
  S().updateElementType('ET-A-02', { Name: 'A two (renamed)' })
  S().createElementType({ ref: 'ET-B-02', name: 'B two', description: 'Beta 2', family: 'ET-B' })
  S().addPSRow('ET-B-02', { Manufacturer: 'Bco', ProductCode: 'B2' })
  S().updateRecipeRow('P1', 'r1', { Quantity: 3 })
  S().addRecipeRow('P1', 'dl_internal', { elementTypeRef: 'ET-B-02' }, { asPosition: true })
  S().removeRecipeRow('P1', 'r2')
  S().deleteElementType('ET-B-01')
  await store.savePendingNow()
  // The rest of a session's saved state, written by prod's schema directly.
  schema.upsertPositionUI(project.id, 'P1', { tags: ['dl'], tagAdd: ['x'], userNotes: 'ask about trim', ignored: false })
  schema.upsertFavorite({ id: 'fav1', kind: 'element', ref: 'ET-A-01', label: 'Alpha', data: { maker: 'Acme' } })
  schema.upsertLocalElementType(project.id, { ref: 'ET-B-03', name: 'B three', family: 'ET-B' })
  schema.setPref(project.id, 'some_ui_pref', '{"a":1}')
  const pending = schema.getPendingChanges(project.id)
  const prefs = { pending_db_changes: schema.getPref(project.id, 'pending_db_changes') }
  const clean = rows => JSON.parse(JSON.stringify(rows))
  const s = S()
  writeFileSync(process.env.UPGRADE_OUT, JSON.stringify({
    projectId: project.id,
    sqlite: Buffer.from(raw.export()).toString('base64'),
    saved: { ...pending, db: JSON.parse(prefs.pending_db_changes || '[]') },
    after: { psRows: clean(s.psRows), recipes: clean(s.recipes), elementTypes: clean(s.elementTypes) },
  }, null, 1))
})
