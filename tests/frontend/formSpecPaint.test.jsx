import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react'

const readSheet = vi.fn()
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: (...a) => readSheet(...a),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(),
  fileMeta: vi.fn().mockResolvedValue({ name: 'form.xlsx' }),
}))
const prefs = {}
window.electronAPI = {
  openXlsxDialog: vi.fn().mockResolvedValue('tok-1'),
  db: { setPref: vi.fn(async (_p, k, v) => { prefs[k] = v }), getPref: vi.fn(async (_p, k) => prefs[k] ?? null) },
}
window.confirm = vi.fn(() => true)
// Offcanvas asks for the viewport size.
window.matchMedia ||= () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} })

const { default: useStore } = await import('../../src/store/useStore.js')
const { default: FormSpecPane } = await import('../../src/components/FormSpecPane.jsx')
const { positionPaintStatus } = await import('../../src/utils/formPositions.js')

const HEAD = ['PositionTypeRef', 'ManufacturerName', 'ProductCode']
const ROWS = [
  { PositionTypeRef: 'C01', ManufacturerName: 'iGuzzini', ProductCode: 'QC50' },
  { PositionTypeRef: 'C02', ManufacturerName: 'iGuzzini', ProductCode: 'QC51' },
  { PositionTypeRef: 'C03', ManufacturerName: 'iGuzzini', ProductCode: 'QC52' },
]
// The compact painter shows the cell text; the codes here are unique per position.
const CODE = { QC50: 'C01', QC51: 'C02', QC52: 'C03' }
// Rows the spec settles are folded: open the fold, then read the rows.
const openDone = () => { const b = screen.queryByTestId('compact-done'); if (b && /show/.test(b.textContent)) fireEvent.click(within(b).getByText('show')) }
const tableRefs = () => (openDone(), screen.getAllByTestId('compact-row')).map(r => CODE[r.textContent.match(/QC5\d/)?.[0]])

beforeEach(() => {
  for (const k of Object.keys(prefs)) delete prefs[k]
  readSheet.mockReset().mockResolvedValue({ sheets: ['S'], sheet: 'S', headers: HEAD, rows: ROWS })
  window.electronAPI.openXlsxDialog.mockClear()
  useStore.setState({ formPaintMode: true,   // these test painting; view-first is tested below
   
    projectId: 1, importDraft: null, formCaptures: null, containerETRefs: new Set(),
    recipes: [{ _id: 'r1', PositionTypeRef: 'C01', ContextType: 'PositionType', ContextRef: 'C01', ElementTypeRef: 'ET-PS-OLD', Quantity: 1 }],
    positionTypes: ['C01', 'C02', 'C03'].map(r => ({ PositionTypeRef: r })),
    elementTypes: ['ET-PS-01', 'ET-PS-03', 'ET-PS-OLD'].map(r => ({ ElementTypeRef: r })),
    psRows: [
      { ElementTypeRef: 'ET-PS-01', Manufacturer: 'iGuzzini', ProductCode: 'QC50' },
      { ElementTypeRef: 'ET-PS-03', Manufacturer: 'iGuzzini', ProductCode: 'QC52' },
    ],
  })
})

