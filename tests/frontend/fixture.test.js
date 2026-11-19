import { describe, it, expect, vi } from 'vitest'
import { fixtureDirectory } from '../../src/platform/fixture'

describe('fixture folder', () => {
  it('is never used outside the dev build, or without a plain name', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    expect(await fixtureDirectory('?fixture=5642', false)).toBeNull()
    expect(await fixtureDirectory('', true)).toBeNull()
    expect(await fixtureDirectory('?fixture=../etc', true)).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })

  it('copies the workbooks that are served and skips the ones that are not', async () => {
    const written = []
    const dir = { getFileHandle: async n => ({ createWritable: async () => ({ write: async () => written.push(n), close: async () => {} }) }) }
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => ({ getDirectoryHandle: async () => dir }) } })
    vi.stubGlobal('fetch', vi.fn(async url => String(url).endsWith('Recipes.xlsx')
      ? new Response('<html>', { headers: { 'content-type': 'text/html' } })
      : new Response('x', { headers: { 'content-type': 'application/octet-stream' } })))
    expect(await fixtureDirectory('?fixture=5642', true)).toBe(dir)
    expect(written).toEqual(['DesignDB.xlsx', 'ProductSpec.xlsx'])
  })
})
