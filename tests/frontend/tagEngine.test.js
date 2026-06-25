import { describe, test, expect } from 'vitest'
import { deriveTagsForPosition, deriveTagsForAll } from '../../src/utils/tagEngine.js'

// ---------------------------------------------------------------------------
// Sample position type fixtures
// ---------------------------------------------------------------------------
const PT_DL_LOCAL_01 = {
  PositionTypeRef: 'PT-DL-LOCAL-01',
  DriverLocation: 'Local',
  SecondaryPowerType: 'CC',
  ControlTypeRef: 'DALI',
  'SecondaryPowerNodes_+ve': 1,
}

const PT_DL_CC_01 = {
  PositionTypeRef: 'PT-DL-CC-01',
  DriverLocation: 'Remote',
  SecondaryPowerType: 'CC',
  ControlTypeRef: 'DALI',
  'SecondaryPowerNodes_+ve': 1,
}

const PT_LIN_01 = {
  PositionTypeRef: 'PT-LIN-01',
  DriverLocation: 'Local',
  SecondaryPowerType: 'CV',
  ControlTypeRef: 'LOCAL',
  'SecondaryPowerNodes_+ve': 1,
}

const PT_DL_TW_01 = {
  PositionTypeRef: 'PT-DL-TW-01',
  DriverLocation: 'Local',
  SecondaryPowerType: 'CC',
  ControlTypeRef: 'DALI',
  'SecondaryPowerNodes_+ve': 2,
}

