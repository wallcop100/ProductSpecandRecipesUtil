/**
 * Step 1 of the upgrade check (scripts/upgrade-check.sh): run inside a checkout of the PROD
 * code. Makes ordinary edits and saves them the way that build saves them, to $UPGRADE_OUT.
 * Only actions prod has may be used here; this file is copied into the prod tree to run.
 */
import { test, vi } from 'vitest'
import { writeFileSync } from 'node:fs'
import { base } from './base.js'

const prefs = {}
let pending = { ps: [], rs: [] }
window.electronAPI = { db: {
  setPref: vi.fn(async (_id, k, v) => { prefs[k] = v }), getPref: vi.fn(async (_id, k) => prefs[k] ?? null),
  setPendingChanges: vi.fn(async (_id, ps, rs) => { pending = JSON.parse(JSON.stringify({ ps, rs })) }),
}}
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))
const store = await import('../../src/store/useStore.js')
const useStore = store.default

test.skipIf(!process.env.UPGRADE_OUT)('prod: edit and save', async () => {
  useStore.setState(base())
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
  const clean = rows => JSON.parse(JSON.stringify(rows))
  const s = S()
  writeFileSync(process.env.UPGRADE_OUT, JSON.stringify({
    saved: { ...pending, db: JSON.parse(prefs.pending_db_changes || '[]') },
    after: { psRows: clean(s.psRows), recipes: clean(s.recipes), elementTypes: clean(s.elementTypes) },
  }, null, 1))
})
