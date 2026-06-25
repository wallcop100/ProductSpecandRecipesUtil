import { describe, test, expect } from 'vitest'
import {
  resolveTemplate,
  getResolutionStatus,
  applyResolvedTemplate,
} from '../../src/utils/slotResolver.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const sampleTemplate = {
  id: 'DL+Local',
  ingredients: [
    { slotKey: 'DESIGN_ELEMENT', section: 'position', isDesign: 'Y', fixed: false },
    { slotKey: 'SITE_SOCKET', section: 'position', isContractItem: 'Y', fixed: false },
    { slotKey: 'LOCAL_DRIVER', section: 'dl_internal', isContractItem: 'Y', fixed: false },
  ],
}

const slotMappingsComplete = {
  DESIGN_ELEMENT: 'ET-DL-SPOT-01',
  SITE_SOCKET: 'ET-SOCK-5P-01',
  LOCAL_DRIVER: 'ET-DRIVER-CC-01',
}

const slotMappingsPartial = {
  DESIGN_ELEMENT: 'ET-DL-SPOT-01',
  // SITE_SOCKET and LOCAL_DRIVER are missing
}

const allEtRefs = ['ET-DL-SPOT-01', 'ET-SOCK-5P-01', 'ET-DRIVER-CC-01', 'ET-TAPE-01']

const positionTypeRef = 'PT-DL-LOCAL-01'

