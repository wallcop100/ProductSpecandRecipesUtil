import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'
import useStore from '../../src/store/useStore'
import BuilderScreen from '../../src/screens/BuilderScreen'

beforeEach(() => {
  useStore.setState({
    positionTypes: [{ PositionTypeRef: 'C01r', ParentRef: 'FAM-DL' }],
    recipes: [], psRows: [], elementTypes: [], dbCollectionRefs: [],
    positionUI: {}, ignoredPositionFamilies: [], validationResults: [],
    psChanges: [], rsChanges: [], dbChanges: [], past: [], future: [],
    activePositionRef: null, activeETRef: null, rootView: 'positions',
    containerETRefs: new Set(), selectedRowIds: [], templates: [], favorites: [],
  })
})

describe('BuilderScreen renders after the drawer rework', () => {
  test('the main surface mounts, with no left drawer and a Status button', () => {
    render(<BuilderScreen
      onBackToSetup={vi.fn()} onOpenProductSpec={vi.fn()} onOpenTemplateEditor={vi.fn()}
      onOpenCodeImport={vi.fn()} onOpenConnectors={vi.fn()} />)
    // the Navigator drawer is gone
    expect(screen.queryByTitle('Open navigator')).toBeNull()
    expect(screen.queryByText('Navigator')).toBeNull()
    // validation/readiness moved to a Status button in the toolbar
    expect(screen.getByTitle('Validation and readiness — where the project stands')).toBeTruthy()
    // coverage moved into the tree header
    expect(screen.getByText(/reciped/)).toBeTruthy()
  })
})

describe('the Add panel', () => {
  const draw = () => render(<BuilderScreen
    onBackToSetup={vi.fn()} onOpenProductSpec={vi.fn()} onOpenTemplateEditor={vi.fn()}
    onOpenCodeImport={vi.fn()} onOpenConnectors={vi.fn()} />)

  test('K3LGUL: the drawer opens on the Form spec; no All, Templates or Favourites', () => {
    localStorage.removeItem('builderDrawer')
    draw()
    const tabs = within(screen.getByRole('group', { name: 'Show' }))
    for (const l of ['Form spec', 'ElementTypes', 'Positions like this one']) expect(tabs.getByRole('button', { name: l })).toBeInTheDocument()
    expect(tabs.queryByRole('button', { name: 'All' })).toBeNull()
    expect(tabs.queryByRole('button', { name: 'Templates' })).toBeNull()
    expect(tabs.queryByRole('button', { name: 'Favourites' })).toBeNull()
    expect(screen.getByTestId('drawer-form-hint')).toBeInTheDocument()        // no position open
    expect(screen.queryByLabelText('Search to add')).toBeNull()                // search is for the add tabs
  })

  test('an add tab shows one search box', () => {
    draw()
    fireEvent.click(within(screen.getByRole('group', { name: 'Show' })).getByRole('button', { name: 'ElementTypes' }))
    expect(screen.getByLabelText('Search to add')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('Search elements…')).toBeNull()
  })
})

describe('the next step on a new project', () => {
  const draw = onOpenCodeImport => render(<BuilderScreen
    onBackToSetup={vi.fn()} onOpenProductSpec={vi.fn()} onOpenTemplateEditor={vi.fn()}
    onOpenCodeImport={onOpenCodeImport} onOpenConnectors={vi.fn()} />)

  test('a blank project points to the Form import first', () => {
    useStore.setState({ formCaptures: null })
    const go = vi.fn()
    draw(go)
    fireEvent.click(within(screen.getByTestId('next-step')).getByRole('button', { name: 'Import the Form' }))
    expect(go).toHaveBeenCalled()
  })

  test('after an import, positions with no recipe are opened one by one (the bulk build is under ⋯)', () => {
    useStore.setState({ formCaptures: { byPosition: { C01r: [{ elementTypeRef: 'ET-PS-01', code: 'QC50', role: 'lead' }] } } })
    draw(vi.fn())
    fireEvent.click(within(screen.getByTestId('next-step')).getByRole('button', { name: 'Open C01r' }))
    expect(useStore.getState().activePositionRef).toBe('C01r')
    expect(screen.queryByText('Recipes from the Form')).toBeNull()
  })
})

