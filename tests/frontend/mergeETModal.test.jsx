import { test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

window.electronAPI = { db: { setPref: vi.fn().mockResolvedValue(undefined) } }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))

const { default: useStore } = await import('../../src/store/useStore.js')
const { default: MergeETModal } = await import('../../src/components/MergeETModal.jsx')

// Report #38: "Merge into a new ref" does not ask which ref to start from.
test('new-ref mode has no Start from select', () => {
  const row = ref => ({ ElementTypeRef: ref, Manufacturer: 'LEDFlex', ProductCode: 'FPSN1013' })
  useStore.setState({ recipes: [], psRows: [row('ET-A'), row('ET-B')], elementTypes: [] })
  render(<MergeETModal show refs={['ET-A', 'ET-B']} onClose={() => {}} />)
  expect(screen.getAllByRole('combobox')).toHaveLength(1)
  fireEvent.click(screen.getByLabelText('Merge into a new ref'))
  expect(screen.queryAllByRole('combobox')).toHaveLength(0)
  expect(screen.getByText(/All 2 become the new ref, with ET-A's Product Spec row/)).toBeTruthy()
})
