import { describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

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

test('report #30: the Product Spec fields open expanded even with nothing prefilled', () => {
  setup({ prefill: {}, importContext: null, draftKey: 'blank' })
  expect(screen.getByPlaceholderText('e.g. Osram')).toBeInTheDocument()
})

test('92YN3U: TBC, Properties TBC and a note go to both the Product Spec and the ElementType', () => {
  setup({ prefill: { ref: 'ET-LIN-TAPE-09', manufacturer: 'LEDFlex', productCode: 'TBC' }, importContext: null, draftKey: '92yn3u' })
  fireEvent.click(screen.getByRole('switch', { name: 'TBC' }))
  fireEvent.click(screen.getByRole('switch', { name: 'Properties TBC' }))
  fireEvent.change(screen.getByPlaceholderText('Anything to query…'), { target: { value: 'Which CCT?' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create Element Type' }))
  const s = useStore.getState()
  const ps = s.psRows.find(r => r.ElementTypeRef === 'ET-LIN-TAPE-09')
  const et = s.elementTypes.find(e => e.ElementTypeRef === 'ET-LIN-TAPE-09')
  for (const row of [ps, et]) {
    expect(row.IsTBC).toBe('Y')
    expect(row.IsPropertiesTBC).toBe('Y')
    expect(row.InternalNotesText).toBe('Which CCT?')
  }
})

test('NQLUFQ: Finish lands in brackets after the description, which the Product Spec shares', () => {
  setup({ prefill: { ref: 'ET-DL-09', description: 'Downlight', manufacturer: 'Acme' }, importContext: null, draftKey: 'nqlufq' })
  fireEvent.change(screen.getByPlaceholderText(/added in brackets/), { target: { value: 'RAL 9010' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create Element Type' }))
  const s = useStore.getState()
  expect(s.elementTypes.find(e => e.ElementTypeRef === 'ET-DL-09').Description).toBe('Downlight (RAL 9010)')
  expect(s.psRows.find(r => r.ElementTypeRef === 'ET-DL-09').ComponentDescription).toBe('Downlight (RAL 9010)')
})

describe('HYQ246: a placeholder code is not a duplicate', () => {
  const taken = [{ ElementTypeRef: 'ET-LIN-01', Manufacturer: 'Ideaworks', ProductCode: 'N/A' },
                 { ElementTypeRef: 'ET-PROF-01', Manufacturer: 'Flexalighting', ProductCode: 'FPS2020BG2000' }]
  const open = (mfr, code) => {
    setup({ prefill: { ref: 'ET-LIN-09', manufacturer: mfr, productCode: code }, importContext: null, draftKey: `hyq-${code}` })
    act(() => useStore.setState({ psRows: taken }))
  }
  test('N/A with the same maker shows no warning', () => {
    open('Ideaworks', 'n/a')
    expect(screen.queryByText(/Use existing/)).toBeNull()
  })
  test('a real code still does', () => {
    open('Flexalighting', 'FPS2020BG2000')
    expect(screen.getByText('Use existing ET-PROF-01')).toBeInTheDocument()
  })
})

test('the Form row shows beside the fields (n/a left out), and a click puts a value into the last field', () => {
  useStore.setState({ importDraft: { map: { mfr: 'ManufacturerName', code: 'ProductCode' }, rows: [
    { positionType: 'C03', rawText: 'OTHER1', manufacturer: 'X', context: { ProductName: 'Wrong row' } },
    { positionType: 'C03', rawText: 'LL240272024', manufacturer: 'LEDFlex', context: { SortOrder: 19, ProductName: 'Lumen Line 240', Finish: 'n/a', Codes: 'LL240272024' } },
  ] } })
  setup({ importContext: null, prefill: { productCode: 'LL240272024' }, formRefs: ['C03'], draftKey: 'formrow' })
  const side = screen.getByTestId('newet-form-row')
  expect(side).toHaveTextContent('ManufacturerNameLEDFlex')
  expect(side).toHaveTextContent('ProductNameLumen Line 240')
  expect(side).not.toHaveTextContent('Finish')
  expect(side).not.toHaveTextContent('Codes')
  expect(side).not.toHaveTextContent('SortOrder')
  const name = document.querySelector('[data-field="name"]')
  fireEvent.focus(name)
  fireEvent.click(screen.getByRole('button', { name: 'Lumen Line 240' }))
  expect(name).toHaveValue('Lumen Line 240')
  useStore.setState({ importDraft: null })
})

test('External Notes goes onto the new Product Spec row, beside Internal Notes', () => {
  setup({ prefill: { ref: 'ET-EXT-01' }, importContext: null, draftKey: 'ext' })
  fireEvent.change(document.querySelector('[data-field="extNotes"]'), { target: { value: 'Supplied by others' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create Element Type' }))
  expect(useStore.getState().psRows.find(r => r.ElementTypeRef === 'ET-EXT-01').ExternalNotesText).toBe('Supplied by others')
})
