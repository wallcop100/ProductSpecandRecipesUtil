import { describe, test, expect } from 'vitest'
import {
  conditionMatches, ruleMatches, ruleConditions, migrateRule, migrateRules,
  evaluateTags, effectiveTags, columnsUsedByRules, computeTagDrift, TAG_OPS,
} from '../../src/utils/tagRules.js'

const pt = (over = {}) => ({
  PositionTypeRef: 'DL-LOCAL-01', DriverLocation: 'Local', ControlTypeRef: 'DALI',
  SecondaryPowerNodes_ve: '2', SortOrder: '30', ExtRef: '', ...over,
})

describe('conditionMatches — every operator', () => {
  const P = pt()
  const cases = [
    [{ column: 'DriverLocation', op: 'equals', value: 'Local' }, true],
    [{ column: 'DriverLocation', op: 'equals', value: 'Remote' }, false],
    [{ column: 'DriverLocation', op: 'notEquals', value: 'Remote' }, true],
    [{ column: 'DriverLocation', op: 'notEquals', value: 'Local' }, false],
    [{ column: 'PositionTypeRef', op: 'contains', value: 'LOCAL' }, true],   // case-insensitive
    [{ column: 'PositionTypeRef', op: 'contains', value: 'REMOTE' }, false],
    [{ column: 'PositionTypeRef', op: 'notContains', value: 'REMOTE' }, true],
    [{ column: 'PositionTypeRef', op: 'startsWith', value: 'DL' }, true],
    [{ column: 'PositionTypeRef', op: 'startsWith', value: '01' }, false],
    [{ column: 'ExtRef', op: 'isEmpty' }, true],
    [{ column: 'DriverLocation', op: 'isEmpty' }, false],
    [{ column: 'DriverLocation', op: 'isNotEmpty' }, true],
    [{ column: 'ExtRef', op: 'isNotEmpty' }, false],
    [{ column: 'SortOrder', op: 'gt', value: '20' }, true],
    [{ column: 'SortOrder', op: 'gt', value: '40' }, false],
    [{ column: 'SortOrder', op: 'lt', value: '40' }, true],
    [{ column: 'SortOrder', op: 'between', value: '20,40' }, true],
    [{ column: 'SortOrder', op: 'between', value: '40,20' }, true],   // order-independent
    [{ column: 'SortOrder', op: 'between', value: '5,10' }, false],
  ]
  for (const [cond, want] of cases) {
    test(`${cond.column} ${cond.op} ${cond.value ?? ''} → ${want}`, () => {
      expect(conditionMatches(cond, P)).toBe(want)
    })
  }

  test('a numeric op on a non-numeric field never matches', () => {
    expect(conditionMatches({ column: 'DriverLocation', op: 'gt', value: '1' }, P)).toBe(false)
  })

  test('an unknown operator never matches', () => {
    expect(conditionMatches({ column: 'DriverLocation', op: 'regex', value: '.*' }, P)).toBe(false)
  })

  test('a condition with no column never matches', () => {
    expect(conditionMatches({ op: 'isEmpty' }, P)).toBe(false)
  })
})

describe('ruleMatches — AND within a rule, OR when told', () => {
  const rule = (over = {}) => ({
    id: 'r1', tag: 'DL-Local-DALI', enabled: true, match: 'all',
    conditions: [
      { column: 'PositionTypeRef', op: 'contains', value: 'DL' },
      { column: 'DriverLocation', op: 'equals', value: 'Local' },
      { column: 'ControlTypeRef', op: 'equals', value: 'DALI' },
    ], ...over,
  })

  test('match all: every condition must hold (the X AND Y AND Z case)', () => {
    expect(ruleMatches(rule(), pt())).toBe(true)
    expect(ruleMatches(rule(), pt({ ControlTypeRef: 'TW' }))).toBe(false)   // one fails → no match
    expect(ruleMatches(rule(), pt({ DriverLocation: 'Remote' }))).toBe(false)
  })

  test('match any: one condition is enough', () => {
    const r = rule({ match: 'any' })
    expect(ruleMatches(r, pt({ DriverLocation: 'Remote', ControlTypeRef: 'TW' }))).toBe(true)  // ref still contains DL
    expect(ruleMatches(r, pt({ PositionTypeRef: 'X', DriverLocation: 'Remote', ControlTypeRef: 'TW' }))).toBe(false)
  })

  test('a disabled rule never matches', () => {
    expect(ruleMatches(rule({ enabled: false }), pt())).toBe(false)
  })

  test('a rule with no tag, or no conditions, never matches', () => {
    expect(ruleMatches(rule({ tag: '' }), pt())).toBe(false)
    expect(ruleMatches(rule({ conditions: [] }), pt())).toBe(false)
  })

  test('a multi-condition rule with no explicit match defaults to AND', () => {
    const r = { tag: 'T', conditions: [
      { column: 'DriverLocation', op: 'equals', value: 'Local' },
      { column: 'ControlTypeRef', op: 'equals', value: 'DALI' },
    ] }
    expect(ruleMatches(r, pt())).toBe(true)
    expect(ruleMatches(r, pt({ ControlTypeRef: 'TW' }))).toBe(false)
  })
})

