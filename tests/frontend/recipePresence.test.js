import { describe, test, expect } from 'vitest'
import {
  buildPresence, ingredientPresence, containersForPosition, containerForPosition,
  rowSlot, normalizeSection, POSITION, INTERNAL,
} from '../../src/utils/recipePresence.js'

/** A position-level row. */
const pos = (posRef, ref, extra = {}) => ({
  PositionTypeRef: posRef, ContextType: 'PositionType', ContextRef: posRef,
  ElementTypeRef: ref, Quantity: 1, ...extra,
})
/** A row inside a container ET. */
const inside = (posRef, container, ref, extra = {}) => ({
  PositionTypeRef: posRef, ContextType: 'ElementType', ContextRef: container,
  ElementTypeRef: ref, Quantity: 1, ...extra,
})

const ing = (ref, section, quantity) => ({ ElementTypeRef: ref, section, quantity })

describe('normalizeSection / rowSlot', () => {
  test('dl_internal and lin_internal name the same slot', () => {
    expect(normalizeSection('dl_internal')).toBe(INTERNAL)
    expect(normalizeSection('lin_internal')).toBe(INTERNAL)
    expect(normalizeSection('position')).toBe(POSITION)
    expect(normalizeSection(undefined)).toBe(POSITION)
  })

  test('a row knows its own slot from ContextType/ContextRef', () => {
    expect(rowSlot(pos('C01r', 'ET-SOCK'))).toEqual({ section: POSITION, container: null })
    expect(rowSlot(inside('C01r', 'ET-DL-04', 'ET-PLUG'))).toEqual({ section: INTERNAL, container: 'et-dl-04' })
  })
})

describe('containment is strict: the slot matters, not just the ref', () => {
  const wrappers = ['ET-DL-04']

  test('an inside-wrapper ingredient is NOT satisfied by a position-level row', () => {
    const p = buildPresence([pos('C01r', 'ET-DL-04', { IsDesign: 'Y' }), pos('C01r', 'ET-PLUG')], wrappers)
    const r = ingredientPresence(p, ing('ET-PLUG', 'dl_internal'))
    expect(r.status).toBe('misplaced')                       // this was the bug: it read 'present'
    expect(r.foundAt).toEqual({ section: POSITION, container: null })
  })

  test('it IS satisfied when the row sits inside that wrapper', () => {
    const p = buildPresence([pos('C01r', 'ET-DL-04'), inside('C01r', 'ET-DL-04', 'ET-PLUG')], wrappers)
    expect(ingredientPresence(p, ing('ET-PLUG', 'dl_internal')).status).toBe('present')
  })

  test('a row inside a DIFFERENT wrapper does not satisfy it', () => {
    const p = buildPresence([pos('C01r', 'ET-DL-04'), inside('C01r', 'ET-DL-07', 'ET-PLUG')], wrappers)
    const r = ingredientPresence(p, ing('ET-PLUG', 'dl_internal'))
    expect(r.status).toBe('misplaced')
    expect(r.foundAt).toEqual({ section: INTERNAL, container: 'et-dl-07' })
  })

  test('a position-level ingredient is not satisfied by a row hidden inside the wrapper', () => {
    const p = buildPresence([pos('C01r', 'ET-DL-04'), inside('C01r', 'ET-DL-04', 'ET-SOCK')], wrappers)
    expect(ingredientPresence(p, ing('ET-SOCK', 'position')).status).toBe('misplaced')
  })

  test('an absent ref is missing, not misplaced', () => {
    const p = buildPresence([pos('C01r', 'ET-DL-04')], wrappers)
    expect(ingredientPresence(p, ing('ET-PLUG', 'dl_internal'))).toMatchObject({ status: 'missing', foundAt: null })
  })

  test('matching ignores case', () => {
    const p = buildPresence([inside('C01r', 'et-dl-04', 'et-plug')], ['ET-DL-04'])
    expect(ingredientPresence(p, ing('ET-PLUG', 'dl_internal')).status).toBe('present')
  })

  test('deleted rows never count', () => {
    const p = buildPresence([pos('C01r', 'ET-DL-04'), inside('C01r', 'ET-DL-04', 'ET-PLUG', { IsDeleted: 'Y' })], wrappers)
    expect(ingredientPresence(p, ing('ET-PLUG', 'dl_internal')).status).toBe('missing')
  })
})

