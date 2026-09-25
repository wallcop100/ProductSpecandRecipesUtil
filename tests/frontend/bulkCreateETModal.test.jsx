import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BulkCreateETModal from '../../src/components/BulkCreateETModal.jsx'

const ETS = [{ ElementTypeRef: 'ET-PS-01', Family: 'ET-PS' }, { ElementTypeRef: 'ET-DRIVER-01', Family: 'ET-DRIVER' }]
const P = (code, ref, extra = {}) => ({
  code, manufacturer: 'Orluna', include: true, action: 'create', reuseRef: null,
  family: 'ET-PS', ref, name: `Orluna - ${code}`, description: '', why: ['maker'], alternatives: [], ...extra,
})

describe('BulkCreateETModal — weed out, don\'t build', () => {
  test('everything is ticked; unticking one leaves it out of the apply', () => {
    const onApply = vi.fn()
    render(<BulkCreateETModal show proposals={[P('A1', 'ET-PS-02'), P('A2', 'ET-PS-03')]}
      families={['ET-PS', 'ET-DRIVER']} elementTypes={ETS} onApply={onApply} onHide={() => {}} />)
    expect(screen.getByLabelText('Include A1').checked).toBe(true)
    fireEvent.click(screen.getByLabelText('Include A2'))
    fireEvent.click(screen.getByRole('button', { name: 'Apply 1' }))
    expect(onApply.mock.calls[0][0].map(p => p.code)).toEqual(['A1'])
  })

  test('changing a group\'s family renumbers every ref in it', () => {
    render(<BulkCreateETModal show proposals={[P('A1', 'ET-PS-02'), P('A2', 'ET-PS-03')]}
      families={['ET-PS', 'ET-DRIVER']} elementTypes={ETS} onApply={() => {}} onHide={() => {}} />)
    fireEvent.change(screen.getByLabelText('Family for ET-PS'), { target: { value: 'ET-DRIVER' } })
    expect(screen.getByLabelText('Ref for A1').value).toBe('ET-DRIVER-02')
    expect(screen.getByLabelText('Ref for A2').value).toBe('ET-DRIVER-03')
  })

  test('a ref that already exists blocks apply until fixed', () => {
    render(<BulkCreateETModal show proposals={[P('A1', 'ET-PS-01')]}
      families={['ET-PS']} elementTypes={ETS} onApply={() => {}} onHide={() => {}} />)
    expect(screen.getByText('already exists')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Apply 1' }).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Ref for A1'), { target: { value: 'ET-PS-02' } })
    expect(screen.getByRole('button', { name: 'Apply 1' }).disabled).toBe(false)
  })

  test('a known product is offered as a reuse, and can be switched to a new one', () => {
    render(<BulkCreateETModal show proposals={[P('A1', '', { action: 'reuse', reuseRef: 'ET-PS-01' })]}
      families={['ET-PS']} elementTypes={ETS} onApply={() => {}} onHide={() => {}} />)
    expect(screen.getByText(/reuse the existing ElementType/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /create a new one instead/ }))
    expect(screen.getByLabelText('Ref for A1').value).toBe('ET-PS-02')
  })
})
