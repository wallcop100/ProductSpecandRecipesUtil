import { describe, test, expect } from 'vitest'
import { pendingCandidates, diffCaptures } from '../../src/utils/formSpec'
import { stampPlan } from '../../src/utils/productCodes'

/**
 * The pane could state a problem and its own answer side by side without noticing:
 *
 *   red  — "1 product with no ElementType"        → Light Sheet Custom / Applelec
 *   grey — "Not specified by the Form"            → ET-LS-01
 *
 * Same product. The only offered action was "Create", which mints a DUPLICATE ElementType
 * for something already in the recipe.
 */
const p = (code, manufacturer = 'Applelec', note = '') => ({ code, manufacturer, note })
const ps = (ref, manufacturer, code) => ({ ElementTypeRef: ref, Manufacturer: manufacturer, ProductCode: code })
const et = (ref, name = '') => ({ ElementTypeRef: ref, Name: name })
const extra = (ref, kind) => ({ elementTypeRef: ref, kind })

describe('pendingCandidates', () => {
  /**
   * THE case. Text matching is blind to it — "Light Sheet Custom" and "ET-LS-01" share no
   * code text, so reuseCandidates scores it zero. The evidence is structural: the recipe
   * holds an ET the Form can't account for, and the Form wants a product with no ET.
   */
  test('the unaccounted-for recipe row is offered, and that is the whole point', () => {
    const out = pendingCandidates(p('Light Sheet Custom'), { extra: [extra('ET-LS-01', 'other')] })
    expect(out).toEqual([{ ref: 'ET-LS-01', why: 'recipe' }])
  })

  test('a wrapper is never offered — it is the assembly, not a product', () => {
    const out = pendingCandidates(p('Light Sheet Custom'), { extra: [extra('ET-LS-WRAP', 'wrapper')] })
    expect(out).toEqual([])
  })

  test('a connector is never offered — it is derived detail', () => {
    const out = pendingCandidates(p('Light Sheet Custom'), { extra: [extra('ET-SOCK-5P', 'connector')] })
    expect(out).toEqual([])
  })

  test('contract and internal extras ARE plausible products', () => {
    const out = pendingCandidates(p('X'), { extra: [extra('ET-A', 'contract'), extra('ET-B', 'internal')] })
    expect(out.map(c => c.ref)).toEqual(['ET-A', 'ET-B'])
  })

  test('a Product Spec hit outranks everything — it is a fact, not a guess', () => {
    const out = pendingCandidates(
      p('LL240272024', 'Nichia'),
      { extra: [extra('ET-OTHER', 'other')], psRows: [ps('ET-TAPE-01', 'Nichia', 'LL240272024')] },
    )
    expect(out[0]).toEqual({ ref: 'ET-TAPE-01', why: 'spec' })
    expect(out.map(c => c.ref)).toContain('ET-OTHER')   // still offered, just second
  })

  test('an ET that is both a spec hit and an extra appears once', () => {
    const out = pendingCandidates(
      p('LL240272024', 'Nichia'),
      { extra: [extra('ET-TAPE-01', 'other')], psRows: [ps('ET-TAPE-01', 'Nichia', 'LL240272024')] },
    )
    expect(out).toHaveLength(1)
    expect(out[0].why).toBe('spec')
  })

  /**
   * A `variant` shares a stem but DIFFERS — 250-1CH vs 250-2CH. Merging onto it is exactly
   * the bug etRefSuggest exists to prevent, so only `same` is ever offered as a merge.
   */
  test('a reuse hit is offered only when it is the same product, never a variant', () => {
    const psRows = [ps('ET-CCR-250-1CH', 'Tridonic', 'LC 250/1CH')]
    const ets = [et('ET-CCR-250-1CH')]
    const variant = pendingCandidates(p('LC 250/2CH', 'Tridonic'), { psRows, elementTypes: ets })
    expect(variant.map(c => c.ref)).not.toContain('ET-CCR-250-1CH')

    const same = pendingCandidates(p('LC 250/1CH', 'Tridonic'), { psRows, elementTypes: ets })
    expect(same[0]).toMatchObject({ ref: 'ET-CCR-250-1CH', why: 'spec' })
  })

  test('nothing plausible → nothing offered', () => {
    expect(pendingCandidates(p('Light Sheet Custom'), {})).toEqual([])
    expect(pendingCandidates(null, {})).toEqual([])
  })
})

