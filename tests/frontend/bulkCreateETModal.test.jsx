import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import BulkCreateETModal from '../../src/components/BulkCreateETModal.jsx'

const ETS = [{ ElementTypeRef: 'ET-PS-01', Family: 'ET-PS' }]
const P = (code, ref, family, extra = {}) => ({
  code, manufacturer: 'Phos', include: true, action: 'create', reuseRef: null,
  family, ref, name: `Phos - ${code}`, description: '', why: 'parent', parent: 'DOWNLIGHT', spread: 1, ...extra,
})
const FAM = { ref: 'ET-DOWNLIGHT', description: 'Downlight family', include: true, from: 'DOWNLIGHT' }
const renderIt = (proposals, newFamilies = [FAM], onApply = () => {}) => render(
  <BulkCreateETModal show proposals={proposals} newFamilies={newFamilies}
    families={['ET-PS']} elementTypes={ETS} onApply={onApply} onHide={() => {}} />)

describe('BulkCreateETModal — weed out, don\'t build', () => {
  test('a new family is created with its members; unticking a code leaves it out', () => {
    const onApply = vi.fn()
    renderIt([P('A1', 'ET-DOWNLIGHT-01', 'ET-DOWNLIGHT'), P('A2', 'ET-DOWNLIGHT-02', 'ET-DOWNLIGHT')], [FAM], onApply)
    expect(screen.getByText('new family')).toBeTruthy()
    expect(screen.getByLabelText('Family description ET-DOWNLIGHT').value).toBe('Downlight family')
    fireEvent.click(screen.getByLabelText('Include A2'))
    fireEvent.click(screen.getByRole('button', { name: 'Apply 1' }))
    const arg = onApply.mock.calls[0][0]
    expect(arg.families.map(f => f.ref)).toEqual(['ET-DOWNLIGHT'])
    expect(arg.items.map(p => p.code)).toEqual(['A1'])
  })

  test('renaming a new family renumbers its members', () => {
    renderIt([P('A1', 'ET-DOWNLIGHT-01', 'ET-DOWNLIGHT'), P('A2', 'ET-DOWNLIGHT-02', 'ET-DOWNLIGHT')])
    fireEvent.change(screen.getByLabelText('Family ref ET-DOWNLIGHT'), { target: { value: 'ET-DL' } })
    expect(screen.getByLabelText('Ref for A1').value).toBe('ET-DL-01')
    expect(screen.getByLabelText('Ref for A2').value).toBe('ET-DL-02')
  })

  test('unticking a new family blocks its members until they move', () => {
    renderIt([P('A1', 'ET-DOWNLIGHT-01', 'ET-DOWNLIGHT')])
    fireEvent.click(screen.getByLabelText('Create family ET-DOWNLIGHT'))
    expect(screen.getByText('its new family is unticked')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Apply 1' }).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Move ET-DOWNLIGHT to family'), { target: { value: 'ET-PS' } })
    expect(screen.getByLabelText('Ref for A1').value).toBe('ET-PS-02')
    expect(screen.getByRole('button', { name: 'Apply 1' }).disabled).toBe(false)
  })

  test('"Needs a family" blocks apply until moved or unticked', () => {
    renderIt([P('Z1', '', '', { why: null, parent: null })], [])
    const group = screen.getByTestId('group-__none')
    expect(within(group).getByText(/Needs a family/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Apply 1' }).disabled).toBe(true)
    fireEvent.click(screen.getByLabelText('Include Z1'))
    expect(screen.getByRole('button', { name: 'Apply 0' }).disabled).toBe(true)
  })

  test('the reason is shown per code', () => {
    renderIt([P('A1', 'ET-DOWNLIGHT-01', 'ET-DOWNLIGHT', { spread: 2 })])
    expect(screen.getByText('position parent DOWNLIGHT · used under 2 families')).toBeTruthy()
  })

  test('placeholder codes are listed as skipped, never applied', () => {
    const onApply = vi.fn()
    renderIt([P('A1', 'ET-DOWNLIGHT-01', 'ET-DOWNLIGHT'), P('n/a', '', '', { action: 'skip', include: false })], [FAM], onApply)
    expect(screen.getByText(/Not product codes/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Apply 1' }))
    expect(onApply.mock.calls[0][0].items.map(p => p.code)).toEqual(['A1'])
  })
})
