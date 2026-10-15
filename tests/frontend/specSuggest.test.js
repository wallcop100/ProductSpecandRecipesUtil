import { describe, it, expect } from 'vitest'
import { familyFix, codeElsewhere } from '../../src/utils/specSuggest'

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
    expect(familyFix(ets[3], null, ets)).toMatchObject({ family: 'ET-LIN-PROF' })
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
})
