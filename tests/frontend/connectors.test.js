import { describe, test, expect } from 'vitest'
import {
  connectorRole, isConnector, counterpartRef, strainReliefRef, pinHint,
  CONNECTION_TYPES, getConnectionType, composeConnection, connectorGaps, suggestRefForPart,
} from '../../src/utils/connectors.js'

describe('connectorRole', () => {
  test('detects socket, plug, and strain relief', () => {
    expect(connectorRole('ET-SOCKET-5P-01')).toBe('socket')
    expect(connectorRole('ET-SOCK-5P-01')).toBe('socket')
    expect(connectorRole('ET-PLUG-5P-01')).toBe('plug')
    expect(connectorRole('ET-SR-5P-01')).toBe('sr')
  })

  test('SR segment wins over substrings and does not match inside DRIVER', () => {
    expect(connectorRole('ET-DRIVER-CC-01')).toBe(null)
  })

  test('returns null for non-connectors', () => {
    expect(connectorRole('ET-DL-01')).toBe(null)
    expect(connectorRole('')).toBe(null)
    expect(connectorRole(null)).toBe(null)
  })

  test('isConnector reflects role detection', () => {
    expect(isConnector('ET-PLUG-2P-01')).toBe(true)
    expect(isConnector('ET-TAPE-01')).toBe(false)
  })
})

describe('counterpartRef', () => {
  test('socket → plug and plug → socket, preserving the rest', () => {
    expect(counterpartRef('ET-SOCKET-5P-01')).toBe('ET-PLUG-5P-01')
    expect(counterpartRef('ET-PLUG-5P-01')).toBe('ET-SOCKET-5P-01')
    expect(counterpartRef('ET-SOCK-2P-01')).toBe('ET-PLUG-2P-01')
  })

  test('returns null when not a socket/plug', () => {
    expect(counterpartRef('ET-SR-5P-01')).toBe(null)
    expect(counterpartRef('ET-DL-01')).toBe(null)
  })
})

describe('strainReliefRef', () => {
  test('derives an SR ref from a connector ref', () => {
    expect(strainReliefRef('ET-SOCKET-5P-01')).toBe('ET-SR-5P-01')
    expect(strainReliefRef('ET-PLUG-2P-01')).toBe('ET-SR-2P-01')
  })
})

describe('pinHint', () => {
  test('extracts pin tokens', () => {
    expect(pinHint('ET-SOCKET-5P-01')).toBe('5P')
    expect(pinHint('ET-PLUG-2PIN-01')).toBe('2PIN')
    expect(pinHint('ET-DL-01')).toBe(null)
  })
})

describe('CONNECTION_TYPES', () => {
  test('every type is well-formed', () => {
    const sections = new Set(['position', 'dl_internal', 'lin_internal'])
    for (const t of CONNECTION_TYPES) {
      expect(typeof t.id).toBe('string')
      expect(typeof t.label).toBe('string')
      expect(Array.isArray(t.tags)).toBe(true)
      expect(t.parts.length).toBeGreaterThan(0)
      for (const part of t.parts) {
        expect(sections.has(part.section)).toBe(true)
        expect(typeof part.slotKey).toBe('string')
        expect(typeof part.role).toBe('string')
      }
    }
  })

  test('the site type places the socket at position and the plug inside DL', () => {
    const site = getConnectionType('site')
    expect(site.parts.find(p => p.role === 'socket').section).toBe('position')
    expect(site.parts.find(p => p.role === 'plug').section).toBe('dl_internal')
  })
})

describe('composeConnection', () => {
  test('pin token flows into part suggestion tokens', () => {
    const parts = composeConnection({ typeId: 'site', pins: '5' })
    const socket = parts.find(p => p.role === 'socket')
    expect(socket.token).toContain('SOCKET')
    expect(socket.token).toContain('5P')
  })

  test('twinSpot sets quantity 2', () => {
    const parts = composeConnection({ typeId: 'site', pins: '5', twinSpot: true })
    expect(parts.find(p => p.role === 'socket').quantity).toBe(2)
  })

  test('ip adds an IP token', () => {
    const parts = composeConnection({ typeId: 'site', pins: '5', ip: true })
    expect(parts.find(p => p.role === 'socket').token).toContain('IP')
  })

  test('includeSR appends optional strain-relief parts per side', () => {
    const without = composeConnection({ typeId: 'site', pins: '5', includeSR: false })
    const withSR = composeConnection({ typeId: 'site', pins: '5', includeSR: true })
    expect(without.some(p => p.role === 'sr')).toBe(false)
    const srs = withSR.filter(p => p.role === 'sr')
    expect(srs.length).toBe(2) // one at position, one in DL
    expect(srs.every(p => p.optional)).toBe(true)
  })

  test('element context coerces every section to the ET internals', () => {
    const parts = composeConnection({ typeId: 'site', pins: '5', context: 'element' })
    expect(parts.every(p => p.section === 'dl_internal')).toBe(true)
  })
})

describe('suggestRefForPart', () => {
  test('requires all tokens (role + pin) when present', () => {
    const part = { token: ['SOCKET', '5P'] }
    const known = ['ET-SOCKET-2P-01', 'ET-SOCKET-5P-01', 'ET-PLUG-5P-01']
    expect(suggestRefForPart(part, known)).toBe('ET-SOCKET-5P-01')
  })

  test('falls back to the role token, then empty', () => {
    expect(suggestRefForPart({ token: ['SOCKET', '9P'] }, ['ET-SOCKET-5P-01'])).toBe('ET-SOCKET-5P-01')
    expect(suggestRefForPart({ token: ['SOCKET'] }, [])).toBe('')
  })
})

describe('connectorGaps', () => {
  const row = (ref, section) => ({ elementTypeRef: ref, _section: section })
  const grouped = (position = [], dlInternal = [], linInternal = []) => ({ position, dlInternal, linInternal })

  test('a socket without its plug yields a plug gap in the DL', () => {
    const gaps = connectorGaps(grouped([row('ET-SOCKET-5P-01')], []))
    const plugGap = gaps.find(g => g.kind === 'plug')
    expect(plugGap).toBeDefined()
    expect(plugGap.ref).toBe('ET-PLUG-5P-01')
    expect(plugGap.section).toBe('dl_internal')
    expect(plugGap.optional).toBe(false)
  })

  test('a plug without its socket yields a socket gap at position [bug fix]', () => {
    const gaps = connectorGaps(grouped([], [row('ET-PLUG-5P-01')]))
    const socketGap = gaps.find(g => g.kind === 'socket')
    expect(socketGap).toBeDefined()
    expect(socketGap.ref).toBe('ET-SOCKET-5P-01')
    expect(socketGap.section).toBe('position')
    expect(socketGap.optional).toBe(false)
  })

  test('a paired socket/plug has no required gaps', () => {
    const gaps = connectorGaps(grouped([row('ET-SOCKET-5P-01')], [row('ET-PLUG-5P-01')]))
    expect(gaps.filter(g => !g.optional)).toHaveLength(0)
  })

  test('connectorGaps does not emit strain-relief gaps (SR handled by validation)', () => {
    const gaps = connectorGaps(grouped([row('ET-SOCKET-5P-01')], [row('ET-PLUG-5P-01')]))
    expect(gaps.filter(g => g.kind === 'sr')).toHaveLength(0)
  })
})
