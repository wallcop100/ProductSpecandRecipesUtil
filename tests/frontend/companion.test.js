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
  it('posts outcomes and reports only when advertised', async () => {
    const f = vi.fn(async url => (String(url).includes('capabilities')
      ? json({ protocol: PROTOCOL, features: ['outcomes', 'reports'] }) : json({ received: true, id: 3 })))
    vi.stubGlobal('fetch', f)
    const c = await getCompanion()
    await c.shareOutcomes('4343', [{ kind: 'rule' }])
    expect(String(f.mock.calls[1][0])).toBe('./api/projects/4343/outcomes')
    expect(JSON.parse(f.mock.calls[1][1].body)).toEqual({ outcomes: [{ kind: 'rule' }] })
    expect(await c.report({ note: 'x' })).toEqual({ received: true, id: 3 })
    expect(String(f.mock.calls[2][0])).toBe('./api/reports')
  })
  it('has no reports or outcomes on an older companion', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ protocol: PROTOCOL, features: ['projects'] })))
    const c = await getCompanion()
    expect(c.report).toBeNull()
    expect(c.shareOutcomes).toBeNull()
  })
  it('proves a project with salted hashes, then sends the token on its calls', async () => {
    const f = vi.fn(async (url, init) => {
      const u = String(url)
      if (u.includes('capabilities')) return json({ protocol: PROTOCOL, features: ['projects', 'proof'] })
      if (u === './api/proof') return json({ nonce: 'N' })
      if (u.endsWith('/proof')) return json({ token: '1761200000.' + 'a'.repeat(32) })
      return json({ items: [] })
    })
    vi.stubGlobal('fetch', f)
    const c = await getCompanion()
    expect(await c.projectItems('4343')).toEqual({ items: [] })
    expect(f.mock.calls[1][1].headers['X-PSR-Proof']).toBeUndefined()
    expect(await c.prove('4343', [{ Ref: 'A1', TypeRef: 'T' }, { Ref: 'A1', TypeRef: 'T' }, { Ref: 'B2' }, {}])).toBe(true)
    const sent = JSON.parse(f.mock.calls[3][1].body)
    expect(sent.nonce).toBe('N')
    // first 16 hex of sha256('N|A1|T') and of 'N|B2|': no Ref or TypeRef leaves in the clear
    const { createHash } = await import('node:crypto')
    expect(sent.hashes).toEqual(['N|A1|T', 'N|B2|'].map(t => createHash('sha256').update(t).digest('hex').slice(0, 16)))
    await c.projectItems('4343')
    expect(f.mock.calls[4][1].headers['X-PSR-Proof']).toBe('1761200000.' + 'a'.repeat(32))
  })
})
