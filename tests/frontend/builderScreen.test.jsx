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

  test('one search box over every source; All stacks them', () => {
    draw()
    expect(screen.getByLabelText('Search to add')).toBeInTheDocument()
    for (const l of ['All', 'ElementTypes', 'Templates', 'Favourites', 'Positions like this one']) {
      expect(within(screen.getByRole('group', { name: 'Show' })).getByRole('button', { name: l })).toBeInTheDocument()
    }
    // the sources no longer carry search boxes of their own
    expect(screen.queryByPlaceholderText('Search templates…')).toBeNull()
    expect(screen.queryByPlaceholderText('Search elements…')).toBeNull()
  })

  test('an icon shows one source alone', () => {
    draw()
    fireEvent.click(within(screen.getByRole('group', { name: 'Show' })).getByRole('button', { name: 'Templates' }))
    expect(screen.getByText(/No templates yet/)).toBeInTheDocument()
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

  test('after an import, positions with no recipe are offered a build', () => {
    useStore.setState({ formCaptures: { byPosition: { C01r: [{ elementTypeRef: 'ET-PS-01', code: 'QC50', role: 'lead' }] } } })
    draw(vi.fn())
    fireEvent.click(within(screen.getByTestId('next-step')).getByRole('button', { name: 'Build them' }))
    expect(screen.getByText('Recipes from the Form')).toBeInTheDocument()
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
        B2: [{ elementTypeRef: 'ET-PS-02', code: 'QC51', role: 'lead' }],
      } },
    })
    render(<BuilderScreen onBackToSetup={vi.fn()} onOpenProductSpec={vi.fn()} onOpenTemplateEditor={vi.fn()}
      onOpenCodeImport={vi.fn()} onOpenConnectors={vi.fn()} />)
    fireEvent.click(within(screen.getByTestId('next-step')).getByRole('button', { name: 'Build them' }))
    const g = (await screen.findAllByTestId('form-group'))[0]
    fireEvent.click(within(g).getByText(/Point source in a DL wrapper/))
    fireEvent.click(within(g).getByRole('button', { name: 'Build B1 and check it in the builder' }))

    const bar = await screen.findByTestId('teach-bar')
    expect(useStore.getState().activePositionRef).toBe('B1')
    expect(bar.textContent).toMatch(/Still empty: .*driver/)
    await act(async () => { fireEvent.click(within(bar).getByRole('button', { name: 'Use B1 for the other 1' })) })

    expect(screen.queryByTestId('teach-bar')).toBeNull()
    fireEvent.click(await screen.findByRole('button', { name: 'Build 1' }))
    expect(useStore.getState().recipes.some(r => (r.PositionTypeRef || r.positionTypeRef) === 'B2'
      && (r.ElementTypeRef || r.elementTypeRef) === 'ET-PS-02')).toBe(true)
  })
})
