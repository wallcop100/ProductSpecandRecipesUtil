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
    expect(screen.getByText('Global', { exact: false })).toBeInTheDocument()
    unmount()
    render(<TemplatesPane posRef="D01" />)
    expect(screen.queryByText('LIN tape and profile')).toBeNull()
    fireEvent.click(screen.getByText('All templates', { selector: 'button' }))
    fireEvent.click(screen.getByText('Why not?'))
    expect(screen.getAllByText(/a linear/).length).toBe(2)   // the rule, and the failing condition
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

describe('a position that already has a recipe', () => {
  test('each template part is ticked or crossed against it', () => {
    const tpl = { ...LIN, rule: { match: 'all', conditions: [{ column: 'Family', op: 'equals', value: 'LN' }] }, ingredients: [
      { slotKey: 'X', slotLabel: 'ET-PROF-01', exact: true, section: 'position' },
      { slotKey: 'X', slotLabel: 'ET-DRV-09', exact: true, section: 'position' },
    ] }
    setup({ templates: [tpl], positionTypes: [{ PositionTypeRef: 'L01', ParentRef: 'LN' }], recipes: [{ PositionTypeRef: 'L01', ContextType: 'PositionType', ContextRef: 'L01', ElementTypeRef: 'ET-PROF-01', _id: 'r1' }] })
    render(<TemplatesPane posRef="L01" />)
    expect(screen.getAllByTestId('tpl-present')).toHaveLength(1)
    expect(screen.getAllByTestId('tpl-missing')).toHaveLength(1)
  })

  test('report #49: a ticked part names the ET holding it, a missing one what it would be', () => {
    const tpl = { ...LIN, rule: { match: 'all', conditions: [{ column: 'Family', op: 'equals', value: 'LN' }] }, ingredients: [
      { slotKey: 'X', slotLabel: 'ET-PROF-01', exact: true, section: 'position' },
      { slotKey: 'X', slotLabel: 'ET-DRV-09', exact: true, section: 'position' },
    ] }
    setup({ templates: [tpl], positionTypes: [{ PositionTypeRef: 'L01', ParentRef: 'LN' }],
      elementTypes: [{ ElementTypeRef: 'ET-PROF-01' }, { ElementTypeRef: 'ET-DRV-09' }],
      psRows: [{ ElementTypeRef: 'ET-PROF-01', ProductCode: 'FPS2020' }, { ElementTypeRef: 'ET-DRV-09', ProductCode: 'LCM-25' }],
      recipes: [{ PositionTypeRef: 'L01', ContextType: 'PositionType', ContextRef: 'L01', ElementTypeRef: 'ET-PROF-01', _id: 'r1' }] })
    render(<TemplatesPane posRef="L01" />)
    expect(screen.getByTestId('tpl-holder').textContent).toBe('ET-PROF-01')
    expect(screen.getByTestId('tpl-holder').title).toBe('FPS2020')
    expect(screen.getByTestId('tpl-add-template').textContent).toMatch(/ET-DRV-09/)
    expect(screen.getByTestId('tpl-add-template').title).toMatch(/LCM-25/)
  })

  test('the design line reads "LIN Wrapper" with its ElementType in the pill', () => {
    const tpl = { ...LIN, rule: { match: 'all', conditions: [{ column: 'Family', op: 'equals', value: 'LN' }] }, ingredients: [
      { slotKey: 'DESIGN_ELEMENT', slotLabel: 'design element', section: 'position' },
    ] }
    setup({ templates: [tpl], positionTypes: [{ PositionTypeRef: 'L01', ParentRef: 'LN' }],
      elementTypes: [{ ElementTypeRef: 'ET-LIN-06', Family: 'ET-LIN' }],
      recipes: [{ PositionTypeRef: 'L01', ContextType: 'PositionType', ContextRef: 'L01', ElementTypeRef: 'ET-LIN-06', IsDesign: 'Y', _id: 'r1' }] })
    render(<TemplatesPane posRef="L01" />)
    const line = screen.getByTestId('tpl-line')
    expect(line.textContent).toMatch(/LIN WrapperET-LIN-06$/)
    expect(line.textContent).not.toMatch(/position|design element/)
    expect(screen.getByTestId('tpl-holder').textContent).toBe('ET-LIN-06')
  })

  test('report #70: a part fewer than all the template\'s positions have shows its share; Add writes the template\'s part', () => {
    const tpl = { ...LIN, rule: { match: 'all', conditions: [{ column: 'Family', op: 'equals', value: 'LN' }] }, ingredients: [
      { slotKey: 'X', slotLabel: 'ET-PROF-01', exact: true, section: 'position' },
      { slotKey: 'X', slotLabel: 'ET-DRV-09', exact: true, section: 'position' },
    ] }
    const row = (p, et) => ({ PositionTypeRef: p, ContextType: 'PositionType', ContextRef: p, ElementTypeRef: et, _id: `${p}-${et}` })
    setup({ templates: [tpl], positionTypes: ['L01', 'L02', 'L03'].map(r => ({ PositionTypeRef: r, ParentRef: 'LN' })),
      elementTypes: [{ ElementTypeRef: 'ET-PROF-01' }, { ElementTypeRef: 'ET-DRV-09' }],
      recipes: [row('L01', 'ET-PROF-01'), row('L02', 'ET-PROF-01'), row('L03', 'ET-PROF-01'), row('L03', 'ET-DRV-09')] })
    render(<TemplatesPane posRef="L01" />)
    expect(screen.getAllByTestId('tpl-share').map(e => e.textContent)).toEqual(['1 of 3 · 33%'])
    act(() => { fireEvent.click(screen.getByTestId('tpl-add-template')) })
    expect(useStore.getState().recipes.some(r => r.PositionTypeRef === 'L01' && r.ElementTypeRef === 'ET-DRV-09')).toBe(true)
    expect(screen.getByTestId('tpl-share').textContent).toBe('2 of 3 · 67%')
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