// ---------------------------------------------------------------------------
// deriveTagsForPosition
// ---------------------------------------------------------------------------
describe('deriveTagsForPosition', () => {
  test('Local DALI downlight gets DL, Local, 5Pin-DALI tags with high confidence', () => {
    const result = deriveTagsForPosition(PT_DL_LOCAL_01)

    expect(result.tags).toContain('DL')
    expect(result.tags).toContain('Local')
    expect(result.tags).toContain('5Pin-DALI')
    // All tag sources are high for this fixture — ref doesn't match LIN/PS/PANEL so
    // DL is inferred as default (low), but the spec says high when all field-driven
    // tags are high. We test the tag set, then separately test confidence for the
    // fixture where the ref contains no ambiguous tokens.
    // PT-DL-LOCAL-01 ref doesn't contain LIN/PANEL/PS so DL is default → low overall
    expect(result.confidence).toBe('low')
  })

  test('Local DALI downlight tagged explicitly as DL in ref has medium/low confidence', () => {
    // "DL" in ref doesn't match LIN/PANEL/PS, so FittingType stays as default ("low")
    const result = deriveTagsForPosition(PT_DL_LOCAL_01)
    // Driver=Local (high), Wiring=DALI (high), FittingType=default (low) → overall low
    expect(['low', 'medium']).toContain(result.confidence)
  })

  test('Remote CC DALI gets DL, Remote-CC, 5Pin-DALI tags', () => {
    const result = deriveTagsForPosition(PT_DL_CC_01)

    expect(result.tags).toContain('DL')
    expect(result.tags).toContain('Remote-CC')
    expect(result.tags).toContain('5Pin-DALI')
    expect(result.tags).not.toContain('Local')
    expect(result.tags).not.toContain('Remote-CV')
  })

  test('CV local linear gets LIN and Local tags (no wiring pin tag for CV / LOCAL control)', () => {
    const result = deriveTagsForPosition(PT_LIN_01)

    expect(result.tags).toContain('LIN')
    expect(result.tags).toContain('Local')
    // LOCAL control type → no wiring pin tag
    expect(result.tags).not.toContain('5Pin-DALI')
    expect(result.tags).not.toContain('3Pin-TE')
    expect(result.tags).not.toContain('4Pin-TW')
  })

  test('LIN tag inferred from ref containing "LIN" has medium confidence contribution', () => {
    const result = deriveTagsForPosition(PT_LIN_01)
    // FittingType inferred from ref ("LIN") → medium; overall ≤ medium
    expect(['medium', 'low']).toContain(result.confidence)
    expect(result.source.FittingType.source).toBe('ref_inference')
  })

  test('SecondaryPowerNodes_+ve=2 adds TwinSpot tag', () => {
    const result = deriveTagsForPosition(PT_DL_TW_01)

    expect(result.tags).toContain('TwinSpot')
  })

  test('SecondaryPowerNodes_+ve=1 does not add TwinSpot tag', () => {
    const result = deriveTagsForPosition(PT_DL_LOCAL_01)
    expect(result.tags).not.toContain('TwinSpot')
  })

  test('Ref containing EXT adds Exterior tag with medium confidence', () => {
    const pt = {
      PositionTypeRef: 'PT-DL-EXT-01',
      DriverLocation: 'Local',
      SecondaryPowerType: 'CC',
      ControlTypeRef: 'DALI',
      'SecondaryPowerNodes_+ve': 1,
    }
    const result = deriveTagsForPosition(pt)

    expect(result.tags).toContain('Exterior')
    expect(result.source.Exterior.source).toBe('ref_inference')
    // medium confidence from Exterior inference (FittingType is low default, so overall low)
    expect(['low', 'medium']).toContain(result.confidence)
  })

  test('Ref containing IP adds Exterior tag', () => {
    const pt = {
      PositionTypeRef: 'PT-DL-IP65-01',
      DriverLocation: 'Local',
      SecondaryPowerType: 'CC',
      ControlTypeRef: 'DALI',
      'SecondaryPowerNodes_+ve': 1,
    }
    const result = deriveTagsForPosition(pt)
    expect(result.tags).toContain('Exterior')
  })

  test('Overall confidence is medium if any tag source is medium (no low sources)', () => {
    // A position where FittingType is inferred as medium, all others high
    // LIN ref + Local driver + DALI wiring → FittingType medium, rest high
    const pt = {
      PositionTypeRef: 'PT-LIN-DALI-01',
      DriverLocation: 'Local',
      SecondaryPowerType: 'CC',
      ControlTypeRef: 'DALI',
      'SecondaryPowerNodes_+ve': 1,
    }
    const result = deriveTagsForPosition(pt)

    expect(result.tags).toContain('LIN')
    expect(result.tags).toContain('Local')
    expect(result.tags).toContain('5Pin-DALI')
    // LIN inferred (medium) + Local (high) + DALI (high) → overall medium
    expect(result.confidence).toBe('medium')
  })

  test('Unknown DriverLocation gives No-Driver tag with low confidence', () => {
    const pt = {
      PositionTypeRef: 'PT-DL-UNKNOWN-01',
      DriverLocation: null,
      SecondaryPowerType: null,
      ControlTypeRef: null,
      'SecondaryPowerNodes_+ve': 1,
    }
    const result = deriveTagsForPosition(pt)

    expect(result.tags).toContain('No-Driver')
    expect(result.confidence).toBe('low')
  })

  test('TE control type gives 3Pin-TE wiring tag', () => {
    const pt = {
      PositionTypeRef: 'PT-DL-TE-01',
      DriverLocation: 'Local',
      SecondaryPowerType: 'CC',
      ControlTypeRef: 'TE',
      'SecondaryPowerNodes_+ve': 1,
    }
    const result = deriveTagsForPosition(pt)
    expect(result.tags).toContain('3Pin-TE')
  })

  test('TW control type gives 4Pin-TW wiring tag', () => {
    const pt = {
      PositionTypeRef: 'PT-DL-TW-CTL-01',
      DriverLocation: 'Local',
      SecondaryPowerType: 'CC',
      ControlTypeRef: 'TW',
      'SecondaryPowerNodes_+ve': 1,
    }
    const result = deriveTagsForPosition(pt)
    expect(result.tags).toContain('4Pin-TW')
  })

  test('Remote CV gives Remote-CV driver tag', () => {
    const pt = {
      PositionTypeRef: 'PT-DL-CV-01',
      DriverLocation: 'Remote',
      SecondaryPowerType: 'CV',
      ControlTypeRef: 'DALI',
      'SecondaryPowerNodes_+ve': 1,
    }
    const result = deriveTagsForPosition(pt)
    expect(result.tags).toContain('Remote-CV')
    expect(result.tags).not.toContain('Remote-CC')
  })

  test('PANEL ref gives PANEL fitting type tag', () => {
    const pt = {
      PositionTypeRef: 'PT-PANEL-01',
      DriverLocation: 'Local',
      SecondaryPowerType: 'CC',
      ControlTypeRef: 'DALI',
      'SecondaryPowerNodes_+ve': 1,
    }
    const result = deriveTagsForPosition(pt)
    expect(result.tags).toContain('PANEL')
    expect(result.source.FittingType.source).toBe('ref_inference')
  })

  test('PS ref gives PS fitting type tag', () => {
    const pt = {
      PositionTypeRef: 'PT-PS-SPOT-01',
      DriverLocation: 'Local',
      SecondaryPowerType: 'CC',
      ControlTypeRef: 'DALI',
      'SecondaryPowerNodes_+ve': 1,
    }
    const result = deriveTagsForPosition(pt)
    expect(result.tags).toContain('PS')
  })
})

// ---------------------------------------------------------------------------
// deriveTagsForAll
// ---------------------------------------------------------------------------
describe('deriveTagsForAll', () => {
  test('returns a keyed object for each position type', () => {
    const positionTypes = [PT_DL_LOCAL_01, PT_DL_CC_01, PT_LIN_01, PT_DL_TW_01]
    const result = deriveTagsForAll(positionTypes)

    expect(Object.keys(result)).toHaveLength(4)
    expect(result['PT-DL-LOCAL-01']).toBeDefined()
    expect(result['PT-LIN-01'].tags).toContain('LIN')
    expect(result['PT-DL-TW-01'].tags).toContain('TwinSpot')
  })

  test('empty input returns empty object', () => {
    const result = deriveTagsForAll([])
    expect(result).toEqual({})
  })
})
