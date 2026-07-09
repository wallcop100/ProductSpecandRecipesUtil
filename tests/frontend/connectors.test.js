import { describe, test, expect } from 'vitest'
import {
  connectorRole, isConnector, counterpartRef, strainReliefRef, pinHint,
  CONNECTION_TYPES, getConnectionType, composeConnection, suggestRefForPart,
} from '../../src/utils/connectors.js'
import { connectorGapsForPosition } from '../../src/utils/collectionStatus.js'

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

describe('connectorGapsForPosition (from the user\'s Connector Templates)', () => {
  // Real, user-chosen refs — nothing token-shaped or hardcoded.
  const posRow = (ref, extra = {}) => ({
    PositionTypeRef: 'P1', ContextType: 'PositionType', ElementTypeRef: ref, ...extra,
  })
  const collection = {
    CollectionId: 'c1', Name: 'Site kit', ApplicableTags: ['Local'],
    Ingredients: [
      { ElementTypeRef: 'ET-WHATEVER-SOCK-1234', section: 'position' },
      { ElementTypeRef: 'ET-BLAH-SR-77', section: 'position' },
      { ElementTypeRef: 'ET-ODD-PLUG-9', section: 'dl_internal' },
    ],
  }

  test('a started-but-incomplete template suggests only its real missing refs', () => {
    const recipes = [posRow('ET-WHATEVER-SOCK-1234')]
    const gaps = connectorGapsForPosition(recipes, 'P1', ['Local'], [collection])
    const refs = gaps.map(g => g.ref)
    expect(refs).toContain('ET-BLAH-SR-77')
    expect(refs).toContain('ET-ODD-PLUG-9')
    expect(refs).not.toContain('ET-WHATEVER-SOCK-1234')  // already present
    // No hardcoded/guessed placeholder refs ever appear
    expect(gaps.every(g => !/2PIN|SOCKET/.test(g.ref))).toBe(true)
  })

  test('a fully-satisfied template yields no gaps (arbitrary real refs)', () => {
    const recipes = [
      posRow('ET-WHATEVER-SOCK-1234'),
      posRow('ET-BLAH-SR-77'),
      // The position must actually USE the wrapper, otherwise a plug inside it
      // belongs to somebody else's assembly and cannot satisfy this template.
      posRow('ET-DESIGN-1', { IsDesign: 'Y' }),
      posRow('ET-ODD-PLUG-9', { ContextType: 'ElementType', ContextRef: 'ET-DESIGN-1' }),
    ]
    expect(connectorGapsForPosition(recipes, 'P1', ['Local'], [collection])).toHaveLength(0)
  })

  test('an inside-wrapper ingredient is NOT satisfied by a copy at position level', () => {
    const recipes = [
      posRow('ET-WHATEVER-SOCK-1234'),
      posRow('ET-BLAH-SR-77'),
      posRow('ET-DESIGN-1', { IsDesign: 'Y' }),
      posRow('ET-ODD-PLUG-9'),                                                   // wrong slot
      posRow('ET-INNER', { ContextType: 'ElementType', ContextRef: 'ET-DESIGN-1' }),
    ]
    const gaps = connectorGapsForPosition(recipes, 'P1', ['Local'], [collection])
    expect(gaps).toHaveLength(1)
    expect(gaps[0]).toMatchObject({ ref: 'ET-ODD-PLUG-9', status: 'misplaced' })
    expect(gaps[0].label).toMatch(/^Move ET-ODD-PLUG-9/)
  })

  test('an internal gap on a position with no wrapper is blocked, never an add', () => {
    const recipes = [posRow('ET-WHATEVER-SOCK-1234')]
    const plug = connectorGapsForPosition(recipes, 'P1', ['Local'], [collection])
      .find(g => g.ref === 'ET-ODD-PLUG-9')
    expect(plug.blocked).toBe(true)          // adding it would write a blank ContextRef
    expect(plug.container).toBeNull()
    expect(plug.label).toMatch(/no design element/)
  })

  test('a short quantity is reported as short, not missing', () => {
    const qtyColl = {
      CollectionId: 'c2', Name: 'Caps', ApplicableTags: ['Local'],
      Ingredients: [
        { ElementTypeRef: 'ET-WHATEVER-SOCK-1234', section: 'position' },
        { ElementTypeRef: 'ET-CAP-X', section: 'position', quantity: 2 },
      ],
    }
    const recipes = [posRow('ET-WHATEVER-SOCK-1234'), posRow('ET-CAP-X', { Quantity: 1 })]
    const gaps = connectorGapsForPosition(recipes, 'P1', ['Local'], [qtyColl])
    expect(gaps).toHaveLength(1)
    expect(gaps[0]).toMatchObject({ ref: 'ET-CAP-X', status: 'short', have: 1, need: 2 })
  })

  test('a template the position never started yields nothing', () => {
    const recipes = [posRow('ET-SOMETHING-ELSE')]
    expect(connectorGapsForPosition(recipes, 'P1', ['Local'], [collection])).toHaveLength(0)
  })

  test('tag-inapplicable templates are skipped', () => {
    const recipes = [posRow('ET-WHATEVER-SOCK-1234')]
    expect(connectorGapsForPosition(recipes, 'P1', ['Remote-CC'], [collection])).toHaveLength(0)
  })

  test('no templates means nothing to suggest', () => {
    const recipes = [posRow('ET-WHATEVER-SOCK-1234')]
    expect(connectorGapsForPosition(recipes, 'P1', ['Local'], [])).toHaveLength(0)
  })
})
