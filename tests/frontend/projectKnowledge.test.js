import { describe, it, expect, vi } from 'vitest'
import {
  assignmentKey, colleagueHint, pendingRules, separatedByColleagues, shareDecisions,
} from '../../src/screens/import/useProjectKnowledge'
import { groupKey } from '../../src/utils/productCodes'

const know = (items = [], dialect = []) => {
  const byKind = { assignment: new Map(), 'local-et': new Map(), rule: [], pair: new Map() }
  for (const it of items) {
    if (it.kind === 'rule') byKind.rule.push(it)
    else byKind[it.kind].set(it.kind === 'local-et' ? it.key.toUpperCase() : it.key, it)
  }
  return { active: true, byKind, dialect, report: vi.fn() }
}

describe('colleagueHint', () => {
  const entry = { text: 'dl0560', manufacturers: ['Acme'], etRef: null }
  it('offers what a colleague chose, usable when the project knows the ref', () => {
    const k = know([{ id: 1, kind: 'assignment', key: assignmentKey('DL0560', 'acme'), value: { ref: 'ET-DL-01' } }])
    expect(colleagueHint(k, entry, new Set(['ET-DL-01']))).toMatchObject({ ref: 'ET-DL-01', usable: true })
    expect(colleagueHint(k, entry, new Set())).toMatchObject({ usable: false })
  })
  it('is usable through a colleague\'s local ElementType', () => {
    const k = know([
      { id: 1, kind: 'assignment', key: assignmentKey('DL0560', 'Acme'), value: { ref: 'ET-NEW-01' } },
      { id: 2, kind: 'local-et', key: 'et-new-01', value: { family: 'ET-NEW' } },
    ])
    expect(colleagueHint(k, entry, new Set())).toMatchObject({ usable: true, local: { id: 2 } })
  })
  it('says nothing once the code has an ElementType, or without knowledge', () => {
    expect(colleagueHint(know(), { ...entry, etRef: 'X' }, new Set())).toBeNull()
    expect(colleagueHint({ active: false }, entry, new Set())).toBeNull()
  })
})

describe('pendingRules', () => {
  it('offers rules this batch lacks, project ones before dialect', () => {
    const k = know([{ id: 1, kind: 'rule', key: 'Tape', value: { role: 'note' } }],
      [{ token: 'tape', role: 'code', projects: 3 }, { token: 'clip', role: 'note', projects: 2 }])
    expect(pendingRules(k, { clip: 'note' })).toEqual([{ token: 'tape', role: 'note', item: expect.objectContaining({ id: 1 }) }])
  })
})

describe('separatedByColleagues', () => {
  it('finds near-miss groups a colleague kept apart', () => {
    const g = [{ text: 'A1' }, { text: 'A1-EM' }]
    const k = know([{ id: 1, kind: 'pair', key: groupKey(g), value: { verdict: 'different' } }])
    expect(separatedByColleagues(k, [g], new Set())).toEqual([g])
    expect(separatedByColleagues(k, [g], new Set([groupKey(g)]))).toEqual([])
  })
})

describe('shareDecisions', () => {
  it('sends assignments, rules, pairs and local ElementTypes for the project', async () => {
    const shareProjectItems = vi.fn(async () => ({ stored: 5 }))
    await shareDecisions({ shareProjectItems }, '4343', {
      entries: [{ text: 'C1', manufacturers: ['Acme'], etRef: 'ET-1' }, { text: 'TBC (J3)', placeholder: {}, etRef: 'ET-2' }],
      rules: { tape: 'note' }, keptSeparate: new Set(['A|B']), merged: new Set(['C|D']),
      localEts: [{ ref: 'ET-1', family: 'ET-F' }],
    })
    const [n, items] = shareProjectItems.mock.calls[0]
    expect(n).toBe('4343')
    expect(items.map(i => `${i.kind}:${i.key}`)).toEqual(['assignment:ACME|C1', 'rule:tape', 'pair:A|B', 'pair:C|D', 'local-et:ET-1'])
  })
  it('sends nothing without a project number', async () => {
    const shareProjectItems = vi.fn()
    expect(await shareDecisions({ shareProjectItems }, '', { rules: { a: 'note' } })).toBeNull()
    expect(shareProjectItems).not.toHaveBeenCalled()
  })
})
