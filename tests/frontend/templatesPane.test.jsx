import { describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'

window.electronAPI = { db: { setPref: vi.fn().mockResolvedValue(undefined), getPref: vi.fn().mockResolvedValue(null), upsertPositionUI: vi.fn() } }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))

const { default: useStore } = await import('../../src/store/useStore.js')
const { default: TemplatesPane } = await import('../../src/components/TemplatesPane.jsx')
const { default: ProjectTreeView } = await import('../../src/components/ProjectTreeView.jsx')

const LIN = {
  id: 'served:lin', name: 'LIN tape and profile', _served: true, scope: 'global',
  rule: { match: 'all', conditions: [{ column: 'Design', op: 'equals', value: 'LIN' }] },
  ingredients: [
    { slotKey: 'DESIGN_ELEMENT', slotLabel: 'ET-LIN-01', section: 'position', newWrapper: 'LIN', isDesign: 'Y' },
    { slotKey: 'PROFILE', slotLabel: 'x', section: 'internal', fromForm: 'lead' },
  ],
}
const captures = { version: 1, source: {}, byPosition: { L01: [{ elementTypeRef: 'ET-PROF-01', code: 'FPS2020', manufacturer: 'Flexa', role: 'lead' }] }, contextByPosition: {}, orphansByPosition: {} }

function setup(over = {}) {
  useStore.setState({
    projectId: 1, projectNumber: '5642', templates: [LIN], formCaptures: captures,
    positionTypes: [{ PositionTypeRef: 'L01', Name: 'Linear' }, { PositionTypeRef: 'D01', Name: 'Downlight' }],
    recipes: [], psRows: [], elementTypes: [{ ElementTypeRef: 'ET-PROF-01', Family: 'ET-PROFILES' }], positionUI: {},
    ignoredPositionFamilies: [], containerETRefs: new Set(), templateChecks: {}, templateHintVersion: 0,
    past: [], future: [], rsChanges: [], psChanges: [], selectedRowIds: [], rowClipboard: null,
    validationResults: [], tagDrift: {}, activePositionRef: null, activeContextType: 'PositionType', activeETRef: null, ...over,
  })
  try { localStorage.clear() } catch { /* */ }
}

describe('the drawer\'s Templates tab', () => {
  beforeEach(() => setup())

  test('lists the matching served template for a LIN position, hides it for a DL one under the default', () => {
    const { unmount } = render(<TemplatesPane posRef="L01" />)
    expect(screen.getByText('LIN tape and profile')).toBeInTheDocument()
    expect(screen.getByText('Global ☁️')).toBeInTheDocument()
    unmount()
    render(<TemplatesPane posRef="D01" />)
    expect(screen.queryByText('LIN tape and profile')).toBeNull()
    fireEvent.click(screen.getByText('All templates', { selector: 'button' }))
    fireEvent.click(screen.getByText('Why not?'))
    expect(screen.getAllByText(/Design is LIN/).length).toBe(2)   // the rule, and the failing condition
  })

  test('Apply previews, needs the confirmation, then writes rows with one undo', async () => {
    render(<TemplatesPane posRef="L01" />)
    fireEvent.click(screen.getByText('Apply…'))
    expect(screen.getByTestId('template-preview')).toBeInTheDocument()
    const apply = screen.getByRole('button', { name: 'Apply' })
    expect(apply).toBeDisabled()
    fireEvent.click(screen.getByLabelText(/This template is right for L01/))
    const before = useStore.getState().past.length
    await act(async () => { fireEvent.click(apply) })
    const st = useStore.getState()
    expect(st.recipes.some(r => r.PositionTypeRef === 'L01' && r.ElementTypeRef === 'ET-PROF-01')).toBe(true)
    expect(st.past.length).toBe(before + 1)
  })
})

describe('the hint on an empty matching position', () => {
  test('shows on the tree row, and a dismissal removes it', () => {
    setup()
    render(<DndContext><ProjectTreeView showDeleted={false} onAddRow={() => {}} onNewET={() => {}} onReplace={() => {}} /></DndContext>)
    expect(screen.getByTestId('template-hint-L01')).toHaveAttribute('title', 'LIN tape and profile fits — apply from the Templates tab')
    expect(screen.queryByTestId('template-hint-D01')).toBeNull()
    fireEvent.click(screen.getByTestId('template-hint-L01'))
    expect(useStore.getState().drawerTab).toBe('templates')
    expect(useStore.getState().activePositionRef).toBe('L01')
  })
})