describe('D4Z9CX: paint one position from the builder', () => {
  test('load the Form once; a position whose codes are all known saves itself; the next needs no file', async () => {
    const view = render(<FormSpecPane posRef="C01" />)
    fireEvent.click(screen.getByTestId('paint-position'))
    fireEvent.click(await screen.findByText('Choose spreadsheet…'))
    // QC50 is in the spec: nothing to ask, no Save to press. C01 is saved and the painter closes.
    await waitFor(() => expect(useStore.getState().formCaptures?.byPosition?.C01?.[0]?.elementTypeRef).toBe('ET-PS-01'))
    expect(Object.keys(useStore.getState().formCaptures.byPosition)).toEqual(['C01'])   // C02, C03 untouched
    await waitFor(() => expect(screen.queryByTestId('compact-painter')).toBeNull())
    expect(screen.getByTestId('paint-status')).toHaveTextContent('Codes in Product Spec')
    expect(screen.getByText(/ET-PS-01/)).toBeInTheDocument()

    // Next position: from the same session, saved by itself; opened, its known code is listed.
    view.unmount()
    render(<FormSpecPane posRef="C03" />)
    await waitFor(() => expect(useStore.getState().formCaptures.byPosition.C03?.[0]?.elementTypeRef).toBe('ET-PS-03'))
    await waitFor(() => expect(screen.getByTestId('paint-status')).toHaveTextContent('Codes in Product Spec'))
    fireEvent.click(screen.getByTestId('paint-position'))
    expect(await screen.findByTestId('compact-known')).toHaveTextContent('QC52 → ET-PS-03')
    expect(screen.getAllByTestId('compact-row')).toHaveLength(1)                 // 5FGNH2: its words, to paint
    expect(screen.queryByTestId('add-and-build')).toBeNull()                  // no Save button
    expect(window.electronAPI.openXlsxDialog).toHaveBeenCalledTimes(1)
  })

  test('the Form now gives something else than was saved: saved again, and the dropped product shows to remove', async () => {
    useStore.setState({ formCaptures: { version: 1, byPosition: { C01: [{ elementTypeRef: 'ET-PS-OLD', code: 'OLD1', manufacturer: 'iGuzzini' }] } } })
    render(<FormSpecPane posRef="C01" />)
    fireEvent.click(screen.getByTestId('paint-position'))
    fireEvent.click(await screen.findByText('Choose spreadsheet…'))
    await waitFor(() => expect(useStore.getState().formCaptures.byPosition.C01?.[0]?.elementTypeRef).toBe('ET-PS-01'))
    await screen.findByText('No longer in the Form')
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    const r1 = useStore.getState().recipes.find(r => r._id === 'r1')
    expect(!r1 || r1.IsDeleted === 'Y').toBe(true)
  })

  test('positionPaintStatus follows the resolved ref', () => {
    const draft = { rows: [{ positionType: 'C01', rawText: 'QC50', confirmed: true }], map: { pt: 'PositionTypeRef' },
      resolutions: [{ formRef: 'C01', target: 'C01r' }], stagedRefs: ['C01'] }
    const helpers = { buildRefMap: (res) => new Map(res.map(r => [r.formRef.toUpperCase(), r.target])), targetFor: (m, f) => m.get(f.toUpperCase()) || null }
    expect(positionPaintStatus(draft, 'C01r', helpers).state).toBe('added')
    expect(positionPaintStatus(draft, 'C01', helpers).state).toBe('absent')
    expect(positionPaintStatus(null, 'C01r').state).toBe('noForm')
  })

  test('U737Z6: a confirmed entry whose code has no ElementType is not "ready"', () => {
    const draft = { rows: [{ positionType: 'H356', rawText: 'LD53', manufacturer: 'X', confirmed: true }] }
    const st = positionPaintStatus(draft, 'H356', { knows: () => false })
    expect(st.state).toBe('todo')
    expect(st.newCodes).toBe(1)
    expect(positionPaintStatus(draft, 'H356', { knows: () => true }).state).toBe('ready')
  })
})

describe('ZEM43Y / 859SCF: nothing to add is nothing to do', () => {
  test('an n/a row comes in confirmed; a position with only n/a rows offers no Add', async () => {
    readSheet.mockResolvedValue({ sheets: ['S'], sheet: 'S', headers: HEAD, rows: [
      ...ROWS, { PositionTypeRef: 'F01', ManufacturerName: '', ProductCode: 'n/a' },
    ] })
    useStore.setState({ positionTypes: ['C01', 'C02', 'C03', 'F01'].map(r => ({ PositionTypeRef: r })) })
    render(<FormSpecPane posRef="F01" />)
    fireEvent.click(screen.getByTestId('paint-position'))
    fireEvent.click(await screen.findByText('Choose spreadsheet…'))
    expect(await screen.findByTestId('compact-nothing')).toHaveTextContent('Nothing to add')
    expect(screen.queryByTestId('add-and-build')).toBeNull()
    await waitFor(() => expect(useStore.getState().importDraft?.rows?.find(r => r.positionType === 'F01')?.confirmed).toBe(true), { timeout: 3000 })
    expect(positionPaintStatus(useStore.getState().importDraft, 'F01').state).toBe('nothing')
  })
})

