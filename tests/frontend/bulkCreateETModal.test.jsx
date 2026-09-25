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
    expect(screen.getByText('position parent DOWNLIGHT (not a company family) · used under 2 families')).toBeTruthy()
  })

  test('placeholder codes are listed as skipped, never applied', () => {
    const onApply = vi.fn()
    renderIt([P('A1', 'ET-DOWNLIGHT-01', 'ET-DOWNLIGHT'), P('n/a', '', '', { action: 'skip', include: false })], [FAM], onApply)
    expect(screen.getByText(/Not product codes/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Apply 1' }))
    expect(onApply.mock.calls[0][0].items.map(p => p.code)).toEqual(['A1'])
  })
})

describe('style-library proposals', () => {
  test('say which example they copy, and flag a ref to check with its alternative', () => {
    renderIt([P('SL0240A3-350mA', 'ET-CCL-D-350-1CH-01', 'ET-DRIVER', {
      why: 'style', styledOn: { ref: 'ET-CCL-D-260-1CH-01', source: '5642 LIGHTING' },
      checkRef: true, alternatives: ['ET-CCR-D-350-1CH'],
    })], [])
    expect(screen.getByText('styled like ET-CCL-D-260-1CH-01 (5642 LIGHTING)')).toBeTruthy()
    expect(screen.getByText(/check ref/).textContent).toContain('or ET-CCR-D-350-1CH')
  })
})

describe('moving codes between families', () => {
  test('a firm rule shows a tick, not a sentence repeated on every row', () => {
    renderIt([P('A1', 'ET-PS-02', 'ET-PS', { why: 'canon', canon: 'Point page' }), P('A2', 'ET-PS-03', 'ET-PS', { why: 'canon', canon: 'Point page' })], [])
    expect(screen.getAllByTestId('verified')).toHaveLength(2)
    expect(screen.queryByText(/company family — Point page/)).toBeNull()
    expect(screen.getAllByTestId('verified')[0].getAttribute('title')).toBe('company family — Point page')
  })

  test('one code moves from its own menu, and its ref renumbers in the new family', () => {
    renderIt([P('A1', 'ET-PS-02', 'ET-PS'), P('A2', 'ET-PS-03', 'ET-PS')], [])
    fireEvent.click(screen.getAllByTitle(/Move A2 to another family/)[0])
    fireEvent.click(screen.getByText('ET-DRIVER', { selector: '.dropdown-item' }))
    expect(screen.getByLabelText('Ref for A2').value).toBe('ET-DRIVER-01')
    expect(screen.getByLabelText('Ref for A1').value).toBe('ET-PS-02')
  })

  test('moving to a company family the project lacks proposes it, with its parent', () => {
    const onApply = vi.fn()
    renderIt([P('T1', 'ET-PS-02', 'ET-PS')], [], onApply)
    fireEvent.click(screen.getAllByTitle(/Move T1 to another family/)[0])
    fireEvent.click(screen.getByText('ET-LIN-TAPE', { selector: '.dropdown-item' }))
    expect(screen.getByLabelText('Family description ET-LIN-TAPE').value).toBe('Linear LED Tape Family')
    fireEvent.click(screen.getByRole('button', { name: 'Apply 1' }))
    expect(onApply.mock.calls[0][0].families.map(f => f.ref)).toEqual(['ET-LIN-TAPE'])
  })

  test('a new family of your own: empty drop target, then a code moved into it from its menu', () => {
    renderIt([P('A1', 'ET-PS-02', 'ET-PS')], [])
    fireEvent.click(screen.getByRole('button', { name: /New family/ }))
    fireEvent.change(screen.getByLabelText('New family ref'), { target: { value: 'et-ps-pendant' } })
    fireEvent.change(screen.getByLabelText('New family description'), { target: { value: 'Pendant family' } })
    fireEvent.change(screen.getByLabelText('New family parent'), { target: { value: 'ET-PS' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByTestId('group-ET-PS-PENDANT').textContent).toMatch(/Drop codes here/)
    fireEvent.click(screen.getAllByTitle(/Move A1 to another family/)[0])
    fireEvent.click(screen.getByText('ET-PS-PENDANT', { selector: '.dropdown-item' }))
    expect(screen.getByLabelText('Ref for A1').value).toBe('ET-PS-PENDANT-01')
    expect(screen.getByText('under ET-PS')).toBeTruthy()
  })

  test('every code that can move has a grip', () => {
    renderIt([P('A1', 'ET-PS-02', 'ET-PS'), P('R1', '', '', { action: 'reuse', reuseRef: 'ET-PS-01' })], [])
    expect(screen.getByRole('button', { name: 'Drag A1 to another family' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Drag R1 to another family' })).toBeNull()
  })
})
