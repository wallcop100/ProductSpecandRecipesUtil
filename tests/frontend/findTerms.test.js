import { describe, it, expect } from 'vitest'
import { mergeTerms, actionsFromTerms } from '../../src/help/terms'
import BASE from '../../src/help/terms.json'
import { buildActions, BEHAVIOUR } from '../../src/help/actions'
import { find } from '../../src/help/search'

describe('Find terms: data, and Orion’s live changes over them', () => {
  it('every action in the code has terms, and every term an action', () => {
    expect(Object.keys(BASE.actions).sort()).toEqual(BEHAVIOUR.map(b => b.id).sort())
    for (const [id, t] of Object.entries(BASE.actions)) {
      expect(t.title, id).toBeTruthy(); expect(t.how, id).toBeTruthy(); expect(t.words.length, id).toBeGreaterThan(0)
      if (t.needs) expect(t.title, id).toMatch(/\{ref\}/)
    }
  })
  it('overrides add and remove words, retitle, hide; an orphan is ignored', () => {
    const t = mergeTerms(BASE, { actions: {
      'et.rename': { add: ['Change The Ref Name'], remove: ['amend'], title: 'Re-ref {ref}', how: 'Here.' },
      'et.dup': { hidden: true }, 'gone.action': { add: ['x'] } } })
    expect(t.actions['et.rename'].words).toContain('change the ref name')
    expect(t.actions['et.rename'].words).not.toContain('amend')
    const acts = actionsFromTerms(t)
    expect(acts.find(a => a.id === 'et.rename').title('ET-A')).toBe('Re-ref ET-A')
    expect(acts.some(a => a.id === 'et.dup')).toBe(false)
    expect(acts.some(a => a.id === 'gone.action')).toBe(false)
    expect(BASE.actions['et.rename'].words).toContain('amend')        // the base is never mutated
  })
  it('synonyms set and removed', () => {
    const t = mergeTerms(BASE, { synonyms: { set: { tweak: ['rename', 'change'] }, remove: ['amend'] } })
    expect(t.synonyms.tweak).toEqual(['rename', 'change'])
    expect(t.synonyms.amend).toBeUndefined()
  })
  it('a live word is found at once; a mapped missed search lands on its action', () => {
    const { actions, synonyms } = buildActions({ actions: { 'et.rename': { add: ['frobnicate the label'] } } })
    expect(find('frobnicate the label', { actions, synonyms, state: {} })[0].action.id).toBe('et.rename')
    const plain = buildActions()
    expect(find('frobnicate the label', { actions: plain.actions, synonyms: plain.synonyms, state: {} }).filter(r => r.action?.id === 'et.rename')).toEqual([])
  })
  it('the Fork card is found by Find', () => {
    const { actions, synonyms } = buildActions()
    expect(find('fork', { actions, synonyms, state: {} }).some(r => r.action?.id === 'tut.fork-position')).toBe(true)
  })
})
