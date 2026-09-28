import { describe, test, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

window.electronAPI = { db: { setPref: vi.fn().mockResolvedValue(undefined) } }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))
const { default: useStore } = await import('../../src/store/useStore.js')
const { default: ETSpecEditor } = await import('../../src/components/ETSpecEditor.jsx')
const { default: UndoShortcut } = await import('../../src/components/UndoShortcut.jsx')

function setup(screenName = 'product-spec') {
  useStore.setState({
    projectId: 1, past: [], future: [], psChanges: [], rsChanges: [], dbChanges: [], recipes: [],
    elementTypes: [{ ElementTypeRef: 'ET-2Pin-Remote-Plug', Family: 'ET-CONNECTORS' }],
    psRows: [{ ElementTypeRef: 'ET-2Pin-Remote-Plug', Manufacturer: 'Wago', ProductCode: '770-1112' }],
  })
  return render(<><UndoShortcut screen={screenName} /><ETSpecEditor selectedRef="ET-2Pin-Remote-Plug" /></>)
}
const code = () => useStore.getState().psRows[0].ProductCode
const input = () => screen.getByDisplayValue(/770-1112/)

describe('Ctrl+Z on the Product Spec', () => {
  test('undoes a saved field edit, even with the cursor back in that field', () => {
    setup()
    fireEvent.change(input(), { target: { value: '770-1112\\' } })
    fireEvent.blur(input())
    expect(code()).toBe('770-1112\\')
    input().focus()                                   // clicked back in, nothing typed
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(code()).toBe('770-1112')
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true })
    expect(code()).toBe('770-1112\\')
  })

  test('while typing in a field, the browser keeps its own undo', () => {
    setup()
    fireEvent.change(input(), { target: { value: '770-1112X' } })
    fireEvent.blur(input())
    input().focus()
    fireEvent.change(input(), { target: { value: '770-1112XY' } })   // typing
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(code()).toBe('770-1112X')
  })

  test('Import keeps its own undo', () => {
    setup('product-code-import')
    const el = input()
    fireEvent.change(el, { target: { value: 'Q' } })
    fireEvent.blur(el)
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(code()).toBe('Q')
  })
})
