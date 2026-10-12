import { describe, it, expect, beforeEach, vi } from 'vitest'
import { getCompanion, resetCompanion, normalizeProduct, PROTOCOL } from '../../src/platform/companion'
import { shareAssignments } from '../../src/screens/import/useCatalogue'

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
    vi.stubGlobal('fetch', vi.fn(async () => json({ protocol: 'something-else/9', features: ['products'] })))
    expect(await getCompanion()).toBeNull()
  })

  it('offers only the features advertised', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ protocol: PROTOCOL, features: ['products'] })))
    const c = await getCompanion()
    expect(typeof c.lookupProduct).toBe('function')
    expect(c.contribute).toBeNull()
    expect(c.workspaces).toBe(false)
  })

  it('caches a lookup per (maker, code)', async () => {
    const f = vi.fn(async url => (String(url).includes('capabilities')
      ? json({ protocol: PROTOCOL, features: ['products'] })
      : json({ known: true, manufacturer: 'Acme', refsUsed: [{ ref: 'ET-A-01', count: 2 }] })))
    vi.stubGlobal('fetch', f)
    const c = await getCompanion()
    const a = await c.lookupProduct('dl0560', 'acme')
    await c.lookupProduct('DL0560', 'ACME')
    expect(a.refsUsed).toEqual([{ ref: 'ET-A-01', count: 2, confirmed: false }])
    expect(f).toHaveBeenCalledTimes(2)
  })
})

describe('normalizeProduct', () => {
  it('treats unknown as null', () => {
    expect(normalizeProduct({ known: false })).toBeNull()
    expect(normalizeProduct(null)).toBeNull()
  })
  it('tolerates string refs and drops malformed facts', () => {
    const p = normalizeProduct({ refsUsed: ['ET-X-01'], facts: [{ attribute: 'ElementTypes.MaxPower(W)', value: 60 }, { value: 1 }] })
    expect(p.refsUsed[0]).toMatchObject({ ref: 'ET-X-01', count: 1 })
    expect(p.facts).toHaveLength(1)
    expect(p.facts[0].value).toBe('60')
  })
})

describe('shareAssignments', () => {
  it('offers single-maker decisions once per session', async () => {
    const contribute = vi.fn(async () => true)
    const entries = [
      { text: 'C1', manufacturers: ['Acme'], etRef: 'ET-1', variants: [{ note: 'n' }] },
      { text: 'C2', manufacturers: ['A', 'B'], etRef: 'ET-2', variants: [] },
      { text: 'C3', manufacturers: ['Acme'], etRef: null, variants: [] },
      { text: 'TBC (J3)', placeholder: {}, manufacturers: ['Acme'], etRef: 'ET-3', variants: [] },
    ]
    expect(await shareAssignments({ contribute }, entries, { project: 'P1' })).toBe(1)
    expect(contribute).toHaveBeenCalledWith(expect.objectContaining({ kind: 'et-assignment', code: 'C1', ref: 'ET-1', project: 'P1' }))
    expect(await shareAssignments({ contribute }, entries)).toBe(0)
  })
  it('does nothing without a companion', async () => {
    expect(await shareAssignments(null, [{ text: 'C', manufacturers: ['A'], etRef: 'E' }])).toBe(0)
  })
})
