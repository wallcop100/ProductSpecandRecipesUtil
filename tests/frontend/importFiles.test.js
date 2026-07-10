import { describe, test, expect, vi, beforeEach } from 'vitest'

/**
 * A new project has a DesignDB and nothing else. The DesignDB is the only source of
 * PositionTypes and of the ExtRef convention (C01 → C01r), so it stays required —
 * but the Product Spec and Recipes Spec start empty and are patched in at export.
 */
const files = {}   // filename → bytes | undefined

vi.mock('../../src/platform/fs.js', () => ({
  getDirectory: vi.fn(async () => ({})),
  readFileNamed: vi.fn(async (_dir, name) => files[name] ?? null),
  readFileHandle: vi.fn(),
  listXlsx: vi.fn(async () => []),
}))
vi.mock('../../src/platform/xlsx.js', () => ({
  parseDb: () => ({ element_types: [{ ElementTypeRef: 'ET-1' }], position_types: [{ PositionTypeRef: 'C01r' }] }),
  parsePs: () => [{ ElementTypeRef: 'ET-1' }],
  parseRs: () => [{ PositionTypeRef: 'C01r' }],
  detectFiles: () => ({}),
  readSheet: () => ({}),
}))

const backend = await import('../../src/utils/backend.js')

beforeEach(async () => {
  for (const k of Object.keys(files)) delete files[k]
  await backend.setActiveDirectory('key')
})

describe('importFiles requires only the DesignDB', () => {
  test('all three present: everything parses', async () => {
    Object.assign(files, { 'db.xlsx': new Uint8Array([1]), 'ps.xlsx': new Uint8Array([1]), 'rs.xlsx': new Uint8Array([1]) })
    const r = await backend.importFiles({ db: 'db.xlsx', ps: 'ps.xlsx', rs: 'rs.xlsx' })
    expect(r.db.position_types).toHaveLength(1)
    expect(r.ps).toHaveLength(1)
    expect(r.rs).toHaveLength(1)
    expect(r.missing).toEqual([])
  })

  test('a new project — DesignDB alone — opens with empty spec and recipes', async () => {
    files['db.xlsx'] = new Uint8Array([1])
    const r = await backend.importFiles({ db: 'db.xlsx', ps: '', rs: '' })
    expect(r.db.position_types).toHaveLength(1)   // the positions still arrive
    expect(r.ps).toEqual([])
    expect(r.rs).toEqual([])
    expect(r.missing).toEqual(['ps', 'rs'])
  })

  test('only the Recipes Spec missing', async () => {
    Object.assign(files, { 'db.xlsx': new Uint8Array([1]), 'ps.xlsx': new Uint8Array([1]) })
    const r = await backend.importFiles({ db: 'db.xlsx', ps: 'ps.xlsx', rs: 'rs.xlsx' })
    expect(r.ps).toHaveLength(1)
    expect(r.rs).toEqual([])
    expect(r.missing).toEqual(['rs'])
  })

  test('no DesignDB still throws — nothing can be resolved without it', async () => {
    Object.assign(files, { 'ps.xlsx': new Uint8Array([1]), 'rs.xlsx': new Uint8Array([1]) })
    await expect(backend.importFiles({ db: 'db.xlsx', ps: 'ps.xlsx', rs: 'rs.xlsx' }))
      .rejects.toThrow(/db: 'db.xlsx' not found/)
  })

  test('the error names the DesignDB even when no filename was chosen', async () => {
    await expect(backend.importFiles({ db: '', ps: '', rs: '' })).rejects.toThrow(/DesignDB/)
  })
})