describe('migration from the legacy single-condition shape', () => {
  test('an old rule becomes a one-condition AND rule', () => {
    const m = migrateRule({ id: 'r1', column: 'DriverLocation', op: 'equals', value: 'Local', tag: 'Local' })
    expect(m).toMatchObject({
      id: 'r1', tag: 'Local', match: 'all', enabled: true,
      conditions: [{ column: 'DriverLocation', op: 'equals', value: 'Local' }],
    })
    expect(m.column).toBeUndefined()
  })

  test('the migrated rule matches exactly what the old one did', () => {
    const legacy = { column: 'PositionTypeRef', op: 'contains', value: 'LIN', tag: 'LIN' }
    expect(ruleMatches(migrateRule(legacy), pt({ PositionTypeRef: 'LIN-01' }))).toBe(true)
    expect(ruleMatches(migrateRule(legacy), pt({ PositionTypeRef: 'DL-01' }))).toBe(false)
  })

  test('migration is idempotent — a conditional rule passes through unchanged', () => {
    const r = { id: 'r', tag: 'T', match: 'any', enabled: true, conditions: [{ column: 'A', op: 'equals', value: 'x' }] }
    expect(migrateRule(r)).toEqual(r)
  })

  test('an old rule with no column migrates to an empty (never-matching) rule', () => {
    expect(migrateRule({ tag: 'T' }).conditions).toEqual([])
  })

  test('ruleConditions reads either shape', () => {
    expect(ruleConditions({ column: 'A', op: 'contains', value: 'x' })).toEqual([{ column: 'A', op: 'contains', value: 'x' }])
    expect(ruleConditions({ conditions: [{ column: 'B' }] })).toEqual([{ column: 'B' }])
  })
})

describe('evaluateTags — rules union (OR across rules)', () => {
  const rules = [
    { tag: 'Local', match: 'all', conditions: [{ column: 'DriverLocation', op: 'equals', value: 'Local' }] },
    { tag: 'DALI', match: 'all', conditions: [{ column: 'ControlTypeRef', op: 'equals', value: 'DALI' }] },
    { tag: 'Both', match: 'all', conditions: [
      { column: 'DriverLocation', op: 'equals', value: 'Local' },
      { column: 'ControlTypeRef', op: 'equals', value: 'DALI' },
    ] },
  ]
  test('a position gets every tag whose rule matches', () => {
    expect(evaluateTags(pt(), rules)).toEqual(['Local', 'DALI', 'Both'])
  })
  test('legacy rules still evaluate', () => {
    expect(evaluateTags(pt(), [{ column: 'DriverLocation', op: 'equals', value: 'Local', tag: 'L' }])).toEqual(['L'])
  })
  test('the same tag from two rules appears once', () => {
    const dup = [
      { tag: 'X', conditions: [{ column: 'DriverLocation', op: 'equals', value: 'Local' }] },
      { tag: 'X', conditions: [{ column: 'ControlTypeRef', op: 'equals', value: 'DALI' }] },
    ]
    expect(evaluateTags(pt(), dup)).toEqual(['X'])
  })
})

describe('columnsUsedByRules walks conditions (drift depends on it)', () => {
  test('collects every condition column across all rules', () => {
    const rules = [
      { tag: 'A', conditions: [{ column: 'DriverLocation' }, { column: 'ControlTypeRef' }] },
      { tag: 'B', conditions: [{ column: 'SortOrder' }] },
      { column: 'ExtRef', op: 'isEmpty', tag: 'C' },   // legacy shape counted too
    ]
    expect(columnsUsedByRules(rules).sort()).toEqual(['ControlTypeRef', 'DriverLocation', 'ExtRef', 'SortOrder'])
  })

  test('drift fires when a watched condition column changes', () => {
    const rules = [{ tag: 'Local', conditions: [{ column: 'DriverLocation', op: 'equals', value: 'Local' }] }]
    const positions = [pt()]
    const { newBaselines } = computeTagDrift(positions, rules, {})
    const snap = newBaselines['DL-LOCAL-01']
    const moved = [pt({ DriverLocation: 'Remote' })]
    const { drift } = computeTagDrift(moved, rules, { 'DL-LOCAL-01': snap })
    expect(drift['DL-LOCAL-01'].changedFields).toEqual([{ column: 'DriverLocation', from: 'Local', to: 'Remote' }])
    expect(drift['DL-LOCAL-01'].tagsAfter).toEqual([])
  })
})

describe('TAG_OPS metadata', () => {
  test('value-less ops are flagged so the UI can hide the value box', () => {
    expect(TAG_OPS.find(o => o.op === 'isEmpty').needsValue).toBe(false)
    expect(TAG_OPS.find(o => o.op === 'equals').needsValue).toBe(true)
  })
  test('numeric ops are flagged', () => {
    expect(TAG_OPS.find(o => o.op === 'between').numeric).toBe(true)
    expect(TAG_OPS.find(o => o.op === 'between').twoValues).toBe(true)
  })
})
