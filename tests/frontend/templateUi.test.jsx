import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

window.electronAPI = { db: { setPref: vi.fn().mockResolvedValue(undefined), upsertTemplate: vi.fn(async t => t) } }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))
const { default: useStore } = await import('../../src/store/useStore.js')
const { default: SaveTemplateModal } = await import('../../src/components/SaveTemplateModal.jsx')
const { default: TemplatePicker } = await import('../../src/components/TemplatePicker.jsx')

const row = (pos, ref, extra = {}) => ({ _id: `${pos}-${ref}`, PositionTypeRef: pos, ContextType: 'PositionType', ContextRef: pos, ElementTypeRef: ref, RecipeIndex: 1, Quantity: 1, ...extra })

function seed() {
  useStore.setState({
    projectId: 7, templates: [], past: [], future: [], rsChanges: [], psRows: [], dbChanges: [],
    containerETRefs: new Set(['et-dl-02']),
    elementTypes: [{ ElementTypeRef: 'ET-DL-02' }, { ElementTypeRef: 'ET-PS-01' }, { ElementTypeRef: 'ET-DRIVER-01' }],
    positionTypes: [{ PositionTypeRef: 'A1' }, { PositionTypeRef: 'A2' }, { PositionTypeRef: 'A3' }],
    positionUI: { A1: { tags: ['DL'] }, A2: { tags: ['DL'] }, A3: { tags: [] } },
    recipes: [row('A1', 'ET-DL-02', { IsDesign: 'Y' }), row('A1', 'ET-DRIVER-01', { IsContractItem: 'Y' })],
  })
}

describe('Save as template', () => {
  test('prefilled, untick a row, saved to this project', async () => {
    seed()
    const onHide = vi.fn()
    render(<SaveTemplateModal show posRef="A1" name="Downlight" onHide={onHide} />)
    expect(screen.getByLabelText('Template name')).toHaveValue('Downlight')
    expect(screen.getByLabelText('Template tags')).toHaveValue('DL')
    expect(screen.getByText(/saved as a new DL wrapper each time/)).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText(/ET-DRIVER-01/))
    fireEvent.click(screen.getByText('Save template (1 row)'))
    await waitFor(() => expect(onHide).toHaveBeenCalledWith(true))
    const [t] = useStore.getState().templates
    expect(t).toMatchObject({ name: 'Downlight', scope: 'project', project_id: 7, applicable_tags: ['DL'] })
    expect(t.ingredients).toHaveLength(1)
  })
})

describe('Apply to…', () => {
  test('ticks the positions whose tags match, and applies as one step', async () => {
    seed()
    const t = await useStore.getState().saveAsTemplate('A1', { name: 'Downlight' })
    render(<TemplatePicker posRef="A1" activeTags={['DL']} hasRows onApply={vi.fn()} />)
    fireEvent.click(screen.getAllByText('Apply to…')[0])
    fireEvent.click(screen.getByText(/Tick every position tagged DL/))
    expect(screen.getByText(/1 already have a recipe/)).toBeInTheDocument()   // A1 itself
    fireEvent.click(screen.getByLabelText(/^A1/))                              // untick A1
    fireEvent.click(screen.getByText('Apply to 1'))
    const a2 = useStore.getState().recipes.filter(r => r.PositionTypeRef === 'A2')
    expect(a2.map(r => r.ElementTypeRef)).toEqual(['ET-DL-03', 'ET-DRIVER-01'])
    expect(screen.getByText(/Applied “Downlight” to 1 position/)).toBeInTheDocument()
    expect(t.id).toBeTruthy()
  })
})
