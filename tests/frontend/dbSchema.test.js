import { describe, test, expect, beforeEach } from 'vitest'
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

  test('getLastProject returns the most recently opened', () => {
    schema.upsertProject('/proj/a', 'Base')
    schema.upsertProject('/proj/b', 'Base')
    expect(schema.getLastProject().folder_path).toBe('/proj/b')
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
