import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'

window.electronAPI = { db: { setPref: vi.fn().mockResolvedValue(undefined) } }
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))

const { default: useStore } = await import('../../src/store/useStore.js')
const { default: BugReporter } = await import('../../src/components/BugReporter.jsx')
const { default: ChangeSummaryModal } = await import('../../src/components/ChangeSummaryModal.jsx')
const { reportsToMarkdown } = await import('../../src/utils/bugReports.js')

function setup() {
  localStorage.clear()
  useStore.setState({
    bugMode: false, bugReports: [], projectLabel: '5452 Test', activePositionRef: 'C01r',
    positionTypes: [{ PositionTypeRef: 'C01r' }], elementTypes: [], recipes: [], psRows: [],
    dbChanges: [], psChanges: [], rsChanges: [], formCaptures: null, teaching: null,
  })
  return render(
    <>
      <BugReporter screen="builder" />
      <div data-debug-id="PositionRecipeEditor">
        <table><tbody><tr data-testid="ing-row"><td>ET-PS-03</td><td><button>Swap</button></td></tr></tbody></table>
      </div>
    </>
  )
}

describe('bug reports', () => {
  beforeEach(() => vi.clearAllMocks())

  test('off: right-click is left alone', () => {
    setup()
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
    screen.getByText('Swap').dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(false)
    expect(screen.queryByTestId('bug-note')).toBeNull()
  })

  test('on: right-click opens a note; saving records where it was', () => {
    setup()
    fireEvent.click(screen.getByTestId('bug-toggle'))
    expect(localStorage.getItem('bugMode')).toBe('1')
    fireEvent.click(screen.getByText('Swap'))                     // goes in the click trail
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 60 })
    act(() => { screen.getByText('Swap').dispatchEvent(ev) })
    expect(ev.defaultPrevented).toBe(true)
    fireEvent.change(screen.getByLabelText('Bug note'), { target: { value: 'Swap does nothing' } })
    fireEvent.keyDown(screen.getByLabelText('Bug note'), { key: 'Enter', ctrlKey: true })

    const [r] = useStore.getState().bugReports
    expect(r.note).toBe('Swap does nothing')
    expect(r.app).toMatchObject({ screen: 'builder', project: '5452 Test', position: 'C01r' })
    expect(r.dom.areas).toEqual(['ing-row', 'PositionRecipeEditor'])
    expect(r.dom.refs).toEqual(['ET-PS-03'])
    expect(r.dom.row).toEqual(['ET-PS-03', 'Swap'])
    expect(r.trail.at(-1).label).toMatch(/Swap/)
    expect(JSON.parse(localStorage.getItem('bugReports'))).toHaveLength(1)

    const md = reportsToMarkdown(useStore.getState().bugReports)
    expect(md).toMatch(/^# Bug reports \(1\)/)
    expect(r.id).toMatch(/^[A-HJ-NP-Z2-9]{6}$/)
    expect(md).toContain(`## ${r.id} · Swap does nothing`)
    expect(md).toContain('- **Position:** C01r')
    expect(md).toContain('- **Area:** `ing-row` › `PositionRecipeEditor`')
    expect(md).toContain('- **Row:** | ET-PS-03 | Swap |')
  })

  test('Shift + right-click keeps the normal menu', () => {
    setup()
    fireEvent.click(screen.getByTestId('bug-toggle'))
    const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, shiftKey: true })
    screen.getByText('Swap').dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(false)
  })

  test('the export window lists them and copies Markdown', async () => {
    setup()
    useStore.setState({ bugReports: [{ id: 'K3F9QZ', at: '2026-09-28T10:00:00.000Z', note: 'Broken thing', version: '1', build: '2026-09-28' }] })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<ChangeSummaryModal show onHide={vi.fn()} />)
    fireEvent.click(screen.getByText('Bug reports'))
    expect(screen.getByTestId('bug-reports-tab')).toHaveTextContent('Broken thing')
    await act(async () => { fireEvent.click(screen.getByText('Copy all as Markdown')) })
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('## K3F9QZ · Broken thing'))
  })
})
