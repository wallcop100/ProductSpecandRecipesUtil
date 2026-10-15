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
    expect(screen.getByTestId('suggestion-same').textContent).toMatch(/Same as C01r: clips/)
    expect(screen.queryByTestId('suggestion-kind')).toBeNull()
    fireEvent.click(screen.getByLabelText('Dismiss'))
    expect(screen.queryByTestId('recipe-suggestions')).toBeNull()
    expect(JSON.parse(localStorage.getItem('psr-suggestions-dismissed:7900'))).toHaveLength(1)
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
    expect(screen.getByTestId('suggestion-kind').textContent).toMatch(/usually also have diffuser \(96%\), 1 per m ET-LIN-DIFF-01/)
    const addRow = vi.spyOn(useStore.getState(), 'addRecipeRow')
    const kit = screen.getByTestId('suggestion-kit')
    await act(async () => { fireEvent.click(kit.querySelector('button')) })
    const s = useStore.getState()
    expect(s.elementTypes.find(e => e.ElementTypeRef === 'ET-LIN-CAP-01')).toMatchObject({ Family: 'ET-LIN-PROF' })
    expect(addRow).toHaveBeenCalledWith('C05r', 'lin_internal', expect.objectContaining({ elementTypeRef: 'ET-LIN-CAP-01', quantity: 2, isContractItem: 'Y' }), { asPosition: true })
    expect(api.current.shareOutcomes).toHaveBeenCalledWith('7900', [expect.objectContaining({ kind: 'kit', key: KIT.key, outcome: 'accepted' })])
    await act(async () => { fireEvent.click(screen.getByTestId('suggestion-kind').querySelector('[aria-label="Dismiss"]')) })
    expect(api.current.shareOutcomes).toHaveBeenLastCalledWith('7900', [expect.objectContaining({ kind: 'kind', key: '2|DIFFUSER', outcome: 'dismissed' })])
  })
})