describe('9GLX5N: with a Product Spec, start straight away', () => {
  const MESSY = [
    { PositionTypeRef: 'C01', ManufacturerName: 'iGuzzini', ProductCode: 'QC50 with honeycomb LOUVRE-HC60 and EM pack 3h' },
    { PositionTypeRef: 'C02', ManufacturerName: 'iGuzzini', ProductCode: 'QC51 c/w snoot SN-22 in black RAL9005' },
    { PositionTypeRef: 'C03', ManufacturerName: 'iGuzzini', ProductCode: 'QC52 + driver DR-700 (remote) 24V' },
  ]
  const open = async () => {
    const { default: ProductCodeImportScreen } = await import('../../src/screens/ProductCodeImportScreen.jsx')
    readSheet.mockResolvedValue({ sheets: ['S'], sheet: 'S', headers: HEAD, rows: MESSY })
    render(<ProductCodeImportScreen onBack={vi.fn()} onReviewPositions={vi.fn()} />)
    fireEvent.click(await screen.findByText('Choose spreadsheet…'))
    await screen.findByTestId('form-table')
  }

  test('no "teach your dialect" when the spec has codes', async () => {
    await open()
    expect(screen.queryByText('Teach the tool your dialect')).toBeNull()
  })

  test('a project starting from nothing still gets it', async () => {
    useStore.setState({ psRows: [] })
    await open()
    expect(await screen.findByText('Teach the tool your dialect')).toBeInTheDocument()
  })

  test('the builder pane leads with painting in place; the full Import is a small link', () => {
    render(<FormSpecPane posRef="C01" />)
    expect(screen.getByTestId('paint-position')).toBeInTheDocument()
    expect(screen.queryByText('No Form template yet')).toBeNull()
    expect(screen.getByText(/or go through the whole Form in Import/)).toBeInTheDocument()
  })
})

describe('known codes save themselves to the position', () => {
  test('a position whose Form rows are all known shows its comparison, no painter, no Save', async () => {
    const draft = {
      version: 1, step: 'review', source: { name: 'form.xlsx', sheet: 'S' },
      map: { pt: '', code: 'ProductCode', mfr: 'ManufacturerName', exclude: '', acc: '', context: [] },
      rules: {}, assignments: {}, resolutions: [], refOverrides: {}, dirStats: { forward: 0, backward: 0 }, stagedRefs: [], keptSeparate: [],
      rows: [{ id: 0, rawText: 'QC50', positionType: 'C01', manufacturer: 'iGuzzini', context: {}, overrides: {}, noteOverride: {}, confirmed: true, autoConfirmed: true }],
    }
    useStore.setState({ importDraft: draft, formCaptures: null })
    render(<FormSpecPane posRef="C01" />)
    await waitFor(() => expect(useStore.getState().formCaptures?.byPosition?.C01?.[0]?.elementTypeRef).toBe('ET-PS-01'))
    expect(screen.queryByTestId('compact-painter')).toBeNull()
    expect(await screen.findByText(/ET-PS-01/)).toBeInTheDocument()
    expect(screen.getByTestId('paint-status')).toHaveTextContent('Codes in Product Spec')
  })

  test('a position with a new code is not saved for you', async () => {
    const draft = {
      version: 1, step: 'review', source: { name: 'form.xlsx', sheet: 'S' },
      map: { pt: '', code: 'ProductCode', mfr: 'ManufacturerName', exclude: '', acc: '', context: [] },
      rules: {}, assignments: {}, resolutions: [], refOverrides: {}, dirStats: { forward: 0, backward: 0 }, stagedRefs: [], keptSeparate: [],
      rows: [{ id: 0, rawText: 'QC51', positionType: 'C02', manufacturer: 'iGuzzini', context: {}, overrides: {}, noteOverride: {}, confirmed: false }],
    }
    useStore.setState({ importDraft: draft, formCaptures: null })
    render(<FormSpecPane posRef="C02" />)
    expect(screen.queryByTestId('form-autosave')).toBeNull()
    // A code needs an ElementType: the painter is open inline by itself, and is the one call.
    expect(await screen.findByTestId('compact-painter')).toBeInTheDocument()
    expect(screen.getByTestId('give-et')).toHaveAttribute('aria-label', 'Give QC51 an ElementType')
    expect(screen.queryByTestId('paint-status')).toBeNull()        // no second call while it is open
    expect(useStore.getState().formCaptures).toBeNull()
  })
})

