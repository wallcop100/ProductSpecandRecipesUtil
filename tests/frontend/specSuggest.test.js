import { describe, it, expect } from 'vitest'
import { familyFix, codeElsewhere, refNumberFix } from '../../src/utils/specSuggest'

const ets = [
  { ElementTypeRef: 'ET-LIN-COMPONENTS', IsCollection: 'Y' },
  ...['ET-LIN-TAPE-01', 'ET-LIN-PROF-01', 'ET-LIN-CAP-01', 'ET-LIN-CLIP-01'].map(r => ({ ElementTypeRef: r, Family: 'ET-LIN-COMPONENTS' })),
  { ElementTypeRef: 'ET-CONNECTORS', IsCollection: 'Y' },
  { ElementTypeRef: 'ET-3Pin-Mains-Plug', Family: 'ET-CONNECTORS', Name: 'WAGO - 770-213' },
  { ElementTypeRef: 'ET-3Pin-Mains-SR', Family: 'ET-CONNECTORS' },
]
const ps = [{ ElementTypeRef: 'ET-3Pin-Mains-Plug', Manufacturer: 'WAGO', ProductCode: '770-213' }, { ElementTypeRef: 'ET-3Pin-Mains-SR' }]

describe('Product Spec hints', () => {
  it('a part in a catch-all family is offered its house family; a connector is not filed by job', () => {
    expect(familyFix(ets[3], null, ets)).toMatchObject({ family: 'ET-LIN-CAPS' })
    expect(familyFix(ets[2], null, ets)).toMatchObject({ family: 'ET-LIN-PROF' })
    expect(familyFix(ets[4], null, ets)).toMatchObject({ family: 'ET-LIN-CLIP' })
    expect(familyFix({ ElementTypeRef: 'ET-LIN-PROF-09', Family: 'ET-LIN-PROF' }, null, ets)).toBeNull()
    expect(familyFix(ets[7], ps[1], ets)).toBeNull()
    const drivers = [...['ET-CCR-D-300-1CH-01', 'ET-CCR-D-350-1CH-01'].map(r => ({ ElementTypeRef: r, Family: 'ET-REMOTE-DRIVERS' })),
      ...['LC1', 'LC2', 'LC2-EM'].map(r => ({ ElementTypeRef: r, Family: 'ET-CABLE' }))]
    expect(familyFix(drivers[0], null, drivers)).toBeNull()                   // a family of its own scheme
    expect(familyFix(drivers[4], null, drivers)).toBeNull()                   // an odd one in a coherent family
  })
  it('a part with no code gets the code the same kind of part has elsewhere, from its family\'s maker', () => {
    const exemplars = [
      { maker: 'Wieland', code: 'GST18-3', ref: 'ET-3Pin-SR', family: 'ET-CONNECTION', description: 'other maker' },
      { maker: 'WAGO', code: '770-503', ref: 'ET-3Pin-SR', family: 'ET-CONNECTION', description: '3-pin strain relief for local driver connectors', source: '4343' },
      { maker: 'WAGO', code: '770-213', ref: 'ET-3Pin-Plug', family: 'ET-CONNECTION' },
    ]
    expect(codeElsewhere(ets[7], ps[1], { elementTypes: ets, psRows: ps, exemplars })).toEqual(
      { maker: 'WAGO', code: '770-503', ref: 'ET-3Pin-SR', description: '3-pin strain relief for local driver connectors', source: '4343' })
    expect(codeElsewhere(ets[6], ps[0], { elementTypes: ets, psRows: ps, exemplars })).toBeNull()   // has a code
  })
  it('a linear wrapper is filed by what is inside it', () => {
    const w = [{ ElementTypeRef: 'ET-LIN-01', Family: 'ET-LIN', IsCollection: 'Y' }, { ElementTypeRef: 'ET-LIN-02', Family: 'ET-LIN-TP', IsCollection: 'Y' },
      { ElementTypeRef: 'ET-LIN-03', Family: 'ET-LIN', IsCollection: 'Y' },
      { ElementTypeRef: 'ET-LIN-TAPE-01', Family: 'ET-LIN-TAPE' }, { ElementTypeRef: 'ET-LIN-FLEX-01', Family: 'ET-LIN-FLEX' }]
    const inside = (wr, et) => ({ ContextType: 'ElementType', ContextRef: wr, ElementTypeRef: et })
    const recipes = [inside('ET-LIN-01', 'ET-LIN-TAPE-01'), inside('ET-LIN-02', 'ET-LIN-TAPE-01'), inside('ET-LIN-03', 'ET-LIN-FLEX-01')]
    expect(familyFix(w[0], null, w, { recipes })).toMatchObject({ family: 'ET-LIN-TP' })
    expect(familyFix(w[1], null, w, { recipes })).toBeNull()
    expect(familyFix(w[2], null, w, { recipes })).toMatchObject({ family: 'ET-LIN-ENCAPSULATED' })
  })
  it('a ref with no number among numbered siblings is offered the next free number; connector refs are not', () => {
    const ets = ['ET-PS-01', 'ET-PS-02', 'ET-PS-03', 'ET-PS-MINI-TINI', 'ET-2Pin-LIN-Socket', 'ET-2Pin-LIN-Plug', 'ET-2Pin-DALI-Plug']
      .map(r => ({ ElementTypeRef: r }))
    expect(refNumberFix({ ElementTypeRef: 'ET-PS-MINI-TINI' }, ets)).toEqual({ ref: 'ET-PS-MINI-TINI-01', head: 'ET-PS' })
    expect(refNumberFix({ ElementTypeRef: 'ET-PS-MINI-TINI' }, [...ets, { ElementTypeRef: 'ET-PS-MINI-TINI-01' }]).ref).toBe('ET-PS-MINI-TINI-02')
    expect(refNumberFix({ ElementTypeRef: 'ET-2Pin-LIN-Socket' }, ets)).toBeNull()
    expect(refNumberFix({ ElementTypeRef: 'ET-PS-02' }, ets)).toBeNull()
  })
})
