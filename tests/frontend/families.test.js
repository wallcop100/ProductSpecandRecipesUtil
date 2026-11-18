import { describe, it, expect } from 'vitest'
import { familyRefs, familyRowRefs, familyRowExists } from '../../src/utils/derived'
import { planFamilyMove } from '../../src/utils/etSeed'

// The 5642 shape: IsCollection marks wrappers far more than families; most families have no row.
const ets = [
  { ElementTypeRef: 'ET-DL-01', IsCollection: 'Y', Family: 'ET-DL' },
  { ElementTypeRef: 'ET-LIN-PROF', IsCollection: 'Y', Family: 'ET-LIN-INGREDIENTS' },
  { ElementTypeRef: 'ET-LIN-PROF-10', Family: 'ET-LIN-PROF' },
  { ElementTypeRef: 'ET-PS-01', Family: 'et-ps ' },
]

describe('families: one source (VHCCAF)', () => {
  it('is every ref named as a Family plus the stripped DesignDB rows, never a wrapper', () => {
    expect([...familyRefs(ets, ['ET-DRIVERS'])].sort()).toEqual(['ET-DL', 'ET-DRIVERS', 'ET-LIN-INGREDIENTS', 'ET-LIN-PROF', 'ET-PS'])
  })
  it('a family has a row when an ElementType or a stripped collection carries its ref', () => {
    const rows = familyRowRefs(ets, ['ET-DRIVERS'])
    expect(rows.has('ET-LIN-PROF') && rows.has('ET-DRIVERS')).toBe(true)
    expect(rows.has('ET-PS')).toBe(false)
    expect(familyRowExists('et-drivers', ets, ['ET-DRIVERS'])).toBe(true)
  })
  it('planFamilyMove never proposes creating a family the DesignDB already has', () => {
    expect(planFamilyMove(['ET-PS-01'], 'ET-DRIVERS', ets, { collectionRefs: ['ET-DRIVERS'] }).newFamilies).toEqual([])
  })
})

describe('families keep the spelling the project uses', () => {
  it('matches case-insensitively but shows the ref as written', async () => {
    const { familyOptionsOf } = await import('../../src/components/NewETModal')
    const opts = familyOptionsOf([...ets, { ElementTypeRef: 'X-1', Family: 'Et-Custom' }, { ElementTypeRef: 'X-2', Family: 'ET-CUSTOM' }], ['ET-DRIVERS'])
    expect(opts).toContain('Et-Custom')
    expect(opts).not.toContain('ET-CUSTOM')
    expect(opts).toContain('et-ps')
    expect(opts.filter(o => o.toUpperCase() === 'ET-PS')).toHaveLength(1)
  })
})