test('W24D3V: the Form shows raw; the brush opens the painter and it stays open, even when it re-saves', async () => {
  useStore.setState({ importDraft: {
    version: 1, step: 'review', source: { name: 'form.xlsx', sheet: 'S' },
    map: { pt: '', code: 'ProductCode', mfr: 'ManufacturerName', exclude: '', acc: '', context: [] },
    rules: {}, assignments: {}, resolutions: [], refOverrides: {}, dirStats: { forward: 0, backward: 0 }, stagedRefs: ['C01'], keptSeparate: [],
    rows: [{ id: 0, rawText: 'QC50', positionType: 'C01', manufacturer: 'iGuzzini', context: {}, overrides: {}, noteOverride: {}, confirmed: true, autoConfirmed: true }],
  }, formCaptures: { version: 1, byPosition: { C01: [{ elementTypeRef: 'ET-PS-OLD', code: 'OLD1', manufacturer: 'iGuzzini' }] } } })
  render(<FormSpecPane posRef="C01" />)
  expect(screen.getByTestId('form-raw')).toHaveTextContent(/ProductCode\s*QC50/)
  expect(screen.getByTestId('form-raw')).toHaveTextContent(/ManufacturerName\s*iGuzzini/)
  fireEvent.click(screen.getByTestId('paint-position'))
  // Saved for the Form as it is now, quietly: the painter the user opened stays open.
  await waitFor(() => expect(useStore.getState().formCaptures.byPosition.C01?.[0]?.elementTypeRef).toBe('ET-PS-01'))
  await new Promise(r => setTimeout(r, 50))
  expect(screen.getByTestId('compact-painter')).toBeInTheDocument()
  expect(screen.queryByTestId('form-raw')).toBeNull()
  // The brush is a toggle.
  fireEvent.click(screen.getByTestId('paint-position'))
  expect(screen.queryByTestId('compact-painter')).toBeNull()
  expect(screen.getByTestId('form-raw')).toBeInTheDocument()
})

test('TKJTDE: the raw view shows manufacturer, code and accessories; the other columns behind ⋯', () => {
  useStore.setState({ formCaptures: null, importDraft: {
    rows: [{ id: 0, rawText: 'QC50\nTRIM-1', accFrom: 5, positionType: 'C01', manufacturer: 'iGuzzini', context: { Notes: 'white finish' }, confirmed: false }],
    map: { code: 'ProductCode', mfr: 'Maker', acc: 'Accessories' },
  } })
  const st = positionPaintStatus(useStore.getState().importDraft, 'C01')
  expect(st.cells[0].map(c => [c.col, c.value, c.more])).toEqual([
    ['Maker', 'iGuzzini', false], ['ProductCode', 'QC50', false], ['Accessories', 'TRIM-1', false], ['Notes', 'white finish', true]])
})

test('TKJTDE: ⋯ shows and hides the other Form columns', async () => {
  const { default: FormPaintBar } = await import('../../src/components/FormPaintBar.jsx')
  useStore.setState({ formCaptures: { byPosition: { C01: [{ elementTypeRef: 'ET-PS-01', code: 'QC50' }] } }, importDraft: {
    rows: [{ id: 0, rawText: 'QC50', positionType: 'C01', manufacturer: 'iGuzzini', context: { Notes: 'white finish' }, confirmed: true }],
    map: { code: 'ProductCode', mfr: 'Maker' }, stagedRefs: ['C01'],
  } })
  render(<FormPaintBar posRef="C01" />)
  expect(screen.getByTestId('form-raw')).toHaveTextContent(/ProductCode\s*QC50/)
  expect(screen.getByTestId('form-raw')).not.toHaveTextContent('white finish')
  fireEvent.click(screen.getByTestId('form-raw-more'))
  expect(screen.getByTestId('form-raw')).toHaveTextContent(/Notes\s*white finish/)
})

