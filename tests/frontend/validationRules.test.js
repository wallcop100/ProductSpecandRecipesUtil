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
describe('MISSING_CLIPS_DIM_QTY', () => {
  test('warns when LIN position has CLIP row with no Dim_QuantityMultiplier', () => {
    const rsRows = [
      makeRsRow({
        positionTypeRef: 'PT-LIN-01',
        contextType: 'PositionType',
        contextRef: 'PT-LIN-01',
        elementTypeRef: 'ET-CLIP-ROUND-01',
        Dim_QuantityMultiplier: null,
        dimQtyMultiplier: null,
        isDesign: 'Y',
      }),
    ]
    const ui = { 'PT-LIN-01': { tags: ['LIN', 'Local'] } }
    const issues = runValidation(dbData, [], rsRows, ui)

    const found = issues.filter(i => i.rule === 'MISSING_CLIPS_DIM_QTY')
    expect(found).toHaveLength(1)
    expect(found[0].severity).toBe('warning')
  })

  test('no warning when LIN CLIP row has Dim_QuantityMultiplier set', () => {
    const rsRows = [
      makeRsRow({
        positionTypeRef: 'PT-LIN-01',
        contextType: 'PositionType',
        contextRef: 'PT-LIN-01',
        elementTypeRef: 'ET-CLIP-ROUND-01',
        Dim_QuantityMultiplier: 8,
        isDesign: 'Y',
      }),
    ]
    const ui = { 'PT-LIN-01': { tags: ['LIN', 'Local'] } }
    const issues = runValidation(dbData, [], rsRows, ui)

    const found = issues.filter(i => i.rule === 'MISSING_CLIPS_DIM_QTY')
    expect(found).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Valid recipe — no errors
// ---------------------------------------------------------------------------
describe('runValidation — valid recipe', () => {
  test('valid recipe with all rules satisfied returns no issues', () => {
    // Every ElementType the recipe uses carries a spec row. Without one,
    // MISSING_PRODUCT_SPEC_ROW fires — and rightly: there is nothing to buy.
    const psRows = [
      makePsRow('ET-DL-SPOT-01', 'SPOT-AAA-001'),
      makePsRow('ET-SOCK-5P-01', 'SOCK-BBB-002'),
      makePsRow('ET-SR-DALI-01', 'SR-CCC-003'),
      makePsRow('ET-DRIVER-CC-01', 'DRV-DDD-004'),
      makePsRow('ET-TAPE-LED-01', 'TAPE-EEE-005'),
      makePsRow('ET-LLOCK-ALU-01', 'LOCK-FFF-006'),
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
// REMOTE_HAS_SITE_SOCKET (Rule 8) — REMOVED: remote fittings can legitimately
// have a site-side socket, so the rule produced false positives.
// ---------------------------------------------------------------------------
describe('REMOTE_HAS_SITE_SOCKET (removed)', () => {
  test('a Remote-CC position with a site socket is NOT flagged', () => {
    const rsRows = [
      makeRsRow({ positionTypeRef: 'PT-DL-CC-01', contextRef: 'PT-DL-CC-01', elementTypeRef: 'ET-DL-SPOT-01', isDesign: 'Y' }),
      makeRsRow({ positionTypeRef: 'PT-DL-CC-01', contextRef: 'PT-DL-CC-01', elementTypeRef: 'ET-SOCK-5P-01' }),
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

// ---------------------------------------------------------------------------
// Rule 13 — BLANK_RECIPE_CONTAINER
// ---------------------------------------------------------------------------
describe('BLANK_RECIPE_CONTAINER', () => {
  const ui = { 'PT-DL-LOCAL-01': { tags: [] } }
  const blank = extra => makeRsRow({ contextType: 'ElementType', contextRef: '', elementTypeRef: 'ET-PLUG-01', ...extra })

  test('an internal row naming no container is an error', () => {
    const issues = runValidation(dbData, [], [blank()], ui)
      .filter(i => i.rule === 'BLANK_RECIPE_CONTAINER')
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('error')
    expect(issues[0].message).toMatch(/ET-PLUG-01/)
    expect(issues[0].ref).toBe('PT-DL-LOCAL-01')
  })

  test('null, undefined and whitespace all count as blank', () => {
    for (const contextRef of [null, undefined, '   ']) {
      const rows = [makeRsRow({ contextType: 'ElementType', contextRef, elementTypeRef: 'ET-X' })]
      expect(runValidation(dbData, [], rows, ui).filter(i => i.rule === 'BLANK_RECIPE_CONTAINER')).toHaveLength(1)
    }
  })

  test('a named container is fine', () => {
    const rows = [makeRsRow({ contextType: 'ElementType', contextRef: 'ET-DL-SPOT-01', elementTypeRef: 'ET-PLUG-01' })]
    expect(runValidation(dbData, [], rows, ui).filter(i => i.rule === 'BLANK_RECIPE_CONTAINER')).toHaveLength(0)
  })

  test('a position-level row needs no container', () => {
    const rows = [makeRsRow({ contextType: 'PositionType', contextRef: 'PT-DL-LOCAL-01' })]
    expect(runValidation(dbData, [], rows, ui).filter(i => i.rule === 'BLANK_RECIPE_CONTAINER')).toHaveLength(0)
  })

  test('a deleted row is not reported', () => {
    expect(runValidation(dbData, [], [blank({ isDeleted: 'Y' })], ui)
      .filter(i => i.rule === 'BLANK_RECIPE_CONTAINER')).toHaveLength(0)
  })

  test('one issue per (position, element), not one per row', () => {
    expect(runValidation(dbData, [], [blank(), blank()], ui)
      .filter(i => i.rule === 'BLANK_RECIPE_CONTAINER')).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Rule 14 — MISSING_PRODUCT_SPEC_ROW  (PS ↔ DB alignment)
// ---------------------------------------------------------------------------
describe('MISSING_PRODUCT_SPEC_ROW', () => {
  const ui = { 'PT-DL-LOCAL-01': { tags: [] } }
  const only = issues => issues.filter(i => i.rule === 'MISSING_PRODUCT_SPEC_ROW')
  const db = element_types => ({ element_types, position_types: [] })

  test('an ET used in a recipe with no spec row is reported', () => {
    const rows = [makeRsRow({ elementTypeRef: 'ET-DRIVER-01' })]
    const issues = only(runValidation(db([]), [], rows, ui))
    expect(issues).toHaveLength(1)
    expect(issues[0].ref).toBe('ET-DRIVER-01')
    expect(issues[0].message).toMatch(/used in a recipe/)
    expect(issues[0].fixKind).toBe('spec')      // the fix lives on the Product Spec screen
  })

  test('an ET catalogued in the DB with no spec row is reported', () => {
    const issues = only(runValidation(db([{ ElementTypeRef: 'ET-ONLY-IN-DB' }]), [], [], {}))
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toMatch(/DesignDB catalogue/)
  })

  test('a spec row silences it', () => {
    const rows = [makeRsRow({ elementTypeRef: 'ET-DRIVER-01' })]
    const ps = [makePsRow('ET-DRIVER-01', 'CODE-1')]
    expect(only(runValidation(db([{ ElementTypeRef: 'ET-DRIVER-01' }]), ps, rows, ui))).toHaveLength(0)
  })

  test('matching is case-insensitive', () => {
    const rows = [makeRsRow({ elementTypeRef: 'ET-Driver-01' })]
    expect(only(runValidation(db([]), [makePsRow('et-driver-01', 'C')], rows, ui))).toHaveLength(0)
  })

  test('DB collections are exempt — a grouping is not purchasable', () => {
    const dbData2 = db([{ ElementTypeRef: 'ET-FAMILY', IsCollection: 'Y' }])
    expect(only(runValidation(dbData2, [], [], {}))).toHaveLength(0)
  })

  test('a deleted recipe row does not demand a spec', () => {
    const rows = [makeRsRow({ elementTypeRef: 'ET-GONE', isDeleted: 'Y' })]
    expect(only(runValidation(db([]), [], rows, ui))).toHaveLength(0)
  })

  test('a deleted spec row does not count as specified', () => {
    const rows = [makeRsRow({ elementTypeRef: 'ET-DRIVER-01' })]
    const ps = [{ elementTypeRef: 'ET-DRIVER-01', productCode: 'C', isDeleted: 'Y' }]
    expect(only(runValidation(db([]), ps, rows, ui))).toHaveLength(1)
  })

  test('each ET is reported once, however many rows use it', () => {
    const rows = [makeRsRow({ elementTypeRef: 'ET-X' }), makeRsRow({ elementTypeRef: 'ET-X', recipeIndex: 2 })]
    expect(only(runValidation(db([{ ElementTypeRef: 'ET-X' }]), [], rows, ui))).toHaveLength(1)
  })

  test('it is a warning, not an error — the recipe still works', () => {
    const rows = [makeRsRow({ elementTypeRef: 'ET-DRIVER-01' })]
    expect(only(runValidation(db([]), [], rows, ui))[0].severity).toBe('warning')
  })
})
