import { describe, test, expect } from 'vitest'
import { correctRows, applyFormNotes, noteState, noteKey, diffParts, formNotesToMarkdown } from '../../src/utils/formNotes'
import { makeRow } from '../../src/utils/productCodes'
import { positionPaintStatus } from '../../src/utils/formPositions'
import { positionFormDone } from '../../src/utils/formDone'

const wrong = { posRef: 'W03e', formRef: 'W03e', kind: 'wrongCode', column: 'ProductCode', code: '330.07.XX.27.250.3.SP4', shouldBe: '330.07.XX.27.250.3.SP5', formText: '330.07.XX.27.250.3.SP4', note: '' }
const notNeeded = { posRef: 'W03e', formRef: 'W03e', kind: 'notNeeded', code: 'JB-20', manufacturer: 'TM Lighting', desc: 'Joinery Bush 20mm diameter', formText: 'JB-20 Joinery Bush 20mm diameter', note: 'Bush is supplied by the joiner.' }

describe('correctRows', () => {
  test('a wrong code is replaced, only on its own Form ref, and its paint survives', () => {
    const r = { ...makeRow(1, 'X1 330.07.XX.27.250.3.SP4 lamp', { positionType: 'W03e' }), overrides: { 0: 'discard', 2: 'note' }, confirmed: true, accFrom: 30 }
    const other = makeRow(2, '330.07.XX.27.250.3.SP4', { positionType: 'W04' })
    const [a, b] = correctRows([r, other], [wrong])
    expect(a.rawText).toBe('X1 330.07.XX.27.250.3.SP5 lamp')
    expect(a.overrides).toEqual({ 0: 'discard', 1: 'code', 2: 'note' })
    expect(a.confirmed).toBe(true)
    expect(a._rawText).toBe('X1 330.07.XX.27.250.3.SP4 lamp')
    expect(a._fixes).toEqual([{ from: wrong.code, to: wrong.shouldBe }])
    expect(b).toBe(other)
  })
  test('a longer correction shifts the paint after it', () => {
    const r = { ...makeRow(1, 'AB-1 lamp', { positionType: 'W03e' }), overrides: { 1: 'discard' }, accFrom: 5 }
    const [a] = correctRows([r], [{ ...wrong, code: 'AB-1', shouldBe: 'AB-1 X' }])
    expect(a.rawText).toBe('AB-1 X lamp')
    expect(a.overrides).toEqual({ 0: 'code', 1: 'code', 2: 'discard' })
    expect(a.accFrom).toBe(7)
  })
  test('only a whole word is replaced', () => {
    const r = makeRow(1, 'JB-200', { positionType: 'W03e' })
    expect(correctRows([r], [{ ...wrong, code: 'JB-20', shouldBe: 'JB-25' }])[0].rawText).toBe('JB-200')
  })
})

describe('applyFormNotes', () => {
  const draft = { rows: [
    { id: 1, positionType: 'W03e', rawText: 'JB-20 Joinery Bush 20mm diameter', confirmed: true, manufacturer: 'TM Lighting' },
    { id: 2, positionType: 'W03e', rawText: '330.07.XX.27.250.3.SP4', confirmed: true, manufacturer: 'TM Lighting' },
    { id: 3, positionType: 'W03e', rawText: 'DRV-350', confirmed: true, manufacturer: 'TM Lighting' },
  ] }
  const caps = {
    byPosition: { W03e: [{ elementTypeRef: 'ET-DRV-02', code: 'DRV-350' }] },
    pendingByPosition: { W03e: [{ code: 'JB-20' }, { code: '330.07.XX.27.250.3.SP4', manufacturer: 'TM Lighting' }] },
    orphansByPosition: { W03e: ['ET-LIN-CLIP-03'] },
  }
  const psRows = [{ ManufacturerName: 'TM Lighting', ProductCode: '330.07.XX.27.250.3.SP5', ElementTypeRef: 'ET-PL-05' }]
  const knows = (m, c) => c === '330.07.XX.27.250.3.SP5'

  test('no notes: the same objects back', () => {
    const v = applyFormNotes({ importDraft: draft, formCaptures: caps }, [])
    expect(v.importDraft).toBe(draft)
    expect(v.formCaptures).toBe(caps)
  })
  test('not needed, wrong code and missing settle; the position reads ready', () => {
    const notes = [notNeeded, wrong,
      { posRef: 'W03e', formRef: 'W03e', kind: 'notNeeded', code: 'DRV-350', et: 'ET-DRV-02', formText: '', note: 'x' },
      { posRef: 'W03e', kind: 'missing', et: 'ET-LIN-CLIP-03', note: 'y' }]
    const before = positionPaintStatus(draft, 'W03e', { knows })
    expect(before.state).toBe('todo')
    const v = applyFormNotes({ importDraft: draft, formCaptures: caps, psRows }, notes)
    expect(v.importDraft.rows[1].rawText).toBe('330.07.XX.27.250.3.SP5')
    expect(draft.rows[1].rawText).toBe('330.07.XX.27.250.3.SP4')   // never written back
    expect(positionPaintStatus(v.importDraft, 'W03e', { knows }).state).toBe('ready')
    expect(v.formCaptures.pendingByPosition.W03e).toEqual([])
    expect(v.formCaptures.byPosition.W03e).toEqual([{ code: '330.07.XX.27.250.3.SP5', manufacturer: 'TM Lighting', elementTypeRef: 'ET-PL-05' }])
    expect(v.formCaptures.orphansByPosition.W03e).toEqual([])
  })
  test('a corrected code nobody knows yet leaves the old ElementType and is not pending twice', () => {
    const c = { byPosition: { W03e: [{ elementTypeRef: 'ET-FFE-01', code: 'X01', manufacturer: 'J' }] }, pendingByPosition: {} }
    const d = { rows: [...draft.rows, { id: 4, positionType: 'W03e', rawText: 'X01', manufacturer: 'J' }] }
    const v = applyFormNotes({ importDraft: d, formCaptures: c, psRows }, [{ ...wrong, code: 'X01', shouldBe: 'X02', formText: 'X01' }])
    expect(v.formCaptures.byPosition.W03e).toEqual([])
    expect(v.formCaptures.pendingByPosition.W03e).toBeUndefined()
    expect(positionPaintStatus(v.importDraft, 'W03e', { knows: () => false }).state).toBe('todo')
  })
  test('whole entry: set aside, done whatever the Form says', () => {
    const v = applyFormNotes({ importDraft: draft, formCaptures: caps }, [{ posRef: 'W03e', formRef: 'W03e', kind: 'wholeEntry', formText: draft.rows.map(r => r.rawText).join(' / '), note: 'z' }])
    const st = positionPaintStatus(v.importDraft, 'W03e', {})
    expect(st.state).toBe('setAside')
    expect(st.formRows).toHaveLength(3)
    expect(v.formCaptures.byPosition.W03e).toBeUndefined()
    expect(positionFormDone('W03e', { importDraft: v.importDraft, formCaptures: v.formCaptures })).toBe(true)
  })
})

