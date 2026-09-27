import { useCallback, useMemo, useReducer, useRef } from 'react'

/**
 * useImportSession — everything the import DECIDES, in one place, with undo.
 *
 * rows (with their per-row overrides, note edits, lead code and confirmed flag), learned
 * rules, ElementType assignments, Form-ref overrides, near-miss groups kept separate, and
 * the note-direction tally. The screen keeps only what is about looking (step, filters,
 * which row is open, which modal).
 *
 * The setters behave like React's: a value or an updater `prev => next`. Every change
 * records history, but changes made in the same event (one click that sets rules AND
 * rows) coalesce into ONE step, so one undo undoes one act.
 */

export const EMPTY = {
  rows: [], rules: {}, assignments: {}, refOverrides: {},
  keptSeparate: new Set(), dirStats: { forward: 0, backward: 0 },
}
const KEYS = Object.keys(EMPTY)
const LIMIT = 100

export function sessionReducer(state, action) {
  switch (action.type) {
    case 'set': {
      const prev = state.data[action.key]
      const next = typeof action.value === 'function' ? action.value(prev) : action.value
      if (next === prev) return state
      const data = { ...state.data, [action.key]: next }
      if (action.record === false) return { ...state, data }
      // `batch` is the event that made the change: one act, one step.
      const coalesce = action.batch != null && action.batch === state.lastBatch && state.past.length > 0
      return {
        data,
        past: coalesce ? state.past : [...state.past, state.data].slice(-LIMIT),
        future: [],
        lastBatch: action.batch,
      }
    }
    case 'load':
      return { data: { ...EMPTY, ...action.data }, past: [], future: [], lastBatch: null }
    case 'undo': {
      if (state.past.length === 0) return state
      return {
        data: state.past[state.past.length - 1],
        past: state.past.slice(0, -1),
        future: [state.data, ...state.future],
        lastBatch: null,
      }
    }
    case 'redo': {
      if (state.future.length === 0) return state
      return {
        data: state.future[0],
        past: [...state.past, state.data],
        future: state.future.slice(1),
        lastBatch: null,
      }
    }
    default:
      return state
  }
}

export default function useImportSession(initial = {}) {
  const [state, dispatch] = useReducer(sessionReducer, null,
    () => ({ data: { ...EMPTY, ...initial }, past: [], future: [], lastBatch: null }))

  // Changes made synchronously in one event share a batch number; the next task starts a new one.
  const batch = useRef({ n: 0, open: false })
  const currentBatch = () => {
    const b = batch.current
    if (!b.open) {
      b.open = true
      setTimeout(() => { b.open = false; b.n++ }, 0)
    }
    return b.n
  }

  // One stable setter per field: setRows, setRules, setAssignments, …
  const setters = useMemo(() => Object.fromEntries(KEYS.map(key => [
    `set${key[0].toUpperCase()}${key.slice(1)}`,
    (value, { record = true } = {}) => dispatch({ type: 'set', key, value, record, batch: currentBatch() }),
  ])), [])

  const load = useCallback(data => dispatch({ type: 'load', data }), [])
  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const redo = useCallback(() => dispatch({ type: 'redo' }), [])

  return {
    ...state.data,
    ...setters,
    load, undo, redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  }
}
