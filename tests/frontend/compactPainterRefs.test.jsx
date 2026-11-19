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

describe('4FQSWW / M3965S / QGQ7H2', () => {
  const draw = (pos = 'XT1', codes = [{ code: 'HL54', etRef: 'ET-PS-01' }]) => render(<CompactPositionPainter key={pos} posRef={pos}
    rows={[{ id: 0, manufacturer: 'LightGraphix', tokens: [], roles: [], rawText: 'HL54', confirmed: true }]}
    info={() => ({ codes, loose: '' })} proposalFor={() => null} onSetRole={() => {}} onToggleConfirm={() => {}} onNeedsET={() => {}} onMakeMain={() => {}} />)
  beforeEach(() => { localStorage.clear(); useStore.setState({ recipes: [], psRows: [], elementTypes: [], formNotes: [] }) })

  test('Paint, once picked, is the face on the next position too', () => {
    const { unmount } = draw('XT51')
    expect(screen.getByTestId('compact-row').dataset.face).toBe('data')
    fireEvent.click(screen.getByRole('button', { name: 'Paint' }))
    unmount()
    draw('T352')
    expect(screen.getByTestId('compact-row').dataset.face).toBe('paint')
  })

  test('the column list is not inside the face, so the face cannot clip it', () => {
    draw()
    fireEvent.click(screen.getByTestId('cols-pick'))
    expect(document.querySelector('div[data-testid="face-data"]')).not.toContainElement(screen.getByTestId('cols-list'))
  })
})

test('M3965S: a comment box says what goes in it', async () => {
  const { NoteEditor } = await import('../../src/components/FormNoteParts')
  render(<NoteEditor head="X" onSave={() => {}} onCancel={() => {}} />)
  expect(screen.getByLabelText('Note').placeholder).toBe('Add a comment')
})
