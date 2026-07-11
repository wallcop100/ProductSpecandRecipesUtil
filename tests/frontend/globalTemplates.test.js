import { describe, test, expect } from 'vitest'
import { GLOBAL_TEMPLATES } from '../../src/platform/dbSchema'
import { GLOBAL_TEMPLATE_IDS } from '../../src/utils/constants'

const byId = id => GLOBAL_TEMPLATES.find(t => t.id === id)
const keysOf = id => byId(id).ingredients.map(i => i.slotKey)

/**
 * Sockets, plugs and strain reliefs are the connector wizard's job now
 * (CONNECTOR_TEMPLATES + ConnectorWizardModal). The built-in templates used to prime the
 * same rows, so every applied template shipped a half-built connector set for the wizard
 * to reconcile. They now carry only what the wizard cannot give you.
 */
const CONNECTOR_SLOTS = [
  'SITE_SOCKET', 'SITE_SR', 'DRIVER_PLUG', 'DC_SR', 'LIN_SOCKET', 'LIN_PLUG',
]

describe('the built-in templates carry no connector slots', () => {
  test.each(['DL+Local', 'DL+Remote-CC', 'DL+Exterior', 'DL+Local+3Pin',
    'DL+Local+4Pin', 'DL+Local+TwinSpot', 'LIN+Tape+Profile', 'LIN+Flex+Mount', 'LIN+Flex'])(
    '%s has none', id => {
      const keys = keysOf(id)
      for (const c of CONNECTOR_SLOTS) expect(keys).not.toContain(c)
      // the DL sets' remote pair is a connector too
      if (id.startsWith('DL')) {
        expect(keys).not.toContain('REMOTE_SOCKET')
        expect(keys).not.toContain('REMOTE_PLUG')
      }
    })

  test('what the wizard cannot give you is still there', () => {
    expect(keysOf('DL+Local')).toEqual(['DESIGN_ELEMENT', 'MOUNT_COLLAR', 'LOCAL_DRIVER'])
    // the linear make-up survives in full
    expect(keysOf('LIN+Tape+Profile')).toEqual([
      'DESIGN_ELEMENT', 'CLIPS', 'LOCKING_LEVER', 'TAPE', 'PROFILE', 'DIFFUSER', 'END_CAPS',
    ])
  })

  test('every template still has its design element, and none is left empty', () => {
    for (const t of GLOBAL_TEMPLATES) {
      expect(t.ingredients.length).toBeGreaterThan(0)
      expect(t.ingredients.map(i => i.slotKey)).toContain('DESIGN_ELEMENT')
    }
  })

  test('recipeIndex is renumbered contiguously from 1', () => {
    for (const t of GLOBAL_TEMPLATES) {
      const idx = t.ingredients.map(i => i.recipeIndex)
      expect(idx).toEqual(idx.map((_, i) => i + 1))
    }
  })

  /**
   * PANEL's slot KEYS lie: REMOTE_SOCKET is the enclosure body, DC_PLUG is the PSU, and
   * REMOTE_PLUG / DC_SOCKET are cable glands. Stripping it by slotKey would have deleted
   * the enclosure, the glands and the power supply. It keeps every slot.
   */
  test('PANEL is exempt — its connector-looking keys are not connectors', () => {
    expect(keysOf('PANEL')).toEqual([
      'DESIGN_ELEMENT', 'REMOTE_SOCKET', 'REMOTE_PLUG', 'DC_SOCKET', 'DC_PLUG',
    ])
    const labels = byId('PANEL').ingredients.map(i => i.slotLabel)
    expect(labels).toContain('PSU Enclosure Body')
    expect(labels).toContain('Remote Driver / PSU')
  })

  test('all ten built-ins are still defined', () => {
    expect(GLOBAL_TEMPLATES.map(t => t.id).sort()).toEqual([...GLOBAL_TEMPLATE_IDS].sort())
  })
})
