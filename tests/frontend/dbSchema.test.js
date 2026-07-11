import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import initSqlJs from 'sql.js'
import path from 'node:path'
import { wrapSqlJs } from '../../src/platform/sqlShim.js'
import * as schema from '../../src/platform/dbSchema.js'

/**
 * dbSchema.js is electron/db.js with its SQL untouched — only the connection is
 * injected. These tests prove the sql.js shim satisfies the exact better-sqlite3
 * surface that file relies on: positional AND named (@name) binding, multi-
 * statement exec, PRAGMA table_info migrations, and transactions.
 */
let SQL
let conn

beforeEach(async () => {
  SQL = SQL || await initSqlJs({
    locateFile: f => path.resolve('node_modules/sql.js/dist', f),
  })
  conn = wrapSqlJs(new SQL.Database())
  schema.initDb(conn)   // createTables() + migrate()
})

describe('the shim runs the real schema', () => {
  test('initDb creates every table and migrations are idempotent', () => {
    const names = conn.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name)
    for (const t of ['projects', 'position_ui', 'templates', 'slot_mappings', 'project_prefs',
      'et_collections', 'favorites', 'pending_changes', 'local_element_types']) {
      expect(names).toContain(t)
    }
    // migrate() runs on every open; a second pass must not throw
    expect(() => schema.initDb(conn)).not.toThrow()
  })

  test('migrations added their columns (PRAGMA table_info path)', () => {
    const cols = conn.prepare('PRAGMA table_info(position_ui)').all().map(c => c.name)
    expect(cols).toEqual(expect.arrayContaining(['ignored', 'tag_add', 'tag_remove']))
    expect(conn.prepare('PRAGMA table_info(et_collections)').all().map(c => c.name)).toContain('ExcludedTags')
  })
})

describe('named (@name) and positional (?) binding both work', () => {
  test('upsertProject (@named upsert) round-trips via getProject (positional)', () => {
    // upsertProject binds a named bag; getProject binds two positional params
    const created = schema.upsertProject('/proj/a', 'Base', '5642', 'Lighting', 'db.xlsx', 'ps.xlsx', 'rs.xlsx')
    expect(created.folder_path).toBe('/proj/a')

    const got = schema.getProject('/proj/a', 'Base')
    expect(got.project_number).toBe('5642')
    expect(got.ps_filename).toBe('ps.xlsx')
  })

  test('ON CONFLICT updates rather than duplicating', () => {
    schema.upsertProject('/proj/a', 'Base', '1')
    schema.upsertProject('/proj/a', 'Base', '2')
    expect(schema.getAllProjects()).toHaveLength(1)
    expect(schema.getProject('/proj/a', 'Base').project_number).toBe('2')
  })

  test('the same folder can hold several named configs', () => {
    schema.upsertProject('/proj/a', 'Base')
    schema.upsertProject('/proj/a', 'Alt')
    expect(schema.getConfigsForFolder('/proj/a').map(c => c.config_name).sort()).toEqual(['Alt', 'Base'])
  })

  test('the most recently opened comes first', () => {
    schema.upsertProject('/proj/a', 'Base')
    schema.upsertProject('/proj/b', 'Base')
    expect(schema.getRecentProjects()[0].folder_path).toBe('/proj/b')
  })

  /**
   * last_opened is an ISO string with millisecond precision, so two projects opened
   * in the same millisecond tie and SQLite may return either first. This suite
   * failed about half the time until `id DESC` broke the tie. Freeze the clock so
   * the tie is guaranteed, rather than depending on how fast the machine is.
   */
  describe('a tie on last_opened resolves by insertion order', () => {
    let clock
    beforeEach(() => {
      clock = vi.spyOn(Date.prototype, 'toISOString').mockReturnValue('2026-01-01T00:00:00.000Z')
    })
    afterEach(() => clock.mockRestore())

    test('the later insert wins when the timestamps are identical', () => {
      schema.upsertProject('/proj/a', 'Base')
      schema.upsertProject('/proj/b', 'Base')
      expect(schema.getRecentProjects()[0].folder_path).toBe('/proj/b')
    })

    test('getConfigsForFolder lists the later insert first', () => {
      schema.upsertProject('/proj/a', 'Base')
      schema.upsertProject('/proj/a', 'Alt')
      expect(schema.getConfigsForFolder('/proj/a').map(c => c.config_name)).toEqual(['Alt', 'Base'])
    })

    // The landing page leads with this list, so the tie must break deterministically —
    // it failed about half the time until `id DESC` was added.
    test('getRecentProjects breaks a same-millisecond tie by insertion order', () => {
      schema.upsertProject('/proj/a', 'Base')
      schema.upsertProject('/proj/b', 'Base')
      schema.upsertProject('/proj/c', 'Base')
      expect(schema.getRecentProjects().map(p => p.folder_path)).toEqual(['/proj/c', '/proj/b', '/proj/a'])
    })
  })
})

