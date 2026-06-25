import { describe, test, expect } from 'vitest'
import { runValidation } from '../../src/utils/validationRules.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Minimal dbData (not directly used by client rules, but required by signature)
const dbData = {
  element_types: [],
  position_types: [],
}

// positionUI — { ref: { tags } }
const positionUI = {
  'PT-DL-LOCAL-01': { tags: ['DL', 'Local', '5Pin-DALI'] },
  'PT-LIN-01': { tags: ['LIN', 'Local'] },
}

// Helper: build a PS row (product spec row)
function makePsRow(elementTypeRef, productCode) {
  return { elementTypeRef, productCode }
}

// Helper: build a recipe row (rs row)
function makeRsRow(overrides) {
  return {
    positionTypeRef: 'PT-DL-LOCAL-01',
    contextType: 'PositionType',
    contextRef: 'PT-DL-LOCAL-01',
    elementTypeRef: 'ET-DL-SPOT-01',
    isDesign: null,
    isContractItem: null,
    dimQtyMultiplier: null,
    dimQuantity: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// MISSING_IS_DESIGN
// ---------------------------------------------------------------------------
describe('MISSING_IS_DESIGN', () => {
  test('detects MISSING_IS_DESIGN for position with no IsDesign=Y row', () => {
    const rsRows = [
      makeRsRow({ positionTypeRef: 'PT-DL-LOCAL-01', isDesign: null }),
    ]
    const issues = runValidation(dbData, [], rsRows, {
      'PT-DL-LOCAL-01': { tags: ['DL', 'Local'] },
    })

    const found = issues.filter(i => i.rule === 'MISSING_IS_DESIGN')
    expect(found).toHaveLength(1)
    expect(found[0].severity).toBe('error')
    expect(found[0].ref).toBe('PT-DL-LOCAL-01')
  })

  test('does not report MISSING_IS_DESIGN when position has IsDesign=Y', () => {
    const rsRows = [
      makeRsRow({ isDesign: 'Y' }),
    ]
    const issues = runValidation(dbData, [], rsRows, {
      'PT-DL-LOCAL-01': { tags: ['DL', 'Local'] },
    })

    const found = issues.filter(i => i.rule === 'MISSING_IS_DESIGN')
    expect(found).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// DUPLICATE_IS_DESIGN
// ---------------------------------------------------------------------------
describe('DUPLICATE_IS_DESIGN', () => {
  test('detects DUPLICATE_IS_DESIGN for position with two IsDesign=Y rows', () => {
    const rsRows = [
      makeRsRow({ isDesign: 'Y', elementTypeRef: 'ET-DL-SPOT-01' }),
      makeRsRow({ isDesign: 'Y', elementTypeRef: 'ET-DL-SPOT-02' }),
    ]
    const issues = runValidation(dbData, [], rsRows, {
      'PT-DL-LOCAL-01': { tags: ['DL', 'Local'] },
    })

    const found = issues.filter(i => i.rule === 'DUPLICATE_IS_DESIGN')
    expect(found).toHaveLength(1)
    expect(found[0].severity).toBe('error')
  })

  test('does not report DUPLICATE_IS_DESIGN for exactly one IsDesign=Y row', () => {
    const rsRows = [
      makeRsRow({ isDesign: 'Y' }),
      makeRsRow({ isDesign: null, elementTypeRef: 'ET-SOCK-5P-01' }),
    ]
    const issues = runValidation(dbData, [], rsRows, {
      'PT-DL-LOCAL-01': { tags: ['DL', 'Local'] },
    })

    const found = issues.filter(i => i.rule === 'DUPLICATE_IS_DESIGN')
    expect(found).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// DUPLICATE_PRODUCT_CODE
// ---------------------------------------------------------------------------
describe('DUPLICATE_PRODUCT_CODE', () => {
  test('detects DUPLICATE_PRODUCT_CODE when same code appears more than once', () => {
    const psRows = [
      makePsRow('ET-DL-SPOT-01', 'ABC-123'),
      makePsRow('ET-DL-SPOT-02', 'ABC-123'),
    ]
    const issues = runValidation(dbData, psRows, [], {})

    const found = issues.filter(i => i.rule === 'DUPLICATE_PRODUCT_CODE')
    expect(found).toHaveLength(1)
    expect(found[0].severity).toBe('error')
  })

  test('ignores N/A product codes for duplicate check', () => {
    const psRows = [
      makePsRow('ET-DL-SPOT-01', 'N/A'),
      makePsRow('ET-DL-SPOT-02', 'N/A'),
    ]
    const issues = runValidation(dbData, psRows, [], {})

    const found = issues.filter(i => i.rule === 'DUPLICATE_PRODUCT_CODE')
    expect(found).toHaveLength(0)
  })

  test('ignores N/A case-insensitively', () => {
    const psRows = [
      makePsRow('ET-DL-01', 'n/a'),
      makePsRow('ET-DL-02', 'N/A'),
    ]
    const issues = runValidation(dbData, psRows, [], {})
    const found = issues.filter(i => i.rule === 'DUPLICATE_PRODUCT_CODE')
    expect(found).toHaveLength(0)
  })

  test('does not flag unique product codes', () => {
    const psRows = [
      makePsRow('ET-DL-SPOT-01', 'AAA-001'),
      makePsRow('ET-DL-SPOT-02', 'BBB-002'),
    ]
    const issues = runValidation(dbData, psRows, [], {})
    const found = issues.filter(i => i.rule === 'DUPLICATE_PRODUCT_CODE')
    expect(found).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// MISSING_LOCKING_LEVER
// ---------------------------------------------------------------------------
describe('MISSING_LOCKING_LEVER', () => {
  test('detects MISSING_LOCKING_LEVER for LIN position with no lever row', () => {
    const rsRows = [
      makeRsRow({
        positionTypeRef: 'PT-LIN-01',
        contextType: 'PositionType',
        contextRef: 'PT-LIN-01',
        elementTypeRef: 'ET-TAPE-LED-01',
        isDesign: 'Y',
      }),
    ]
    const ui = { 'PT-LIN-01': { tags: ['LIN', 'Local'] } }
    const issues = runValidation(dbData, [], rsRows, ui)

    const found = issues.filter(i => i.rule === 'MISSING_LOCKING_LEVER')
    expect(found).toHaveLength(1)
    expect(found[0].severity).toBe('error')
    expect(found[0].ref).toBe('PT-LIN-01')
  })

  test('no MISSING_LOCKING_LEVER when position has LLOCK element', () => {
    const rsRows = [
      makeRsRow({
        positionTypeRef: 'PT-LIN-01',
        contextType: 'PositionType',
        contextRef: 'PT-LIN-01',
        elementTypeRef: 'ET-LLOCK-01',
        isDesign: 'Y',
      }),
    ]
    const ui = { 'PT-LIN-01': { tags: ['LIN', 'Local'] } }
    const issues = runValidation(dbData, [], rsRows, ui)

    const found = issues.filter(i => i.rule === 'MISSING_LOCKING_LEVER')
    expect(found).toHaveLength(0)
  })

  test('no MISSING_LOCKING_LEVER when position has LEVER element', () => {
    const rsRows = [
      makeRsRow({
        positionTypeRef: 'PT-LIN-01',
        contextType: 'PositionType',
        contextRef: 'PT-LIN-01',
        elementTypeRef: 'ET-LEVER-ALUM-01',
        isDesign: 'Y',
      }),
    ]
    const ui = { 'PT-LIN-01': { tags: ['LIN', 'Local'] } }
    const issues = runValidation(dbData, [], rsRows, ui)

    const found = issues.filter(i => i.rule === 'MISSING_LOCKING_LEVER')
    expect(found).toHaveLength(0)
  })

  test('DL positions are not checked for locking lever', () => {
    const rsRows = [
      makeRsRow({
        positionTypeRef: 'PT-DL-LOCAL-01',
        contextType: 'PositionType',
        contextRef: 'PT-DL-LOCAL-01',
        elementTypeRef: 'ET-DL-SPOT-01',
        isDesign: 'Y',
      }),
    ]
    const ui = { 'PT-DL-LOCAL-01': { tags: ['DL', 'Local'] } }
    const issues = runValidation(dbData, [], rsRows, ui)

    const found = issues.filter(i => i.rule === 'MISSING_LOCKING_LEVER')
    expect(found).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// DIM_QTY_MULT_NOT_ONE
// ---------------------------------------------------------------------------
describe('DIM_QTY_MULT_NOT_ONE', () => {
  test('warns when TAPE row has dimQtyMultiplier != 1', () => {
    const rsRows = [
      makeRsRow({
        elementTypeRef: 'ET-TAPE-LED-01',
        dimQtyMultiplier: 2,
      }),
    ]
    const issues = runValidation(dbData, [], rsRows, { 'PT-DL-LOCAL-01': { tags: [] } })

    const found = issues.filter(i => i.rule === 'DIM_QTY_MULT_NOT_ONE')
    expect(found).toHaveLength(1)
    expect(found[0].severity).toBe('warning')
  })

  test('does not warn when TAPE row has dimQtyMultiplier=1', () => {
    const rsRows = [
      makeRsRow({
        elementTypeRef: 'ET-TAPE-LED-01',
        dimQtyMultiplier: 1,
      }),
    ]
    const issues = runValidation(dbData, [], rsRows, { 'PT-DL-LOCAL-01': { tags: [] } })

    const found = issues.filter(i => i.rule === 'DIM_QTY_MULT_NOT_ONE')
    expect(found).toHaveLength(0)
  })

  test('does not warn when dimQtyMultiplier is null (unset)', () => {
    const rsRows = [
      makeRsRow({
        elementTypeRef: 'ET-TAPE-LED-01',
        dimQtyMultiplier: null,
      }),
    ]
    const issues = runValidation(dbData, [], rsRows, { 'PT-DL-LOCAL-01': { tags: [] } })

    const found = issues.filter(i => i.rule === 'DIM_QTY_MULT_NOT_ONE')
    expect(found).toHaveLength(0)
  })

  test('warns for PROFILE rows with wrong multiplier', () => {
    const rsRows = [
      makeRsRow({
        elementTypeRef: 'ET-PROFILE-ALU-01',
        dimQtyMultiplier: 3,
      }),
    ]
    const issues = runValidation(dbData, [], rsRows, { 'PT-DL-LOCAL-01': { tags: [] } })

    const found = issues.filter(i => i.rule === 'DIM_QTY_MULT_NOT_ONE')
    expect(found).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// MISSING_CLIPS_DIM_QTY
// ---------------------------------------------------------------------------
describe('MISSING_CLIPS_QTY', () => {
  test('warns when LIN position has CLIP row with no Quantity', () => {
    const rsRows = [
      makeRsRow({
        positionTypeRef: 'PT-LIN-01',
        contextType: 'PositionType',
        contextRef: 'PT-LIN-01',
        elementTypeRef: 'ET-CLIP-ROUND-01',
        Quantity: null,
        quantity: null,
        isDesign: 'Y',
      }),
    ]
    const ui = { 'PT-LIN-01': { tags: ['LIN', 'Local'] } }
    const issues = runValidation(dbData, [], rsRows, ui)

    const found = issues.filter(i => i.rule === 'MISSING_CLIPS_QTY')
    expect(found).toHaveLength(1)
    expect(found[0].severity).toBe('warning')
  })

  test('no warning when LIN CLIP row has Quantity set', () => {
    const rsRows = [
      makeRsRow({
        positionTypeRef: 'PT-LIN-01',
        contextType: 'PositionType',
        contextRef: 'PT-LIN-01',
        elementTypeRef: 'ET-CLIP-ROUND-01',
        Quantity: 10,
        isDesign: 'Y',
      }),
    ]
    const ui = { 'PT-LIN-01': { tags: ['LIN', 'Local'] } }
    const issues = runValidation(dbData, [], rsRows, ui)

    const found = issues.filter(i => i.rule === 'MISSING_CLIPS_QTY')
    expect(found).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Valid recipe — no errors
// ---------------------------------------------------------------------------
describe('runValidation — valid recipe', () => {
  test('valid recipe with all rules satisfied returns no issues', () => {
    const psRows = [
      makePsRow('ET-DL-SPOT-01', 'SPOT-AAA-001'),
      makePsRow('ET-SOCK-5P-01', 'SOCK-BBB-002'),
    ]

    const rsRows = [
      // DL position — has exactly one IsDesign=Y, no LIN rules apply
      makeRsRow({
        positionTypeRef: 'PT-DL-LOCAL-01',
        contextType: 'PositionType',
        contextRef: 'PT-DL-LOCAL-01',
        elementTypeRef: 'ET-DL-SPOT-01',
        isDesign: 'Y',
        dimQtyMultiplier: null,
      }),
      makeRsRow({
        positionTypeRef: 'PT-DL-LOCAL-01',
        contextType: 'PositionType',
        contextRef: 'PT-DL-LOCAL-01',
        elementTypeRef: 'ET-SOCK-5P-01',
        isDesign: null,
        dimQtyMultiplier: null,
      }),
      // Local first-fix kit: site strain relief + driver (so Rule 7 is satisfied)
      makeRsRow({
        positionTypeRef: 'PT-DL-LOCAL-01',
        contextType: 'PositionType',
        contextRef: 'PT-DL-LOCAL-01',
        elementTypeRef: 'ET-SR-DALI-01',
        isDesign: null,
        dimQtyMultiplier: null,
      }),
      makeRsRow({
        positionTypeRef: 'PT-DL-LOCAL-01',
        contextType: 'ElementType',
        contextRef: 'ET-DL-SPOT-01',
        elementTypeRef: 'ET-DRIVER-CC-01',
        isDesign: null,
        dimQtyMultiplier: null,
      }),
      // LIN position — IsDesign=Y, has a lever, TAPE with mult=1
      makeRsRow({
        positionTypeRef: 'PT-LIN-01',
        contextType: 'PositionType',
        contextRef: 'PT-LIN-01',
        elementTypeRef: 'ET-TAPE-LED-01',
        isDesign: 'Y',
        dimQtyMultiplier: 1,
      }),
      makeRsRow({
        positionTypeRef: 'PT-LIN-01',
        contextType: 'PositionType',
        contextRef: 'PT-LIN-01',
        elementTypeRef: 'ET-LLOCK-ALU-01',
        isDesign: null,
        dimQtyMultiplier: null,
      }),
    ]

    const ui = {
      'PT-DL-LOCAL-01': { tags: ['DL', 'Local', '5Pin-DALI'] },
      'PT-LIN-01': { tags: ['LIN', 'Local'] },
    }

    const issues = runValidation(dbData, psRows, rsRows, ui)
    expect(issues).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// LOCAL_DRIVER_REQUIREMENTS (Rule 7)
// ---------------------------------------------------------------------------
describe('LOCAL_DRIVER_REQUIREMENTS', () => {
  const localUI = { 'PT-DL-LOCAL-01': { tags: ['DL', 'Local'] } }

  test('warns when a Local position lacks driver, site socket, and strain relief', () => {
    const rsRows = [makeRsRow({ elementTypeRef: 'ET-DL-SPOT-01', isDesign: 'Y' })]
    const issues = runValidation(dbData, [], rsRows, localUI)
    const rules = issues.map(i => i.rule)
    expect(rules).toContain('LOCAL_MISSING_DRIVER')
    expect(rules).toContain('LOCAL_MISSING_SITE_SOCKET')
    expect(rules).toContain('LOCAL_MISSING_STRAIN_RELIEF')
    expect(issues.every(i => i.severity === 'warning' || i.rule === 'MISSING_IS_DESIGN' || i.severity === 'error')).toBe(true)
  })

  test('clean Local assembly produces none of the Rule 7 warnings', () => {
    const rsRows = [
      makeRsRow({ elementTypeRef: 'ET-DL-SPOT-01', isDesign: 'Y' }),
      makeRsRow({ elementTypeRef: 'ET-SOCK-5P-01' }),
      makeRsRow({ elementTypeRef: 'ET-SR-DALI-01' }),
      makeRsRow({ contextType: 'ElementType', contextRef: 'ET-DL-SPOT-01', elementTypeRef: 'ET-DRIVER-CC-01' }),
    ]
    const issues = runValidation(dbData, [], rsRows, localUI)
    const rule7 = issues.filter(i => i.rule.startsWith('LOCAL_'))
    expect(rule7).toHaveLength(0)
  })

  test('does not apply the downlight first-fix rules to LIN positions', () => {
    const rsRows = [
      makeRsRow({ positionTypeRef: 'PT-LIN-01', contextRef: 'PT-LIN-01', elementTypeRef: 'ET-LIN-PROF-01', isDesign: 'Y' }),
      makeRsRow({ positionTypeRef: 'PT-LIN-01', contextRef: 'PT-LIN-01', elementTypeRef: 'ET-LLOCK-ALU-01' }),
    ]
    const issues = runValidation(dbData, [], rsRows, { 'PT-LIN-01': { tags: ['LIN', 'Local'] } })
    expect(issues.some(i => i.rule.startsWith('LOCAL_'))).toBe(false)
  })

  test('does not warn for an empty recipe (covered by MISSING_IS_DESIGN)', () => {
    const issues = runValidation(dbData, [], [], localUI)
    expect(issues.some(i => i.rule.startsWith('LOCAL_'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// REMOTE_HAS_SITE_SOCKET (Rule 8)
// ---------------------------------------------------------------------------
describe('REMOTE_HAS_SITE_SOCKET', () => {
  test('warns when a Remote-CC position has a site socket at position level', () => {
    const rsRows = [
      makeRsRow({ positionTypeRef: 'PT-DL-CC-01', contextRef: 'PT-DL-CC-01', elementTypeRef: 'ET-DL-SPOT-01', isDesign: 'Y' }),
      makeRsRow({ positionTypeRef: 'PT-DL-CC-01', contextRef: 'PT-DL-CC-01', elementTypeRef: 'ET-SOCK-5P-01' }),
    ]
    const issues = runValidation(dbData, [], rsRows, { 'PT-DL-CC-01': { tags: ['DL', 'Remote-CC'] } })
    const found = issues.filter(i => i.rule === 'REMOTE_HAS_SITE_SOCKET')
    expect(found).toHaveLength(1)
    expect(found[0].severity).toBe('warning')
  })

  test('no warning when a Remote-CC position has no site socket', () => {
    const rsRows = [
      makeRsRow({ positionTypeRef: 'PT-DL-CC-01', contextRef: 'PT-DL-CC-01', elementTypeRef: 'ET-DL-SPOT-01', isDesign: 'Y' }),
    ]
    const issues = runValidation(dbData, [], rsRows, { 'PT-DL-CC-01': { tags: ['DL', 'Remote-CC'] } })
    expect(issues.some(i => i.rule === 'REMOTE_HAS_SITE_SOCKET')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// EXTERIOR_NON_IP_CONNECTOR (Rule 9)
// ---------------------------------------------------------------------------
describe('EXTERIOR_NON_IP_CONNECTOR', () => {
  test('warns when an Exterior position has a non-IP connector', () => {
    const rsRows = [
      makeRsRow({ positionTypeRef: 'PT-EXT-01', contextRef: 'PT-EXT-01', elementTypeRef: 'ET-DL-SPOT-01', isDesign: 'Y' }),
      makeRsRow({ positionTypeRef: 'PT-EXT-01', contextRef: 'PT-EXT-01', elementTypeRef: 'ET-SOCK-5P-01' }),
    ]
    const issues = runValidation(dbData, [], rsRows, { 'PT-EXT-01': { tags: ['DL', 'Exterior'] } })
    const found = issues.filter(i => i.rule === 'EXTERIOR_NON_IP_CONNECTOR')
    expect(found).toHaveLength(1)
    expect(found[0].severity).toBe('warning')
  })

  test('no warning when Exterior connectors are IP-rated', () => {
    const rsRows = [
      makeRsRow({ positionTypeRef: 'PT-EXT-01', contextRef: 'PT-EXT-01', elementTypeRef: 'ET-DL-SPOT-01', isDesign: 'Y' }),
      makeRsRow({ positionTypeRef: 'PT-EXT-01', contextRef: 'PT-EXT-01', elementTypeRef: 'ET-SOCK-IP-2P-01' }),
    ]
    const issues = runValidation(dbData, [], rsRows, { 'PT-EXT-01': { tags: ['DL', 'Exterior'] } })
    expect(issues.some(i => i.rule === 'EXTERIOR_NON_IP_CONNECTOR')).toBe(false)
  })
})
