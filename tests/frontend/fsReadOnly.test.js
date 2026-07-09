import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import * as fsx from '../../src/platform/fs.js'

// Directory handles are persisted to IndexedDB, which jsdom does not provide.
vi.mock('../../src/platform/idb.js', () => ({
  idbGet: vi.fn(async () => ({})),
  idbSet: vi.fn(async () => {}),
  idbDel: vi.fn(async () => {}),
  idbKeys: vi.fn(async () => []),
}))

/**
 * The project folder is read-only. Not by convention — by the grant the browser
 * gives us. These pin that, so a future "just write a little file" cannot quietly
 * reintroduce a path that could clobber a design workbook.
 */

describe('the module exposes no way to write to the project folder', () => {
  test('no writer is exported', () => {
    for (const gone of ['writeFile', 'snapshot', 'lastSnapshotTime', 'ensureWritePermission']) {
      expect(fsx[gone], `${gone} should not exist`).toBeUndefined()
    }
  })

  test('nothing ever asks for a readwrite grant', () => {
    // saveAs/download do call createWritable — but on a handle the user chose from a
    // save picker, never on the project directory handle. The grant is what matters.
    const code = fs.readFileSync('src/platform/fs.js', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')      // block comments
      .replace(/\/\/.*$/gm, '')              // line comments
    expect(code).not.toMatch(/['"]readwrite['"]/)
  })
})

describe('the directory grant', () => {
  const origin = {}
  beforeEach(() => {
    origin.picker = globalThis.window?.showDirectoryPicker
  })
  afterEach(() => {
    if (globalThis.window) globalThis.window.showDirectoryPicker = origin.picker
  })

  test('pickDirectory asks for read, never readwrite', async () => {
    const handle = { name: 'proj' }
    const picker = vi.fn(async () => handle)
    globalThis.window.showDirectoryPicker = picker

    await fsx.pickDirectory()
    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ mode: 'read' }))
  })

  test('ensurePermission defaults to read, and short-circuits when already granted', async () => {
    const handle = {
      queryPermission: vi.fn(async () => 'granted'),
      requestPermission: vi.fn(async () => 'denied'),
    }
    expect(await fsx.ensurePermission(handle)).toBe(true)
    expect(handle.queryPermission).toHaveBeenCalledWith({ mode: 'read' })
    expect(handle.requestPermission).not.toHaveBeenCalled()
  })

  test('ensurePermission requests when not yet granted, and reports a refusal', async () => {
    const ask = answer => ({
      queryPermission: vi.fn(async () => 'prompt'),
      requestPermission: vi.fn(async () => answer),
    })
    expect(await fsx.ensurePermission(ask('granted'))).toBe(true)
    expect(await fsx.ensurePermission(ask('denied'))).toBe(false)
  })

  test('a missing handle is simply not usable', async () => {
    expect(await fsx.ensurePermission(null)).toBe(false)
  })
})
