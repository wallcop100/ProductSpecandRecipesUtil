import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
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
    expect(screen.getByTestId('form-build')).toBeInTheDocument()
  })
})