describe('setting up a group: build one, check it in the builder, come back', () => {
  test('the bar says what is empty and brings you back to the rest of the group', async () => {
    window.electronAPI = { ...(window.electronAPI || {}), db: { ...(window.electronAPI?.db || {}),
      upsertTemplate: vi.fn().mockResolvedValue({}), getRecipePatterns: vi.fn().mockResolvedValue([]),
      getStyleExemplars: vi.fn().mockResolvedValue([]), setPref: vi.fn().mockResolvedValue(undefined) } }
    useStore.setState({
      projectId: 1, library: { patterns: [], exemplars: [] }, teaching: null,
      positionTypes: [
        { PositionTypeRef: 'B1', ParentRef: 'DOWNLIGHT', DriverLocation: 'Local to fitting' },
        { PositionTypeRef: 'B2', ParentRef: 'DOWNLIGHT', DriverLocation: 'Local to fitting' },
      ],
      elementTypes: [{ ElementTypeRef: 'ET-PS-01', Family: 'ET-PS' }, { ElementTypeRef: 'ET-PS-02', Family: 'ET-PS' }],
      formCaptures: { byPosition: {
        B1: [{ elementTypeRef: 'ET-PS-01', code: 'QC50', role: 'lead' }],
        B2: [{ elementTypeRef: 'ET-PS-01', code: 'QC50', role: 'lead' }],   // the same fitting: one group
      } },
    })
    render(<BuilderScreen onBackToSetup={vi.fn()} onOpenProductSpec={vi.fn()} onOpenTemplateEditor={vi.fn()}
      onOpenCodeImport={vi.fn()} onOpenConnectors={vi.fn()} />)
    // Under ⋯ now, not pushed.
    for (const m of screen.getAllByTitle('More')) { fireEvent.click(m); if (screen.queryByText(/Build recipes from the Form/)) break }
    fireEvent.click(await screen.findByText(/Build recipes from the Form/))
    const g = (await screen.findAllByTestId('form-group'))[0]
    fireEvent.click(within(g).getByText(/Point source in a DL wrapper/))
    fireEvent.click(within(g).getByRole('button', { name: 'Build B1 and check it in the builder' }))

    const bar = await screen.findByTestId('teach-bar')
    expect(useStore.getState().activePositionRef).toBe('B1')
    expect(bar.textContent).toMatch(/Still empty: .*driver/)
    await act(async () => { fireEvent.click(within(bar).getByRole('button', { name: 'Use B1 for the other 1' })) })

    expect(screen.queryByTestId('teach-bar')).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: 'Build 1' }))
    // Same fitting, same contents: B2 is built and shares B1's wrapper.
    expect(useStore.getState().recipes.some(r => (r.PositionTypeRef || r.positionTypeRef) === 'B2')).toBe(true)
  })
})

describe('setting up a group: job-dependent quantities are confirmed, even when prefilled', () => {
  test('tape pulses with "Confirm qty"; the group cannot be copied until it is confirmed', async () => {
    Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || vi.fn()
    useStore.setState({
      projectId: 1, library: { patterns: [], exemplars: [] }, teaching: null, recipes: [], psRows: [], recipeChoices: {},
      containerETRefs: new Set(), activePositionRef: null, rootView: 'positions',
      positionTypes: [
        { PositionTypeRef: 'L1', ParentRef: 'LINEAR', DriverLocation: 'Remote' },
        { PositionTypeRef: 'L2', ParentRef: 'LINEAR', DriverLocation: 'Remote' },
      ],
      elementTypes: [{ ElementTypeRef: 'ET-LIN-TAPE-01', Family: 'ET-LIN-TAPE' }, { ElementTypeRef: 'ET-LIN-TAPE-02', Family: 'ET-LIN-TAPE' }],
      formCaptures: { byPosition: {
        L1: [{ elementTypeRef: 'ET-LIN-TAPE-01', code: 'T1', role: 'lead' }],
        L2: [{ elementTypeRef: 'ET-LIN-TAPE-02', code: 'T2', role: 'lead' }],
      } },
    })
    useStore.getState().buildProposedRecipe('L1')
    useStore.getState().startTeaching({ groupKey: 'g', label: 'Linear', posRef: 'L1', others: ['L2'], refs: ['L1', 'L2'], missing: [] })
    useStore.getState().setActivePosition('L1')
    render(<BuilderScreen onBackToSetup={vi.fn()} onOpenProductSpec={vi.fn()} onOpenTemplateEditor={vi.fn()}
      onOpenCodeImport={vi.fn()} onOpenConnectors={vi.fn()} />)
    const bar = screen.getByTestId('teach-bar')
    expect(bar.textContent).toMatch(/Confirm quantities.*ET-LIN-TAPE-01/)
    expect(within(bar).getByRole('button', { name: 'Use L1 for the other 1' })).toBeDisabled()

    fireEvent.click(await screen.findByTestId('qty-inside'))                    // the wrapper row: confirm inside
    const pulse = await screen.findByTestId('qty-confirm')
    fireEvent.click(within(pulse).getByRole('button', { name: /Confirm qty/ }))
    expect(screen.queryByTestId('qty-confirm')).toBeNull()
    expect(within(screen.getByTestId('teach-bar')).getByRole('button', { name: 'Use L1 for the other 1' })).not.toBeDisabled()
  })
})

