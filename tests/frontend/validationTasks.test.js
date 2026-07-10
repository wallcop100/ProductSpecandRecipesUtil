import { describe, test, expect } from 'vitest'
import { buildTasks, taskSummary, queuedRefs, BLOCKING_RULES } from '../../src/utils/validationTasks.js'

const issue = (rule, ref, severity = 'error', extra = {}) => ({ rule, ref, severity, message: `${rule} on ${ref}`, ...extra })

describe('group by action', () => {
  test('45 NOT_IN_DB issues become one task with 45 items', () => {
    const issues = Array.from({ length: 45 }, (_, i) => issue('ELEMENT_TYPE_NOT_IN_DB', `ET-${i}`))
    const tasks = buildTasks(issues)
    expect(tasks).toHaveLength(1)
    expect(tasks[0].key).toBe('teachMaster')
    expect(tasks[0].count).toBe(45)
    expect(tasks[0].action).toBe('queueMissingDbRows')
  })

  test('a wrapper and a real product are different tasks — one is a click, one is not', () => {
    const tasks = buildTasks([
      issue('MISSING_PRODUCT_SPEC_ROW', 'ET-LIN-01', 'warning'),
      issue('MISSING_PRODUCT_SPEC_ROW', 'ET-PROF-01', 'error'),
    ])
    const keys = tasks.map(t => t.key).sort()
    expect(keys).toEqual(['completeWrappers', 'specifyProducts'])
    expect(tasks.find(t => t.key === 'completeWrappers').action).toBe('fillWrapperSpecRows')
    expect(tasks.find(t => t.key === 'specifyProducts').action).toBeNull()   // never bulk
  })

  test('recipe rules get one task per rule, fixed by visiting the position', () => {
    const tasks = buildTasks([issue('MISSING_IS_DESIGN', 'C01r'), issue('MISSING_IS_DESIGN', 'C03r')])
    expect(tasks).toHaveLength(1)
    expect(tasks[0].key).toBe('rule:MISSING_IS_DESIGN')
    expect(tasks[0].count).toBe(2)
  })
})

describe('one action, one row', () => {
  /**
   * A wrapper with no spec row is ALSO absent from the master. fillWrapperSpecRows()
   * appends the spec row and queues the DesignDB row, so it is one task.
   */
  test('a wrapper trips two rules and appears once', () => {
    const tasks = buildTasks([
      issue('MISSING_PRODUCT_SPEC_ROW', 'ET-LIN-01', 'warning'),
      issue('ELEMENT_TYPE_NOT_IN_DB', 'ET-LIN-01'),
    ])
    expect(tasks).toHaveLength(1)
    expect(tasks[0].key).toBe('completeWrappers')
    expect(tasks[0].count).toBe(1)
  })

  test('but two DIFFERENT actions on one ref stay two rows — that is honest', () => {
    // ET-DL-01 has a spec row with no product code, AND is not in the master.
    // Adding a code does not teach the master; teaching the master adds no code.
    const tasks = buildTasks([
      issue('MISSING_PRODUCT_CODE', 'ET-DL-01', 'warning'),
      issue('ELEMENT_TYPE_NOT_IN_DB', 'ET-DL-01'),
    ])
    expect(tasks.map(t => t.key).sort()).toEqual(['completeSpecRows', 'teachMaster'])
  })

  test('absorption is case-insensitive', () => {
    const tasks = buildTasks([
      issue('MISSING_PRODUCT_SPEC_ROW', 'ET-LIN-01', 'warning'),
      issue('ELEMENT_TYPE_NOT_IN_DB', 'et-lin-01'),
    ])
    expect(tasks).toHaveLength(1)
  })
})

describe('queued is neither broken nor fixed', () => {
  test('a NOT_IN_DB ref sitting in dbChanges is queued', () => {
    const tasks = buildTasks(
      [issue('ELEMENT_TYPE_NOT_IN_DB', 'ET-PS-01')],
      { dbChanges: [{ elementTypeRef: 'ET-PS-01' }] }
    )
    expect(tasks[0].items[0].queued).toBe(true)
    expect(tasks[0].queued).toBe(true)
  })

  test('a task is only queued when EVERY item is', () => {
    const tasks = buildTasks(
      [issue('ELEMENT_TYPE_NOT_IN_DB', 'ET-A'), issue('ELEMENT_TYPE_NOT_IN_DB', 'ET-B')],
      { dbChanges: [{ elementTypeRef: 'ET-A' }] }
    )
    expect(tasks[0].queued).toBe(false)
    expect(tasks[0].items.filter(i => i.queued)).toHaveLength(1)
  })

  test('a queued task sinks below the open ones', () => {
    const tasks = buildTasks(
      [issue('ELEMENT_TYPE_NOT_IN_DB', 'ET-A'), issue('MISSING_PRODUCT_CODE', 'ET-B', 'warning')],
      { dbChanges: [{ elementTypeRef: 'ET-A' }] }
    )
    expect(tasks[tasks.length - 1].key).toBe('teachMaster')
  })

  test('queuedRefs reads all three queues', () => {
    const q = queuedRefs({
      psChanges: [{ elementTypeRef: 'ET-P' }],
      rsChanges: [{ positionTypeRef: 'C01r' }],
      dbChanges: [{ elementTypeRef: 'ET-D' }],
    })
    expect(q.ps.has('et-p')).toBe(true)
    expect(q.rs.has('c01r')).toBe(true)
    expect(q.db.has('et-d')).toBe(true)
  })
})

describe('severity is honest', () => {
  test('blocking rules are the ones that ship a wrong spreadsheet', () => {
    expect(BLOCKING_RULES.has('BLANK_RECIPE_CONTAINER')).toBe(true)
    expect(BLOCKING_RULES.has('ELEMENT_TYPE_NOT_IN_DB')).toBe(true)
    expect(BLOCKING_RULES.has('MISSING_IS_DESIGN')).toBe(true)
    expect(BLOCKING_RULES.has('DUPLICATE_IS_DESIGN')).toBe(true)
  })

  test('a missing product code is advisory, not blocking', () => {
    expect(BLOCKING_RULES.has('MISSING_PRODUCT_CODE')).toBe(false)
    const tasks = buildTasks([issue('MISSING_PRODUCT_CODE', 'ET-A', 'warning')])
    expect(tasks[0].blocking).toBe(false)
  })

  test('blocking tasks sort first', () => {
    const tasks = buildTasks([
      issue('MISSING_PRODUCT_CODE', 'ET-A', 'warning'),
      issue('BLANK_RECIPE_CONTAINER', 'C01r'),
    ])
    expect(tasks[0].blocking).toBe(true)
  })
})

describe('taskSummary', () => {
  test('counts what is open, what blocks, and what is waiting on Excel', () => {
    const tasks = buildTasks(
      [issue('ELEMENT_TYPE_NOT_IN_DB', 'ET-A'), issue('BLANK_RECIPE_CONTAINER', 'C01r'), issue('MISSING_PRODUCT_CODE', 'ET-B', 'warning')],
      { dbChanges: [{ elementTypeRef: 'ET-A' }] }
    )
    const s = taskSummary(tasks)
    expect(s.tasks).toBe(3)
    expect(s.queued).toBe(1)
    expect(s.open).toBe(2)
    expect(s.blocking).toBe(1)     // BLANK_RECIPE_CONTAINER; the queued one no longer counts
    expect(s.issues).toBe(3)
  })

  test('nothing to do', () => {
    expect(taskSummary(buildTasks([]))).toMatchObject({ tasks: 0, open: 0, blocking: 0, issues: 0 })
  })
})
