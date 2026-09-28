import { describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import useStore from '../../src/store/useStore'
import TagRulesModal from '../../src/components/TagRulesModal'

const positionTypes = [
  { PositionTypeRef: 'A02m', DriverLocation: 'Local', ControlTypeRef: 'DALI' },
  { PositionTypeRef: 'A02w', DriverLocation: 'Local', ControlTypeRef: 'TW' },
  { PositionTypeRef: 'D01', DriverLocation: 'Remote', ControlTypeRef: 'DALI' },
]

beforeEach(() => {
  useStore.setState({
    positionTypes,
    positionUI: {},
    tagPalette: ['Local', 'DALI'],
    tagRules: [
      { id: 'r1', tag: 'Local', enabled: true, match: 'all',
        conditions: [{ column: 'DriverLocation', op: 'equals', value: 'Local' }] },
    ],
    tagColors: {},
    tagDrift: {},
    setTagRules: vi.fn(),
    setTagPalette: vi.fn(),
    setTagColor: vi.fn(),
  })
})

describe('the rule editor is conditional', () => {
  test('a rule shows its live match count', () => {
    render(<TagRulesModal show onHide={() => {}} />)
    // two Local-driver positions
    expect(screen.getByText('2 matches')).toBeTruthy()
  })

  test('a single-condition rule shows no AND/OR connector — it appears only when needed', () => {
    render(<TagRulesModal show onHide={() => {}} />)
    expect(screen.queryByText('AND')).toBeNull()
    expect(screen.queryByText('OR')).toBeNull()
    fireEvent.click(screen.getByText('Add condition'))
    expect(screen.getByText('AND')).toBeTruthy()   // now there are two conditions
  })

  test('adding a condition makes it an AND — the count drops to the intersection', () => {
    render(<TagRulesModal show onHide={() => {}} />)
    fireEvent.click(screen.getByText('Add condition'))

    // set the new condition: ControlTypeRef equals DALI
    const selects = screen.getAllByRole('combobox')
    // the last column select + op select + a value box belong to the new row
    const columnSelects = selects.filter(s => within(s).queryByText('ControlTypeRef'))
    fireEvent.change(columnSelects[columnSelects.length - 1], { target: { value: 'ControlTypeRef' } })

    const valueBoxes = screen.getAllByPlaceholderText('value')
    fireEvent.change(valueBoxes[valueBoxes.length - 1], { target: { value: 'DALI' } })

    // Local AND DALI → only A02m
    expect(screen.getByText('1 match')).toBeTruthy()
  })

  test('switching a rule to ANY makes it an OR — the count is the union', () => {
    // Local (2) OR DALI (2, but D01 shares none with Local) → A02m, A02w, D01 = 3
    render(<TagRulesModal show onHide={() => {}} />)
    fireEvent.click(screen.getByText('Add condition'))

    const columnSelects = screen.getAllByRole('combobox')
    const lastCol = columnSelects.filter(s => within(s).queryByText('ControlTypeRef')).pop()
    fireEvent.change(lastCol, { target: { value: 'ControlTypeRef' } })
    const valueBoxes = screen.getAllByPlaceholderText('value')
    fireEvent.change(valueBoxes[valueBoxes.length - 1], { target: { value: 'DALI' } })

    // flip AND → OR via the connector pill between the two conditions
    fireEvent.click(screen.getByText('AND'))
    expect(screen.getByText('3 matches')).toBeTruthy()
    expect(screen.getByText('OR')).toBeTruthy()   // the connector now reads OR
  })

  test('a value-less operator hides the value box', () => {
    render(<TagRulesModal show onHide={() => {}} />)
    const opSelect = screen.getAllByRole('combobox').find(s => within(s).queryByText('is empty'))
    fireEvent.change(opSelect, { target: { value: 'isEmpty' } })
    expect(screen.getByText('(no value)')).toBeTruthy()
  })

  test('Apply pushes the edited rules to the store', () => {
    render(<TagRulesModal show onHide={() => {}} />)
    fireEvent.click(screen.getByText('Add condition'))
    fireEvent.click(screen.getByRole('button', { name: 'Apply rules' }))
    expect(useStore.getState().setTagRules).toHaveBeenCalled()
    const pushed = useStore.getState().setTagRules.mock.calls[0][0]
    expect(pushed[0].conditions).toHaveLength(2)
  })
})

describe('the Tags & colours tab', () => {
  test('every tag — palette, rule, or used — is colourable', () => {
    useStore.setState({
      tagPalette: ['Local'],
      tagRules: [{ id: 'r', tag: 'FromRule', conditions: [{ column: 'DriverLocation', op: 'equals', value: 'Local' }] }],
      positionUI: { A02m: { tags: ['OnPosition'] } },
    })
    render(<TagRulesModal show onHide={() => {}} />)
    fireEvent.click(screen.getByText('Tags & colours'))
    // rule and position tags are unique; the palette tag appears at least once
    expect(screen.getByText('FromRule')).toBeTruthy()
    expect(screen.getByText('OnPosition')).toBeTruthy()
    expect(screen.getAllByText('Local').length).toBeGreaterThan(0)
  })
})

describe('Tags window: recipe columns, new rules on top, no silent loss', () => {
  test('a rule on the recipe’s manufacturer tags the positions using that maker', async () => {
    const { recipeTagIndex, withRecipeFields, evaluateTags } = await import('../../src/utils/tagRules.js')
    const index = recipeTagIndex({
      recipes: [{ PositionTypeRef: 'A1', ElementTypeRef: 'ET-PS-01' }, { PositionTypeRef: 'A2', ElementTypeRef: 'ET-PS-02' }],
      psRows: [{ ElementTypeRef: 'ET-PS-01', Manufacturer: 'iGuzzini' }, { ElementTypeRef: 'ET-PS-02', Manufacturer: 'Flos' }],
      elementTypes: [],
    })
    const rule = { id: 'r', tag: 'iGuzzini', match: 'all', conditions: [{ column: 'Recipe.Manufacturer', op: 'equals', value: 'iguzzini' }] }
    expect(evaluateTags(withRecipeFields({ PositionTypeRef: 'A1' }, index), [rule])).toEqual(['iGuzzini'])
    expect(evaluateTags(withRecipeFields({ PositionTypeRef: 'A2' }, index), [rule])).toEqual([])
    const not = { ...rule, conditions: [{ column: 'Recipe.Manufacturer', op: 'notEquals', value: 'iGuzzini' }] }
    expect(evaluateTags(withRecipeFields({ PositionTypeRef: 'A1' }, index), [not])).toEqual([])
  })

  test('Add rule puts the new rule first; closing with edits asks; Apply is in the footer', () => {
    const onHide = vi.fn()
    useStore.setState({ tagRules: [{ id: 'old', tag: 'Old', enabled: true, match: 'all', conditions: [{ column: 'Name', op: 'contains', value: 'x' }] }] })
    render(<TagRulesModal show onHide={onHide} />)
    fireEvent.click(screen.getByRole('button', { name: /Add rule/ }))
    const names = screen.getAllByLabelText('Tag name')
    expect(names[0]).toHaveValue('')
    expect(document.activeElement).toBe(names[0])
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0])   // the header ×: same guard
    expect(onHide).not.toHaveBeenCalled()
    expect(screen.getByTestId('unapplied-warning')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onHide).toHaveBeenCalled()
  })
})
