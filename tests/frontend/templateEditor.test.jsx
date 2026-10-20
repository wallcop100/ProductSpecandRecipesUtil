import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

window.electronAPI = { db: { setPref: vi.fn().mockResolvedValue(undefined), upsertTemplate: vi.fn(async t => t), deleteTemplate: vi.fn() } }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))
const suggestTemplate = vi.fn(async () => true)
let companion = { suggestTemplate }
vi.mock('../../src/platform/companion', () => ({ useCompanion: () => companion }))
const { default: useStore } = await import('../../src/store/useStore.js')
const { default: TemplateEditorScreen } = await import('../../src/screens/TemplateEditorScreen.jsx')
const { default: SaveTemplateModal } = await import('../../src/components/SaveTemplateModal.jsx')

const row = (pos, ref, extra = {}) => ({ _id: `${pos}-${ref}`, PositionTypeRef: pos, ContextType: 'PositionType', ContextRef: pos, ElementTypeRef: ref, RecipeIndex: 1, Quantity: 1, ...extra })
const rule = { match: 'all', conditions: [{ column: 'DriverLocation', op: 'equals', value: 'REMOTE' }] }
const ing = [{ slotKey: 'S1', slotLabel: 'ET-X', section: 'position' }]

beforeEach(() => {
  companion = { suggestTemplate }
  suggestTemplate.mockClear()
  useStore.setState({
    projectId: 7, projectNumber: '5499', past: [], future: [], rsChanges: [], psRows: [], dbChanges: [],
    elementTypes: [{ ElementTypeRef: 'ET-DL-02' }], containerETRefs: new Set(),
    positionTypes: [{ PositionTypeRef: 'A1', DriverLocation: 'REMOTE' }, { PositionTypeRef: 'A2', DriverLocation: 'LOCAL' }],
    positionUI: {}, recipes: [row('A1', 'ET-DL-02', { IsDesign: 'Y' })],
    templates: [
      { id: 'served:1', name: 'Orion one', scope: 'global', _served: true, rule, ingredients: ing },
      { id: 'p1', name: 'Proj one', scope: 'project', project_id: 7, rule, ingredients: ing },
    ],
  })
})

describe('Template editor', () => {
  test('editing the rule shows the positions it matches, and why one does not', () => {
    render(<TemplateEditorScreen onBack={vi.fn()} />)
    fireEvent.click(screen.getByText('Proj one'))
    expect(screen.getByTestId('matched-positions')).toHaveTextContent('1 position match: A1')
    fireEvent.change(screen.getByLabelText('Value'), { target: { value: 'LOCAL' } })
    expect(screen.getByTestId('matched-positions')).toHaveTextContent('1 position match: A2')
    fireEvent.change(screen.getByLabelText('Check a position'), { target: { value: 'A1' } })
    expect(screen.getByTestId('check-position')).toHaveTextContent('✗ DriverLocation equals “LOCAL” — it has REMOTE')
  })

  test('Orion is read-only; Copy to mine makes an editable copy', async () => {
    render(<TemplateEditorScreen onBack={vi.fn()} />)
    fireEvent.click(screen.getByText('Orion one'))
    expect(screen.getByLabelText('Template name')).toBeDisabled()
    expect(screen.queryByText('Save template')).toBeNull()
    fireEvent.click(screen.getAllByText('Copy to mine')[0])
    await waitFor(() => expect(useStore.getState().templates).toHaveLength(3))
    const copy = useStore.getState().templates.find(t => t.name === 'Orion one (copy)')
    expect(copy).toMatchObject({ scope: 'global', rule })
    expect(copy._served).toBeUndefined()
    await waitFor(() => expect(screen.getByLabelText('Template name')).toBeEnabled())
  })

  test('Suggest to Orion posts the template, only for editable ones with the feature', async () => {
    render(<TemplateEditorScreen onBack={vi.fn()} />)
    fireEvent.click(screen.getByText('Orion one'))
    expect(screen.queryByText('Suggest to Orion')).toBeNull()
    fireEvent.click(screen.getByText('Proj one'))
    fireEvent.click(screen.getByText('Suggest to Orion'))
    await waitFor(() => expect(suggestTemplate).toHaveBeenCalledWith({ name: 'Proj one', rule, ingredients: ing, by: 'psr-app', project: '5499' }))
    await waitFor(() => expect(useStore.getState().toastMsg.text).toMatch(/Suggested/))
  })

  test('no Suggest without the feature', () => {
    companion = {}
    render(<TemplateEditorScreen onBack={vi.fn()} />)
    fireEvent.click(screen.getByText('Proj one'))
    expect(screen.queryByText('Suggest to Orion')).toBeNull()
  })
})

describe('Save as template seeds the rule', () => {
  test("from the position's kind", async () => {
    useStore.setState({ templates: [] })
    render(<SaveTemplateModal show posRef="A1" name="Downlight" onHide={vi.fn()} />)
    fireEvent.click(screen.getByText(/Save template/))
    await waitFor(() => expect(useStore.getState().templates).toHaveLength(1))
    const r = useStore.getState().templates[0].rule
    expect(r.conditions).toEqual(expect.arrayContaining([{ column: 'Design', op: 'equals', value: 'DL' }]))
    expect(r.conditions.every(c => ['Design', 'DriverLocation', 'DriverType', 'Jobs'].includes(c.column))).toBe(true)
  })
})
