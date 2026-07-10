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
    ...over,
  })
  return render(<FormProgressChip {...props} />)
}

describe('the chip is the way into the workflow when no Form is attached', () => {
  const onAttach = vi.fn()
  const onReconcile = vi.fn()
  beforeEach(() => vi.clearAllMocks())

  test('with no Form, it offers to attach one', () => {
    setup({}, { onAttach, onReconcile })
    fireEvent.click(screen.getByText('Attach a Form'))
    expect(onAttach).toHaveBeenCalled()
  })

  test('with no Form and no handler, it stays silent rather than dangling', () => {
    const { container } = setup({}, {})
    expect(container).toBeEmptyDOMElement()
  })

  test('with a Form, it shows progress instead of the attach button', () => {
    setup({
      formCaptures: { version: 1, byPosition: { C01r: [ent('ET-PROF-01')], C03r: [ent('ET-PROF-01')] } },
    }, { onAttach, onReconcile })

    expect(screen.queryByText('Attach a Form')).toBeNull()
    expect(screen.getByText('Form: 1/2')).toBeInTheDocument()   // C03r lacks the profile
    expect(screen.getByText(/1 missing/)).toBeInTheDocument()
  })

  test('Reconcile hands the incomplete positions to the step-through', () => {
    setup({
      formCaptures: { version: 1, byPosition: { C01r: [ent('ET-PROF-01')], C03r: [ent('ET-PROF-01')] } },
    }, { onAttach, onReconcile })

    fireEvent.click(screen.getByText(/Reconcile/))
    expect(onReconcile).toHaveBeenCalledWith(['C03r'])
  })

  test('nothing left to reconcile: no Reconcile link', () => {
    setup({
      formCaptures: { version: 1, byPosition: { C01r: [ent('ET-PROF-01')] } },
    }, { onAttach, onReconcile })

    expect(screen.getByText('Form: 1/1')).toBeInTheDocument()
    expect(screen.queryByText(/Reconcile/)).toBeNull()
  })
})