describe('noteState', () => {
  const draft = { rows: [{ positionType: 'W03e', rawText: 'JB-20 Joinery Bush 25mm', manufacturer: 'TM', context: { Finish: 'RAL 9005' } }] }
  test('changed since: stale, with the words around the code', () => {
    expect(noteState(notNeeded, draft)).toEqual({ state: 'stale', then: 'Joinery Bush 20mm diameter', now: 'Joinery Bush 25mm' })
  })
  test('the code has left the Form: gone', () => {
    expect(noteState({ ...notNeeded, code: 'JB-99' }, draft).state).toBe('gone')
  })
  test('a cell note goes stale when the value changes', () => {
    expect(noteState({ posRef: 'W03e', formRef: 'W03e', kind: 'cell', column: 'Finish', formText: 'RAL 6014' }, draft))
      .toEqual({ state: 'stale', then: 'RAL 6014', now: 'RAL 9005' })
  })
  test('missing: gone once the Form lists the ElementType', () => {
    const n = { posRef: 'W03e', kind: 'missing', et: 'ET-X' }
    expect(noteState(n, draft, { byPosition: { W03e: [{ elementTypeRef: 'et-x' }] } }).state).toBe('gone')
    expect(noteState(n, draft, { byPosition: {} }).state).toBe('ok')
  })
})

test('one key per code: not needed and wrong code replace each other', () => {
  expect(noteKey(notNeeded)).toBe(noteKey({ ...wrong, code: 'jb-20' }))
})

test('diffParts: just the part that changed', () => {
  expect(diffParts('330.07.XX.27.250.3.SP4', '330.07.XX.27.250.3.SP5')).toEqual(['330.07.XX.27.250.3.SP', '4', '5', ''])
  expect(diffParts('AB', 'AB')).toEqual(['AB', '', '', ''])
})

test('formNotesToMarkdown: questions, in the canvas order, notes indented', () => {
  const md = formNotesToMarkdown([
    { posRef: 'W03e', kind: 'cell', column: 'Finish', formText: 'RAL 6014 Olive Yellow matt', note: 'Finish changed at review.' },
    { ...wrong, note: '' },
    { posRef: 'W03e', kind: 'missing', et: 'ET-LIN-CLIP-03', note: '' },
    notNeeded,
    { posRef: 'W03e', kind: 'notNeeded', code: 'DRV-350', et: 'ET-DRV-02', note: 'Shared PSU.' },
    { posRef: 'W03e', kind: 'wholeEntry', note: 'Old single-head template.' },
  ], { project: '5642', sourceName: '5642 - Form V3.6.xlsx', importedAt: '2026-11-18T10:00:00Z', positionNames: { W03e: 'Decorative wall lights' }, today: new Date('2026-11-19T12:00:00Z'),
    gone: [{ posRef: 'D09r', kind: 'notNeeded', code: 'ZZ-1', note: '' }] })
  expect(md).toBe(`# Form Template Notes · 5642 · 19 Nov 2026
Form: 5642 - Form V3.6.xlsx, imported 18 Nov 2026

## D09r
- **Fixed in the Form** · \`ZZ-1\`

## W03e · Decorative wall lights
- **Whole entry wrong?** · W03e entry set aside
  Old single-head template.
- **Not needed?** · \`JB-20\` (TM Lighting) “Joinery Bush 20mm diameter”
  Bush is supplied by the joiner.
- **Not needed?** · \`DRV-350\` → ET-DRV-02
  Shared PSU.
- **Wrong code?** · ProductCode \`330.07.XX.27.250.3.SP4\`, should it be \`330.07.XX.27.250.3.SP5\`?
- **Missing from Form?** · ET-LIN-CLIP-03 (in the recipe)
- **Note** · Finish “RAL 6014 Olive Yellow matt”
  Finish changed at review.
`)
})

test('changedWord: one word when only one changed, else the whole value', async () => {
  const { changedWord } = await import('../../src/utils/formNotes')
  expect(changedWord('X1 AB-4 lamp', 'X1 AB-5 lamp')).toEqual(['AB-4', 'AB-5'])
  expect(changedWord('AB-4', 'AB-4 X')).toEqual(['AB-4', 'AB-4 X'])
})