describe('quantity is part of presence', () => {
  const wrappers = ['ET-DL-04']

  test('enough is present; too few is short', () => {
    const p = buildPresence([pos('C01r', 'ET-CAP', { Quantity: 1 })], wrappers)
    expect(ingredientPresence(p, ing('ET-CAP', 'position', 1))).toMatchObject({ status: 'present', have: 1, need: 1 })
    expect(ingredientPresence(p, ing('ET-CAP', 'position', 2))).toMatchObject({ status: 'short', have: 1, need: 2 })
  })

  test('more than enough is still present', () => {
    const p = buildPresence([pos('C01r', 'ET-CAP', { Quantity: 4 })], wrappers)
    expect(ingredientPresence(p, ing('ET-CAP', 'position', 2)).status).toBe('present')
  })

  test('quantities of several rows in the same slot add up', () => {
    const p = buildPresence([pos('C01r', 'ET-CAP', { Quantity: 1 }), pos('C01r', 'ET-CAP', { Quantity: 1 })], wrappers)
    expect(ingredientPresence(p, ing('ET-CAP', 'position', 2))).toMatchObject({ status: 'present', have: 2 })
  })

  test('a missing or unparseable quantity counts as one', () => {
    const p = buildPresence([pos('C01r', 'ET-CAP', { Quantity: null }), pos('C01r', 'ET-X', { Quantity: 'abc' })], [])
    expect(ingredientPresence(p, ing('ET-CAP', 'position')).have).toBe(1)
    expect(ingredientPresence(p, ing('ET-X', 'position')).have).toBe(1)
  })

  test('an ingredient with no stated quantity needs one', () => {
    const p = buildPresence([], [])
    expect(ingredientPresence(p, ing('ET-CAP', 'position')).need).toBe(1)
  })
})

describe('containersForPosition', () => {
  const containerRefs = new Set(['et-dl-04', 'et-dl-07'])

  test('the design element wins when it is a container', () => {
    const rows = [pos('C01r', 'ET-DL-07'), pos('C01r', 'ET-DL-04', { IsDesign: 'Y' })]
    expect(containerForPosition(rows, 'C01r', containerRefs)).toBe('ET-DL-04')
  })

  test('an ET holding internal rows counts as a container even when unlisted', () => {
    const rows = [pos('C01r', 'ET-THING'), inside('C01r', 'ET-THING', 'ET-BIT')]
    expect(containerForPosition(rows, 'C01r', new Set())).toBe('ET-THING')
  })

  test('a fresh DESIGN wrapper with no internals yet is a container', () => {
    // This is why containerETRefs is consulted: a brand-new DL holds nothing.
    const rows = [pos('C01r', 'ET-DL-04', { IsDesign: 'Y' })]
    expect(containerForPosition(rows, 'C01r', containerRefs)).toBe('ET-DL-04')
  })

  test('a non-design row that merely LOOKS like a container is not one', () => {
    // containerETRefs is a soft guess: on the real project it flags ET-LIN-TAPE-*
    // and every driver marked Ideaworks/N/A. Trusting it here files plugs inside
    // a driver. Only the design element, or an ET that actually holds rows, counts.
    const rows = [pos('C01r', 'ET-LAMP', { IsDesign: 'Y' }), pos('C01r', 'ET-DL-04')]
    expect(containerForPosition(rows, 'C01r', containerRefs)).toBeNull()
  })

  test('a non-container design element is not a container', () => {
    expect(containerForPosition([pos('C01r', 'ET-LAMP', { IsDesign: 'Y' })], 'C01r', containerRefs)).toBeNull()
  })

  test('a position with no design row at all resolves to nothing', () => {
    // The real A02wE: no IsDesign row, and a driver at position level marked
    // Ideaworks/N/A. Guessing the driver would parent a plug inside it.
    const rows = [pos('A02wE', 'ET-CCL-D-250-1CH-EM-01')]
    expect(containerForPosition(rows, 'A02wE', new Set(['et-ccl-d-250-1ch-em-01']))).toBeNull()
  })

  test('a position with no wrapper resolves to nothing — never to a blank', () => {
    expect(containersForPosition([pos('C01r', 'ET-LAMP')], 'C01r', containerRefs)).toEqual([])
    expect(containerForPosition([], 'C01r', containerRefs)).toBeNull()
  })

  test('deleted rows do not supply a container', () => {
    const rows = [pos('C01r', 'ET-DL-04', { IsDeleted: 'Y' })]
    expect(containerForPosition(rows, 'C01r', containerRefs)).toBeNull()
  })

  test('another position\'s wrapper is not this position\'s', () => {
    expect(containerForPosition([pos('D01r', 'ET-DL-04')], 'C01r', containerRefs)).toBeNull()
  })

  test('several containers are all reported, design first', () => {
    // ET-DL-07 qualifies because it actually holds a row, not because of its name.
    const rows = [
      pos('C01r', 'ET-DL-07'),
      inside('C01r', 'ET-DL-07', 'ET-BIT'),
      pos('C01r', 'ET-DL-04', { IsDesign: 'Y' }),
    ]
    expect(containersForPosition(rows, 'C01r', containerRefs)).toEqual(['ET-DL-04', 'ET-DL-07'])
  })

  test('a deleted internal row does not make its container a container', () => {
    const rows = [pos('C01r', 'ET-THING'), inside('C01r', 'ET-THING', 'ET-BIT', { IsDeleted: 'Y' })]
    expect(containerForPosition(rows, 'C01r', new Set())).toBeNull()
  })
})
