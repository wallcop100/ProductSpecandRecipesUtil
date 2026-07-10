import { describe, test, expect, vi, beforeEach } from 'vitest'
import { formPending, formCoverage, formWorklist, formProgress } from '../../src/utils/formSpec.js'
import useStore from '../../src/store/useStore.js'

/**
 * Staging became incremental — stage the codes that are ready, leave the rest. But
 * handleStage dropped any code with no ElementType (`if (!et) continue`), so the codes
 * you deliberately left behind were ERASED from the Form's record. The pane, whose
 * promise is "what the Form asks for vs what the recipe has", could never mention them.
 */
const pos = (posRef, ref) => ({
  PositionTypeRef: posRef, ContextType: 'PositionType', ContextRef: posRef, ElementTypeRef: ref,
})

const captures = {
  byPosition: { C01r: [{ elementTypeRef: 'ET-PROF-01', code: 'FPS2020' }] },
  pendingByPosition: {
    C01r: [{ code: 'XAL 011-8000018M', manufacturer: 'XAL', note: 'Move It 45', formRef: 'C01' }],
    D07: [{ code: 'TBC-1000', manufacturer: '', note: '', formRef: 'D07' }],
  },
}

describe('formPending — an intention with no name is still an intention', () => {
  test('reads the pending products for a position', () => {
    expect(formPending(captures, 'C01r')).toHaveLength(1)
    expect(formPending(captures, 'C01r')[0].code).toBe('XAL 011-8000018M')
  })

  test('a position with none is empty, not undefined', () => {
    expect(formPending(captures, 'W01')).toEqual([])
    expect(formPending(null, 'C01r')).toEqual([])
  })
})

describe('pending counts toward the total', () => {
  const recipes = [pos('C01r', 'ET-PROF-01')]

  test('coverage would otherwise report 1/1 on a Form that asked for two', () => {
    const formEts = [{ elementTypeRef: 'ET-PROF-01' }]
    expect(formCoverage(recipes, 'C01r', formEts, new Set(), 0)).toMatchObject({ present: 1, total: 1 })
    expect(formCoverage(recipes, 'C01r', formEts, new Set(), 1)).toMatchObject({ present: 1, total: 2, pending: 1 })
  })

  test('a position whose only gap is pending still appears in the worklist', () => {
    const work = formWorklist(recipes, captures, new Set())
    const c01 = work.find(w => w.posRef === 'C01r')
    expect(c01).toBeTruthy()
    expect(c01.missing).toBe(0)      // the one named product IS in the recipe
    expect(c01.pending).toBe(1)      // but the Form asked for another
  })

  test('a position known ONLY through pending products is reconcilable work', () => {
    const work = formWorklist(recipes, captures, new Set())
    expect(work.map(w => w.posRef)).toContain('D07')
  })

  test('progress counts pending separately — it is blocked on an ElementType, not on you', () => {
    const p = formProgress(recipes, captures, new Set())
    expect(p.total).toBe(2)          // C01r and D07
    expect(p.complete).toBe(0)       // neither is reconciled
    expect(p.pending).toBe(2)
    expect(p.missing).toBe(0)
  })
})

describe('promotePendingCapture — naming it makes it addable', () => {
  beforeEach(() => {
    useStore.setState({ projectId: null, formCaptures: JSON.parse(JSON.stringify(captures)) })
  })

  test('the product moves from pending into the Form spec proper', async () => {
    await useStore.getState().promotePendingCapture('C01r', 'XAL 011-8000018M', 'ET-PS-09')
    const fc = useStore.getState().formCaptures
    expect(fc.pendingByPosition.C01r).toBeUndefined()   // last one out, key removed
    const entry = fc.byPosition.C01r.find(e => e.elementTypeRef === 'ET-PS-09')
    expect(entry).toBeTruthy()
    expect(entry.code).toBe('XAL 011-8000018M')
    expect(entry.manufacturer).toBe('XAL')
    expect(entry.note).toBe('Move It 45')               // the note travels with it
  })

  test('other positions are untouched', async () => {
    await useStore.getState().promotePendingCapture('C01r', 'XAL 011-8000018M', 'ET-PS-09')
    expect(useStore.getState().formCaptures.pendingByPosition.D07).toHaveLength(1)
  })

  test('promoting twice leaves one entry', async () => {
    const { promotePendingCapture } = useStore.getState()
    await promotePendingCapture('C01r', 'XAL 011-8000018M', 'ET-PS-09')
    await promotePendingCapture('C01r', 'XAL 011-8000018M', 'ET-PS-09')
    expect(useStore.getState().formCaptures.byPosition.C01r).toHaveLength(2)
  })

  test('an unknown code changes nothing', async () => {
    await useStore.getState().promotePendingCapture('C01r', 'NOT-A-CODE', 'ET-X')
    expect(useStore.getState().formCaptures.byPosition.C01r).toHaveLength(1)
    expect(useStore.getState().formCaptures.pendingByPosition.C01r).toHaveLength(1)
  })

  test('matching a code is case- and space-insensitive', async () => {
    await useStore.getState().promotePendingCapture('C01r', '  xal 011-8000018m ', 'ET-PS-09')
    expect(useStore.getState().formCaptures.pendingByPosition.C01r).toBeUndefined()
  })

  test('several pending on one position: only the named one is promoted', async () => {
    useStore.setState({
      formCaptures: {
        byPosition: {},
        pendingByPosition: { C01r: [{ code: 'A' }, { code: 'B' }] },
      },
    })
    await useStore.getState().promotePendingCapture('C01r', 'A', 'ET-A')
    const fc = useStore.getState().formCaptures
    expect(fc.pendingByPosition.C01r.map(p => p.code)).toEqual(['B'])
    expect(fc.byPosition.C01r).toHaveLength(1)
  })
})