test('4746 G353 480: a code read as the same as an existing ElementType gets a FREE ref on the card, never that one', async () => {
  useStore.setState({
    elementTypes: [...useStore.getState().elementTypes, { ElementTypeRef: 'ET-PS-04', Family: 'ET-PS', Description: 'kit with QC51' }],
    psRows: [...useStore.getState().psRows, { ElementTypeRef: 'ET-PS-04', Manufacturer: 'iGuzzini', ProductCode: 'QC51-KIT' }],
    formCaptures: null, importDraft: {
      version: 1, step: 'review', source: { name: 'form.xlsx', sheet: 'S' },
      map: { pt: '', code: 'ProductCode', mfr: 'ManufacturerName', exclude: '', acc: '', context: [] },
      rules: {}, assignments: {}, resolutions: [], refOverrides: {}, dirStats: { forward: 0, backward: 0 }, stagedRefs: [], keptSeparate: [],
      rows: [{ id: 0, rawText: 'QC51', positionType: 'C02', manufacturer: 'iGuzzini', context: {}, overrides: {}, noteOverride: {}, confirmed: false }],
    } })
  render(<FormSpecPane posRef="C02" />)
  await screen.findByTestId('compact-painter')
  const ref = screen.getByLabelText('Ref for QC51').value
  expect(ref).toMatch(/^ET-PS-\d+$/)
  expect(['ET-PS-01', 'ET-PS-03', 'ET-PS-04']).not.toContain(ref)
})

test('a card ref holds no number for codes elsewhere in the Form: same ref with or without them', async () => {
  const draft = rows => ({
    version: 1, step: 'review', source: { name: 'form.xlsx', sheet: 'S' },
    map: { pt: '', code: 'ProductCode', mfr: 'ManufacturerName', exclude: '', acc: '', context: [] },
    rules: {}, assignments: {}, resolutions: [], refOverrides: {}, dirStats: { forward: 0, backward: 0 }, stagedRefs: [], keptSeparate: [], rows,
  })
  const row = (id, code, pt, confirmed) => ({ id, rawText: code, positionType: pt, manufacturer: 'iGuzzini', context: {}, overrides: {}, noteOverride: {}, confirmed })
  const refFor = async rows => {
    useStore.setState({ formCaptures: null, importDraft: draft(rows) })
    const v = render(<FormSpecPane posRef="C02" />)
    await screen.findByTestId('compact-painter')
    const ref = screen.getByLabelText('Ref for QC59').value
    v.unmount()
    return ref
  }
  useStore.setState({
    elementTypes: ['ET-PS-01', 'ET-PS-03'].map(r => ({ ElementTypeRef: r, Family: 'ET-PS' })),
    recipes: ['C01', 'C02', 'C03'].map(pt => ({ _id: pt, PositionTypeRef: pt, ContextType: 'PositionType', ContextRef: pt, ElementTypeRef: 'ET-PS-01', Quantity: 1 })),
  })
  const alone = await refFor([row(0, 'QC59', 'C02', false)])
  const others = await refFor([row(0, 'QC57', 'C01', true), row(1, 'QC58', 'C03', true), row(2, 'QC59', 'C02', false)])
  expect(alone).toBeTruthy()
  expect(others).toBe(alone)
})

test('S3JLGL: Detach with the painter open closes it, and the open painter does not write the Form back', async () => {
  useStore.setState({ formCaptures: null, importDraft: {
    version: 1, step: 'review', source: { name: 'form.xlsx', sheet: 'S' },
    map: { pt: '', code: 'ProductCode', mfr: 'ManufacturerName', exclude: '', acc: '', context: [] },
    rules: {}, assignments: {}, resolutions: [], refOverrides: {}, dirStats: { forward: 0, backward: 0 }, stagedRefs: [], keptSeparate: [],
    rows: [{ id: 0, rawText: 'QC51', positionType: 'C02', manufacturer: 'iGuzzini', context: {}, overrides: {}, noteOverride: {}, confirmed: false }],
  } })
  render(<FormSpecPane posRef="C02" />)
  await screen.findByTestId('compact-painter')
  await act(async () => { await useStore.getState().detachForm() })
  await waitFor(() => expect(screen.queryByTestId('compact-painter')).toBeNull())
  await act(async () => { await new Promise(r => setTimeout(r, 1300)) })   // past the draft save debounce
  expect(useStore.getState().importDraft).toBeNull()
  expect(screen.getByTestId('paint-position')).toHaveTextContent('Load the Form')
})

