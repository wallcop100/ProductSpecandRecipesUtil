import { describe, test, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

window.electronAPI = { db: { setPref: vi.fn().mockResolvedValue(undefined) } }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))

const { default: useStore } = await import('../../src/store/useStore.js')
const { default: FormProgressChip } = await import('../../src/components/FormProgressChip.jsx')

const pos = (posRef, ref, extra = {}) => ({
  _id: `${posRef}-p-${ref}`, PositionTypeRef: posRef, ContextType: 'PositionType',
  ContextRef: posRef, ElementTypeRef: ref, Quantity: 1, ...extra,
})
const ent = (ref) => ({ elementTypeRef: ref, code: 'C-' + ref, manufacturer: 'M' })

function setup(over = {}, props = {}) {
  useStore.setState({
    projectId: 42,
    recipes: [pos('C01r', 'ET-PROF-01'), pos('C03r', 'ET-LAMP')],
    containerETRefs: new Set(),
    formCaptures: null,
    positionTypes: [{ PositionTypeRef: 'C01r' }, { PositionTypeRef: 'C03r' }],
    // The loaded Form: both positions, saved (added).
    importDraft: { rows: [
      { id: 0, positionType: 'C01r', rawText: 'C-ET-PROF-01', confirmed: true },
      { id: 1, positionType: 'C03r', rawText: 'C-ET-PROF-01', confirmed: true },
    ], stagedRefs: ['C01r', 'C03r'] },
    ...over,
  })
  return render(<FormProgressChip {...props} />)
}

describe('the chip reports Form progress, and only that', () => {
  const onReconcile = vi.fn()
  beforeEach(() => vi.clearAllMocks())

  test('with no Form it is silent — the pane carries the prompt', () => {
    const { container } = setup({ importDraft: null }, { onReconcile })
    expect(container).toBeEmptyDOMElement()
  })

  test('with a Form, it shows progress', () => {
    setup({
      formCaptures: { version: 1, byPosition: { C01r: [ent('ET-PROF-01')], C03r: [ent('ET-PROF-01')] } },
    }, { onReconcile })

    const chip = screen.getByLabelText(/^Form 1\/2:/)            // C03r lacks the profile
    expect(chip.getAttribute('aria-label')).toMatch(/1 missing/)
  })

  test('Reconcile hands the incomplete positions to the step-through', () => {
    setup({
      formCaptures: { version: 1, byPosition: { C01r: [ent('ET-PROF-01')], C03r: [ent('ET-PROF-01')] } },
    }, { onReconcile })

    fireEvent.click(screen.getByText(/Reconcile/))
    expect(onReconcile).toHaveBeenCalledWith(['C03r'])
  })

  test('nothing left to reconcile: no Reconcile link', () => {
    setup({
      formCaptures: { version: 1, byPosition: { C01r: [ent('ET-PROF-01')] } },
      importDraft: { rows: [{ id: 0, positionType: 'C01r', rawText: 'C-ET-PROF-01', confirmed: true }], stagedRefs: ['C01r'] },
    }, { onReconcile })

    expect(screen.getByLabelText(/^Form 1\/1:/)).toBeInTheDocument()
    expect(screen.queryByText(/Reconcile/)).toBeNull()
  })

  test('X4AN58: saved positions but no Form loaded: "Form not loaded", no count', () => {
    const onLoad = vi.fn()
    setup({ importDraft: null, formCaptures: { version: 1, byPosition: { C01r: [ent('ET-PROF-01')] } } }, { onReconcile, onLoad })
    expect(screen.getByLabelText(/^Form not loaded/)).toBeInTheDocument()
    expect(screen.queryByText(/\d\/\d/)).toBeNull()
    fireEvent.click(screen.getByTestId('form-load'))
    expect(onLoad).toHaveBeenCalled()
  })

  test('X4AN58: the total counts every position the loaded Form gives products for, saved or not', () => {
    setup({
      formCaptures: { version: 1, byPosition: { C01r: [ent('ET-PROF-01')] } },
      importDraft: { rows: [
        { id: 0, positionType: 'C01r', rawText: 'C-ET-PROF-01', confirmed: true },
        { id: 1, positionType: 'C03r', rawText: 'NEW-CODE-9', confirmed: false },
        { id: 2, positionType: 'C05r', rawText: 'n/a', confirmed: true },
      ], stagedRefs: ['C01r'] },
      positionTypes: [{ PositionTypeRef: 'C01r' }, { PositionTypeRef: 'C03r' }, { PositionTypeRef: 'C05r' }],
    }, { onReconcile })
    expect(screen.getByLabelText(/^Form 1\/2:/)).toBeInTheDocument()     // C05r says n/a: not counted
  })
})
