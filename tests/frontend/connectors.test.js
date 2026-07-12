import { describe, test, expect } from 'vitest'
import { connectorRole, isConnector } from '../../src/utils/connectors.js'
import { connectorGapsForPosition } from '../../src/utils/collectionStatus.js'

/**
 * The connection PRESETS (CONNECTION_TYPES / composeConnection / suggestRefForPart) and the
 * wizard that composed recipes out of them are gone: connectors are user-defined Connector
 * Templates now, applied and audited through the coverage matrix. What is left of this module
 * is the one thing that really is a property of a ref: whether it names a connector at all.
 */

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