test('44VCYZ: a code still needs an ElementType; the known ones are compared with the recipe anyway, and the chip counts only the new one', async () => {
  useStore.setState({ formCaptures: { version: 1, byPosition: { C03: [{ elementTypeRef: 'ET-PS-03', code: 'QC52' }] } }, importDraft: {
    version: 1, step: 'review', source: { name: 'form.xlsx', sheet: 'S' },
    map: { pt: '', code: 'ProductCode', mfr: 'ManufacturerName', exclude: '', acc: '', context: [] },
    rules: {}, assignments: {}, resolutions: [], refOverrides: {}, dirStats: { forward: 0, backward: 0 }, stagedRefs: [], keptSeparate: [],
    rows: [{ id: 0, rawText: 'QC50 QC51', positionType: 'C01', manufacturer: 'iGuzzini', context: {}, overrides: {}, noteOverride: {}, confirmed: false }],
  } })
  const st = positionPaintStatus(useStore.getState().importDraft, 'C01', { knows: (m, c) => c === 'QC50' })
  expect(st.newCodes).toBe(1)
  render(<FormSpecPane posRef="C01" />)
  fireEvent.click(screen.getByTestId('paint-position'))          // close the painter
  await waitFor(() => expect(screen.queryByTestId('compact-painter')).toBeNull())
  expect(screen.getByTestId('paint-status')).toHaveTextContent('1 code needs an ElementType')
  expect(screen.getByText('ET-PS-01')).toBeInTheDocument()       // QC50's ElementType, compared with the recipe
  expect(screen.getByText('already an ElementType — add it')).toBeInTheDocument()
})

test('LLVJHU: clicking an ElementType ref in the Form pane opens it in the Product Spec', async () => {
  const openSpec = vi.fn()
  useStore.setState({ openSpec, formPaintMode: false, formCaptures: { version: 1, byPosition: { C01: [{ elementTypeRef: 'ET-PS-01', code: 'QC50' }] } }, importDraft: {
    version: 1, step: 'review', source: { name: 'form.xlsx', sheet: 'S' },
    map: { pt: '', code: 'ProductCode', mfr: 'ManufacturerName', exclude: '', acc: '', context: [] },
    rules: {}, assignments: {}, resolutions: [], refOverrides: {}, dirStats: { forward: 0, backward: 0 }, stagedRefs: [], keptSeparate: [],
    rows: [{ id: 0, rawText: 'QC50', positionType: 'C01', manufacturer: 'iGuzzini', context: {}, overrides: {}, noteOverride: {}, confirmed: true }],
  } })
  render(<FormSpecPane posRef="C01" />)
  fireEvent.click(await screen.findByTestId('form-et-ref'))
  expect(openSpec).toHaveBeenCalledWith('ET-PS-01')
})

test('WYZ3NN: an entry whose codes all have ElementTypes (here one given in this import) is confirmed and saved, not "needs an ElementType"', async () => {
  useStore.setState({ formCaptures: null, importDraft: {
    version: 1, step: 'review', source: { name: 'form.xlsx', sheet: 'S' },
    map: { pt: '', code: 'ProductCode', mfr: 'ManufacturerName', exclude: '', acc: '', context: [] },
    rules: {}, assignments: { QC51: 'ET-PS-03' }, resolutions: [], refOverrides: {}, dirStats: { forward: 0, backward: 0 }, stagedRefs: [], keptSeparate: [],
    rows: [{ id: 0, rawText: 'QC51', positionType: 'C02', manufacturer: 'iGuzzini', context: {}, overrides: {}, noteOverride: {}, confirmed: false }],
  } })
  const st = positionPaintStatus(useStore.getState().importDraft, 'C02', { knows: (m, c) => !!useStore.getState().importDraft.assignments[c] })
  expect(st.newCodes).toBe(0)
  render(<FormSpecPane posRef="C02" />)
  await waitFor(() => expect(useStore.getState().formCaptures?.byPosition?.C02?.[0]?.elementTypeRef).toBe('ET-PS-03'), { timeout: 3000 })
  expect(screen.queryByText(/needs an ElementType/)).toBeNull()
})

test('the status is right before the painter is opened: the background save confirms and saves an entry whose codes all have ElementTypes', async () => {
  const { default: FormAutoSaveAll } = await import('../../src/components/FormAutoSaveAll.jsx')
  useStore.setState({ formCaptures: null, importDraft: {
    version: 1, step: 'review', source: { name: 'form.xlsx', sheet: 'S' },
    map: { pt: '', code: 'ProductCode', mfr: 'ManufacturerName', exclude: '', acc: '', context: [] },
    rules: {}, assignments: { QC51: 'ET-PS-03' }, resolutions: [], refOverrides: {}, dirStats: { forward: 0, backward: 0 }, stagedRefs: [], keptSeparate: [],
    rows: [{ id: 0, rawText: 'QC51', positionType: 'C02', manufacturer: 'iGuzzini', context: {}, overrides: {}, noteOverride: {}, confirmed: false }],
  } })
  render(<FormAutoSaveAll />)                                   // no painter opened
  await waitFor(() => expect(useStore.getState().formCaptures?.byPosition?.C02?.[0]?.elementTypeRef).toBe('ET-PS-03'), { timeout: 4000 })
})

