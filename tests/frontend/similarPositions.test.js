import { describe, test, expect } from 'vitest'
import { similarPositions, similarityReason } from '../../src/utils/similarPositions'

const pt = (ref, parent) => ({ PositionTypeRef: ref, ParentRef: parent || null })
const row = (posRef, etRef) => ({ PositionTypeRef: posRef, ElementTypeRef: etRef })

/**
 * The Form says nothing about A02wE. Is it a technical variant of something it DOES
 * describe? The tempting answer is "A02wE looks like A02" — which is exactly the
 * inference ptResolve.js forbids ("never compares prefixes … Only ExtRef speaks").
 * Similarity comes from the family, the tags and the recipe, never the string.
 */
describe('similarPositions', () => {
  const positionTypes = [pt('A02wE', 'FAM-A'), pt('A02r', 'FAM-A'), pt('Z99', 'FAM-Z')]
  const positionUI = {
    A02wE: { tags: ['DL', 'Local'] },
    A02r: { tags: ['DL', 'Local'] },
    Z99: { tags: ['LIN'] },
  }
  const recipes = [
    row('A02wE', 'ET-DL-01'),
    row('A02r', 'ET-DL-01'), row('A02r', 'ET-SOCK-5P'),
    row('Z99', 'ET-LIN-01'),
  ]
  const opts = { positionTypes, recipes, positionUI }

  test('a same-family, same-tag, overlapping-recipe position ranks first', () => {
    const [best] = similarPositions('A02wE', opts)
    expect(best.ref).toBe('A02r')
    expect(best.sameFamily).toBe(true)
    expect(best.sharedTags).toEqual(['DL', 'Local'])
    expect(best.recipeOverlap).toBeGreaterThan(0)
  })

  test('every other position is still returned, so the caller can offer a free pick', () => {
    const all = similarPositions('A02wE', opts).map(s => s.ref)
    expect(all).toEqual(['A02r', 'Z99'])   // Z99 shares nothing, but is still offered
    const z = similarPositions('A02wE', opts).find(s => s.ref === 'Z99')
    expect(z.score).toBe(0)
  })

  test('it never ranks on the ref string — a look-alike in another family with no tags loses', () => {
    // A02x LOOKS like A02wE but the DB puts it elsewhere and it shares nothing.
    // B77 looks nothing like it but the DB says same family, same tags, same recipe.
    const pts = [pt('A02wE', 'FAM-A'), pt('A02x', 'FAM-OTHER'), pt('B77', 'FAM-A')]
    const ui = { A02wE: { tags: ['DL'] }, A02x: { tags: [] }, B77: { tags: ['DL'] } }
    const rs = [row('A02wE', 'ET-DL-01'), row('B77', 'ET-DL-01')]
    const ranked = similarPositions('A02wE', { positionTypes: pts, recipes: rs, positionUI: ui })
    expect(ranked[0].ref).toBe('B77')     // the data, not the name
    expect(ranked[1].ref).toBe('A02x')
  })

  test('the position itself is never its own match', () => {
    expect(similarPositions('A02wE', opts).some(s => s.ref === 'A02wE')).toBe(false)
  })

  test('no position, no matches', () => {
    expect(similarPositions('', opts)).toEqual([])
  })

  test('a deleted row does not count toward recipe overlap', () => {
    const rs = [row('A02wE', 'ET-DL-01'), { ...row('A02r', 'ET-DL-01'), IsDeleted: 'Y' }]
    const s = similarPositions('A02wE', { positionTypes, recipes: rs, positionUI })
      .find(x => x.ref === 'A02r')
    expect(s.recipeOverlap).toBe(0)
  })

  test('the reason reads as prose', () => {
    const [best] = similarPositions('A02wE', opts)
    expect(similarityReason(best)).toContain('same family')
    expect(similarityReason(best)).toContain('DL')
  })
})
