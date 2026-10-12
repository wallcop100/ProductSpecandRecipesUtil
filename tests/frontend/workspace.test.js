import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../src/platform/backup', () => ({
  makeBackup: vi.fn(async () => ({ format: 'recipe-builder-backup', version: 1, sqlite: 'AA==' })),
  restoreBackup: vi.fn(async () => {}),
  checkBackup: vi.fn(() => null),
}))
vi.mock('../../src/platform/db', () => ({ onPersisted: vi.fn() }))

const load = async () => { vi.resetModules(); return import('../../src/platform/workspace') }

describe('workspace sync', () => {
  beforeEach(() => { localStorage.clear(); vi.unstubAllGlobals() })

  it('creates with If-None-Match, then saves with If-Match', async () => {
    const calls = []
    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      calls.push(init.headers)
      return new Response('{}', { status: 200, headers: { ETag: `"v${calls.length}"` } })
    }))
    const ws = await load()
    expect(await ws.create()).toBe('saved')
    expect(calls[0]['If-None-Match']).toBe('*')
    expect(await ws.push()).toBe('saved')
    expect(calls[1]['If-Match']).toBe('"v1"')
    expect(ws.current().key).toMatch(/^[A-Za-z0-9_-]{22}$/)
  })

  it('stops at a conflict instead of overwriting', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 412 })))
    const ws = await load()
    expect(await ws.create()).toBe('conflict')
    expect(ws.currentStatus().phase).toBe('conflict')
  })

  it('takes a #ws= link off the address bar', async () => {
    history.replaceState(null, '', '/app/#ws=abcdefghijklmnopqrstuv')
    const ws = await load()
    ws.captureLink()
    expect(ws.linkedKey()).toBe('abcdefghijklmnopqrstuv')
    expect(location.hash).toBe('')
  })
})
