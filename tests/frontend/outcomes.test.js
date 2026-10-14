import { describe, it, expect, beforeEach, vi } from 'vitest'
import { noteSupplied, settle, outcomeOf, shareOutcomes, learnedInView, forgetSupplied, resetOutcomes } from '../../src/platform/outcomes'

describe('what became of learned defaults', () => {
  beforeEach(() => resetOutcomes())

  it('compares as the app does', () => {
    expect(outcomeOf('ET-PS-01', 'et-ps-01 ')).toBe('kept')
    expect(outcomeOf('ET-PS-01', 'ET-PS-02')).toBe('changed')
    expect(outcomeOf('ET-PS-01', null)).toBe('cleared')
    expect(outcomeOf('ET-PS-01', '')).toBe('cleared')
  })

  it('keeps the first value supplied and settles only what is being decided', () => {
    noteSupplied({ kind: 'assignment', key: 'ACME|C1', tier: 'project', value: 'ET-1', code: 'C1' })
    noteSupplied({ kind: 'assignment', key: 'ACME|C1', tier: 'project', value: 'ET-9', code: 'C1' })
    noteSupplied({ kind: 'assignment', key: 'ACME|C2', tier: 'project', value: 'ET-2', code: 'C2' })
    const finals = new Map([['ACME|C1', 'ET-5']])
    const rows = settle('4343', 'assignment', k => (finals.has(k) ? finals.get(k) : undefined))
    expect(rows).toEqual([{ kind: 'assignment', key: 'ACME|C1', tier: 'project', source: '', supplied: 'ET-1', final: 'ET-5', outcome: 'changed' }])
  })

  it('sends a key again only when its outcome changes', () => {
    noteSupplied({ kind: 'rule', key: 'tape', tier: 'dialect', value: 'note' })
    expect(settle('1', 'rule', () => 'note')).toHaveLength(1)
    expect(settle('1', 'rule', () => 'note')).toHaveLength(0)
    expect(settle('1', 'rule', () => null)[0].outcome).toBe('cleared')
    expect(settle('2', 'rule', () => 'note')).toHaveLength(1)
  })

  it('is inert without the feature', async () => {
    expect(await shareOutcomes(null, '1', [{}])).toBe(0)
    expect(await shareOutcomes({ shareOutcomes: null }, '1', [{}])).toBe(0)
    const api = { shareOutcomes: vi.fn(async () => ({ stored: 1 })) }
    expect(await shareOutcomes(api, ' 4343 ', [{ kind: 'rule' }])).toBe(1)
    expect(api.shareOutcomes).toHaveBeenCalledWith('4343', [{ kind: 'rule' }])
    expect(await shareOutcomes(api, '4343', [])).toBe(0)
  })

  it('says which learned values are behind a code in view', () => {
    noteSupplied({ kind: 'family', key: 'ACME|C1', tier: 'library', source: '5642', value: 'ET-DL', code: 'C1' })
    noteSupplied({ kind: 'assignment', key: 'ACME|C2', tier: 'project', value: 'ET-PS-02', code: 'C2' })
    expect(learnedInView(['c1'])).toEqual([{ kind: 'family', key: 'ACME|C1', value: 'ET-DL', tier: 'library', source: '5642' }])
    expect(learnedInView([null, 'ET-PS-02']).map(x => x.key)).toEqual(['ACME|C2'])
    expect(learnedInView([])).toEqual([])
    forgetSupplied()
    expect(learnedInView(['C1'])).toEqual([])
  })
})
