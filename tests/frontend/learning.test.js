import { describe, it, expect, beforeEach, vi } from 'vitest'

const shareLibrary = vi.fn(async () => ({ stored: 1 }))
const shareProjectItems = vi.fn(async () => ({ stored: 1 }))
vi.mock('../../src/platform/companion', () => ({ getCompanion: async () => ({ shareLibrary, shareProjectItems }) }))

import { groupExemplars, diffExemplars, assignmentsFrom, diffAssignments, primeLearning, learnNow, resetLearning } from '../../src/platform/learning'
import { orderLibrary } from '../../src/screens/import/useProjectKnowledge'

const ets = (fam = 'ET-LIN-TAPE', ref = 'ET-LIN-TAPE-01') => [{ ElementTypeRef: ref, Family: fam, Name: 'Tape', Description: '' }]
const ps = (ref = 'ET-LIN-TAPE-01') => [{ ElementTypeRef: ref, ProductCode: '011-3405', Manufacturer: 'LED Flex' }]

describe('learning corrections', () => {
  beforeEach(() => { localStorage.clear(); resetLearning(); shareLibrary.mockClear(); shareProjectItems.mockClear() })

  it('opening a project is the baseline, not a change', async () => {
    primeLearning('4343', { elementTypes: ets(), psRows: ps() })
    expect(await learnNow({ projectNumber: '4343', elementTypes: ets(), psRows: ps() })).toEqual({ exemplars: 0, assignments: 0 })
    expect(shareLibrary).not.toHaveBeenCalled()
  })

  it('a corrected family is sent for that code only, in merge mode', async () => {
    primeLearning('4343', { elementTypes: ets(), psRows: ps() })
    await learnNow({ projectNumber: '4343', elementTypes: ets('ET-LIN-FLEX'), psRows: ps() })
    expect(shareLibrary).toHaveBeenCalledWith('4343', [expect.objectContaining({ code: '011-3405', family: 'ET-LIN-FLEX' })], 'merge')
    expect(shareProjectItems).not.toHaveBeenCalled()
  })

  it('a corrected ref sends the new exemplar and the new assignment', async () => {
    primeLearning('4343', { elementTypes: ets(), psRows: ps() })
    const out = await learnNow({ projectNumber: '4343', elementTypes: ets('ET-LIN-TAPE', 'ET-LIN-TAPE-07'), psRows: ps('ET-LIN-TAPE-07') })
    expect(out).toEqual({ exemplars: 1, assignments: 1 })
    expect(shareProjectItems.mock.calls[0][1]).toEqual([{ kind: 'assignment', key: 'LED FLEX|011-3405',
      value: { ref: 'ET-LIN-TAPE-07', code: '011-3405', maker: 'LED Flex' } }])
  })

  it('a code that no longer has an ElementType is removed', () => {
    const { snapEx } = diffExemplars(groupExemplars([{ maker: 'Acme', code: 'C1', ref: 'R', family: 'F' }]), {})
    expect(diffExemplars({}, snapEx).send).toEqual([{ maker: 'ACME', code: 'C1', deleted: true }])
  })

  it('does nothing for a project that was not opened (or has no number)', async () => {
    expect(await learnNow({ projectNumber: '', elementTypes: ets('X'), psRows: ps() })).toEqual({ exemplars: 0, assignments: 0 })
  })

  it('assignments come from live, real-code spec rows only', () => {
    const cur = assignmentsFrom([...ps(), { ElementTypeRef: 'ET-X', ProductCode: 'TBC' }, { ElementTypeRef: 'ET-Y', ProductCode: 'Z1', IsDeleted: 'Y' }])
    expect(Object.keys(cur)).toEqual(['LED FLEX|011-3405'])
    expect(diffAssignments(cur, { 'LED FLEX|011-3405': 'ET-LIN-TAPE-01' }).items).toEqual([])
  })
})

describe('library precedence', () => {
  it('this project first, then this browser, then other projects', () => {
    const shared = [{ code: 'A', source: '5139' }, { code: 'A', source: '4343', ref: 'new' }]
    const local = [{ code: 'A', source: '4343 REV', ref: 'old' }]
    expect(orderLibrary(shared, local, '4343').map(e => e.ref || e.source)).toEqual(['new', 'old', '5139'])
  })
})
