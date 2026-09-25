import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import CompareCodesPanel from '../../src/components/CompareCodesPanel.jsx'

const entry = extra => ({
  text: '021-1102', status: 'amber', rowRefs: [1], manufacturers: ['LEDFlex'], positionTypes: [],
  variants: [{ note: '' }], reuse: [], ...extra,
})

describe('CompareCodesPanel', () => {
  test('a code in a supplier\'s old numbering says so', () => {
    render(<CompareCodesPanel entries={[entry({ superseded: { example: '021-0202' } })]} onReuse={() => {}} onCreateET={() => {}} />)
    expect(screen.getByTestId('superseded').textContent).toMatch(/old LEDFlex numbering/)
  })

  test('a near-miss shows how the codes differ, not a percentage', () => {
    render(<CompareCodesPanel entries={[entry({ text: 'FPS2020BG2000', reuse: [{ ref: 'ET-LIN-PROF-01', kind: 'variant', matchedCode: 'FPS2020BG3000', score: 0.63 }] })]}
      onReuse={() => {}} onCreateET={() => {}} />)
    expect(screen.getByTestId('code-diff')).toBeTruthy()
    expect(screen.queryByText(/63%/)).toBeNull()
  })
})
