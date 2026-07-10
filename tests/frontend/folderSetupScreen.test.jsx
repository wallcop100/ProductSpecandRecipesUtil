import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const detectFiles = vi.fn()
const importFiles = vi.fn()
vi.mock('../../src/utils/backend.js', () => ({
  detectFiles: (...a) => detectFiles(...a),
  importFiles: (...a) => importFiles(...a),
}))

const { default: FolderSetupScreen } = await import('../../src/screens/FolderSetupScreen.jsx')

const RECENTS = [
  { id: 1, folder_path: 'key-a', project_number: '5642', project_label: 'LIGHTING', config_name: 'Base', db_filename: 'db.xlsx', last_opened: new Date(Date.now() - 7200e3).toISOString() },
  { id: 2, folder_path: 'key-b', project_number: '5511', project_label: 'ATRIUM', config_name: 'Alt', db_filename: 'db.xlsx', last_opened: new Date(Date.now() - 3 * 864e5).toISOString() },
]

// The order calls actually happened in — the permission grant must come first.
let calls

beforeEach(() => {
  calls = []
  detectFiles.mockReset().mockResolvedValue({ db: 'db.xlsx', ps: 'ps.xlsx', rs: 'rs.xlsx', all_xlsx: ['db.xlsx'] })
  importFiles.mockReset().mockResolvedValue({ db: { element_types: [], position_types: [] }, ps: [], rs: [], missing: [] })

  window.electronAPI = {
    getAppVersion: vi.fn().mockResolvedValue('1.0.0'),
    isFolderAccessSupported: () => true,
    openFolderDialog: vi.fn().mockResolvedValue('picked-key'),
    getFolderName: vi.fn().mockResolvedValue('Some Folder'),
    requestFolderAccess: vi.fn(async () => { calls.push('grant'); return true }),
    startWatcher: vi.fn().mockResolvedValue(undefined),
    db: {
      getRecentProjects: vi.fn(async () => { calls.push('recents'); return RECENTS }),
      getConfigsForFolder: vi.fn().mockResolvedValue([]),
      upsertProject: vi.fn(async () => { calls.push('upsert'); return { id: 9, project_label: 'LIGHTING' } }),
      getPendingChanges: vi.fn().mockResolvedValue(null),
      getPref: vi.fn().mockResolvedValue(null),
      setPref: vi.fn().mockResolvedValue(undefined),
      getLocalETs: vi.fn().mockResolvedValue([]),
      getAllPositionUI: vi.fn().mockResolvedValue([]),
      getAllTemplates: vi.fn().mockResolvedValue([]),
      getAllSlotMappings: vi.fn().mockResolvedValue({}),
      getAllCollections: vi.fn().mockResolvedValue([]),
      getFavorites: vi.fn().mockResolvedValue([]),
      getDefaultTags: vi.fn().mockResolvedValue({ rules: [], palette: [] }),
    },
  }
})

describe('the landing page leads with what you last worked on', () => {
  test('recent projects are listed, newest first, with their config and age', async () => {
    render(<FolderSetupScreen onProjectLoaded={() => {}} />)
    expect(await screen.findByText('5642')).toBeTruthy()
    expect(screen.getByText('LIGHTING')).toBeTruthy()
    expect(screen.getByText('Alt')).toBeTruthy()
    expect(screen.getByText('2h ago')).toBeTruthy()
    expect(screen.getByText('3d ago')).toBeTruthy()
  })

  test('both ways in are offered, and one of them is a new project', async () => {
    render(<FolderSetupScreen onProjectLoaded={() => {}} />)
    expect(await screen.findByText('Open a folder…')).toBeTruthy()
    expect(screen.getByText('New project')).toBeTruthy()
  })

  /**
   * Chrome only honours requestPermission inside the gesture that triggered it. Any
   * await before it ends the gesture and the prompt is refused. This asserts the
   * ordering, not just that the call happened.
   */
  test('clicking a recent asks for permission BEFORE anything else, then opens', async () => {
    const onLoaded = vi.fn()
    render(<FolderSetupScreen onProjectLoaded={onLoaded} />)
    fireEvent.click(await screen.findByText('LIGHTING'))

    await waitFor(() => expect(onLoaded).toHaveBeenCalled())
    expect(window.electronAPI.requestFolderAccess).toHaveBeenCalledWith('key-a')
    expect(calls.indexOf('grant')).toBeLessThan(calls.indexOf('upsert'))
    // opened with that row's identity, not the first row's
    expect(window.electronAPI.db.upsertProject.mock.calls[0][0]).toMatchObject({
      folderPath: 'key-a', projectNumber: '5642', configName: 'Base',
    })
  })

  test('a refused permission says so and opens nothing', async () => {
    window.electronAPI.requestFolderAccess = vi.fn().mockResolvedValue(false)
    const onLoaded = vi.fn()
    render(<FolderSetupScreen onProjectLoaded={onLoaded} />)
    fireEvent.click(await screen.findByText('ATRIUM'))

    expect(await screen.findByText(/was not granted/)).toBeTruthy()
    expect(onLoaded).not.toHaveBeenCalled()
    expect(window.electronAPI.db.upsertProject).not.toHaveBeenCalled()
  })

  test('when detection misses the DesignDB, the remembered filename still opens it', async () => {
    detectFiles.mockResolvedValue({ db: null, ps: null, rs: null, all_xlsx: [] })
    render(<FolderSetupScreen onProjectLoaded={() => {}} />)
    fireEvent.click(await screen.findByText('LIGHTING'))

    await waitFor(() => expect(window.electronAPI.db.upsertProject).toHaveBeenCalled())
    expect(window.electronAPI.db.upsertProject.mock.calls[0][0].dbFilename).toBe('db.xlsx')
  })

  test('a recent with no DesignDB anywhere is reported, not opened', async () => {
    detectFiles.mockResolvedValue({ db: null, ps: null, rs: null, all_xlsx: [] })
    window.electronAPI.db.getRecentProjects = vi.fn().mockResolvedValue([{ ...RECENTS[0], db_filename: null }])
    render(<FolderSetupScreen onProjectLoaded={() => {}} />)
    fireEvent.click(await screen.findByText('LIGHTING'))

    expect(await screen.findByText(/No DesignDB in that folder/)).toBeTruthy()
    expect(window.electronAPI.db.upsertProject).not.toHaveBeenCalled()
  })
})

describe('a new project needs only the DesignDB', () => {
  test('a missing Product Spec reads as "starts empty", not as an error', async () => {
    detectFiles.mockResolvedValue({ db: 'db.xlsx', ps: null, rs: null, all_xlsx: ['db.xlsx'] })
    render(<FolderSetupScreen onProjectLoaded={() => {}} />)

    fireEvent.click(await screen.findByText('New project'))
    await screen.findAllByText('Product Spec (PS)')

    expect(screen.queryByText('not found')).toBeNull()
    expect(screen.getAllByText(/starts empty, and your export/)).toHaveLength(2)
    expect(screen.getByText('Open Project')).not.toBeDisabled()
  })

  test('without a DesignDB the project cannot be opened', async () => {
    detectFiles.mockResolvedValue({ db: null, ps: 'ps.xlsx', rs: 'rs.xlsx', all_xlsx: ['ps.xlsx'] })
    render(<FolderSetupScreen onProjectLoaded={() => {}} />)

    fireEvent.click(await screen.findByText('Open a folder…'))
    await screen.findAllByText('Database (DB)')

    expect(screen.getByText('not found')).toBeTruthy()   // the DB, and only the DB
    expect(screen.getByText('Open Project')).toBeDisabled()
  })
})
