import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, act } from '@testing-library/react'

window.electronAPI = {
  db: {
    upsertTemplate: vi.fn().mockResolvedValue({}), setPref: vi.fn().mockResolvedValue(undefined), getPref: vi.fn().mockResolvedValue(null),
    getRecipePatterns: vi.fn().mockResolvedValue([]), getStyleExemplars: vi.fn().mockResolvedValue([]),
  },
}
const { default: useStore } = await import('../../src/store/useStore.js')
const { default: FormRecipesModal } = await import('../../src/components/FormRecipesModal.jsx')

const et = (ref, Family) => ({ ElementTypeRef: ref, Family })
const rowsOf = pos => useStore.getState().recipes.filter(r => (r.PositionTypeRef || r.positionTypeRef) === pos && (r.IsDeleted || r.isDeleted) !== 'Y')

beforeEach(() => {
  useStore.setState({
    projectId: 1, recipes: [], psRows: [], templates: [], containerETRefs: new Set(), past: [], future: [], psChanges: [], rsChanges: [], dbChanges: [],
    positionUI: {}, library: { patterns: [], exemplars: [] },
    positionTypes: [
      { PositionTypeRef: 'B1', ParentRef: 'DOWNLIGHT', DriverLocation: 'Local to fitting' },
      { PositionTypeRef: 'B2', ParentRef: 'DOWNLIGHT', DriverLocation: 'Local to fitting' },
      { PositionTypeRef: 'L1', ParentRef: 'LINEAR', DriverLocation: 'Remote' },
    ],
    elementTypes: [et('ET-PS-01', 'ET-PS'), et('ET-PS-02', 'ET-PS'), et('ET-LIN-TAPE-01', 'ET-LIN-TAPE')],
    formCaptures: { byPosition: {
      B1: [{ elementTypeRef: 'ET-PS-01', code: 'QC50', role: 'lead' }],
      B2: [{ elementTypeRef: 'ET-PS-02', code: 'QC51', role: 'lead' }],
      L1: [{ elementTypeRef: 'ET-LIN-TAPE-01', code: 'NF24', role: 'lead' }],
    } },
  })
})

describe('recipes from the Form: build one, check it, the rest copy it', () => {
  test('groups by kind; the first is proposed with empty parts flagged; nothing is written until you build it', async () => {
    const onOpen = vi.fn()
    render(<FormRecipesModal show posRefs={[]} onHide={vi.fn()} onOpenPosition={onOpen} />)
    expect(await screen.findAllByTestId('form-group')).toHaveLength(3)     // split by main product too
    fireEvent.click(screen.getByRole('button', { name: 'Main product' }))  // the old grouping: by kind
    const groups = screen.getAllByTestId('form-group').filter(g => /Point source/.test(g.textContent))
    expect(screen.getAllByTestId('form-group')).toHaveLength(2)
    fireEvent.click(within(groups[0]).getByText(/Point source in a DL wrapper/))
    expect(within(groups[0]).getAllByText('empty — add it in the builder').length).toBeGreaterThan(0)
    expect(rowsOf('B1')).toEqual([])
    fireEvent.click(within(groups[0]).getByRole('button', { name: 'Build B1 and check it in the builder' }))
    expect(onOpen).toHaveBeenCalledWith('B1')
    expect(rowsOf('B1').length).toBeGreaterThan(0)
  })

  test('once checked, "Use it for the other 1" teaches the group; B2 is built from it with its own product', async () => {
    useStore.getState().buildProposedRecipe('B1')
    render(<FormRecipesModal show posRefs={[]} onHide={vi.fn()} onOpenPosition={vi.fn()} />)
    await screen.findAllByTestId('form-group')
    fireEvent.click(screen.getByRole('button', { name: 'Main product' }))
    const g = screen.getAllByTestId('form-group').find(x => /Point source/.test(x.textContent))
    fireEvent.click(within(g).getByText(/Point source in a DL wrapper/))
    await act(async () => { fireEvent.click(within(g).getByRole('button', { name: 'Use it for the other 1' })) })
    // Saved as a style: the group is now that style's, and B2 is ticked to build from it.
    const sg = screen.getAllByTestId('form-group').find(x => /style/.test(x.textContent))
    fireEvent.click(await within(sg).findByRole('button', { name: 'Build 1' }))
    const refs = rowsOf('B2').map(r => r.ElementTypeRef || r.elementTypeRef)
    expect(refs).toContain('ET-PS-02')
    expect(refs).not.toContain('ET-PS-01')
    expect(screen.getByText(/Built 1 from .*B1/)).toBeInTheDocument()
  })
})

describe('choosing what ships together', () => {
  test('pick a wrapper for the group, send a part separately, and the first one is built that way', async () => {
    useStore.setState({ recipeChoices: {} })
    render(<FormRecipesModal show posRefs={[]} onHide={vi.fn()} onOpenPosition={vi.fn()} />)
    const g = (await screen.findAllByTestId('form-group')).find(x => /Linear/.test(x.textContent))   // the linear group
    fireEvent.click(within(g).getByText(/Linear in a LIN wrapper/))
    expect(within(g).getByLabelText('Wrapper').value).toBe('LIN')
    fireEvent.change(within(g).getByLabelText('Wrapper'), { target: { value: 'none' } })
    expect(within(g).queryAllByText('inside wrapper')).toHaveLength(0)
    fireEvent.change(within(g).getByLabelText('Wrapper'), { target: { value: 'LIN' } })
    fireEvent.click(within(g).getByRole('button', { name: 'Build L1 and check it in the builder' }))
    const rows = rowsOf('L1')
    expect(rows.some(r => /^ET-LIN-\d/.test(r.ElementTypeRef || r.elementTypeRef))).toBe(true)
    expect(rows.find(r => (r.ElementTypeRef || r.elementTypeRef) === 'ET-LIN-TAPE-01')).toMatchObject({ ContextType: 'ElementType' })
  })
})
