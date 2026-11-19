import { describe, it, expect, vi } from 'vitest'
import {
  assignmentKey, digest, learnedRef, shareDecisions, offerAssignments, orderLibrary,
} from '../../src/screens/import/useProjectKnowledge'

const know = (items = [], dialect = []) => ({ ready: true, ...digest({ items, dialect }) })
const entry = { text: 'dl0560', manufacturers: ['Acme'], etRef: null }

describe('learned defaults', () => {
  it('a learned ref stands only when the project can resolve it', () => {
    const k = know([{ kind: 'assignment', key: assignmentKey('DL0560', 'acme'), value: { ref: 'ET-DL-01' } }])
    expect(learnedRef(k, entry, new Set(['ET-DL-01']))).toBe('ET-DL-01')
    expect(learnedRef(k, entry, new Set())).toBeNull()
  })
  it('is inert until knowledge arrives', () => {
    expect(learnedRef({ ready: false }, entry, new Set(['X']))).toBeNull()
  })
  it('project rules beat cross-project dialect; separate pairs are kept', () => {
    const k = know([{ kind: 'rule', key: 'Tape', value: { role: 'note' } },
      { kind: 'pair', key: 'A|B', value: { verdict: 'different' } },
      { kind: 'pair', key: 'C|D', value: { verdict: 'same' } }],
    [{ token: 'tape', role: 'code' }, { token: 'clip', role: 'note' }])
    expect(k.rules).toEqual({ tape: 'note', clip: 'note' })
    expect(k.separate).toEqual(['A|B'])
  })
  it('the person\'s own rules win when seeded (spread order used by the import)', () => {
    const k = know([{ kind: 'rule', key: 'tape', value: { role: 'note' } }])
    expect({ ...k.rules, ...{ tape: 'code' } }).toEqual({ tape: 'code' })
  })
})

describe('learning from the session', () => {
  it('sends assignments, rules and pairs, never an ElementType made here and not exported', async () => {
    const shareProjectItems = vi.fn(async () => ({ stored: 5 }))
    await shareDecisions({ shareProjectItems }, '4343', {
      entries: [{ text: 'C1', manufacturers: ['Acme'], etRef: 'ET-1' }, { text: 'TBC (J3)', placeholder: {}, etRef: 'ET-2' },
        { text: 'C3', manufacturers: ['Acme'], etRef: 'ET-PS-22' }],
      rules: { tape: 'note' }, keptSeparate: new Set(['A|B']), merged: new Set(['C|D']),
      localEts: [{ ref: 'et-ps-22', family: 'ET-PS' }],
    })
    const [n, items] = shareProjectItems.mock.calls[0]
    expect(n).toBe('4343')
    expect(items.map(i => `${i.kind}:${i.key}`)).toEqual(['assignment:ACME|C1', 'rule:tape', 'pair:A|B', 'pair:C|D'])
  })
  it('sends nothing without a project number', async () => {
    const shareProjectItems = vi.fn()
    expect(await shareDecisions({ shareProjectItems }, '', { rules: { a: 'note' } })).toBeNull()
    expect(shareProjectItems).not.toHaveBeenCalled()
  })
  it('offers single-maker ElementType decisions once, with their family', async () => {
    const contribute = vi.fn(async () => true)
    const entries = [
      { text: 'C1', manufacturers: ['Acme'], etRef: 'ET-1', variants: [{ note: 'n' }] },
      { text: 'C2', manufacturers: ['A', 'B'], etRef: 'ET-2', variants: [] },
    ]
    expect(await offerAssignments({ contribute }, entries, { project: 'P1', familyOf: () => 'ET-F' })).toBe(1)
    expect(contribute).toHaveBeenCalledWith(expect.objectContaining({ kind: 'et-assignment', code: 'C1', family: 'ET-F' }))
    expect(await offerAssignments({ contribute }, entries)).toBe(0)
  })
})

describe('Discard forgets what the project learned', () => {
  it('ignores items up to the cut and keeps later ones', async () => {
    const { forgetLearning, sinceDiscard } = await import('../../src/screens/import/useProjectKnowledge')
    const items = [
      { kind: 'local-et', key: 'ET-OLD-01', value: {}, updated_at: '2026-11-17T16:05:00' },
      { kind: 'assignment', key: '|QC57', value: { ref: 'ET-OLD-01' }, updated_at: '2026-11-17T15:00:00' },
    ]
    await forgetLearning({ projectItems: async () => ({ items }) }, '9901')
    const later = { kind: 'assignment', key: '|QC58', value: { ref: 'ET-NEW-01' }, updated_at: '2026-11-17T16:06:00' }
    expect(sinceDiscard({ items: [...items, later] }, '9901').items).toEqual([later])
    expect(sinceDiscard({ items }, '9902').items).toHaveLength(2)
    localStorage.removeItem('rb-discarded-9901')
  })
})

describe('library precedence', () => {
  it('this project first, then this browser, then other projects', () => {
    const shared = [{ code: 'A', source: '5139' }, { code: 'A', source: '4343', ref: 'new' }]
    const local = [{ code: 'A', source: '4343 REV', ref: 'old' }]
    expect(orderLibrary(shared, local, '4343').map(e => e.ref || e.source)).toEqual(['new', 'old', '5139'])
  })
})