// ---------------------------------------------------------------------------
// resolveTemplate
// ---------------------------------------------------------------------------
describe('resolveTemplate', () => {
  test('resolves all slots when mappings are complete', () => {
    const resolved = resolveTemplate(sampleTemplate, slotMappingsComplete, allEtRefs)

    expect(resolved).toHaveLength(3)
    expect(resolved[0]).toMatchObject({
      slotKey: 'DESIGN_ELEMENT',
      entityRef: 'ET-DL-SPOT-01',
      resolved: true,
      etExists: true,
    })
    expect(resolved[1]).toMatchObject({
      slotKey: 'SITE_SOCKET',
      entityRef: 'ET-SOCK-5P-01',
      resolved: true,
      etExists: true,
    })
    expect(resolved[2]).toMatchObject({
      slotKey: 'LOCAL_DRIVER',
      entityRef: 'ET-DRIVER-CC-01',
      resolved: true,
      etExists: true,
    })
  })

  test('marks missing mappings as resolved:false', () => {
    const resolved = resolveTemplate(sampleTemplate, slotMappingsPartial, allEtRefs)

    const socket = resolved.find(r => r.slotKey === 'SITE_SOCKET')
    const driver = resolved.find(r => r.slotKey === 'LOCAL_DRIVER')

    expect(socket.resolved).toBe(false)
    expect(socket.entityRef).toBeNull()
    expect(driver.resolved).toBe(false)
  })

  test('marks resolved ET ref not in DB as etExists:false', () => {
    const mappings = { ...slotMappingsComplete, DESIGN_ELEMENT: 'ET-DL-UNKNOWN-99' }
    const resolved = resolveTemplate(sampleTemplate, mappings, allEtRefs)

    const designEl = resolved.find(r => r.slotKey === 'DESIGN_ELEMENT')
    expect(designEl.resolved).toBe(true)
    expect(designEl.etExists).toBe(false)
  })

  test('etExists check is case-insensitive', () => {
    const mappings = { ...slotMappingsComplete, DESIGN_ELEMENT: 'et-dl-spot-01' }
    const resolved = resolveTemplate(sampleTemplate, mappings, allEtRefs)

    const designEl = resolved.find(r => r.slotKey === 'DESIGN_ELEMENT')
    expect(designEl.etExists).toBe(true)
  })

  test('preserves original ingredient fields on resolved entries', () => {
    const resolved = resolveTemplate(sampleTemplate, slotMappingsComplete, allEtRefs)
    const socket = resolved.find(r => r.slotKey === 'SITE_SOCKET')

    expect(socket.isContractItem).toBe('Y')
    expect(socket.section).toBe('position')
  })

  test('handles empty slotMappings without throwing', () => {
    const resolved = resolveTemplate(sampleTemplate, {}, allEtRefs)
    expect(resolved.every(r => r.resolved === false)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// getResolutionStatus
// ---------------------------------------------------------------------------
describe('getResolutionStatus', () => {
  test('counts resolved vs total correctly', () => {
    const resolved = resolveTemplate(sampleTemplate, slotMappingsComplete, allEtRefs)
    const status = getResolutionStatus(resolved)

    expect(status.total).toBe(3)
    expect(status.resolved).toBe(3)
    expect(status.missing).toHaveLength(0)
  })

  test('counts partial resolution correctly', () => {
    const resolved = resolveTemplate(sampleTemplate, slotMappingsPartial, allEtRefs)
    const status = getResolutionStatus(resolved)

    expect(status.total).toBe(3)
    expect(status.resolved).toBe(1)
    expect(status.missing).toHaveLength(2)
  })

  test('returns missing slot keys', () => {
    const resolved = resolveTemplate(sampleTemplate, slotMappingsPartial, allEtRefs)
    const status = getResolutionStatus(resolved)

    expect(status.missing).toContain('SITE_SOCKET')
    expect(status.missing).toContain('LOCAL_DRIVER')
  })

  test('all missing when no mappings', () => {
    const resolved = resolveTemplate(sampleTemplate, {}, allEtRefs)
    const status = getResolutionStatus(resolved)

    expect(status.resolved).toBe(0)
    expect(status.missing).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// applyResolvedTemplate
// ---------------------------------------------------------------------------
describe('applyResolvedTemplate', () => {
  test('produces recipe rows with entityRef set', () => {
    const resolved = resolveTemplate(sampleTemplate, slotMappingsComplete, allEtRefs)
    const rows = applyResolvedTemplate(resolved, positionTypeRef)

    expect(rows).toHaveLength(3)
    const designRow = rows.find(r => r.slotKey === 'DESIGN_ELEMENT')
    expect(designRow.elementTypeRef).toBe('ET-DL-SPOT-01')
    expect(designRow.resolved).toBe(true)
  })

  test('unresolved slots produce placeholder rows (elementTypeRef null, resolved false)', () => {
    const resolved = resolveTemplate(sampleTemplate, slotMappingsPartial, allEtRefs)
    const rows = applyResolvedTemplate(resolved, positionTypeRef)

    const socketRow = rows.find(r => r.slotKey === 'SITE_SOCKET')
    expect(socketRow.elementTypeRef).toBeNull()
    expect(socketRow.resolved).toBe(false)
  })

  test('position section rows get contextType=PositionType', () => {
    const resolved = resolveTemplate(sampleTemplate, slotMappingsComplete, allEtRefs)
    const rows = applyResolvedTemplate(resolved, positionTypeRef)

    const designRow = rows.find(r => r.slotKey === 'DESIGN_ELEMENT')
    expect(designRow.contextType).toBe('PositionType')
    expect(designRow.contextRef).toBe(positionTypeRef)
  })

  test('dl_internal section rows get contextType=ElementType and contextRef from DESIGN_ELEMENT', () => {
    const resolved = resolveTemplate(sampleTemplate, slotMappingsComplete, allEtRefs)
    const rows = applyResolvedTemplate(resolved, positionTypeRef)

    const driverRow = rows.find(r => r.slotKey === 'LOCAL_DRIVER')
    expect(driverRow.contextType).toBe('ElementType')
    expect(driverRow.contextRef).toBe('ET-DL-SPOT-01')
  })

  test('DimQtyMultiplier auto-set to 1 for TAPE token in entityRef', () => {
    const templateWithTape = {
      id: 'LIN+Tape',
      ingredients: [
        { slotKey: 'TAPE', section: 'position', fixed: false },
      ],
    }
    const mappings = { TAPE: 'ET-TAPE-LED-01' }
    const resolved = resolveTemplate(templateWithTape, mappings, ['ET-TAPE-LED-01'])
    const rows = applyResolvedTemplate(resolved, 'PT-LIN-01')

    const tapeRow = rows.find(r => r.slotKey === 'TAPE')
    expect(tapeRow.dimQtyMultiplier).toBe(1)
  })

  test('DimQtyMultiplier auto-set to 1 for PROFILE token in entityRef', () => {
    const templateWithProfile = {
      id: 'LIN+Profile',
      ingredients: [
        { slotKey: 'PROFILE', section: 'position', fixed: false },
      ],
    }
    const mappings = { PROFILE: 'ET-PROFILE-ALU-01' }
    const resolved = resolveTemplate(templateWithProfile, mappings, ['ET-PROFILE-ALU-01'])
    const rows = applyResolvedTemplate(resolved, 'PT-LIN-01')

    const profileRow = rows.find(r => r.slotKey === 'PROFILE')
    expect(profileRow.dimQtyMultiplier).toBe(1)
  })

  test('Quantity=2 auto-set for CAP token in entityRef', () => {
    const templateWithCap = {
      id: 'LIN+Cap',
      ingredients: [
        { slotKey: 'END_CAPS', section: 'position', fixed: false },
      ],
    }
    const mappings = { END_CAPS: 'ET-CAP-SQ-01' }
    const resolved = resolveTemplate(templateWithCap, mappings, ['ET-CAP-SQ-01'])
    const rows = applyResolvedTemplate(resolved, 'PT-LIN-01')

    const capRow = rows.find(r => r.slotKey === 'END_CAPS')
    expect(capRow.quantity).toBe(2)
  })

  test('IsContractItem auto-set to Y for DRIVER token in entityRef', () => {
    const templateWithDriver = {
      id: 'DL+Driver',
      ingredients: [
        { slotKey: 'LOCAL_DRIVER', section: 'position', fixed: false },
      ],
    }
    const mappings = { LOCAL_DRIVER: 'ET-DRIVER-CC-01' }
    const resolved = resolveTemplate(templateWithDriver, mappings, ['ET-DRIVER-CC-01'])
    const rows = applyResolvedTemplate(resolved, 'PT-DL-01')

    const driverRow = rows[0]
    expect(driverRow.isContractItem).toBe('Y')
  })

  test('IsContractItem auto-set to Y for GLAND token in entityRef', () => {
    const templateWithGland = {
      id: 'EXT+Gland',
      ingredients: [
        { slotKey: 'GLAND_SLOT', section: 'position', fixed: false },
      ],
    }
    const mappings = { GLAND_SLOT: 'ET-GLAND-M20-01' }
    const resolved = resolveTemplate(templateWithGland, mappings, ['ET-GLAND-M20-01'])
    const rows = applyResolvedTemplate(resolved, 'PT-EXT-01')

    expect(rows[0].isContractItem).toBe('Y')
  })

  test('rows include all required fields', () => {
    const resolved = resolveTemplate(sampleTemplate, slotMappingsComplete, allEtRefs)
    const rows = applyResolvedTemplate(resolved, positionTypeRef)

    const requiredFields = [
      'positionTypeRef', 'contextType', 'contextRef', 'recipeIndex',
      'elementTypeRef', 'quantity', 'dimQtyMultiplier', 'dimQuantity',
      'isDesign', 'isContractItem', 'isTBC', 'isPropertiesTBC',
      'notes', 'slotKey', 'resolved',
    ]
    for (const row of rows) {
      for (const field of requiredFields) {
        expect(row, `row should have field "${field}"`).toHaveProperty(field)
      }
    }
  })
})