describe('stampPlan — the link is only as durable as the Product Spec', () => {
  test('an empty spec row gets stamped, so findProductET resolves it for ever', () => {
    const plan = stampPlan([ps('ET-LS-01', '', '')], 'ET-LS-01', 'Applelec', 'Light Sheet Custom')
    expect(plan.action).toBe('stamp')
    expect(plan.updates).toEqual({ ProductCode: 'Light Sheet Custom', Manufacturer: 'Applelec' })
  })

  test('a placeholder N/A on a NON-container is still empty — stamp it', () => {
    const plan = stampPlan([ps('ET-LS-01', 'Ideaworks', 'N/A')], 'ET-LS-01', 'Applelec', 'Light Sheet Custom')
    expect(plan.action).toBe('stamp')
    expect(plan.updates.ProductCode).toBe('Light Sheet Custom')
    expect(plan.updates.Manufacturer).toBeUndefined()   // never overwrite a real maker
  })

  /**
   * A wrapper's "Ideaworks / N/A" is its corroborating mark — computeContainerInfo reads
   * it. Stamp a real product code over it and you can un-wrapper an assembly.
   */
  test('a container is never stamped, only linked', () => {
    const plan = stampPlan([ps('ET-LIN-01', 'Ideaworks', 'N/A')], 'ET-LIN-01', 'Applelec', 'X',
      { isContainer: true })
    expect(plan.action).toBe('skip')
  })

  test('the identity already matches → nothing to do', () => {
    const plan = stampPlan([ps('ET-LS-01', 'Applelec', 'Light Sheet Custom')],
      'ET-LS-01', 'Applelec', 'Light Sheet Custom')
    expect(plan.action).toBe('skip')
  })

  test('a different real code already there → conflict, never a silent overwrite', () => {
    const plan = stampPlan([ps('ET-LS-01', 'Applelec', 'OTHER-999')],
      'ET-LS-01', 'Applelec', 'Light Sheet Custom')
    expect(plan.action).toBe('conflict')
    expect(plan.current).toEqual({ manufacturer: 'Applelec', code: 'OTHER-999' })
  })

  /**
   * If the spec already says this code is ET-OTHER, linking it to ET-LS-01 would not stick:
   * FormSpecPane re-resolves through findProductET on every render and would keep showing
   * ET-OTHER. So this must steer, not warn-and-proceed.
   */
  test('the identity already names another ET → taken, with the ref to steer to', () => {
    const plan = stampPlan([ps('ET-OTHER', 'Applelec', 'Light Sheet Custom')],
      'ET-LS-01', 'Applelec', 'Light Sheet Custom')
    expect(plan.action).toBe('taken')
    expect(plan.otherRef).toBe('ET-OTHER')
  })

  test('a placeholder code is never stamped anywhere', () => {
    expect(stampPlan([ps('ET-X', '', '')], 'ET-X', 'Acme', 'TBC').action).toBe('skip')
    expect(stampPlan([ps('ET-X', '', '')], 'ET-X', 'Acme', '').action).toBe('skip')
  })
})

describe('a merged code is remembered, so a re-import does not re-report it', () => {
  test('diffCaptures does not call a merged code "added"', () => {
    const prev = {
      byPosition: {
        C01r: [{
          elementTypeRef: 'ET-LS-01',
          code: 'Light Sheet 90CRI',
          merged: [{ code: 'Light Sheet Custom' }],
        }],
      },
    }
    // the Form still carries BOTH codes on the next import
    const next = {
      byPosition: {
        C01r: [
          { elementTypeRef: 'ET-LS-01', code: 'Light Sheet 90CRI' },
          { elementTypeRef: 'ET-LS-01', code: 'Light Sheet Custom' },
        ],
      },
    }
    expect(diffCaptures(prev, next).added).toEqual([])
  })
})