describe('getRecentProjects — what the landing page leads with', () => {
  test('honours the limit, and defaults to five', () => {
    for (const f of ['/a', '/b', '/c']) schema.upsertProject(f, 'Base')
    expect(schema.getRecentProjects(2)).toHaveLength(2)
    expect(schema.getRecentProjects()).toHaveLength(3)
  })

  test('a project that was never opened is not recent', () => {
    conn.prepare("INSERT INTO projects (folder_path, config_name, last_opened) VALUES ('/never', 'Base', NULL)").run()
    schema.upsertProject('/opened', 'Base')
    expect(schema.getRecentProjects().map(p => p.folder_path)).toEqual(['/opened'])
  })

  test('empty when nothing has been opened', () => {
    expect(schema.getRecentProjects()).toEqual([])
  })
})

describe('project-scoped data survives a round trip', () => {
  let pid
  beforeEach(() => { pid = schema.upsertProject('/p', 'Base').id })

  test('prefs', () => {
    schema.setPref(pid, 'dbWriteEnabled', 'true')
    expect(schema.getPref(pid, 'dbWriteEnabled')).toBe('true')
    expect(schema.getPref(pid, 'missing')).toBeNull()
  })

  test('collections (JSON columns)', () => {
    schema.upsertCollection(pid, {
      CollectionId: 'c1', Name: 'Site kit',
      ApplicableTags: ['Local'], ExcludedTags: [], Ingredients: [{ ElementTypeRef: 'ET-A' }],
    })
    const [c] = schema.getAllCollections(pid)
    expect(c.Name).toBe('Site kit')
    expect(c.ApplicableTags).toEqual(['Local'])
    expect(c.Ingredients[0].ElementTypeRef).toBe('ET-A')
  })

  test('pending changes (the crash-safe dirty registry)', () => {
    expect(schema.getPendingChanges(pid)).toEqual({ ps: [], rs: [] })
    schema.setPendingChanges(pid, [{ elementTypeRef: 'ET-A' }], [{ _id: 'r1' }])
    expect(schema.getPendingChanges(pid).ps[0].elementTypeRef).toBe('ET-A')
    schema.clearPendingChanges(pid)
    expect(schema.getPendingChanges(pid)).toEqual({ ps: [], rs: [] })
  })

  test('local element types', () => {
    schema.upsertLocalElementType(pid, { ref: 'ET-NEW', name: 'New', family: 'TAPE' })
    expect(schema.getLocalElementTypes(pid).map(e => e.ElementTypeRef)).toContain('ET-NEW')
    schema.renameLocalElementType(pid, 'ET-NEW', 'ET-RENAMED')
    expect(schema.getLocalElementTypes(pid).map(e => e.ElementTypeRef)).toContain('ET-RENAMED')
    schema.deleteLocalElementType(pid, 'ET-RENAMED')
    expect(schema.getLocalElementTypes(pid)).toHaveLength(0)
  })

  test('templates, and deleting the project cascades its rows away', () => {
    schema.upsertTemplate({ id: 't1', name: 'T', scope: 'project', project_id: pid, ingredients: [{ slotKey: 's' }] })
    expect(schema.getAllTemplates(pid).map(t => t.id)).toContain('t1')

    schema.deleteProject(pid)          // FK ON DELETE CASCADE must fire
    expect(schema.getAllProjects()).toHaveLength(0)
    expect(schema.getPendingChanges(pid)).toEqual({ ps: [], rs: [] })
  })
})

describe('global (cross-project) data', () => {
  test('favourites are not tied to a project', () => {
    schema.upsertFavorite({ id: 'f1', kind: 'element', ref: 'ET-A', label: 'Alpha' })
    expect(schema.getFavorites().map(f => f.ref)).toEqual(['ET-A'])
    schema.deleteFavorite('f1')
    expect(schema.getFavorites()).toHaveLength(0)
  })
})

describe('transactions (db.transaction)', () => {
  test('a throwing transaction rolls back every statement', () => {
    const pid = schema.upsertProject('/p', 'Base').id
    const boom = conn.transaction(() => {
      schema.setPref(pid, 'a', '1')
      throw new Error('boom')
    })
    expect(() => boom()).toThrow('boom')
    expect(schema.getPref(pid, 'a')).toBeNull()
  })

  test('a transaction forwards its arguments and commits', () => {
    const pid = schema.upsertProject('/p', 'Base').id
    const setMany = conn.transaction(pairs => {
      for (const [k, v] of pairs) schema.setPref(pid, k, v)
      return pairs.length
    })
    expect(setMany([['a', '1'], ['b', '2']])).toBe(2)
    expect(schema.getPref(pid, 'b')).toBe('2')
  })
})

describe('serialize / restore (what IndexedDB persistence relies on)', () => {
  test('exported bytes reopen into an identical database', () => {
    const pid = schema.upsertProject('/p', 'Base', '5642').id
    schema.setPref(pid, 'k', 'v')

    const bytes = conn.export()
    const restored = wrapSqlJs(new SQL.Database(new Uint8Array(bytes)))
    schema.initDb(restored)

    expect(schema.getProject('/p', 'Base').project_number).toBe('5642')
    expect(schema.getPref(pid, 'k')).toBe('v')
  })
})

