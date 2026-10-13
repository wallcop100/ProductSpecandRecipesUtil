import { describe, it, expect, vi } from 'vitest'
import {
  assignmentKey, digest, learnedRef, localEtsNeeded, shareDecisions, offerAssignments,
} from '../../src/screens/import/useProjectKnowledge'

const know = (items = [], dialect = []) => ({ ready: true, ...digest({ items, dialect }) })
const entry = { text: 'dl0560', manufacturers: ['Acme'], etRef: null }

describe('learned defaults', () => {
  it('a learned ref stands only when the project can resolve it', () => {
    const k = know([{ kind: 'assignment', key: assignmentKey('DL0560', 'acme'), value: { ref: 'ET-DL-01' } }])
    expect(learnedRef(k, entry, new Set(['ET-DL-01']))).toBe('ET-DL-01')
    expect(learnedRef(k, entry, new Set())).toBeNull()
  })
  it('a learned local ElementType is made first so its ref can be resolved', () => {
    const k = know([
      { kind: 'assignment', key: assignmentKey('DL0560', 'Acme'), value: { ref: 'ET-NEW-01' } },
      { kind: 'local-et', key: 'ET-NEW-01', value: { family: 'ET-NEW' } },
    ])
    expect(localEtsNeeded(k, [entry], new Set())).toEqual([{ ref: 'ET-NEW-01', family: 'ET-NEW' }])
    expect(localEtsNeeded(k, [entry], new Set(['ET-NEW-01']))).toEqual([])
  })
  it('is inert until knowledge arrives', () => {
    expect(learnedRef({ ready: false }, entry, new Set(['X']))).toBeNull()
    expect(localEtsNeeded({ ready: false }, [entry], new Set())).toEqual([])
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