test('4MYUQ7: Detach takes the Form off the whole project, session included', async () => {
  useStore.setState({ importDraft: { rows: [{ id: 0, rawText: 'QC50', positionType: 'C01' }] }, formCaptures: { byPosition: { C01: [{ elementTypeRef: 'ET-PS-01', code: 'QC50' }] } } })
  await useStore.getState().detachForm()
  expect(useStore.getState().formCaptures).toBeNull()
  expect(useStore.getState().importDraft).toBeNull()
})

test('Detach while the background save is running: nothing is written back', async () => {
  const { default: FormAutoSaveAll } = await import('../../src/components/FormAutoSaveAll.jsx')
  useStore.setState({ formCaptures: null, importDraft: {
    version: 1, step: 'review', source: { name: 'form.xlsx', sheet: 'S' },
    map: { pt: '', code: 'ProductCode', mfr: 'ManufacturerName', exclude: '', acc: '', context: [] },
    rules: {}, assignments: { QC51: 'ET-PS-03' }, resolutions: [], refOverrides: {}, dirStats: { forward: 0, backward: 0 }, stagedRefs: [], keptSeparate: [],
    rows: [{ id: 0, rawText: 'QC51', positionType: 'C02', manufacturer: 'iGuzzini', context: {}, overrides: {}, noteOverride: {}, confirmed: false }],
  } })
  render(<FormAutoSaveAll />)
  await act(async () => { await useStore.getState().detachForm() })
  await act(async () => { await new Promise(r => setTimeout(r, 4500)) })
  expect(useStore.getState().formCaptures).toBeNull()
  expect(useStore.getState().importDraft).toBeNull()
}, 10000)

test('2K4TCY: every known position is saved at once; the chip counts the whole Form', async () => {
  const { default: FormAutoSaveAll } = await import('../../src/components/FormAutoSaveAll.jsx')
  const { default: FormProgressChip } = await import('../../src/components/FormProgressChip.jsx')
  const r = (id, rawText, pt, x = {}) => ({ id, rawText, positionType: pt, manufacturer: 'iGuzzini', context: {}, overrides: { 0: 'code' }, noteOverride: {}, confirmed: false, ...x })
  useStore.setState({ formCaptures: null, importDraft: {
    version: 1, step: 'review', source: { name: 'form.xlsx', sheet: 'S' },
    map: { pt: '', code: 'ProductCode', mfr: 'ManufacturerName', exclude: '', acc: '', context: [] },
    rules: {}, assignments: {}, resolutions: [], refOverrides: {}, dirStats: { forward: 0, backward: 0 }, stagedRefs: [], keptSeparate: [],
    rows: [r(0, 'QC50', 'C01', { confirmed: true }), r(1, 'QC51', 'C02'), r(2, 'QC52', 'C03', { confirmed: true })],
  } })
  render(<><FormAutoSaveAll /><FormProgressChip onReconcile={() => {}} /></>)
  await waitFor(() => expect(Object.keys(useStore.getState().formCaptures?.byPosition || {}).sort()).toEqual(['C01', 'C03']))
  expect(screen.getByText(/Form \d\/3/)).toBeInTheDocument()
})

