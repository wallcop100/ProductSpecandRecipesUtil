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
})
