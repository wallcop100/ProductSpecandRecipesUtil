import { describe, it, expect } from 'vitest'
import { suggestRef } from '../../src/utils/etRefSuggest'
import { proposeElementTypes } from '../../src/utils/etSeed'

// 4746 G353 "480": ET-PS-ACCESSORIES-02 exists only in the Product Spec, yet was offered as new.
describe('a ref only the Product Spec (or a recipe) uses is taken', () => {
  const psRows = [
    { ElementTypeRef: 'ET-PS-ACCESSORIES-01', Manufacturer: 'LightGraphix', ProductCode: '470' },
    { ElementTypeRef: 'ET-PS-ACCESSORIES-02', Manufacturer: 'LightGraphix', ProductCode: '481' },
  ]
  it('suggestRef numbers past PS-only refs', () => {
    const r = suggestRef('480', '', 'LightGraphix', { prefix: 'ET', counterWidth: 2 }, [{ ElementTypeRef: 'ET-PS-ACCESSORIES-01' }], psRows)
    expect(psRows.map(p => p.ElementTypeRef)).not.toContain(r.ref)
  })
  it('proposeElementTypes never proposes a PS or recipe ref', () => {
    const entries = [{ text: '480', manufacturers: ['LightGraphix'], variants: [], positionTypes: [], rowRefs: [], reuse: [] }]
    const lib = [{ code: '480', family: 'ET-PS-ACCESSORIES', ref: 'ET-PS-ACCESSORIES-02' }]
    const { proposals } = proposeElementTypes(entries, { elementTypes: [], psRows, recipes: [{ ElementTypeRef: 'ET-PS-ACCESSORIES-03' }], library: lib })
    expect(['ET-PS-ACCESSORIES-01', 'ET-PS-ACCESSORIES-02', 'ET-PS-ACCESSORIES-03']).not.toContain(proposals[0].ref)
  })
})
