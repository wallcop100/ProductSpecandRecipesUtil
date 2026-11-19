import { describe, test, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CompactPositionPainter from '../../src/components/import/CompactPositionPainter'
import useStore from '../../src/store/useStore'

describe('AEST77: a family picked on one card skips the refs its neighbours show', () => {
  beforeEach(() => useStore.setState({ recipes: [], psRows: [], elementTypes: [
    { ElementTypeRef: 'ET-PS-ACCESSORIES', IsCollection: 'Y' }, { ElementTypeRef: 'ET-PS-MOUNTING', IsCollection: 'Y' }] }))

  test('HL54 back to ACCESSORIES does not take GS10238\'s -01', () => {
    const props = { 'GS10238/PCBRZ': { ref: 'ET-PS-ACCESSORIES-01', family: 'ET-PS-ACCESSORIES' }, HL54: { ref: 'ET-PS-ACCESSORIES-02', family: 'ET-PS-ACCESSORIES' } }
    render(<CompactPositionPainter posRef="XT1" rows={[{ id: 0, manufacturer: 'LightGraphix', tokens: [], roles: [], rawText: '' }]}
      info={() => ({ codes: [{ code: 'GS10238/PCBRZ' }, { code: 'HL54' }], loose: '' })}
      proposalFor={c => props[c]} onSetRole={() => {}} onToggleConfirm={() => {}} onNeedsET={() => {}} onMakeMain={() => {}} />)
    const fam = screen.getByLabelText('Family for HL54')
    fireEvent.change(fam, { target: { value: 'ET-PS-MOUNTING' } })
    fireEvent.change(fam, { target: { value: 'ET-PS-ACCESSORIES' } })
    expect(screen.getByLabelText('Ref for HL54').value).toBe('ET-PS-ACCESSORIES-02')
  })

  test('T6FDCM: a family the project lacks can be typed; leaving the box numbers the ref into it', () => {
    const props = { 'GS10238/PCBRZ': { ref: 'ET-PS-ACCESSORIES-01', family: 'ET-PS-ACCESSORIES' }, HL54: { ref: 'ET-PS-ACCESSORIES-02', family: 'ET-PS-ACCESSORIES' } }
    render(<CompactPositionPainter posRef="XT1" rows={[{ id: 0, manufacturer: 'LightGraphix', tokens: [], roles: [], rawText: '' }]}
      info={() => ({ codes: [{ code: 'GS10238/PCBRZ' }, { code: 'HL54' }], loose: '' })}
      proposalFor={c => props[c]} onSetRole={() => {}} onToggleConfirm={() => {}} onNeedsET={() => {}} onMakeMain={() => {}} />)
    const fam = screen.getByLabelText('Family for HL54')
    fireEvent.change(fam, { target: { value: 'et-ps-louvre' } })
    expect(fam.value).toBe('et-ps-louvre')
    fireEvent.blur(fam)
    expect(screen.getByLabelText('Ref for HL54').value).toBe('ET-PS-LOUVRE-01')
    expect(fam.value).toBe('ET-PS-LOUVRE')
  })
})

describe('YBLJSW: why a family was learned sits on the Family field, in a popup', () => {
  beforeEach(() => useStore.setState({ recipes: [], psRows: [], elementTypes: [{ ElementTypeRef: 'ET-PS-ACCESSORIES', IsCollection: 'Y' }, { ElementTypeRef: 'ET-PS-MOUNTING', IsCollection: 'Y' }] }))

  test('no line under the card; hovering the dot says why; changing the family drops it', async () => {
    const props = { HL54: { ref: 'ET-PS-ACCESSORIES-01', family: 'ET-PS-ACCESSORIES', why: 'canon', canon: 'extra code on a Point page' } }
    render(<CompactPositionPainter posRef="XT1" rows={[{ id: 0, manufacturer: 'LightGraphix', tokens: [], roles: [], rawText: '' }]}
      info={() => ({ codes: [{ code: 'HL54' }], loose: '' })}
      proposalFor={c => props[c]} onSetRole={() => {}} onToggleConfirm={() => {}} onNeedsET={() => {}} onMakeMain={() => {}} />)
    expect(screen.queryByText(/^Family: /)).toBeNull()
    const dot = screen.getByRole('button', { name: 'Why ET-PS-ACCESSORIES' })
    expect(screen.getByLabelText('Family for HL54').parentElement).toContainElement(dot)
    fireEvent.focus(dot)
    expect(await screen.findByTestId('family-why')).toHaveTextContent('HL54 goes in ET-PS-ACCESSORIES: company family — extra code on a Point page.')
    fireEvent.change(screen.getByLabelText('Family for HL54'), { target: { value: 'ET-PS-MOUNTING' } })
    expect(screen.queryByTestId('family-from')).toBeNull()
  })
})
