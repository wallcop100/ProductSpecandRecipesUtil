import { describe, test, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import MapColumnsStep from '../../src/components/MapColumnsStep.jsx'

const headers = ['PositionTypeRef', 'ProductCode', 'Accessories']
const rawRows = [
  { PositionTypeRef: 'A1', ProductCode: 'QC50', Accessories: '-' },
  { PositionTypeRef: 'C1', ProductCode: 'UN22', Accessories: 'UN223DFP25241000' },
  { PositionTypeRef: 'C2', ProductCode: 'THN16', Accessories: '' },
]
const base = { pt: 'PositionTypeRef', code: 'ProductCode', mfr: '', exclude: '', acc: '', context: [] }
const draw = map => render(<MapColumnsStep sheets={['S']} sheet="S" onSheet={vi.fn()} headers={headers}
  rawRows={rawRows} map={map} onMap={vi.fn()} onStart={vi.fn()} />)

describe('the Accessories column is optional', () => {
  test('offered, marked optional, and can be left as none', () => {
    draw(base)
    expect(screen.getByText('Accessories', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByText('optional')).toBeInTheDocument()
    expect(screen.queryByTestId('acc-count')).toBeNull()
  })

  test('when mapped, says how many rows actually use it (placeholders do not count)', () => {
    draw({ ...base, acc: 'Accessories' })
    expect(screen.getByTestId('acc-count')).toHaveTextContent('1 of 3 rows have some')
  })
})
