import { describe, test, expect } from 'vitest'
import {
  uniqueConfigName, groupProjects, adoptPlan, pickCanonical, holdsWork, UNASSIGNED,
} from '../../src/utils/projectIdentity'

const p = (id, over = {}) => ({
  id, config_name: 'Base', project_number: '5642', last_opened: '2026-07-01T00:00:00Z',
  unexported: 0, taggedPositions: 0, overlayRows: 0, ...over,
})

/**
 * Picking a folder used to mint a fresh handle id every time, so re-picking a project you
 * already had forked a second, EMPTY copy of it — and your tags, templates and unexported
 * changes appeared to have vanished. They were on the old row. This is the pure half of
 * recognising that and putting it back together.
 */
describe('uniqueConfigName — the UNIQUE(folder_path, config_name) guard', () => {
  test('a free name is used as-is', () => {
    expect(uniqueConfigName(['Base'], 'Phase 2')).toBe('Phase 2')
  })

  test('a taken name gets a counter, so the re-key cannot violate the constraint', () => {
    expect(uniqueConfigName(['Base'], 'Base')).toBe('Base (2)')
    expect(uniqueConfigName(['Base', 'Base (2)'], 'Base')).toBe('Base (3)')
  })

  test('it is case- and space-insensitive — the DB constraint is not fooled, and neither are we', () => {
    expect(uniqueConfigName(['base'], '  Base  ')).toBe('Base (2)')
  })

  test('an empty name falls back to Base, like everything else', () => {
    expect(uniqueConfigName([], '')).toBe('Base')
    expect(uniqueConfigName(['Base'], '')).toBe('Base (2)')
  })
})

describe('groupProjects', () => {
  test('configs of one job sit together, newest first', () => {
    const [g] = groupProjects([
      p(1, { config_name: 'Base', last_opened: '2026-07-01T00:00:00Z' }),
      p(2, { config_name: 'Phase 2', last_opened: '2026-07-09T00:00:00Z' }),
    ])
    expect(g.number).toBe('5642')
    expect(g.projects.map(x => x.config_name)).toEqual(['Phase 2', 'Base'])
  })

  test('the job you touched last comes first — you came back for a reason', () => {
    const groups = groupProjects([
      p(1, { project_number: '5642', last_opened: '2026-01-01T00:00:00Z' }),
      p(2, { project_number: '7101', last_opened: '2026-07-09T00:00:00Z' }),
    ])
    expect(groups.map(g => g.number)).toEqual(['7101', '5642'])
  })

  test('a project whose filename yielded no number is last, not a category of its own', () => {
    const groups = groupProjects([
      p(1, { project_number: null, last_opened: '2026-07-09T00:00:00Z' }),
      p(2, { project_number: '5642', last_opened: '2026-01-01T00:00:00Z' }),
    ])
    expect(groups.map(g => g.number)).toEqual(['5642', UNASSIGNED])
  })
})

describe('holdsWork / pickCanonical', () => {
  test('unexported changes are work; an untouched copy is not', () => {
    expect(holdsWork(p(1, { unexported: 3 }))).toBe(true)
    expect(holdsWork(p(1, { taggedPositions: 12 }))).toBe(true)
    expect(holdsWork(p(1))).toBe(false)
  })

  test('the row with the most work wins — losing a rename annoys, losing changes destroys', () => {
    const real = p(1, { unexported: 3, last_opened: '2026-01-01T00:00:00Z' })
    const empty = p(2, { last_opened: '2026-07-09T00:00:00Z' })   // newer, but empty
    expect(pickCanonical([empty, real]).id).toBe(1)
  })
})

describe('adoptPlan — collapse duplicates without ever merging an overlay', () => {
  /**
   * The usual case: the bug minted an EMPTY second copy. There is nothing in it to keep.
   */
  test('an empty stray is deleted', () => {
    const plan = adoptPlan(p(1, { unexported: 3 }), [p(2)])
    expect(plan).toEqual([{ id: 2, action: 'delete', configName: 'Base' }])
  })

  /**
   * A stray that HOLDS work is re-keyed, not merged. Every overlay table hangs off
   * project_id, not folder_path — so moving the row carries its tags, templates and
   * unexported changes with it, and it becomes another CONFIG of the one project.
   */
  test('a stray holding work is re-keyed onto a free config name, never merged', () => {
    const plan = adoptPlan(p(1, { config_name: 'Base' }), [p(2, { config_name: 'Base', unexported: 2 })])
    expect(plan).toEqual([{ id: 2, action: 'rekey', configName: 'Base (2)' }])
  })

  test('two strays holding work never collide with each other', () => {
    const plan = adoptPlan(
      p(1, { config_name: 'Base' }),
      [p(2, { config_name: 'Base', unexported: 1 }), p(3, { config_name: 'Base', taggedPositions: 5 })],
    )
    expect(plan.map(x => x.configName)).toEqual(['Base (2)', 'Base (3)'])
    expect(plan.every(x => x.action === 'rekey')).toBe(true)
  })

  test('a stray with its own name keeps it when it is free', () => {
    const plan = adoptPlan(p(1, { config_name: 'Base' }), [p(2, { config_name: 'Phase 2', unexported: 1 })])
    expect(plan).toEqual([{ id: 2, action: 'rekey', configName: 'Phase 2' }])
  })

  test('the canonical row is never in its own plan', () => {
    expect(adoptPlan(p(1), [p(1)])).toEqual([])
    expect(adoptPlan(null, [p(2)])).toEqual([])
  })

  /** No branch may ever propose combining two overlays. */
  test('no action other than rekey or delete is ever proposed', () => {
    const plan = adoptPlan(p(1), [p(2, { unexported: 9 }), p(3)])
    expect(plan.every(x => x.action === 'rekey' || x.action === 'delete')).toBe(true)
  })
})