describe('coming from a By-position import', () => {
  test('a banner names the positions and leads on to the next one', () => {
    const onNext = vi.fn()
    render(<BuilderScreen
      onBackToSetup={vi.fn()} onOpenProductSpec={vi.fn()} onOpenTemplateEditor={vi.fn()}
      onOpenCodeImport={vi.fn()} onOpenConnectors={vi.fn()}
      importLoop={{ refs: ['C01r'] }} onNextFromImport={onNext} onEndImportLoop={vi.fn()} />)
    expect(screen.getByTestId('import-loop')).toHaveTextContent('C01r added to the Product Spec')
    fireEvent.click(screen.getByRole('button', { name: /Next position/ }))
    expect(onNext).toHaveBeenCalled()
  })
})

describe('toolbars (96KPJ5, XZ3UBB, M7DYP4, A8GNSJ, DD66AT, B3DGQT, AFEHZM)', () => {
  test('top bar: Recipes + Product Spec; ElementTypes, Form import and Connectors in ⋮; no deleted toggle', async () => {
    const openPS = vi.fn(), openImport = vi.fn()
    render(<BuilderScreen onBackToSetup={vi.fn()} onOpenProductSpec={openPS} onOpenTemplateEditor={vi.fn()}
      onOpenCodeImport={openImport} onOpenConnectors={vi.fn()} />)
    expect(screen.getByTestId('view-recipes')).toHaveTextContent('Recipes')
    fireEvent.click(screen.getByTestId('open-product-spec'))
    expect(openPS).toHaveBeenCalled()
    expect(screen.queryByTitle('Import product codes from a Form template')).toBeNull()
    expect(screen.queryByTitle('Connectors — templates and the coverage matrix')).toBeNull()
    expect(screen.queryByTitle('Show IsDeleted rows')).toBeNull()
    fireEvent.click(screen.getByTitle('More'))
    fireEvent.click(await screen.findByText('Browse ElementTypes'))
    expect(useStore.getState().rootView).toBe('elements')
  })

  test('Recipe actions: connectors, IsDeleted rows and apply a template; shared toggle fills blue', async () => {
    const { default: PositionRecipeEditor } = await import('../../src/components/PositionRecipeEditor.jsx')
    const openConn = vi.fn()
    useStore.setState({ showDeleted: false, showSharedEverywhere: false })
    render(<PositionRecipeEditor posRef="C01r" onOpenConnectors={openConn} />)
    expect(screen.getByTestId('shared-toggle').className).toMatch(/outline-secondary/)
    fireEvent.click(screen.getByTestId('shared-toggle'))
    expect(screen.getByTestId('shared-toggle').className).toMatch(/btn-primary/)
    fireEvent.click(screen.getByLabelText('Recipe actions'))
    fireEvent.click(await screen.findByText('Connectors for this PositionType'))
    expect(openConn).toHaveBeenCalledWith('C01r')
    fireEvent.click(screen.getByLabelText('Recipe actions'))
    fireEvent.click(await screen.findByTestId('toggle-deleted'))
    expect(useStore.getState().showDeleted).toBe(true)
    fireEvent.click(screen.getByLabelText('Recipe actions'))
    fireEvent.click(await screen.findByTestId('apply-template'))
    expect(await screen.findByText('Apply a template to C01r')).toBeInTheDocument()
  })
})

test('E2H3QX: a missing spec says which positions use it, and where', async () => {
  const { default: ETSpecEditor } = await import('../../src/components/ETSpecEditor.jsx')
  const open = vi.fn()
  useStore.setState({ psRows: [], elementTypes: [], recipes: [
    { _id: 'a', PositionTypeRef: 'A02', ContextType: 'PositionType', ContextRef: 'A02', ElementTypeRef: 'ET-LIN-CLIP-02' },
    { _id: 'b', PositionTypeRef: 'A05', ContextType: 'ElementType', ContextRef: 'ET-LIN-03', ElementTypeRef: 'ET-LIN-CLIP-02' },
  ] })
  render(<ETSpecEditor selectedRef="ET-LIN-CLIP-02" missingETs={['ET-LIN-CLIP-02']} onOpenPosition={open} />)
  expect(screen.getByTestId('missing-spec-uses')).toHaveTextContent('Used by A02, A05 (inside ET-LIN-03)')
  fireEvent.click(screen.getByRole('button', { name: 'A05' }))
  expect(open).toHaveBeenCalledWith('A05')
})

test('98GPK7: the Product Spec has the same Recipes | Product Spec switch; Recipes goes back', async () => {
  const { default: ProductSpecScreen } = await import('../../src/screens/ProductSpecScreen.jsx')
  const back = vi.fn()
  render(<ProductSpecScreen onBack={back} />)
  expect(screen.getByTestId('open-product-spec').className).toMatch(/btn-primary/)
  fireEvent.click(screen.getByTestId('view-recipes'))
  expect(back).toHaveBeenCalled()
})
