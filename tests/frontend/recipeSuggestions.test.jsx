import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

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
const KIND = { id: 2, name: 'Linear tape in profile', design: 'LIN', driver: 'remote', secondary: 'CV', projects: 16, defining: ['PROFILE', 'TAPE:tape'],
  slots: [{ slot: 'PROFILE', core: true, share: 1 }, { slot: 'TAPE:tape', core: true, share: 1 },
    { slot: 'DIFFUSER', core: false, share: 0.96, section: 'lin_internal', dim: 1, contract: 1, integer: 0 }] }
const KIT = { key: 'ledflex|021-8810-02>ledflex|021-8810-11', anchor: { code: '021-8810-02' },
  part: { maker_key: 'ledflex', code: '021-8810-11', slot: 'END_CAPS', name: 'LED Flex - 8810 Cap' }, share: 1, qty: 2, dim: null, integer: false, contract: true }

function setup() {
  localStorage.clear()
  useStore.setState({
    projectNumber: '7900',
    library: { patterns: [], exemplars: [], kinds: api.current ? [KIND] : undefined },
    positionTypes: ['C01r', 'C05r'].map(r => ({ PositionTypeRef: r, DriverLocation: 'Remote', SecondaryPowerType: 'CV' })),
    elementTypes: [{ ElementTypeRef: 'ET-LIN-01', Family: 'ET-LIN' }, { ElementTypeRef: 'ET-LIN-TAPE-01', Family: 'ET-LIN-TAPE' },
      { ElementTypeRef: 'ET-LIN-PROF-01', Family: 'ET-LIN-PROF' }, { ElementTypeRef: 'ET-LIN-DIFF-01', Family: 'ET-LIN-PROF' },
      { ElementTypeRef: 'ET-LIN-CLIP-01', Family: 'ET-LIN-CLIP' }],
    psRows: [{ ElementTypeRef: 'ET-LIN-PROF-01', Manufacturer: 'LEDFlex', ProductCode: '021-8810-02' }],
    recipes: [...['C01r', 'C05r'].flatMap(p => [row(p, 'ET-LIN-01', 'PositionType', { IsDesign: 'Y' }),
      row(p, 'ET-LIN-TAPE-01', 'ElementType'), row(p, 'ET-LIN-PROF-01', 'ElementType')]), row('C01r', 'ET-LIN-CLIP-01', 'ElementType')],
    rsChanges: [], psChanges: [], dbChanges: [], loadLibrary: vi.fn(),
  })
  return render(<RecipeSuggestions posRef="C05r" />)
}

