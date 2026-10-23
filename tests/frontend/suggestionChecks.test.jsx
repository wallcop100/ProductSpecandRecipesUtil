import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { levelOf, mayAsk, noteAsked, resetAsked } from '../../src/utils/certainty'

window.electronAPI = { db: { setPref: vi.fn().mockResolvedValue(undefined) } }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))
const api = { current: null }
vi.mock('../../src/platform/companion', () => ({ useCompanion: () => api.current, getCompanion: async () => api.current }))
const { default: useStore } = await import('../../src/store/useStore.js')
const { default: RecipeSuggestions } = await import('../../src/components/RecipeSuggestions.jsx')

const row = (pos, ref, ctx = 'PositionType', extra = {}) => ({ _id: `${pos}-${ref}`,
  PositionTypeRef: pos, ContextType: ctx, ContextRef: ctx === 'PositionType' ? pos : 'ET-LIN-01', ElementTypeRef: ref, ...extra })
const CAP = { key: 'ledflex|FPSC0808BG2000>range|FPSC0808ECG', range: 'FPSC0808', anchor: { code: 'FPSC0808BG2000' },
  part: { maker_key: 'ledflex', code: 'FPSC0808ECG', slot: 'END_CAPS', name: 'FLEX PROFILE SURFACE CORNER 0808 END CAP SET GREY' },
  votes: { yes: 0, no: 0, origins: 0, openNo: false }, alsoWith: [{ code: 'FPSC0808BW2000', positions: 3, projects: 1 }] }

async function setup(kits = [CAP], features = ['checks']) {
  localStorage.clear()
  api.current = { features: new Set(features), kits: vi.fn(async () => kits), shareOutcomes: vi.fn(async () => ({ stored: 1 })) }
  useStore.setState({
    projectNumber: '7900', library: { patterns: [], exemplars: [], kinds: [] },
    positionTypes: [{ PositionTypeRef: 'C05r', DriverLocation: 'Remote', SecondaryPowerType: 'CV' }],
    elementTypes: [{ ElementTypeRef: 'ET-LIN-01', Family: 'ET-LIN' }, { ElementTypeRef: 'ET-LIN-TAPE-01', Family: 'ET-LIN-TAPE' },
      { ElementTypeRef: 'ET-LIN-PROF-01', Family: 'ET-LIN-PROF' }, { ElementTypeRef: 'ET-LIN-CAP-06', Family: 'ET-LIN-PROF', Name: 'LEDFlex - Half Moon 0808 end cap' }],
    psRows: [{ ElementTypeRef: 'ET-LIN-PROF-01', Manufacturer: 'LEDFlex', ProductCode: 'FPSC0808BG2000' },
      { ElementTypeRef: 'ET-LIN-CAP-06', Manufacturer: 'LEDFlex', ProductCode: 'TBC', IsTBC: 'Y' }],
    recipes: [row('C05r', 'ET-LIN-01', 'PositionType', { IsDesign: 'Y' }), row('C05r', 'ET-LIN-TAPE-01', 'ElementType'),
      row('C05r', 'ET-LIN-PROF-01', 'ElementType'), row('C05r', 'ET-LIN-CAP-06', 'ElementType', { _id: 'cap6' })],
    rsChanges: [], psChanges: [], dbChanges: [], loadLibrary: vi.fn(),
  })
  await act(async () => { render(<RecipeSuggestions posRef="C05r" />) })
}
const setCode = () => act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Set code' })) })

describe('levelOf', () => {
  test('own and Orion-confirmed are sure; a range guess, a one-off kit, a placeholder and an open "no" are unsure', () => {
    expect(levelOf({ own: true })).toBe('sure')
    expect(levelOf({ range: true, votes: { verdict: 'confirmed' } })).toBe('sure')
    expect(levelOf({ range: true })).toBe('unsure')
    expect(levelOf({ projects: 1 })).toBe('unsure')
    expect(levelOf({ placeholder: true })).toBe('unsure')
    expect(levelOf({ projects: 5, votes: { yes: 4, no: 1, origins: 3, openNo: true } })).toBe('unsure')
    expect(levelOf({ projects: 3 })).toBe('likely')
    expect(levelOf({ range: true, votes: { yes: 1, no: 0, origins: 1 } })).toBe('likely')
    expect(levelOf({ range: true, votes: { yes: 3, no: 0, origins: 2 } })).toBe('sure')
    expect(levelOf({ range: true }, false)).toBe('likely')   // the companion does not count votes: never halt
  })

  test('asked once per key, again only after a newer "no" from someone else, and not twice in 3 minutes', () => {
    localStorage.clear(); resetAsked()
    expect(mayAsk('1', 'k', { no: 0 }, 0)).toBe(true)
    noteAsked('1', 'k', { no: 0 }, 'rejected', 0)
    expect(mayAsk('1', 'j', null, 60_000)).toBe(false)
    expect(mayAsk('1', 'k', { no: 1, openNo: true }, 400_000)).toBe(false)   // their own "no"
    expect(mayAsk('1', 'k', { no: 2, openNo: true }, 400_000)).toBe(true)
  })
})

