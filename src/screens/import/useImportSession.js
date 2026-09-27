import { useCallback, useMemo, useReducer } from 'react'

/**
 * useImportSession — everything the import DECIDES, in one place, with undo.
 *
 * rows (with their per-row overrides, note edits, lead code and confirmed flag), learned
 * rules, ElementType assignments, Form-ref overrides, near-miss groups kept separate, and
 * the note-direction tally. The screen keeps only what is about looking (step, filters,
 * which row is open, which modal).
 *
 * The setters behave like React's: a value or an updater `prev => next`. Every change
 * records history, but changes made in the same instant (one click that sets rules AND
 * rows) coalesce into ONE step, so one undo undoes one act.
 */

export const EMPTY = {
  rows: [], rules: {}, assignments: {}, refOverrides: {},
  keptSeparate: new Set(), dirStats: { forward: 0, backward: 0 },
}
const KEYS = Object.keys(EMPTY)
const LIMIT = 100
const COALESCE_MS = 40

export function sessionReducer(state, action) {
  switch (action.type) {
    case 'set': {
      const prev = state.data[action.key]
      const next = typeof action.value === 'function' ? action.value(prev) : action.value
      if (next === prev) return state
      const data = { ...state.data, [action.key]: next }
      if (action.record === false) return { ...state, data }
      const coalesce = action.at - state.lastAt < COALESCE_MS && state.past.length > 0
      return {
        data,
        past: coalesce ? state.past : [...state.past, state.data].slice(-LIMIT),
        future: [],
        lastAt: action.at,
      }
    }
    case 'load':
      return { data: { ...EMPTY, ...action.data }, past: [], future: [], lastAt: 0 }
    case 'undo': {
      if (state.past.length === 0) return state
      return {
        data: state.past[state.past.length - 1],
        past: state.past.slice(0, -1),
        future: [state.data, ...state.future],
        lastAt: 0,
      }
    }
    case 'redo': {
      if (state.future.length === 0) return state
      return {
        data: state.future[0],
        past: [...state.past, state.data],
        future: state.future.slice(1),
        lastAt: 0,
      }
    }
    default:
      return state
  }
}

export default function useImportSession(initial = {}) {
  const [state, dispatch] = useReducer(sessionReducer, null,
    () => ({ data: { ...EMPTY, ...initial }, past: [], future: [], lastAt: 0 }))

  // One stable setter per field: setRows, setRules, setAssignments, …
  const setters = useMemo(() => Object.fromEntries(KEYS.map(key => [
    `set${key[0].toUpperCase()}${key.slice(1)}`,
    (value, { record = true } = {}) => dispatch({ type: 'set', key, value, record, at: Date.now() }),
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
