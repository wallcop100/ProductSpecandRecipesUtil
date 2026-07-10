import { describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

window.electronAPI = { db: { setPref: vi.fn().mockResolvedValue(undefined) } }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))

const { default: useStore } = await import('../../src/store/useStore.js')
const { default: NewETModal } = await import('../../src/components/NewETModal.jsx')

const ctx = {
  code: 'FPS2020BG2000',
  manufacturer: 'Flexalighting',
  note: 'Profile 2020',
  positionTypes: ['C01r', 'C03r'],
  rowCount: 2,
}
const prefill = { ref: 'ET-PROF-02', manufacturer: 'Flexalighting', productCode: 'FPS2020BG2000', description: 'Profile 2020' }

function setup(over = {}) {
  useStore.setState({
    projectId: 42, elementTypes: [], psRows: [], recipes: [],
    dbWriteEnabled: false, psChanges: [], dbChanges: [], past: [], future: [],
  })
  const props = {
    show: true, onHide: vi.fn(), onCreated: vi.fn(),
    prefill, importContext: ctx, draftKey: '::FPS2020BG2000', ...over,
  }
  return { ...render(<NewETModal {...props} />), props }
}

describe('the import\'s context travels into the modal', () => {
  beforeEach(() => vi.clearAllMocks())

  test('the captured code, maker and note are shown as evidence', () => {
    setup()
    const panel = screen.getByText('From the Form').parentElement
    expect(panel).toHaveTextContent('FPS2020BG2000')
    expect(panel).toHaveTextContent('Flexalighting')
    expect(panel).toHaveTextContent('note: Profile 2020')
    // the note also seeds the Description field — that is a field, this is evidence
    expect(screen.getByPlaceholderText(/What is this element type/)).toHaveValue('Profile 2020')
  })

  test('it names the PositionTypes that asked for it', () => {
    setup()
    expect(screen.getByText('C01r, C03r')).toBeInTheDocument()
    expect(screen.getByText(/2 rows/)).toBeInTheDocument()
  })

  test('a product with no manufacturer says so', () => {
    setup({ importContext: { ...ctx, manufacturer: '' } })
    expect(screen.getByText('no manufacturer')).toBeInTheDocument()
  })

  test('a merge names every code being folded onto one ElementType', () => {
    setup({ importContext: { ...ctx, mergedCodes: ['250-1CH', '250-1CH-A'] } })
    expect(screen.getByText(/merging 2 codes/)).toBeInTheDocument()
    expect(screen.getByText('250-1CH, 250-1CH-A')).toBeInTheDocument()
  })

  test('with no import context the panel is absent', () => {
    setup({ importContext: null })
    expect(screen.queryByText('From the Form')).toBeNull()
  })
})

describe('the draft survives closing and reopening', () => {
  beforeEach(() => vi.clearAllMocks())

  test('what you typed comes back for the same code', () => {
    const { rerender, props } = setup()
    const refInput = screen.getByPlaceholderText('e.g. ET-TAPE-004')
    fireEvent.change(refInput, { target: { value: 'ET-MY-CHOICE-07' } })

    // Close it to go and look at a sibling code, then come back.
    rerender(<NewETModal {...props} show={false} />)
    rerender(<NewETModal {...props} show />)

    expect(screen.getByPlaceholderText('e.g. ET-TAPE-004')).toHaveValue('ET-MY-CHOICE-07')
  })

  test('a DIFFERENT code seeds afresh, and does not inherit the last draft', () => {
    const { rerender, props } = setup()
    fireEvent.change(screen.getByPlaceholderText('e.g. ET-TAPE-004'), { target: { value: 'ET-MY-CHOICE-07' } })
    rerender(<NewETModal {...props} show={false} />)

    rerender(
      <NewETModal {...props} show draftKey="::LL240272024"
        prefill={{ ...prefill, ref: 'ET-TAPE-05', productCode: 'LL240272024' }} />
    )
    expect(screen.getByPlaceholderText('e.g. ET-TAPE-004')).toHaveValue('ET-TAPE-05')
  })

  test('the prefilled ref is used when nothing has been typed', () => {
    setup()
    expect(screen.getByPlaceholderText('e.g. ET-TAPE-004')).toHaveValue('ET-PROF-02')
  })
})