describe('the check popup', () => {
  beforeEach(() => { resetAsked() })

  test('an unsure range part halts Set code; Yes sets it and sends a confirmed vote', async () => {
    await setup()
    const upd = vi.spyOn(useStore.getState(), 'updatePSRow')
    await setCode()
    expect(upd).not.toHaveBeenCalled()
    const pop = screen.getByTestId('confirm-suggestion')
    expect(pop.textContent).toMatch(/Please double check this now, your input helps future projects/)
    expect(pop.textContent).toMatch(/same range as FPSC0808BG2000/)
    expect(pop.textContent).toMatch(/FPSC0808BW2000/)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /Yes, it's right/ })) })
    expect(upd).toHaveBeenCalledWith('ET-LIN-CAP-06', { Manufacturer: 'LEDFlex', ProductCode: 'FPSC0808ECG', IsTBC: null })
    expect(api.current.shareOutcomes).toHaveBeenCalledWith('7900', expect.arrayContaining([
      expect.objectContaining({ kind: 'kit', key: CAP.key, outcome: 'confirmed', slot: 'END_CAPS' })]))
  })

  test('No with the right code sets that code and sends it as a correction', async () => {
    await setup()
    const upd = vi.spyOn(useStore.getState(), 'updatePSRow')
    await setCode()
    fireEvent.click(screen.getByRole('button', { name: /No, it's wrong/ }))
    fireEvent.change(screen.getByLabelText('Right code'), { target: { value: 'fpsc0808ecw' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add the right code' })) })
    expect(upd).toHaveBeenCalledWith('ET-LIN-CAP-06', { Manufacturer: 'LEDFlex', ProductCode: 'FPSC0808ECW', IsTBC: null })
    expect(api.current.shareOutcomes).toHaveBeenCalledWith('7900', [
      expect.objectContaining({ kind: 'kit', key: CAP.key, outcome: 'rejected', final: 'FPSC0808ECW', slot: 'END_CAPS' })])
  })

  test('Esc cancels with nothing said; within 3 minutes of an answer the next one only gets the chip', async () => {
    await setup()
    noteAsked('7900', 'other', null, 'confirmed')
    const upd = vi.spyOn(useStore.getState(), 'updatePSRow')
    await setCode()
    expect(screen.queryByTestId('confirm-suggestion')).toBeNull()
    expect(upd).toHaveBeenCalled()
    expect(screen.getByTestId('suggestion-check-chip').textContent).toMatch(/Is this right\?/)
    await act(async () => { fireEvent.click(screen.getByLabelText('Yes, this is right')) })
    expect(api.current.shareOutcomes).toHaveBeenLastCalledWith('7900', [expect.objectContaining({ key: CAP.key, outcome: 'confirmed' })])
  })

  test('undo takes the chip away with the part; redo brings it back (#72)', async () => {
    await setup([CAP], [])
    await setCode()
    expect(screen.getByTestId('suggestion-check-chip')).toBeTruthy()
    await act(async () => { useStore.getState().undo() })
    expect(screen.queryByTestId('suggestion-check-chip')).toBeNull()
    expect(screen.getByRole('button', { name: 'Set code' })).toBeTruthy()
    await act(async () => { useStore.getState().redo() })
    expect(screen.getByTestId('suggestion-check-chip')).toBeTruthy()
  })

  test('without the checks feature nothing halts', async () => {
    await setup([CAP], [])
    await setCode()
    expect(screen.queryByTestId('confirm-suggestion')).toBeNull()
    expect(screen.getByTestId('suggestion-check-chip')).toBeTruthy()
  })
})
