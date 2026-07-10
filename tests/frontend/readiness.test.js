import { describe, test, expect } from 'vitest'
import { readiness, CLAUSE } from '../../src/utils/readiness.js'
import { buildTasks } from '../../src/utils/validationTasks.js'

/**
 * The end state was fully computable and never stated. "Done" means nothing is left for
 * YOU — a fix sitting in a patch script is discharged on your side and outstanding on
 * Excel's, which is exactly why this is not a percentage.
 */
const pt = ref => ({ PositionTypeRef: ref })
const row = posRef => ({ PositionTypeRef: posRef, ElementTypeRef: 'ET-X' })
const noGaps = { specRows: { wrappers: [], products: [] }, dbRows: [] }
const clause = (r, key) => r.clauses.find(c => c.key === key)

const perfect = {
  positionTypes: [pt('C01r')],
  recipes: [row('C01r')],
  formProgress: { total: 1, complete: 1, missing: 0, orphans: 0, pending: 0 },
  tasks: [],
  gaps: noGaps,
}

describe('the four clauses', () => {
  test('a finished project says so', () => {
    const r = readiness(perfect)
    expect(r.done).toBe(true)
    expect(r.clauses.every(c => c.done)).toBe(true)
  })

  test('a position with no recipe is named, not merely counted', () => {
    const r = readiness({ ...perfect, positionTypes: [pt('C01r'), pt('D07')] })
    const c = clause(r, CLAUSE.RECIPES)
    expect(c.done).toBe(false)
    expect(c.refs).toEqual(['D07'])
    expect(c.detail).toMatch(/D07/)
    expect(r.done).toBe(false)
  })

  test('an ignored position is not your problem', () => {
    const r = readiness({
      ...perfect,
      positionTypes: [pt('C01r'), pt('W01')],
      ignoredPosRefs: new Set(['w01']),
    })
    expect(clause(r, CLAUSE.RECIPES).done).toBe(true)
  })

  /**
   * The DesignDB says C01r answers to C01. The recipe lives on C01r, so C01 having none
   * of its own is the ExtRef convention working. Eight of project 5642's "21 positions
   * with no recipe" were exactly this, and reporting them teaches the user to distrust
   * the panel.
   */
  test('a position that delegated its recipe via ExtRef is not missing one', () => {
    const r = readiness({
      ...perfect,
      positionTypes: [{ PositionTypeRef: 'C01' }, { PositionTypeRef: 'C01r', ExtRef: 'C01' }],
      recipes: [row('C01r')],
    })
    const c = clause(r, CLAUSE.RECIPES)
    expect(c.done).toBe(true)
    expect(c.refs).toEqual([])
    expect(c.detail).toMatch(/All 1 positions/)
  })

  test('but the twin that OWNS the recipe is still checked', () => {
    const r = readiness({
      ...perfect,
      positionTypes: [{ PositionTypeRef: 'C01' }, { PositionTypeRef: 'C01r', ExtRef: 'C01' }],
      recipes: [],
    })
    expect(clause(r, CLAUSE.RECIPES).refs).toEqual(['C01r'])
  })

  test('a Form product still needing an ElementType counts against you', () => {
    const r = readiness({ ...perfect, formProgress: { total: 1, complete: 0, missing: 0, orphans: 0, pending: 2 } })
    const c = clause(r, CLAUSE.FORM)
    expect(c.done).toBe(false)
    expect(c.remaining).toBe(2)
    expect(c.detail).toMatch(/still need an ElementType/)
  })

  test('no Form attached is "not applicable", never a silent pass', () => {
    const r = readiness({ ...perfect, formProgress: null })
    const c = clause(r, CLAUSE.FORM)
    expect(c.notApplicable).toBe(true)
    expect(c.done).toBe(false)
    expect(r.done).toBe(true)      // the other three carry it
  })
})

describe('blocking vs advisory', () => {
  test('an advisory task does not stop you shipping', () => {
    const tasks = buildTasks([{ rule: 'MISSING_PRODUCT_CODE', ref: 'ET-A', severity: 'warning', message: '' }])
    const r = readiness({ ...perfect, tasks })
    expect(clause(r, CLAUSE.VALIDATION).done).toBe(true)
    expect(r.blocking).toBe(0)
  })

  test('a blocking task does', () => {
    const tasks = buildTasks([{ rule: 'BLANK_RECIPE_CONTAINER', ref: 'C01r', severity: 'error', message: '' }])
    const r = readiness({ ...perfect, tasks })
    expect(clause(r, CLAUSE.VALIDATION).done).toBe(false)
    expect(r.blocking).toBe(1)
    expect(r.done).toBe(false)
  })
})

describe('queued is done on your side', () => {
  const gaps = { specRows: { wrappers: [], products: [] }, dbRows: [{ ref: 'ET-PS-01' }] }

  test('an unqueued master gap is your work', () => {
    const tasks = buildTasks([{ rule: 'ELEMENT_TYPE_NOT_IN_DB', ref: 'ET-PS-01', severity: 'error', message: '' }])
    const r = readiness({ ...perfect, gaps, tasks })
    const c = clause(r, CLAUSE.ALIGNMENT)
    expect(c.done).toBe(false)
    expect(c.queued).toBe(false)
    expect(r.done).toBe(false)
  })

  test('once queued, the clause is discharged and the project reads done', () => {
    const tasks = buildTasks(
      [{ rule: 'ELEMENT_TYPE_NOT_IN_DB', ref: 'ET-PS-01', severity: 'error', message: '' }],
      { dbChanges: [{ elementTypeRef: 'ET-PS-01' }] }
    )
    const r = readiness({ ...perfect, gaps, tasks })
    const c = clause(r, CLAUSE.ALIGNMENT)
    expect(c.done).toBe(false)          // Excel still does not know
    expect(c.queued).toBe(true)         // but you have done your part
    expect(c.detail).toMatch(/paste it in Excel/)
    expect(r.done).toBe(true)
    expect(r.waiting).toBe(1)
  })

  test('a queued master gap does not excuse a missing spec row', () => {
    const tasks = buildTasks(
      [{ rule: 'ELEMENT_TYPE_NOT_IN_DB', ref: 'ET-PS-01', severity: 'error', message: '' }],
      { dbChanges: [{ elementTypeRef: 'ET-PS-01' }] }
    )
    const withSpecGap = { specRows: { wrappers: [], products: [{ ref: 'ET-Y' }] }, dbRows: [{ ref: 'ET-PS-01' }] }
    const r = readiness({ ...perfect, gaps: withSpecGap, tasks })
    expect(clause(r, CLAUSE.ALIGNMENT).queued).toBe(false)
    expect(r.done).toBe(false)
  })
})

describe('an empty project is not a finished one', () => {
  test('no positions means nothing is done', () => {
    const r = readiness({ positionTypes: [], recipes: [], tasks: [], gaps: noGaps })
    expect(clause(r, CLAUSE.RECIPES).done).toBe(false)
    expect(r.done).toBe(false)
  })
})
