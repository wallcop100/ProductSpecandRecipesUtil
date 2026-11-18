import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { setTracing, registerTrace, getTrace, recentTraces, clipTrace, reportTraces, traceIds } from '../../src/utils/trace.js'
import { buildReport, domContext, reportsToMarkdown } from '../../src/utils/bugReports.js'
import { formImpact, readCodes } from '../../src/utils/formImpact.js'
import { buildMaster } from '../../src/utils/productCodes.js'
import { proposalTrace } from '../../src/utils/etSeed.js'

beforeEach(() => setTracing(true))
afterEach(() => setTracing(false))

describe('trace ring', () => {
  test('off (prod): nothing kept, no id', () => {
    setTracing(false)
    expect(registerTrace({ rule: 'x' })).toBeUndefined()
    expect(reportTraces(['t1'])).toBeNull()
  })

  test('the same decision re-rendered keeps its id; a different one gets a new id', () => {
    const a = registerTrace({ rule: 'r', subject: 'A1', result: { k: 1 } })
    expect(registerTrace({ rule: 'r', subject: 'A1', result: { k: 1 } })).toBe(a)
    expect(registerTrace({ rule: 'r', subject: 'A1', result: { k: 2 } })).not.toBe(a)
    expect(getTrace(a)).toMatchObject({ rule: 'r', subject: 'A1' })
  })

  test('keeps the latest 500', () => {
    const first = registerTrace({ rule: 'r', subject: 'first' })
    for (let i = 0; i < 500; i++) registerTrace({ rule: 'r', subject: `s${i}` })
    expect(getTrace(first)).toBeNull()
    expect(recentTraces(1)[0].subject).toBe('s499')
  })

  test('clipTrace cuts long strings and lists, and drops the timestamp', () => {
    const c = clipTrace({ rule: 'r', at: 1, inputs: { s: 'x'.repeat(500), l: Array.from({ length: 20 }, (_, i) => i) } })
    expect(c.at).toBeUndefined()
    expect(c.inputs.s.length).toBe(160)
    expect(c.inputs.l).toHaveLength(9)
    expect(c.inputs.l.at(-1)).toBe('…12 more')
  })

  test('a report keeps to its budget however big the traces', () => {
    const ids = Array.from({ length: 40 }, (_, i) => registerTrace({ rule: 'r', subject: `s${i}`, inputs: { blob: Array.from({ length: 8 }, () => 'y'.repeat(160)) } }))
    expect(JSON.stringify(reportTraces(ids)).length).toBeLessThan(7500)
  })

  test('traceIds joins the ids an element carries, skipping blanks', () => {
    expect(traceIds('t1', undefined, 't2')).toBe('t1 t2')
    expect(traceIds(undefined)).toBeUndefined()
  })
})

describe('reports carry the trace of what was clicked', () => {
  test('domContext collects data-trace up the tree; buildReport attaches them; the Markdown shows them', () => {
    const outer = registerTrace({ rule: 'formImpact', subject: 'A02hw', result: { kind: 'dropNew' } })
    const inner = registerTrace({ rule: 'etFor', subject: 'HNY/31MM', result: { status: 'grey' } })
    document.body.innerHTML = `<div data-trace="${outer}"><div data-trace="${inner}"><button id="b">x</button></div></div>`
    const target = document.getElementById('b')
    expect(domContext(target).traces).toEqual([inner, outer])
    const r = buildReport({ note: 'why?', target, state: {}, screen: 'builder' })
    expect(r.traces.clicked.map(t => t.rule)).toEqual(['etFor', 'formImpact'])
    expect(reportsToMarkdown([r])).toContain('Why (traces)')
  })

  test('no traces (prod): the report has no traces field', () => {
    setTracing(false)
    document.body.innerHTML = '<button id="b">x</button>'
    expect(buildReport({ note: 'n', target: document.getElementById('b'), state: {} }).traces).toBeUndefined()
  })
})

describe('the traces themselves', () => {
  const ps = [{ ElementTypeRef: 'ET-PS-05', Manufacturer: 'Orluna', ProductCode: 'ZH-INFD-27-D-W-NA-AWB-54H (Finish: RAL 9010)' }]
  const row = (pt, rawText) => ({ positionType: pt, formRef: pt, manufacturer: 'Orluna', rawText })
  const pos = (p, ref) => ({ _id: `${p}-${ref}`, PositionTypeRef: p, ContextType: 'PositionType', ContextRef: p, ElementTypeRef: ref, Quantity: 1 })

  test('5642 A02hw before the fix: readCodes says why the old code missed ET-PS-05 (amber, nearest the finished code)', () => {
    const { words } = readCodes(row('A02hw', 'ZH-INFD-27-D-W-NA-AWB-54H'), buildMaster(ps))
    expect(words).toEqual([{ word: 'ZH-INFD-27-D-W-NA-AWB-54H', status: 'amber', ref: 'ET-PS-05', nearest: 'ZH-INFD-27-D-W-NA-AWB-54H (Finish: RAL 9010)' }])
  })

  test('formImpact: each change carries the words of both rows and why it is that kind', () => {
    const [c] = formImpact({ posRef: 'A02hw', master: buildMaster(ps), recipes: [pos('A02hw', 'ET-PS-05')],
      baseRows: [row('A02hw', 'ZH-INFD-27-D-W-NA-AWB-54H')], newRows: [row('A02hw', 'ZH-NEW-1')] })
    expect(c.trace).toMatchObject({ rule: 'formImpact', subject: 'A02hw',
      inputs: { was: 'ZH-INFD-27-D-W-NA-AWB-54H', now: 'ZH-NEW-1', recipeHolds: ['ET-PS-05'] },
      result: { kind: 'respec', fromEt: 'ET-PS-05', toCode: 'ZH-NEW-1', canUpdate: true },
      read: { was: [{ word: 'ZH-INFD-27-D-W-NA-AWB-54H', status: 'green', ref: 'ET-PS-05' }], now: [{ word: 'ZH-NEW-1', status: 'grey' }] } })
    expect(c.read).toBeUndefined()
  })

  test('proposalTrace: what was proposed, why in words, and the deciding fields', () => {
    const t = proposalTrace({ code: 'HNY/31MM', manufacturer: 'Orluna', ref: 'ET-PS-ACCESSORIES-02', family: 'ET-PS-ACCESSORIES', why: 'extra', refFrom: { from: 'family' }, role: 'extra' })
    expect(t).toMatchObject({ rule: 'proposeElementTypes', subject: 'HNY/31MM', result: { ref: 'ET-PS-ACCESSORIES-02', family: 'ET-PS-ACCESSORIES' },
      why: 'extra code in its cell', detail: { role: 'extra' } })
    expect(proposalTrace(null)).toBeNull()
  })
})
