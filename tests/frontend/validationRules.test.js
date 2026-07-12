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

    // The DesignDB is the master list: an ET in the Product Spec or a recipe must
    // exist in it. A parsed workbook row carries `_row_num`; that is what "in the
    // master" means. Without this the six ETs below trip ELEMENT_TYPE_NOT_IN_DB.
    const master = {
      element_types: psRows.map((r, i) => ({ ElementTypeRef: r.elementTypeRef, _row_num: i + 2 })),
      position_types: [],
    }
    const issues = runValidation(master, psRows, rsRows, ui)
    expect(issues).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// LOCAL_DRIVER_REQUIREMENTS (Rule 7)
// ---------------------------------------------------------------------------
describe('LOCAL_DRIVER_REQUIREMENTS', () => {
  const localUI = { 'PT-DL-LOCAL-01': { tags: ['DL', 'Local'] } }

  /**
   * The site socket and the SR ARE the connector template's first-fix kit. A project that
   * never set connectors up has no such ref anywhere, so asking for one it has no concept
   * of is noise — it flagged 'A02m has no site-side strain relief' on a project with no
   * connector templates at all. The driver is not connector-derived and still stands.
   */
  test('with no connectors anywhere, only the driver is demanded — not the first-fix kit', () => {
    const rsRows = [makeRsRow({ elementTypeRef: 'ET-DL-SPOT-01', isDesign: 'Y' })]
    const issues = runValidation(dbData, [], rsRows, localUI)
    const rules = issues.map(i => i.rule)
    expect(rules).toContain('LOCAL_MISSING_DRIVER')
    expect(rules).not.toContain('LOCAL_MISSING_SITE_SOCKET')
    expect(rules).not.toContain('LOCAL_MISSING_STRAIN_RELIEF')
  })

  /**
   * THE REAL BUG. `ET-2Pin-LIN-Socket` is a LINEAR connector, and its ref carries the
   * segment SOCKET. A project-wide "does anyone use connectors?" gate therefore saw that
   * one row on C01r and started demanding a site-side strain relief from every Local
   * downlight in the job — A02m included, which has no connector recipe at all.
   * The evidence has to be the position's own.
   */
  test('a connector on ANOTHER position never makes this one owe a first-fix kit', () => {
    const rsRows = [
      makeRsRow({ elementTypeRef: 'ET-DL-SPOT-01', isDesign: 'Y' }),
      // a LINEAR position's connector — nothing to do with this downlight
      makeRsRow({ positionTypeRef: 'C01r', contextRef: 'C01r', elementTypeRef: 'ET-2Pin-LIN-Socket' }),
    ]
    const rules = runValidation(dbData, [], rsRows, localUI).map(i => i.rule)
    expect(rules).not.toContain('LOCAL_MISSING_SITE_SOCKET')
    expect(rules).not.toContain('LOCAL_MISSING_STRAIN_RELIEF')
  })

  test('a HALF-built kit on this position is still flagged — a socket with no strain relief', () => {
    const rsRows = [
      makeRsRow({ elementTypeRef: 'ET-DL-SPOT-01', isDesign: 'Y' }),
      makeRsRow({ elementTypeRef: 'ET-SOCK-5P-01' }),   // this position DOES do connectors
    ]
    const rules = runValidation(dbData, [], rsRows, localUI).map(i => i.rule)
    expect(rules).toContain('LOCAL_MISSING_STRAIN_RELIEF')
    expect(rules).not.toContain('LOCAL_MISSING_SITE_SOCKET')   // it has the socket
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
// Rule 14 — MISSING_PRODUCT_SPEC_ROW   (a recipe implies a spec)
// Rule 17 — ELEMENT_TYPE_NOT_IN_DB     (the DesignDB is the master)
// ---------------------------------------------------------------------------

/** A row parsed from the DesignDB workbook carries its Excel row number. */
const dbEt = (ref, n = 2) => ({ ElementTypeRef: ref, _row_num: n })

describe('MISSING_PRODUCT_SPEC_ROW', () => {
  const ui = { 'PT-DL-LOCAL-01': { tags: [] } }
  const only = issues => issues.filter(i => i.rule === 'MISSING_PRODUCT_SPEC_ROW')
  const db = element_types => ({ element_types, position_types: [] })

  test('a real product used in a recipe with no spec row is an ERROR — nothing to buy', () => {
    const rows = [makeRsRow({ elementTypeRef: 'ET-DRIVER-01' })]
    const issues = only(runValidation(db([dbEt('ET-DRIVER-01')]), [], rows, ui))
    expect(issues).toHaveLength(1)
    expect(issues[0].ref).toBe('ET-DRIVER-01')
    expect(issues[0].severity).toBe('error')
    expect(issues[0].message).toMatch(/no Product Spec row/)
    expect(issues[0].fixKind).toBe('spec')      // the fix lives on the Product Spec screen
  })

  test('a WRAPPER is only a warning — Ideaworks / N/A is one click away', () => {
    const rows = [makeRsRow({ elementTypeRef: 'ET-LIN-01' })]
    const issues = only(runValidation(db([dbEt('ET-LIN-01')]), [], rows, ui, {
      containerETRefs: new Set(['et-lin-01']),
    }))
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('warning')
    expect(issues[0].message).toMatch(/Ideaworks \/ N\/A/)
  })

  /**
   * THE BUG THIS RULE HAD. It demanded a spec row for every CATALOGUED ElementType,
   * so on the real project it flagged 25 cables and connectors nobody ever bought
   * and never once flagged a real product. The catalogue is a master list, not a
   * shopping list.
   */
  test('an ET catalogued in the DB but used in no recipe needs NOTHING', () => {
    expect(only(runValidation(db([dbEt('ET-ONLY-IN-DB')]), [], [], {}))).toHaveLength(0)
  })

  test('a spec row silences it', () => {
    const rows = [makeRsRow({ elementTypeRef: 'ET-DRIVER-01' })]
    const ps = [makePsRow('ET-DRIVER-01', 'CODE-1')]
    expect(only(runValidation(db([dbEt('ET-DRIVER-01')]), ps, rows, ui))).toHaveLength(0)
  })

  test('matching is case-insensitive', () => {
    const rows = [makeRsRow({ elementTypeRef: 'ET-Driver-01' })]
    expect(only(runValidation(db([dbEt('ET-Driver-01')]), [makePsRow('et-driver-01', 'C')], rows, ui))).toHaveLength(0)
  })

  test('a collection is a grouping, not a purchasable', () => {
    const rows = [makeRsRow({ elementTypeRef: 'ET-FAMILY' })]
    expect(only(runValidation(db([]), [], rows, ui, { collectionRefs: ['ET-FAMILY'] }))).toHaveLength(0)
  })

  test('a deleted recipe row does not demand a spec', () => {
    const rows = [makeRsRow({ elementTypeRef: 'ET-GONE', isDeleted: 'Y' })]
    expect(only(runValidation(db([]), [], rows, ui))).toHaveLength(0)
  })

  test('a deleted spec row does not count as specified', () => {
    const rows = [makeRsRow({ elementTypeRef: 'ET-DRIVER-01' })]
    const ps = [{ elementTypeRef: 'ET-DRIVER-01', productCode: 'C', isDeleted: 'Y' }]
    expect(only(runValidation(db([dbEt('ET-DRIVER-01')]), ps, rows, ui))).toHaveLength(1)
  })

  test('an ET used only by an ignored position is out of scope', () => {
    const rows = [makeRsRow({ elementTypeRef: 'ET-DRIVER-01' })]
    const opts = { ignoredPosRefs: new Set(['pt-dl-local-01']) }
    expect(only(runValidation(db([dbEt('ET-DRIVER-01')]), [], rows, ui, opts))).toHaveLength(0)
  })
})

describe('ELEMENT_TYPE_NOT_IN_DB — the DesignDB is the master list', () => {
  const ui = { 'PT-DL-LOCAL-01': { tags: [] } }
  const only = issues => issues.filter(i => i.rule === 'ELEMENT_TYPE_NOT_IN_DB')
  const db = element_types => ({ element_types, position_types: [] })

  test('an ET in the Product Spec but not the DesignDB is an error', () => {
    const issues = only(runValidation(db([]), [makePsRow('ET-PS-01', 'C')], [], {}))
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('error')
    expect(issues[0].message).toMatch(/master list/)
  })

  test('an ET in a recipe but not the DesignDB is an error', () => {
    const rows = [makeRsRow({ elementTypeRef: 'ET-DL-01' })]
    expect(only(runValidation(db([]), [], rows, ui))).toHaveLength(1)
  })

  test('a parsed workbook row satisfies it', () => {
    expect(only(runValidation(db([dbEt('ET-PS-01')]), [makePsRow('ET-PS-01', 'C')], [], {}))).toHaveLength(0)
  })

  /**
   * A locally-minted ET has no _row_num: the app knows it, the workbook does not.
   * That is precisely the drift this rule exists to surface — it reaches the master
   * through the ElementTypes patch or not at all.
   */
  test('a locally-minted ET has not reached the master yet', () => {
    const local = { ElementTypeRef: 'ET-NEW-01', _row_num: null }
    expect(only(runValidation(db([local]), [makePsRow('ET-NEW-01', 'C')], [], {}))).toHaveLength(1)
  })

  test('a collection stripped by parseDb is still in the master', () => {
    const rows = [makeRsRow({ elementTypeRef: 'ET-CABLE' })]
    expect(only(runValidation(db([]), [], rows, ui, { collectionRefs: ['ET-CABLE'] }))).toHaveLength(0)
  })

  test('the fix lives on the Product Spec screen', () => {
    const issues = only(runValidation(db([]), [makePsRow('ET-PS-01', 'C')], [], {}))
    expect(issues[0].fixKind).toBe('spec')
  })
})

// ---------------------------------------------------------------------------
// DUPLICATE_PRODUCT_CODE — identity is (manufacturer, product code)
// ---------------------------------------------------------------------------
describe('DUPLICATE_PRODUCT_CODE keys on manufacturer + code', () => {
  const row = (ref, mfr, code, extra = {}) => ({ elementTypeRef: ref, Manufacturer: mfr, ProductCode: code, ...extra })
  const only = ps => runValidation(dbData, ps, [], {}).filter(i => i.rule === 'DUPLICATE_PRODUCT_CODE')

  test('one code from two makers is NOT an error — the real Orluna/Phos case', () => {
    const ps = [
      row('ET-PLASTERKIT-01', 'Orluna', 'PLASTER IN KIT'),
      row('ET-PLASTERKIT-02', 'Phos', 'PLASTER IN KIT'),
    ]
    expect(only(ps)).toHaveLength(0)
  })

  test('the same maker entering the same code twice IS an error', () => {
    const ps = [row('ET-A', 'Orluna', 'PLASTER IN KIT'), row('ET-B', 'Orluna', 'PLASTER IN KIT')]
    const issues = only(ps)
    expect(issues).toHaveLength(1)
    expect(issues[0].severity).toBe('error')
    expect(issues[0].message).toMatch(/from Orluna/)
  })

  test('two blank makers sharing a code are still an error', () => {
    const ps = [row('ET-A', '', 'ABC-1'), row('ET-B', '', 'ABC-1')]
    expect(only(ps)[0].message).toMatch(/no manufacturer/)
  })

  test('N/A is still exempt, whatever the maker', () => {
    const ps = [row('ET-A', 'Ideaworks', 'N/A'), row('ET-B', 'Ideaworks', 'n/a')]
    expect(only(ps)).toHaveLength(0)
  })

  test('a deleted row does not create a duplicate', () => {
    const ps = [row('ET-A', 'Orluna', 'X1'), row('ET-B', 'Orluna', 'X1', { IsDeleted: 'Y' })]
    expect(only(ps)).toHaveLength(0)
  })
})