describe('recipe suggestions', () => {
  beforeEach(() => { api.current = null })

  test('without a companion: only "same as" from this project, and dismissing it stays dismissed', () => {
    setup()
    expect(screen.getByTestId('suggestion-same').textContent).toMatch(/Same profile as C01r \(ET-LIN-PROF-01\): clips/)
    expect(screen.queryByTestId('suggestion-kind')).toBeNull()
    fireEvent.click(screen.getByLabelText('More'))
    fireEvent.click(screen.getByText("Don't show this again for C05r"))
    expect(screen.queryByTestId('recipe-suggestions')).toBeNull()
    expect(JSON.parse(localStorage.getItem('psr-suggestions-dismissed:7900'))).toEqual([expect.stringMatching(/^C05r\|same\|C01r>C05r/)])
  })

  test('× hides a line for now only, and says nothing back', () => {
    setup()
    fireEvent.click(screen.getByLabelText('Hide'))
    expect(screen.queryByTestId('recipe-suggestions')).toBeNull()
    expect(localStorage.getItem('psr-suggestions-dismissed:7900')).toBeNull()
  })

  test('"same as" adds just the missing parts', () => {
    setup()
    const copy = vi.spyOn(useStore.getState(), 'copyRecipeFrom').mockReturnValue(1)
    fireEvent.click(screen.getByText('Add'))
    expect(copy).toHaveBeenCalledWith('C01r', 'C05r', { merge: true, etRefs: ['ET-LIN-CLIP-01'] })
  })

  test('beside a companion: the kit makes the ElementType it needs, the kind adds the usual part, both feed back', async () => {
    api.current = { kits: vi.fn(async () => [KIT]), shareOutcomes: vi.fn(async () => ({ stored: 1 })) }
    await act(async () => { setup() })
    expect(api.current.kits).toHaveBeenCalledWith([{ code: '021-8810-02', manufacturer: 'LEDFlex' }], '7900')
    expect(screen.getByTestId('suggestion-kit').textContent).toMatch(/Usually with this profile: end caps 021-8810-11 LED Flex - 8810 Cap ×2/)
    expect(screen.getByTestId('suggestion-kind').textContent).toMatch(/usually also have diffuser \(96%\), 1 per m — not known for 021-8810-02/)
    const addRow = vi.spyOn(useStore.getState(), 'addRecipeRow')
    const kit = screen.getByTestId('suggestion-kit')
    await act(async () => { fireEvent.click(kit.querySelector('button')) })
    const s = useStore.getState()
    expect(s.elementTypes.find(e => e.ElementTypeRef === 'ET-LIN-CAP-01')).toMatchObject({ Family: 'ET-LIN-CAPS' })
    expect(addRow).toHaveBeenCalledWith('C05r', 'lin_internal', expect.objectContaining({ elementTypeRef: 'ET-LIN-CAP-01', quantity: 2, isContractItem: 'Y' }), { asPosition: true })
    expect(api.current.shareOutcomes).toHaveBeenCalledWith('7900', [expect.objectContaining({ kind: 'kit', key: KIT.key, outcome: 'accepted' })])
    fireEvent.click(screen.getByTestId('suggestion-kind').querySelector('[aria-label="More"]'))
    await act(async () => { fireEvent.click(screen.getByText("Don't show this again for C05r")) })
    expect(api.current.shareOutcomes).toHaveBeenLastCalledWith('7900', [expect.objectContaining({ kind: 'kind', key: '2|DIFFUSER', outcome: 'dismissed' })])
  })

  test('caps, diffusers and clips come from THIS profile: its range part is made as an ElementType', async () => {
    const range = code => ({ key: `ledflex|FPS1709BG2000>range|${code}`, range: 'FPS1709', anchor: { code: 'FPS1709BG2000' },
      part: { maker_key: 'ledflex', code, slot: 'CLIPS', name: 'FLEX PROFILE SURFACE 1709 MOUNTING CLIP' }, share: null, contract: true })
    api.current = { kits: vi.fn(async () => [range('FPS1709MC')]), shareOutcomes: vi.fn(async () => ({ stored: 1 })) }
    const CLIPS = { ...KIND, slots: [...KIND.slots, { slot: 'CLIPS', core: false, share: 0.92, section: 'lin_internal', dim: 3, contract: 1, integer: 0 }] }
    await act(async () => { setup() })
    await act(async () => useStore.setState({ library: { patterns: [], exemplars: [], kinds: [CLIPS] },
      psRows: [{ ElementTypeRef: 'ET-LIN-PROF-01', Manufacturer: 'LEDFlex', ProductCode: '021-8810-02' },
        { ElementTypeRef: 'ET-LIN-PROF-09', Manufacturer: 'LEDFlex', ProductCode: 'FPS1709BG2000' }],
      elementTypes: [...useStore.getState().elementTypes, { ElementTypeRef: 'ET-LIN-PROF-09', Family: 'ET-LIN-PROF' }],
      recipes: useStore.getState().recipes.map(r => (r.PositionTypeRef === 'C05r' && r.ElementTypeRef === 'ET-LIN-PROF-01' ? { ...r, ElementTypeRef: 'ET-LIN-PROF-09' } : r)) }))
    const clips = [...screen.getAllByTestId('suggestion-kind')].find(l => /clips/.test(l.textContent))
    expect(clips.textContent).toMatch(/clips \(92%\), 3 per m: FPS1709MC — made for FPS1709BG2000, as a new ElementType/)
    expect(screen.queryByTestId('suggestion-same')).toBeNull()   // C01r's clip is for another profile
    const addRow = vi.spyOn(useStore.getState(), 'addRecipeRow')
    await act(async () => { fireEvent.click(clips.querySelector('button')) })
    const made = useStore.getState().elementTypes.find(e => e.Name === 'LEDFlex - FPS1709MC')
    expect(made).toMatchObject({ Family: 'ET-LIN-CLIP' })
    expect(addRow).toHaveBeenCalledWith('C05r', 'lin_internal', expect.objectContaining({ elementTypeRef: made.ElementTypeRef, dimQtyMultiplier: 3 }), { asPosition: true })
  })

  test('with nothing known to fit the profile: a TBC placeholder for it, ⋯ for one of the project\'s own', async () => {
    api.current = { kits: vi.fn(async () => []), shareOutcomes: vi.fn(async () => ({ stored: 1 })) }
    const CLIPS = { ...KIND, slots: [{ slot: 'CLIPS', core: false, share: 0.92, section: 'lin_internal' }] }
    await act(async () => { setup() })
    await act(async () => useStore.setState({ library: { patterns: [], exemplars: [], kinds: [CLIPS] },
      recipes: useStore.getState().recipes.filter(r => r.ElementTypeRef !== 'ET-LIN-CLIP-01') }))
    const line = screen.getByTestId('suggestion-kind')
    expect(line.textContent).toMatch(/clips \(92%\) — not known for 021-8810-02/)
    expect(line.querySelector('select')).toBeNull()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add placeholder' })) })
    const ph = useStore.getState().elementTypes.find(e => e.Name === 'TBC - clips for ET-LIN-PROF-01')
    expect(ph).toMatchObject({ Family: 'ET-LIN-CLIP' })
    expect(useStore.getState().psRows.find(r => r.ElementTypeRef === ph.ElementTypeRef)).toMatchObject({ IsTBC: 'Y', Manufacturer: 'LEDFlex' })
    expect(screen.queryByTestId('suggestion-kind')).toBeNull()
    // Removing it brings the line back (an Add is not a dismissal), now naming the placeholder.
    await act(async () => useStore.setState({ recipes: useStore.getState().recipes.filter(r => r.ElementTypeRef !== ph.ElementTypeRef) }))
    expect(screen.getByTestId('suggestion-kind').textContent).toMatch(new RegExp(`${ph.ElementTypeRef} holds its place`))
    fireEvent.click(screen.getByLabelText('More'))
    expect(screen.getByText(/^ET-LIN-CLIP-01/)).toBeInTheDocument()
  })

  test('a TBC part of the recipe gets the code of this profile\'s range', async () => {
    const cap = { key: 'r', range: 'FPSC0808', anchor: { code: 'FPSC0808BG2000' }, part: { maker_key: 'ledflex', code: 'FPSC0808ECG', slot: 'END_CAPS', name: 'FLEX PROFILE SURFACE CORNER 0808 END CAP SET GREY' } }
    api.current = { kits: vi.fn(async () => [cap]), shareOutcomes: vi.fn(async () => ({ stored: 1 })) }
    await act(async () => { setup() })
    await act(async () => useStore.setState({ library: { patterns: [], exemplars: [], kinds: [] },
      elementTypes: [...useStore.getState().elementTypes, { ElementTypeRef: 'ET-LIN-CAP-06', Family: 'ET-LIN-PROF', Name: 'LEDFlex - Half Moon 0808 end cap' }],
      psRows: [{ ElementTypeRef: 'ET-LIN-PROF-01', Manufacturer: 'LEDFlex', ProductCode: 'FPSC0808BG2000' },
        { ElementTypeRef: 'ET-LIN-CAP-06', Manufacturer: 'LEDFlex', ProductCode: 'TBC', IsTBC: 'Y' }],
      recipes: [...useStore.getState().recipes, row('C05r', 'ET-LIN-CAP-06', 'ElementType', { _id: 'cap6' })] }))
    const line = screen.getByTestId('suggestion-tbc')
    expect(line.textContent).toMatch(/end caps ET-LIN-CAP-06 is TBC — this profile's is FPSC0808ECG/)
    const upd = vi.spyOn(useStore.getState(), 'updatePSRow')
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Set code' })) })
    expect(upd).toHaveBeenCalledWith('ET-LIN-CAP-06', { Manufacturer: 'LEDFlex', ProductCode: 'FPSC0808ECG', IsTBC: null })
  })

  test('a TBC-flagged part that already holds a code is left alone (no silent spec change)', async () => {
    const cap = { key: 'r', range: 'FPSC0808', anchor: { code: 'FPSC0808BG2000' }, part: { maker_key: 'ledflex', code: 'FPSC0808ECG', slot: 'END_CAPS', name: 'FLEX PROFILE SURFACE CORNER 0808 END CAP SET GREY' } }
    api.current = { kits: vi.fn(async () => [cap]), shareOutcomes: vi.fn(async () => ({ stored: 1 })) }
    await act(async () => { setup() })
    await act(async () => useStore.setState({ library: { patterns: [], exemplars: [], kinds: [] },
      elementTypes: [...useStore.getState().elementTypes, { ElementTypeRef: 'ET-LIN-CAP-06', Family: 'ET-LIN-PROF', Name: 'LEDFlex - Half Moon 0808 end cap' }],
      psRows: [{ ElementTypeRef: 'ET-LIN-PROF-01', Manufacturer: 'LEDFlex', ProductCode: 'FPSC0808BG2000' },
        { ElementTypeRef: 'ET-LIN-CAP-06', Manufacturer: 'LEDFlex', ProductCode: 'FPSC0808PMCD2000', IsTBC: 'Y' }],
      recipes: [...useStore.getState().recipes, row('C05r', 'ET-LIN-CAP-06', 'ElementType', { _id: 'cap6' })] }))
    expect(screen.queryByTestId('suggestion-tbc')).toBeNull()
  })

  test('a profile whose range has no clip gets no clip line', async () => {
    const cap = { key: 'r', range: 'FPS2020', anchor: { code: 'FPS2020BG2000' }, part: { maker_key: 'ledflex', code: 'FPS2020ECG', slot: 'END_CAPS', name: 'END CAP' } }
    api.current = { kits: vi.fn(async () => [cap]), shareOutcomes: vi.fn(async () => ({ stored: 1 })) }
    const CLIPS = { ...KIND, slots: [{ slot: 'CLIPS', core: false, share: 0.92, section: 'lin_internal' }] }
    await act(async () => { setup() })
    await act(async () => useStore.setState({ library: { patterns: [], exemplars: [], kinds: [CLIPS] },
      recipes: useStore.getState().recipes.filter(r => r.ElementTypeRef !== 'ET-LIN-CLIP-01') }))
    expect(screen.queryByTestId('suggestion-kind')).toBeNull()
  })
})
