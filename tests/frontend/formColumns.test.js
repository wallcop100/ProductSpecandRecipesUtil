import { describe, test, expect, beforeEach } from 'vitest'
import {
  capturableColumns, captureContext, loadVisible, saveVisible, clearVisible, visibleColumns,
} from '../../src/utils/formColumns'

describe('what gets captured from the Form', () => {
  const headers = ['PositionTypeRef', 'ProductCode', 'ManufacturerName', 'ExcludeFromOutput',
    'ProductName', 'Finish', 'Wattage', '__EMPTY', '__EMPTY_12', '']
  const map = { pt: 'PositionTypeRef', code: 'ProductCode', mfr: 'ManufacturerName', exclude: 'ExcludeFromOutput' }

  test('every real column that is not already doing a job', () => {
    expect(capturableColumns(headers, map)).toEqual(['ProductName', 'Finish', 'Wattage'])
  })

  test('xlsx junk headers are never offered', () => {
    expect(capturableColumns(headers, map)).not.toContain('__EMPTY')
    expect(capturableColumns(headers, map)).not.toContain('__EMPTY_12')
  })

  // The capture is generous ON PURPOSE: a column not captured cannot be shown later
  // without a re-import, and "show me Wattage too" must never cost a re-import.
  test('capture is not limited to the columns picked for display', () => {
    const cols = capturableColumns(headers, map)
    expect(cols).toContain('Wattage')
    expect(cols.length).toBeGreaterThan(2)
  })

  test('a captured context drops blanks, keeps values', () => {
    const row = { ProductName: 'Linear LED', Finish: '   ', Wattage: 24, Other: 'x' }
    expect(captureContext(row, ['ProductName', 'Finish', 'Wattage'])).toEqual({
      ProductName: 'Linear LED', Wattage: 24,
    })
  })
})

describe('which columns show is a preference, not a re-import', () => {
  beforeEach(() => window.localStorage.clear())

  const available = ['ProductName', 'Finish', 'Wattage']
  const defaults = ['ProductName', 'Finish']

  test('never asked → the import defaults', () => {
    expect(loadVisible('p1')).toBeNull()
    expect(visibleColumns({ available, defaults, chosen: null })).toEqual(['ProductName', 'Finish'])
  })

  test('a choice persists, per project', () => {
    saveVisible('p1', ['Wattage'])
    expect(loadVisible('p1')).toEqual(['Wattage'])
    expect(loadVisible('p2')).toBeNull()
  })

  // Two different things that both look empty. "Show nothing" is an answer; "never asked"
  // is not, and collapsing them would silently re-show columns the user turned off.
  test('choosing NOTHING is a real answer, not "never asked"', () => {
    saveVisible('p1', [])
    expect(loadVisible('p1')).toEqual([])
    expect(visibleColumns({ available, defaults, chosen: [] })).toEqual([])
  })

  test('reset goes back to the import defaults', () => {
    saveVisible('p1', ['Wattage'])
    clearVisible('p1')
    expect(loadVisible('p1')).toBeNull()
  })

  test('order follows the sheet, not the order you ticked them', () => {
    expect(visibleColumns({ available, defaults, chosen: ['Wattage', 'ProductName'] }))
      .toEqual(['ProductName', 'Wattage'])
  })

  test('a column that has left the sheet is simply not shown', () => {
    expect(visibleColumns({ available, defaults, chosen: ['Finish', 'GoneAway'] })).toEqual(['Finish'])
  })

  test('corrupt storage falls back to the defaults rather than throwing', () => {
    window.localStorage.setItem('rb-form-columns', '{not json')
    expect(loadVisible('p1')).toBeNull()
  })
})
