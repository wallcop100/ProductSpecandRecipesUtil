import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import useStore from '../../src/store/useStore'
import ValidationPanel from '../../src/components/ValidationPanel'

/**
 * The panel used to render 59 rows for what is really 3 jobs. It now renders the jobs.
 */
const issue = (rule, ref, severity = 'error') => ({ rule, ref, severity, message: `${rule} on ${ref}` })

const results = [
  ...Array.from({ length: 33 }, (_, i) => issue('ELEMENT_TYPE_NOT_IN_DB', `ET-PS-${i}`)),
  ...Array.from({ length: 12 }, (_, i) => issue('MISSING_PRODUCT_SPEC_ROW', `ET-LIN-0${i}`, 'warning')),
  ...Array.from({ length: 12 }, (_, i) => issue('ELEMENT_TYPE_NOT_IN_DB', `ET-LIN-0${i}`)),
  issue('MISSING_PRODUCT_CODE', 'ET-DL-01', 'warning'),
]

beforeEach(() => {
  useStore.setState({
    validationResults: results,
    psChanges: [], rsChanges: [], dbChanges: [],
  })
})

describe('tasks, not issues', () => {
  test('58 issues render as 3 tasks', () => {
    render(<ValidationPanel />)
    expect(screen.getByText(/33 ElementTypes missing from the DesignDB master/)).toBeTruthy()
    expect(screen.getByText(/12 wrappers need their Ideaworks \/ N\/A spec row/)).toBeTruthy()
    expect(screen.getByText(/1 spec row with no product code/)).toBeTruthy()
    // the 12 wrappers' NOT_IN_DB issues were absorbed: 45 - 12 = 33
  })

  test('the headline names what blocks a correct patch', () => {
    render(<ValidationPanel />)
    expect(screen.getByText(/1 blocks a correct patch/)).toBeTruthy()
  })

  test('detail is folded away until asked for', () => {
    render(<ValidationPanel />)
    expect(screen.queryByText('ET-PS-0')).toBeNull()
    fireEvent.click(screen.getByText(/33 ElementTypes missing/))
    expect(screen.getByText('ET-PS-0')).toBeTruthy()
  })

  test('a bulk task offers one button; a per-item task offers none', () => {
    render(<ValidationPanel />)
    expect(screen.getByText('Fix all 33')).toBeTruthy()
    expect(screen.getByText('Fix all 12')).toBeTruthy()
    expect(screen.queryByText('Fix all 1')).toBeNull()   // product codes need a human
  })

  test('Fix all calls the store action and re-runs validation', () => {
    const queueMissingDbRows = vi.fn()
    const runValidation = vi.fn()
    useStore.setState({ queueMissingDbRows, runValidation })
    render(<ValidationPanel />)
    fireEvent.click(screen.getByText('Fix all 33'))
    expect(queueMissingDbRows).toHaveBeenCalled()
    expect(runValidation).toHaveBeenCalled()
  })
})

describe('queued is neither broken nor fixed', () => {
  test('once queued, the task greys out, loses its button and sinks', () => {
    useStore.setState({
      dbChanges: results.filter(i => i.rule === 'ELEMENT_TYPE_NOT_IN_DB').map(i => ({ elementTypeRef: i.ref })),
    })
    render(<ValidationPanel />)
    expect(screen.getByText(/Queued for export/)).toBeTruthy()
    expect(screen.queryByText('Fix all 33')).toBeNull()
    // and it no longer counts as blocking
    expect(screen.queryByText(/blocks a correct patch/)).toBeNull()
  })

  test('everything queued reads as done-for-now, not as clean', () => {
    useStore.setState({
      validationResults: [issue('ELEMENT_TYPE_NOT_IN_DB', 'ET-A')],
      dbChanges: [{ elementTypeRef: 'ET-A' }],
    })
    render(<ValidationPanel />)
    expect(screen.getByText(/Nothing left to do/)).toBeTruthy()
    expect(screen.getByText(/waiting on Excel/)).toBeTruthy()
  })
})

describe('empty states', () => {
  test('never run', () => {
    useStore.setState({ validationResults: [] })
    render(<ValidationPanel />)
    expect(screen.getByText(/Click Run to validate/)).toBeTruthy()
  })
})
