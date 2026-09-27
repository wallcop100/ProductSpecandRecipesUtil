import { describe, test, expect } from 'vitest'
import { sessionReducer, EMPTY } from '../../src/screens/import/useImportSession.js'

const start = () => ({ data: { ...EMPTY }, past: [], future: [], lastBatch: null })
const set = (key, value, batch, extra = {}) => ({ type: 'set', key, value, batch, ...extra })

describe('import session: one state, full undo', () => {
  test('a change records history; undo and redo walk it', () => {
    let s = sessionReducer(start(), set('rules', { a: 'code' }, 1000))
    s = sessionReducer(s, set('rules', r => ({ ...r, b: 'note' }), 2000))
    expect(s.data.rules).toEqual({ a: 'code', b: 'note' })
    s = sessionReducer(s, { type: 'undo' })
    expect(s.data.rules).toEqual({ a: 'code' })
    s = sessionReducer(s, { type: 'undo' })
    expect(s.data.rules).toEqual({})
    s = sessionReducer(s, { type: 'redo' })
    expect(s.data.rules).toEqual({ a: 'code' })
  })

  test('changes in the same event are one step (one act, one undo)', () => {
    let s = sessionReducer(start(), set('rules', { a: 'code' }, 7))
    s = sessionReducer(s, set('rows', [{ id: 1 }], 7))
    expect(s.past).toHaveLength(1)
    s = sessionReducer(s, { type: 'undo' })
    expect(s.data).toMatchObject({ rules: {}, rows: [] })
  })

  test('a new change clears redo; unrecorded changes leave history alone', () => {
    let s = sessionReducer(start(), set('rules', { a: 'code' }, 1000))
    s = sessionReducer(s, { type: 'undo' })
    s = sessionReducer(s, set('rows', [{ id: 1 }], 3000, { record: false }))
    expect(s.future).toHaveLength(1)
    s = sessionReducer(s, set('rules', { z: 'note' }, 5000))
    expect(s.future).toHaveLength(0)
  })

  test('load replaces everything and starts a fresh history', () => {
    let s = sessionReducer(start(), set('rules', { a: 'code' }, 1000))
    s = sessionReducer(s, { type: 'load', data: { rows: [{ id: 9 }] } })
    expect(s.past).toHaveLength(0)
    expect(s.data.rows).toEqual([{ id: 9 }])
    expect(s.data.rules).toEqual({})
  })
})
