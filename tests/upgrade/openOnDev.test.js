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
