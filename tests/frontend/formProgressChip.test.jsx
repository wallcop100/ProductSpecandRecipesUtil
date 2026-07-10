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

describe('the chip reports Form progress, and only that', () => {
  const onReconcile = vi.fn()
  beforeEach(() => vi.clearAllMocks())

  test('with no Form it is silent — the pane carries the prompt', () => {
    const { container } = setup({}, { onReconcile })
    expect(container).toBeEmptyDOMElement()
  })

  test('with a Form, it shows progress', () => {
    setup({
      formCaptures: { version: 1, byPosition: { C01r: [ent('ET-PROF-01')], C03r: [ent('ET-PROF-01')] } },
    }, { onReconcile })

    expect(screen.getByText('Form: 1/2')).toBeInTheDocument()   // C03r lacks the profile
    expect(screen.getByText(/1 missing/)).toBeInTheDocument()
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
    }, { onReconcile })

    expect(screen.getByText('Form: 1/1')).toBeInTheDocument()
    expect(screen.queryByText(/Reconcile/)).toBeNull()
  })
})
