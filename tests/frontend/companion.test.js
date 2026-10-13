import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getCompanion, resetCompanion, PROTOCOL } from '../../src/platform/companion'

const json = (body, init = {}) => new Response(JSON.stringify(body), {
  status: 200, ...init, headers: { 'content-type': 'application/json', ...(init.headers || {}) },
})

describe('companion discovery', () => {
  beforeEach(() => { resetCompanion(); vi.restoreAllMocks() })

  it('is null on a static host (404)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
    expect(await getCompanion()).toBeNull()
  })
  it('is null when every path answers with index.html', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html></html>', { status: 200, headers: { 'content-type': 'text/html' } })))
    expect(await getCompanion()).toBeNull()
  })
  it('is null when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline') }))
    expect(await getCompanion()).toBeNull()
  })
  it('is null for an unknown protocol', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ protocol: 'something-else/9', features: ['sweep'] })))
    expect(await getCompanion()).toBeNull()
  })
  it('offers only the features advertised', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ protocol: PROTOCOL, features: ['sweep'] })))
    const c = await getCompanion()
    expect(typeof c.sweep).toBe('function')
    expect(c.projectItems).toBeNull()
    expect(c.contribute).toBeNull()
  })
  it('asks a project only for what is newer', async () => {
    const f = vi.fn(async url => (String(url).includes('capabilities')
      ? json({ protocol: PROTOCOL, features: ['projects'] }) : json({ items: [] })))
    vi.stubGlobal('fetch', f)
    const c = await getCompanion()
    await c.projectItems('4343', '2026-10-13T07:00:00')
    expect(String(f.mock.calls[1][0])).toBe('./api/projects/4343?since=2026-10-13T07%3A00%3A00')
  })
})