test('the pane starts as a view; ⋯ Paint from the Form opens the painter, and View only closes it', async () => {
  useStore.setState({ formPaintMode: false, importDraft: {
    version: 1, step: 'review', source: { name: 'form.xlsx', sheet: 'S' },
    map: { pt: '', code: 'ProductCode', mfr: 'ManufacturerName', exclude: '', acc: '', context: [] },
    rules: {}, assignments: {}, resolutions: [], refOverrides: {}, dirStats: { forward: 0, backward: 0 }, stagedRefs: [], keptSeparate: [],
    rows: [{ id: 0, rawText: 'NEW99', positionType: 'C01', manufacturer: 'iGuzzini', context: {}, overrides: {}, noteOverride: {}, confirmed: false }],
  }, formCaptures: { version: 1, byPosition: { C01: [{ elementTypeRef: 'ET-PS-OLD', code: 'OLD1', manufacturer: 'iGuzzini' }] } } })
  render(<FormSpecPane posRef="C01" />)
  // The brush stays, unlit, so painting is one click away.
  expect(screen.getByTestId('paint-position')).toHaveAttribute('aria-pressed', 'false')
  expect(screen.queryByTestId('paint-panel')).toBeNull()
  expect(screen.getByTestId('form-raw')).toHaveTextContent('NEW99')
  fireEvent.click(screen.getByTitle('Form template options'))
  fireEvent.click(await screen.findByTestId('paint-mode'))
  expect(await screen.findByTestId('paint-panel')).toBeInTheDocument()
  fireEvent.click(screen.getByTitle('Form template options'))
  fireEvent.click(await screen.findByText(/View only/))
  await waitFor(() => expect(screen.queryByTestId('paint-panel')).toBeNull())
  expect(screen.getByTestId('paint-position')).toHaveAttribute('aria-pressed', 'false')
})

test('KU9NQJ: the brush sets paint mode for every position, and it is remembered across reloads', async () => {
  const draft = rows => ({
    version: 1, step: 'review', source: { name: 'form.xlsx', sheet: 'S' },
    map: { pt: '', code: 'ProductCode', mfr: 'ManufacturerName', exclude: '', acc: '', context: [] },
    rules: {}, assignments: {}, resolutions: [], refOverrides: {}, dirStats: { forward: 0, backward: 0 }, stagedRefs: [], keptSeparate: [], rows,
  })
  const row = (id, code, pt) => ({ id, rawText: code, positionType: pt, manufacturer: 'iGuzzini', context: {}, overrides: {}, noteOverride: {}, confirmed: false })
  useStore.getState().setFormPaintMode(true)
  useStore.setState({ importDraft: draft([row(0, 'NEW98', 'C01'), row(1, 'NEW99', 'C02')]) })
  const view = render(<FormSpecPane posRef="C01" />)
  expect(await screen.findByTestId('paint-panel')).toBeInTheDocument()
  fireEvent.click(screen.getByLabelText('Stop painting'))
  expect(useStore.getState().formPaintMode).toBe(false)
  expect(localStorage.getItem('formPaintMode')).toBe('0')
  view.rerender(<FormSpecPane posRef="C02" />)   // the next position stays stopped
  expect(screen.queryByTestId('paint-panel')).toBeNull()
  fireEvent.click(screen.getByTestId('paint-position'))
  expect(localStorage.getItem('formPaintMode')).toBe('1')
  view.rerender(<FormSpecPane posRef="C01" />)   // and once started, the next one paints too
  expect(await screen.findByTestId('paint-panel')).toBeInTheDocument()
})

test('43B4AM: clicking the raw product code copies it, with no icon; the manufacturer does not copy', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  useStore.setState({ formPaintMode: false, importDraft: {
    version: 1, step: 'review', source: { name: 'form.xlsx', sheet: 'S' },
    map: { pt: '', code: 'ProductCode', mfr: 'ManufacturerName', exclude: '', acc: '', context: [] },
    rules: {}, assignments: {}, resolutions: [], refOverrides: {}, dirStats: { forward: 0, backward: 0 }, stagedRefs: [], keptSeparate: [],
    rows: [{ id: 0, rawText: 'NEW99', positionType: 'C01', manufacturer: 'iGuzzini', context: {}, overrides: {}, noteOverride: {}, confirmed: false }],
  }, formCaptures: { version: 1, byPosition: { C01: [{ elementTypeRef: 'ET-PS-OLD', code: 'OLD1', manufacturer: 'iGuzzini' }] } } })
  render(<FormSpecPane posRef="C01" />)
  const raw = screen.getByTestId('form-raw')
  expect(raw.textContent).not.toMatch(/content_copy/)
  await act(async () => { fireEvent.click(within(raw).getByText('NEW99')) })
  expect(writeText).toHaveBeenCalledWith('NEW99')
  expect(within(raw).getByText('iGuzzini').getAttribute('role')).toBeNull()
})
