import { describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

window.electronAPI = { db: { setPref: vi.fn().mockResolvedValue(undefined) } }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))

const { default: useStore } = await import('../../src/store/useStore.js')
const { default: NewETModal, familyOptionsOf } = await import('../../src/components/NewETModal.jsx')

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
    const panel = screen.getByText('Form Template Data').parentElement
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
    expect(screen.queryByText('Form Template Data')).toBeNull()
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
  fireEvent.change(screen.getByPlaceholderText(/RAL 9010/), { target: { value: 'RAL 9010' } })
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

test('the Form row shows beside the fields (n/a left out), and a click only copies a value (LWKL84)', async () => {
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
  const writeText = vi.fn().mockResolvedValue()
  Object.assign(navigator, { clipboard: { writeText } })
  fireEvent.focus(name)
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Lumen Line 240' })) })
  expect(writeText).toHaveBeenCalledWith('Lumen Line 240')
  expect(name).not.toHaveValue('Lumen Line 240')
  useStore.setState({ importDraft: null })
})

test('External Notes goes onto the new Product Spec row, beside Internal Notes', () => {
  setup({ prefill: { ref: 'ET-EXT-01' }, importContext: null, draftKey: 'ext' })
  fireEvent.change(document.querySelector('[data-field="extNotes"]'), { target: { value: 'Supplied by others' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create Element Type' }))
  expect(useStore.getState().psRows.find(r => r.ElementTypeRef === 'ET-EXT-01').ExternalNotesText).toBe('Supplied by others')
})

test('a ref that already has a Product Spec row cannot be created, so its description is never overwritten', () => {
  setup({ prefill: { ref: 'ET-KEEP-01', description: 'New words' }, importContext: null, draftKey: 'keep' })
  act(() => useStore.setState({ psRows: [{ ElementTypeRef: 'ET-KEEP-01', ComponentDescription: 'Old words' }] }))
  expect(screen.getByRole('button', { name: 'Create Element Type' })).toBeDisabled()
  expect(useStore.getState().psRows[0].ComponentDescription).toBe('Old words')
})

test('the Form pane and diff Create (position passed as import context) show the Form row too', () => {
  useStore.setState({ importDraft: { map: { mfr: 'ManufacturerName' }, rows: [
    { positionType: 'C03', rawText: 'LL240272024', manufacturer: 'LEDFlex', context: { ProductName: 'Lumen Line 240' } },
  ] } })
  setup({ importContext: { code: 'LL240272024', positionTypes: ['C03'], rowCount: 1 }, prefill: {}, draftKey: 'ctxrow' })
  expect(screen.getByTestId('newet-form-row')).toHaveTextContent('ProductNameLumen Line 240')
  // The right panel says it in full: no second Form Template Data box on the left.
  expect(screen.queryByText('Form Template Data')).toBeNull()
  useStore.setState({ importDraft: null })
})

test('ZAJ889: a proposal fills the fields with wands; the Form\'s Finish waits, muted, until clicked', () => {
  useStore.setState({ importDraft: { map: { mfr: 'ManufacturerName', code: 'ProductCode' }, rows: [
    { positionType: 'H351', rawText: 'LD53', manufacturer: 'LightGraphix', context: { ProductName: 'LD53', Finish: 'Classic bronze' } },
  ] } })
  setup({ importContext: null, formRefs: ['H351'], draftKey: 'zaj889',
    prefill: { ref: 'ET-PS-07', name: 'LightGraphix - LD53', family: 'ET-SPIKE', manufacturer: 'LightGraphix', productCode: 'LD53', description: 'LD53', why: 'like LD51 here' } })
  for (const f of ['ref', 'name', 'family', 'manufacturer', 'productCode']) expect(screen.getByTestId(`wand-${f}`)).toBeInTheDocument()
  expect(screen.getByTestId('wand-ref').title).toBe('Suggested: like LD51 here')
  expect(screen.getByTestId('wand-manufacturer').title).toMatch(/^Filled in/)   // copied from the Form, not learned
  expect(screen.queryByTestId('wand-description')).toBeNull()        // only the code again: nothing proposed
  const finish = document.querySelector('[data-field="finish"]')
  expect(finish).toHaveValue('')
  expect(finish.placeholder).toBe('Classic bronze')
  expect(screen.getByTestId('newet-use-finish')).toHaveTextContent('Classic bronze')   // E5UVLW
  fireEvent.click(finish)
  expect(finish).toHaveValue('Classic bronze')
  expect(screen.queryByTestId('newet-use-finish')).toBeNull()
  expect(screen.getByTestId('wand-finish')).toBeInTheDocument()
  fireEvent.change(document.querySelector('[data-field="name"]'), { target: { value: 'Spike' } })
  expect(screen.queryByTestId('wand-name')).toBeNull()
  expect(screen.queryByText(/at once/)).toBeNull()   // 2V84PW: no bulk jump; the pane walks the codes
  useStore.setState({ importDraft: null })
})

describe('placeIn: the footer puts the new ElementType where you say', () => {
  const wrapped = [{ PositionTypeRef: 'D74', ContextType: 'PositionType', ContextRef: 'D74', ElementTypeRef: 'ET-DL-04', IsDesign: 'Y' }]
  const place = (recipes, testId) => {
    useStore.setState({ projectId: 42, elementTypes: [], psRows: [], recipes, containerETRefs: new Set(['et-dl-04']),
      dbWriteEnabled: false, psChanges: [], rsChanges: [], dbChanges: [], past: [], future: [] })
    const onCreated = vi.fn()
    render(<NewETModal show onHide={vi.fn()} onCreated={onCreated} prefill={prefill} importContext={ctx} draftKey={`::${testId}`} placeIn="D74" />)
    if (testId) fireEvent.click(screen.getByTestId(testId))
    return onCreated
  }
  const rowsOf = et => useStore.getState().recipes.filter(r => r.ElementTypeRef === et)

  test('no wrapper on the position, no wrapper tick box', () => {
    place([], null)
    expect(screen.queryByTestId('newet-inside')).toBeNull()
    expect(screen.getByTestId('newet-into-position')).toHaveTextContent('Add into D74')
  })

  test('into the position', () => {
    expect(place(wrapped, 'newet-into-position')).toHaveBeenCalledWith('ET-PROF-02', 'position', { advance: false })
    expect(rowsOf('ET-PROF-02')).toMatchObject([{ ContextType: 'PositionType', ContextRef: 'D74' }])
  })

  test('into the wrapper: tick Inside, then Add', () => {
    const onCreated = place(wrapped, null)
    expect(screen.getByTestId('newet-inside')).not.toBeChecked()   // no precedent: unticked, not purple
    expect(screen.queryByTestId('newet-inside-learned')).toBeNull()
    fireEvent.click(screen.getByLabelText(/Inside/))
    fireEvent.click(screen.getByTestId('newet-into-position'))
    expect(onCreated).toHaveBeenCalledWith('ET-PROF-02', 'wrapper', { advance: false })
    expect(rowsOf('ET-PROF-02')).toMatchObject([{ ContextType: 'ElementType', ContextRef: 'ET-DL-04' }])
  })

  test('Product Spec only: a spec row, no recipe row', () => {
    expect(place(wrapped, 'newet-ps-only')).toHaveBeenCalledWith('ET-PROF-02', 'ps', { advance: false })
    expect(rowsOf('ET-PROF-02')).toHaveLength(0)
    expect(useStore.getState().psRows.some(r => r.ElementTypeRef === 'ET-PROF-02')).toBe(true)
  })
})

describe('2V84PW: one code of a queue', () => {
  const wrapper = { PositionTypeRef: 'D74', ContextType: 'PositionType', ContextRef: 'D74', ElementTypeRef: 'ET-DL-04', IsDesign: 'Y' }
  const base = (over = {}) => useStore.setState({ projectId: 42, elementTypes: [], psRows: [], recipes: [wrapper],
    containerETRefs: new Set(['et-dl-04']), dbWriteEnabled: false, psChanges: [], rsChanges: [], dbChanges: [], past: [], future: [], ...over })
  const step = (over = {}) => ({ index: 0, total: 3, states: ['current', 'waiting', 'waiting'], doneRefs: [], onBack: null, onSkip: vi.fn(), ...over })
  const open = props => render(<NewETModal show onHide={vi.fn()} onCreated={vi.fn()} prefill={prefill} importContext={ctx} placeIn="D74" {...props} />)

  test('progress, no Back on the first, Continue advances, the outline Add stops', () => {
    base()
    const onCreated = vi.fn(), s = step()
    open({ onCreated, step: s, draftKey: '::q1' })
    expect(screen.getByTestId('newet-step')).toHaveTextContent('D74 · code 1 of 3')
    expect([...screen.getByTestId('newet-progress').children].map(c => c.dataset.state)).toEqual(['current', 'waiting', 'waiting'])
    expect(screen.queryByTestId('newet-back')).toBeNull()
    expect(screen.getByTestId('newet-into-position')).toHaveTextContent('Add into D74 and Continue')
    expect(screen.getByTestId('newet-into-position-stop')).toHaveTextContent('Add into D74')
    fireEvent.click(screen.getByTestId('newet-skip'))
    expect(s.onSkip).toHaveBeenCalled()
    expect(useStore.getState().elementTypes).toHaveLength(0)        // Skip makes nothing
    fireEvent.click(screen.getByTestId('newet-into-position'))
    expect(onCreated).toHaveBeenLastCalledWith('ET-PROF-02', 'position', { advance: true })
  })

  test('the last code finishes; Back and Product Spec only carry on', () => {
    base()
    const onCreated = vi.fn(), onBack = vi.fn()
    open({ onCreated, step: step({ index: 2, states: ['done', 'skipped', 'current'], doneRefs: ['ET-PS-01'], onBack }), draftKey: '::q3' })
    expect(screen.getByTestId('newet-into-position')).toHaveTextContent('Add into D74 and finish')
    expect(screen.queryByTestId('newet-into-position-stop')).toBeNull()   // one Add on the last code (RQC5ZU)
    expect(screen.getByTestId('newet-step')).toHaveTextContent('done: ET-PS-01')
    fireEvent.click(screen.getByTestId('newet-back'))
    expect(onBack).toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('newet-ps-only'))
    expect(onCreated).toHaveBeenLastCalledWith('ET-PROF-02', 'ps', { advance: true })
  })

  test('Inside is ticked, purple, when the project puts parts doing this job inside a wrapper', () => {
    base({ recipes: [wrapper, { PositionTypeRef: 'D10', ContextType: 'ElementType', ContextRef: 'ET-DL-01', ElementTypeRef: 'ET-PROF-01' }] })
    const onCreated = vi.fn()
    open({ onCreated, draftKey: '::prec' })
    expect(screen.getByTestId('newet-inside')).toBeChecked()
    expect(screen.getByTestId('newet-inside-learned').title).toMatch(/1 of 1 .*inside a wrapper/)
    fireEvent.click(screen.getByTestId('newet-into-position'))
    expect(onCreated).toHaveBeenCalledWith('ET-PROF-02', 'wrapper', { advance: false })
    expect(useStore.getState().recipes.filter(r => r.ElementTypeRef === 'ET-PROF-02')).toMatchObject([{ ContextType: 'ElementType', ContextRef: 'ET-DL-04' }])
  })

  test('Back onto one made earlier: a change updates the ElementType and its Product Spec row, no second one', () => {
    base({
      elementTypes: [{ ElementTypeRef: 'ET-PROF-02', Name: 'Old name', Description: 'Profile 2020', Family: 'ET-LIN-PROF', _row_num: null }],
      psRows: [{ ElementTypeRef: 'ET-PROF-02', Manufacturer: 'Flexalighting', ProductCode: 'FPS2020BG2000', ComponentDescription: 'Profile 2020' }],
      recipes: [wrapper, { _id: 'r1', PositionTypeRef: 'D74', ContextType: 'PositionType', ContextRef: 'D74', ElementTypeRef: 'ET-PROF-02' }],
    })
    const onCreated = vi.fn()
    open({ onCreated, editing: 'ET-PROF-02', step: step({ index: 0 }), draftKey: '::q1' })
    expect(document.querySelector('[data-field="name"]')).toHaveValue('Old name')
    expect(screen.getByTestId('newet-into-position')).not.toBeDisabled()   // its own ref is not "already exists"
    fireEvent.change(document.querySelector('[data-field="name"]'), { target: { value: 'New name' } })
    fireEvent.change(document.querySelector('[data-field="finish"]'), { target: { value: 'Black' } })
    fireEvent.click(screen.getByTestId('newet-into-position'))
    const st = useStore.getState()
    const mine = st.elementTypes.filter(e => e.ElementTypeRef === 'ET-PROF-02')
    expect(mine).toHaveLength(1)
    expect(mine[0]).toMatchObject({ Name: 'New name', Description: 'Profile 2020 (Black)' })
    expect(st.psRows.find(r => r.ElementTypeRef === 'ET-PROF-02')).toMatchObject({ ComponentDescription: 'Profile 2020 (Black)', Manufacturer: 'Flexalighting' })
    expect(st.recipes.filter(r => r.ElementTypeRef === 'ET-PROF-02')).toHaveLength(1)
    expect(onCreated).toHaveBeenCalledWith('ET-PROF-02', 'position', { advance: true })
  })
})

describe('a Form card Create proposes, and learns from this sitting', () => {
  const et = (ref, family, name) => ({ ElementTypeRef: ref, Family: family, Name: name, _row_num: 1 })
  const ps = (ref, maker, code) => ({ ElementTypeRef: ref, Manufacturer: maker, ProductCode: code })
  const open = (code, key) => render(<NewETModal show onHide={vi.fn()} onCreated={vi.fn()} draftKey={key}
    prefill={{ manufacturer: 'LEDFlex', productCode: code }} importContext={{ code, manufacturer: 'LEDFlex', positionTypes: ['C9'] }} />)
  const field = f => document.querySelector(`[data-field="${f}"]`)

  test('family, ref and name from the project, each saying where it came from', () => {
    useStore.setState({ projectId: 42, recipes: [], positionTypes: [], sitting: [], psChanges: [], dbChanges: [], past: [], future: [],
      elementTypes: [et('ET-PROF-1009-01', 'ET-LIN-PROF', 'LEDFlex - 1009 Profile')], psRows: [ps('ET-PROF-1009-01', 'LEDFlex', '012-1009-SL')] })
    open('012-1019-SL', '::a')
    expect(field('family')).toHaveValue('ET-LIN-PROF')
    expect(field('ref')).toHaveValue('ET-PROF-1019-01')
    expect(field('name')).toHaveValue('LEDFlex - 1019 Profile')
    expect(screen.getByTestId('ref-from')).toHaveTextContent('ref like ET-PROF-1009-01 here')
    // A learned suggestion wears companion purple.
    expect(screen.getByTestId('ref-from').querySelector('.companion-dot')).not.toBeNull()
    expect(screen.getByTestId('family-from').querySelector('.companion-dot')).not.toBeNull()
    expect(screen.getByTestId('family-from')).toBeInTheDocument()
  })

  test('with nothing else to go on, the maker\'s last family this sitting', () => {
    useStore.setState({ projectId: 42, recipes: [], positionTypes: [], elementTypes: [], psRows: [], psChanges: [], dbChanges: [], past: [], future: [],
      sitting: [{ code: 'ZZ-1', maker: 'LEDFlex', kept: { family: 'ET-LIN-CLIPS', ref: 'ET-CLIP-FLEX-01', name: '' } }] })
    useStore.getState().noteKept({ code: 'QQ-9', maker: 'Other', family: 'ET-PS', ref: 'ET-PS-07' })
    open('XK-77', '::b')
    expect(field('family')).toHaveValue('ET-LIN-CLIPS')
    expect(field('ref')).toHaveValue('ET-CLIP-FLEX-02')
    expect(screen.getByTestId('family-from')).toHaveTextContent("a guess: you filed LEDFlex's last one (ZZ-1) here this sitting")
    expect(screen.getByTestId('ref-from')).toHaveTextContent('your last one in ET-LIN-CLIPS')
  })

  test('creating one adds it to the sitting', () => {
    useStore.setState({ projectId: 42, recipes: [], positionTypes: [], elementTypes: [], psRows: [], sitting: [], psChanges: [], dbChanges: [], past: [], future: [] })
    open('XK-78', '::c')
    fireEvent.change(field('family'), { target: { value: 'ET-LIN-CLIPS' } })
    fireEvent.change(field('ref'), { target: { value: 'ET-CLIP-FLEX-01' } })
    fireEvent.click(screen.getByRole('button', { name: /Create Element Type/ }))
    expect(useStore.getState().sitting).toMatchObject([{ code: 'XK-78', maker: 'LEDFlex', kept: { family: 'ET-LIN-CLIPS', ref: 'ET-CLIP-FLEX-01' } }])
  })
})

describe('AEST77: the family list', () => {
  test('an assembly wrapper (ET-LIN-07) is not offered as a family', async () => {
    const { familyOptionsOf } = await import('../../src/components/NewETModal.jsx')
    const opts = familyOptionsOf([
      { ElementTypeRef: 'ET-LIN-07', Family: 'ET-LINEAR', IsCollection: 'Y' },
      { ElementTypeRef: 'ET-TAPE-01', Family: 'ET-LIN-07' },
      { ElementTypeRef: 'ET-PS-MOUNTING', IsCollection: 'Y' },
    ])
    expect(opts).not.toContain('ET-LIN-07')
    expect(opts).toContain('ET-PS-MOUNTING')
    expect(opts).toContain('ET-LINEAR')
  })
})

describe('house maker spelling', () => {
  test('"Light Graphix" is offered as LightGraphix, and one click takes it', () => {
    setup()
    const m = document.querySelector('[data-field="manufacturer"]')
    fireEvent.change(m, { target: { value: 'Light Graphix' } })
    fireEvent.click(screen.getByRole('button', { name: 'LightGraphix' }))
    expect(m).toHaveValue('LightGraphix')
    expect(screen.queryByTestId('house-maker')).toBeNull()
  })
})

describe('ref hygiene (LOOP_CHECKS_PLAN A)', () => {
  const refField = () => document.querySelector('[data-field="ref"]')
  const create = () => screen.getByRole('button', { name: 'Create Element Type' })

  test('ET-XX- suggests ET-XX-01, never ET-XX--01, and cannot be created as typed', () => {
    setup({ prefill: { ...prefill, ref: '' } })
    fireEvent.change(refField(), { target: { value: 'ET-XX-' } })
    expect(screen.getByRole('button', { name: 'ET-XX-01' })).toBeInTheDocument()
    expect(screen.queryByText(/ET-XX--01/)).toBeNull()
    expect(create()).toBeDisabled()
  })

  test('a doubled - is an error, with the fix one click away', () => {
    setup({ prefill: { ...prefill, ref: '' } })
    fireEvent.change(refField(), { target: { value: 'ET-XX--01' } })
    expect(screen.getByTestId('ref-empty-segment')).toBeInTheDocument()
    expect(create()).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'ET-XX-01' }))
    expect(refField()).toHaveValue('ET-XX-01')
    expect(create()).not.toBeDisabled()
  })

  test('whitespace is fixed when the field is left, and at Create', () => {
    setup({ prefill: { ...prefill, ref: '' } })
    fireEvent.change(refField(), { target: { value: ' ET- FRAME-DOWN IN-LINE ' } })
    fireEvent.blur(refField())
    expect(refField()).toHaveValue('ET-FRAME-DOWN-IN-LINE')
    fireEvent.change(refField(), { target: { value: 'ET-TAPE 01' } })
    fireEvent.click(create())
    expect(useStore.getState().elementTypes.map(e => e.ElementTypeRef)).toContain('ET-TAPE-01')
  })
})

test('VHCCAF: a wrapper collection nobody files under is not a family', () => {
  const opts = familyOptionsOf([
    { ElementTypeRef: 'ET-LIN-08', IsCollection: 'Y', Family: 'ET-LIN' },
    { ElementTypeRef: 'ET-LIN-XX', IsCollection: 'Y', Family: 'ET-LIN' },
    { ElementTypeRef: 'ET-LIN-PROF-01', Family: 'ET-LIN-COMPONENTS' },
  ])
  expect(opts).toContain('ET-LIN-COMPONENTS')
  expect(opts).not.toContain('ET-LIN-XX')
})
