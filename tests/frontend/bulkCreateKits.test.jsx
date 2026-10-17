import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

const api = { current: null }
vi.mock('../../src/platform/companion', () => ({ useCompanion: () => api.current, getCompanion: async () => api.current }))
window.electronAPI = { db: { setPref: vi.fn().mockResolvedValue(undefined) } }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))
const { default: useStore } = await import('../../src/store/useStore.js')
const { default: BulkCreateETModal } = await import('../../src/components/BulkCreateETModal.jsx')

const PROF = { code: '021-8810-02', manufacturer: 'LEDFlex', include: true, action: 'create', reuseRef: null, family: 'ET-LIN-PROF',
  ref: 'ET-LIN-PROF-01', name: 'LEDFlex - 021-8810-02', description: '', why: 'job', job: { slot: 'PROFILE', variant: '' }, parent: null, spread: 1 }
const KIT = { key: 'ledflex|021-8810-02>ledflex|021-8810-11', anchor: { code: '021-8810-02' },
  part: { code: '021-8810-11', slot: 'END_CAPS', name: 'LED Flex - 8810 Cap' }, share: 1, qty: 2, dim: null, integer: false, contract: true }

describe('kits in the ElementType review (beside a companion)', () => {
  test('a profile brings a line for its usual parts; Add proposes the part, and the answer feeds back', async () => {
    api.current = { kits: vi.fn(async () => [KIT]), shareOutcomes: vi.fn(async () => ({ stored: 1 })) }
    const onApply = vi.fn()
    useStore.setState({ projectNumber: '7900' })
    await act(async () => {
      render(<BulkCreateETModal show proposals={[PROF]} newFamilies={[]} families={['ET-LIN-PROF']} elementTypes={[]} onApply={onApply} onHide={() => {}} />)
    })
    expect(api.current.kits).toHaveBeenCalledWith([{ code: '021-8810-02', manufacturer: 'LEDFlex' }], '7900')
    expect(screen.getByTestId('kit-suggestions').textContent).toMatch(/Usually with 021-8810-02: end caps 021-8810-11 LED Flex - 8810 Cap, ×2/)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Add' })) })
    expect(screen.queryByTestId('kit-suggestions')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Apply 2' }))
    const items = onApply.mock.calls[0][0].items
    expect(items[1]).toMatchObject({ code: '021-8810-11', family: 'ET-LIN-CAPS', ref: 'ET-LIN-CAP-01', why: 'kit' })
    expect(api.current.shareOutcomes).toHaveBeenCalledWith('7900', [expect.objectContaining({ kind: 'kit', key: KIT.key, outcome: 'accepted' })])
  })

  test('without a companion there is no kit line', () => {
    api.current = null
    render(<BulkCreateETModal show proposals={[PROF]} newFamilies={[]} families={['ET-LIN-PROF']} elementTypes={[]} onApply={() => {}} onHide={() => {}} />)
    expect(screen.queryByTestId('kit-suggestions')).toBeNull()
  })
})
