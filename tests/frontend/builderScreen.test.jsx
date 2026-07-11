import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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