/**
 * Picking a folder used to mint a fresh handle id every time, and `folder_path` IS that id.
 * So re-picking a project you already had inserted a SECOND row with an empty overlay, and
 * your tags, templates and unexported changes appeared to have vanished — they were on the
 * old row. These prove the repair, and that it never costs you anything.
 */
describe('naming a project', () => {
  test('a project can be renamed — nothing in the app could do this before', () => {
    const p = schema.upsertProject('dir_a', 'Base', '5642', 'my-folder')
    schema.renameProject(p.id, 'Marlborough House')
    expect(schema.getProject('dir_a', 'Base').project_label).toBe('Marlborough House')
  })

  /**
   * The reason the column was dead: every open silently overwrote it with the folder name,
   * so there was no point letting anyone rename anything.
   */
  test('re-opening does NOT clobber the name you gave it', () => {
    const p = schema.upsertProject('dir_a', 'Base', '5642', 'my-folder')
    schema.renameProject(p.id, 'Marlborough House')
    schema.upsertProject('dir_a', 'Base', '5642', 'my-folder')   // open it again
    expect(schema.getProject('dir_a', 'Base').project_label).toBe('Marlborough House')
  })

  test('a config can be renamed, and a clash fails cleanly instead of throwing', () => {
    const base = schema.upsertProject('dir_a', 'Base', '5642', 'f')
    schema.upsertProject('dir_a', 'Phase 2', '5642', 'f')

    expect(schema.renameConfig(base.id, 'Tender').ok).toBe(true)
    expect(schema.getProject('dir_a', 'Tender')).toBeTruthy()

    // 'Phase 2' is taken on this folder — UNIQUE(folder_path, config_name) is real
    const clash = schema.renameConfig(base.id, 'Phase 2')
    expect(clash.ok).toBe(false)
    expect(clash.reason).toBe('taken')
    expect(schema.getProject('dir_a', 'Tender')).toBeTruthy()   // unchanged
  })
})

describe('adopting a duplicate — a re-key, never an overlay merge', () => {
  /**
   * The overlay hangs off project_id, NOT folder_path. So moving the row onto the canonical
   * folder carries the whole overlay with it, intact, and it simply becomes another config.
   * That is the entire trick, and this is the test that proves nothing is lost.
   */
  test('the stray keeps every scrap of its work, as a new config of the real project', () => {
    schema.upsertProject('dir_real', 'Base', '5642', 'folder')
    const stray = schema.upsertProject('dir_stray', 'Base', '5642', 'folder')

    // the stray is where the user actually did the work
    schema.upsertPositionUI(stray.id, 'C01r', { tags: ['DL', 'Local'] })
    schema.setPendingChanges(stray.id, [{ x: 1 }], [{ y: 2 }])
    schema.upsertLocalElementType(stray.id, { ref: 'ET-MINE-01' })

    const res = schema.adoptDuplicateProject(stray.id, 'dir_real', 'Base (2)')
    expect(res.ok).toBe(true)

    // it now lives on the real folder, as its own config
    const moved = schema.getProject('dir_real', 'Base (2)')
    expect(moved.id).toBe(stray.id)          // same row — so the overlay FKs still point at it
    expect(schema.getConfigsForFolder('dir_real').map(c => c.config_name).sort())
      .toEqual(['Base', 'Base (2)'])

    // …and the work came with it
    expect(schema.getAllPositionUI(stray.id).find(u => u.position_type_ref === 'C01r')).toBeTruthy()
    const pending = schema.getPendingChanges(stray.id)
    expect(pending.ps).toHaveLength(1)
    expect(pending.rs).toHaveLength(1)
    expect(schema.getLocalElementTypes(stray.id).map(e => e.ElementTypeRef)).toContain('ET-MINE-01')
  })

  test('it refuses a config name already taken on the target, rather than violating UNIQUE', () => {
    schema.upsertProject('dir_real', 'Base', '5642', 'f')
    const stray = schema.upsertProject('dir_stray', 'Base', '5642', 'f')
    const res = schema.adoptDuplicateProject(stray.id, 'dir_real', 'Base')
    expect(res).toEqual({ ok: false, reason: 'taken' })
    expect(schema.getProject('dir_stray', 'Base')).toBeTruthy()   // untouched
  })
})

describe('getProjectSummaries — "am I in the right project?"', () => {
  test('it reports what each project actually HOLDS, so you can tell the real one from the empty copy', () => {
    const real = schema.upsertProject('dir_real', 'Base', '5642', 'f')
    schema.upsertProject('dir_empty', 'Base', '5642', 'f')

    schema.upsertPositionUI(real.id, 'C01r', { tags: ['DL'] })
    schema.setPendingChanges(real.id, [{ a: 1 }, { b: 2 }], [{ c: 3 }])

    const byId = Object.fromEntries(schema.getProjectSummaries().map(s => [s.id, s]))
    expect(byId[real.id].unexported).toBe(3)        // 2 ps + 1 rs
    expect(byId[real.id].taggedPositions).toBe(1)

    const emptyId = schema.getProject('dir_empty', 'Base').id
    expect(byId[emptyId].unexported).toBe(0)
    expect(byId[emptyId].taggedPositions).toBe(0)
  })
})
