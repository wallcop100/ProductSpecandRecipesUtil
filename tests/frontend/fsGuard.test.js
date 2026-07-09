import { describe, test, expect, vi } from 'vitest'
import { writeFile, snapshot, ensureWritePermission } from '../../src/platform/fs.js'

/**
 * The design workbooks are read-only. These pin the two guards that enforce it, so
 * a future caller cannot quietly overwrite a form.
 */

/** A directory handle just real enough for writeFile/snapshot. */
function fakeDir(name = 'root', files = {}) {
  const dirs = {}
  const written = {}
  const handle = {
    name,
    written,
    dirs,
    permission: 'granted',
    queryPermission: vi.fn(async () => handle.permission),
    requestPermission: vi.fn(async () => handle.permission),
    async getFileHandle(n, opts) {
      if (!(n in files) && !opts?.create) throw new Error('not found')
      return {
        getFile: async () => ({
          arrayBuffer: async () => new Uint8Array(files[n] || []).buffer,
          lastModified: 1,
        }),
        createWritable: async () => ({
          write: async c => { written[n] = c },
          close: async () => {},
        }),
      }
    },
    async getDirectoryHandle(n, opts) {
      if (!dirs[n]) {
        if (!opts?.create) throw new Error('no dir')
        dirs[n] = fakeDir(n)
      }
      return dirs[n]
    },
  }
  return handle
}

describe('writeFile refuses to touch a workbook', () => {
  test('an .xlsx write into the project folder throws', async () => {
    const dir = fakeDir()
    await expect(writeFile(dir, 'LIGHTING.DesignDB.xlsx', 'x')).rejects.toThrow(/read-only/i)
    expect(dir.written).toEqual({})
  })

  test('.xlsm is refused too, and the check ignores case', async () => {
    const dir = fakeDir()
    await expect(writeFile(dir, 'Form.XLSM', 'x')).rejects.toThrow(/read-only/i)
    await expect(writeFile(dir, 'Form.XlSx', 'x')).rejects.toThrow(/read-only/i)
  })

  test('a non-workbook write is allowed', async () => {
    const dir = fakeDir()
    await writeFile(dir, 'project.config.yaml', 'a: 1')
    expect(dir.written['project.config.yaml']).toBe('a: 1')
  })

  test('the guard can be opted out of — that is how snapshot copies workbooks', async () => {
    const dir = fakeDir()
    await writeFile(dir, 'copy.xlsx', 'bytes', { allowWorkbook: true })
    expect(dir.written['copy.xlsx']).toBe('bytes')
  })
})

describe('snapshot escalates permission, and only writes inside snapshot/', () => {
  const files = { 'db.xlsx': [1, 2, 3], 'ps.xlsx': [4] }

  test('copies the workbooks into snapshot/<date>/, never the root', async () => {
    const dir = fakeDir('root', files)
    const res = await snapshot(dir, ['db.xlsx', 'ps.xlsx'])

    expect(res.ok).toBe(true)
    expect(dir.written).toEqual({})                       // the project root is untouched
    const leaf = Object.values(dir.dirs.snapshot.dirs)[0]
    expect(Object.keys(leaf.written).sort()).toEqual(['db.xlsx', 'ps.xlsx'])
    expect(res.copied.sort()).toEqual(['db.xlsx', 'ps.xlsx'])
  })

  test('it asks for write permission before copying anything', async () => {
    const dir = fakeDir('root', files)
    await snapshot(dir, ['db.xlsx'])
    expect(dir.queryPermission).toHaveBeenCalledWith({ mode: 'readwrite' })
  })

  test('a declined write grant aborts, writing nothing', async () => {
    const dir = fakeDir('root', files)
    dir.permission = 'denied'
    await expect(snapshot(dir, ['db.xlsx'])).rejects.toThrow(/declined/i)
    expect(dir.dirs.snapshot).toBeUndefined()
  })

  test('an absent file is skipped rather than failing the snapshot', async () => {
    const dir = fakeDir('root', files)
    const res = await snapshot(dir, ['db.xlsx', 'missing.xlsx'])
    expect(res.copied).toEqual(['db.xlsx'])
  })

  test('the config overlay lands beside the copies', async () => {
    const dir = fakeDir('root', files)
    await snapshot(dir, ['db.xlsx'], { name: 'p.config.yaml', contents: 'a: 1' })
    const leaf = Object.values(dir.dirs.snapshot.dirs)[0]
    expect(leaf.written['p.config.yaml']).toBe('a: 1')
  })
})

describe('ensureWritePermission', () => {
  test('asks for readwrite, and reports the answer', async () => {
    const granted = fakeDir()
    expect(await ensureWritePermission(granted)).toBe(true)
    expect(granted.queryPermission).toHaveBeenCalledWith({ mode: 'readwrite' })

    const denied = fakeDir()
    denied.permission = 'denied'
    expect(await ensureWritePermission(denied)).toBe(false)
  })
})
