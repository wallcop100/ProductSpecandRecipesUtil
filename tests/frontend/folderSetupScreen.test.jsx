import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const detectFiles = vi.fn()
const importFiles = vi.fn()
vi.mock('../../src/utils/backend.js', () => ({
  detectFiles: (...a) => detectFiles(...a),
  importFiles: (...a) => importFiles(...a),
}))

const { default: FolderSetupScreen } = await import('../../src/screens/FolderSetupScreen.jsx')

const PROJECTS = [
  { id: 1, folder_path: 'key-a', project_number: '5642', project_label: 'LIGHTING', config_name: 'Base', db_filename: 'db.xlsx', last_opened: new Date(Date.now() - 7200e3).toISOString(), unexported: 3, taggedPositions: 12, overlayRows: 0 },
  { id: 2, folder_path: 'key-b', project_number: '5511', project_label: 'ATRIUM', config_name: 'Alt', db_filename: 'db.xlsx', last_opened: new Date(Date.now() - 3 * 864e5).toISOString(), unexported: 0, taggedPositions: 0, overlayRows: 0 },
]

// The order calls actually happened in — the permission grant must come first.
let calls

beforeEach(() => {
  calls = []
  window.confirm = vi.fn(() => true)
  detectFiles.mockReset().mockResolvedValue({ db: 'db.xlsx', ps: 'ps.xlsx', rs: 'rs.xlsx', all_xlsx: ['db.xlsx'] })
  importFiles.mockReset().mockResolvedValue({ db: { element_types: [], position_types: [] }, ps: [], rs: [], missing: [] })

  window.electronAPI = {
    getAppVersion: vi.fn().mockResolvedValue('1.0.0'),
    isFolderAccessSupported: () => true,
    openFolderDialog: vi.fn().mockResolvedValue({ key: 'picked-key', name: 'Some Folder', known: false }),
    getFolderName: vi.fn().mockResolvedValue('Some Folder'),
    requestFolderAccess: vi.fn(async () => { calls.push('grant'); return true }),
    startWatcher: vi.fn().mockResolvedValue(undefined),
    findDuplicateFolders: vi.fn().mockResolvedValue([]),
    forgetFolder: vi.fn().mockResolvedValue(undefined),
    db: {
      getProjectSummaries: vi.fn(async () => { calls.push('summaries'); return PROJECTS }),
      getConfigsForFolder: vi.fn().mockResolvedValue([]),
      upsertProject: vi.fn(async () => { calls.push('upsert'); return { id: 9, project_label: 'LIGHTING' } }),
      renameProject: vi.fn().mockResolvedValue(undefined),
      renameConfig: vi.fn().mockResolvedValue({ ok: true }),
      deleteProject: vi.fn().mockResolvedValue(undefined),
      adoptDuplicateProject: vi.fn().mockResolvedValue({ ok: true }),
      exportConfigYAML: vi.fn().mockResolvedValue({ ok: true, path: 'x.yaml' }),
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

describe('the landing page IS the project list', () => {
  test('a project shows its name, number, config and age', async () => {
    render(<FolderSetupScreen onProjectLoaded={() => {}} />)
    expect(await screen.findByText('LIGHTING')).toBeTruthy()
    expect(screen.getByText('5642')).toBeTruthy()
    expect(screen.getByText('Base')).toBeTruthy()
    expect(screen.getByText('2h ago')).toBeTruthy()
    expect(screen.getByText('3d ago')).toBeTruthy()
  })

  /**
   * "Am I in the right one?" is the only question this page has to answer, and the honest
   * answer is the work inside. An empty copy of a project has the same name as the real one.
   */
  test('unexported changes are shown — that is how you tell the real project from an empty copy', async () => {
    render(<FolderSetupScreen onProjectLoaded={() => {}} />)
    expect(await screen.findByText('3 unexported')).toBeTruthy()
    expect(screen.getByText('empty')).toBeTruthy()   // the other one holds nothing
  })

  /**
   * Chrome only honours requestPermission inside the gesture that triggered it. Any await
   * before it ends the gesture and the prompt is refused. This asserts the ORDERING.
   */
  test('opening a project asks for permission BEFORE anything else, then opens', async () => {
    const onLoaded = vi.fn()
    render(<FolderSetupScreen onProjectLoaded={onLoaded} />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Open' }))[0])

    await waitFor(() => expect(onLoaded).toHaveBeenCalled())
    expect(window.electronAPI.requestFolderAccess).toHaveBeenCalledWith('key-a')
    expect(calls.indexOf('grant')).toBeLessThan(calls.indexOf('upsert'))
    expect(window.electronAPI.db.upsertProject.mock.calls[0][0]).toMatchObject({
      folderPath: 'key-a', projectNumber: '5642', configName: 'Base',
    })
  })

  test('a refused permission says so and opens nothing', async () => {
    window.electronAPI.requestFolderAccess = vi.fn().mockResolvedValue(false)
    const onLoaded = vi.fn()
    render(<FolderSetupScreen onProjectLoaded={onLoaded} />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Open' }))[0])

    expect(await screen.findByText(/was not granted/)).toBeTruthy()
    expect(onLoaded).not.toHaveBeenCalled()
    expect(window.electronAPI.db.upsertProject).not.toHaveBeenCalled()
  })

  test('when detection misses the DesignDB, the remembered filename still opens it', async () => {
    detectFiles.mockResolvedValue({ db: null, ps: null, rs: null, all_xlsx: [] })
    render(<FolderSetupScreen onProjectLoaded={() => {}} />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Open' }))[0])

    await waitFor(() => expect(window.electronAPI.db.upsertProject).toHaveBeenCalled())
    expect(window.electronAPI.db.upsertProject.mock.calls[0][0].dbFilename).toBe('db.xlsx')
  })

  test('a project with no DesignDB anywhere is reported, not opened', async () => {
    detectFiles.mockResolvedValue({ db: null, ps: null, rs: null, all_xlsx: [] })
    window.electronAPI.db.getProjectSummaries = vi.fn().mockResolvedValue([{ ...PROJECTS[0], db_filename: null }])
    render(<FolderSetupScreen onProjectLoaded={() => {}} />)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Open' }))[0])

    expect(await screen.findByText(/No DesignDB in that folder/)).toBeTruthy()
    expect(window.electronAPI.db.upsertProject).not.toHaveBeenCalled()
  })

  test('a project can be renamed — the name used to be a folder name you could not change', async () => {
    render(<FolderSetupScreen onProjectLoaded={() => {}} />)
    fireEvent.click(await screen.findByText('LIGHTING'))
    const input = screen.getByDisplayValue('LIGHTING')
    fireEvent.change(input, { target: { value: 'Marlborough House' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() =>
      expect(window.electronAPI.db.renameProject).toHaveBeenCalledWith(1, 'Marlborough House'))
  })
})

/**
 * pickDirectory used to mint a fresh handle id on EVERY pick, and folder_path is that id.
 * So re-picking a project you already had forked a second, empty copy of it and your work
 * appeared to vanish. Recent was the safe door; "Open a folder…" was a trapdoor.
 */
describe('a folder you already have is recognised, not forked', () => {
  test('re-picking a known folder says so, and offers to resume', async () => {
    window.electronAPI.openFolderDialog = vi.fn().mockResolvedValue({ key: 'key-a', name: 'LIGHTING', known: true })
    window.electronAPI.db.getConfigsForFolder = vi.fn().mockResolvedValue([
      { id: 1, config_name: 'Base', project_number: '5642' },
    ])
    render(<FolderSetupScreen onProjectLoaded={() => {}} />)
    fireEvent.click(await screen.findByText('Open a folder…'))

    expect(await screen.findByText(/You have opened this folder before/)).toBeTruthy()
  })

  test('a genuinely new folder does not claim to be recognised', async () => {
    render(<FolderSetupScreen onProjectLoaded={() => {}} />)
    fireEvent.click(await screen.findByText('Open a folder…'))
    await screen.findAllByText('Database (DB)')
    expect(screen.queryByText(/You have opened this folder before/)).toBeNull()
  })

  test('duplicates already made are offered as a merge, never as an overlay combine', async () => {
    window.electronAPI.findDuplicateFolders = vi.fn().mockResolvedValue([['key-a', 'key-b']])
    render(<FolderSetupScreen onProjectLoaded={() => {}} />)

    expect(await screen.findByText(/One folder, opened as 2 separate projects/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Merge into one project/ }))

    await waitFor(() => expect(window.electronAPI.db.deleteProject).toHaveBeenCalled())
    // key-a holds the work (3 unexported), so it is canonical and key-b (empty) is dropped
    expect(window.electronAPI.db.deleteProject).toHaveBeenCalledWith(2)
    expect(window.electronAPI.db.adoptDuplicateProject).not.toHaveBeenCalled()
  })
})

describe('a new project needs only the DesignDB', () => {
  test('a missing Product Spec reads as "starts empty", not as an error', async () => {
    detectFiles.mockResolvedValue({ db: 'db.xlsx', ps: null, rs: null, all_xlsx: ['db.xlsx'] })
    render(<FolderSetupScreen onProjectLoaded={() => {}} />)

    fireEvent.click(await screen.findByText('Open a folder…'))
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

/**
 * The repo forbids "a linear tutorial… do not narrate a tour of a project the user does not
 * have" (FEATURESET.md). So: what it is, the 1-2-3, and ONE action.
 */
describe('someone who has never used this', () => {
  beforeEach(() => {
    window.electronAPI.db.getProjectSummaries = vi.fn().mockResolvedValue([])
  })

  test('is told what the tool is, and given exactly one thing to do', async () => {
    render(<FolderSetupScreen onProjectLoaded={() => {}} />)
    expect(await screen.findByText(/never writes to/)).toBeTruthy()
    expect(screen.getByText(/what exists/)).toBeTruthy()          // the DesignDB
    expect(screen.getByText('Open the folder with your DesignDB →')).toBeTruthy()
    expect(screen.queryByText('Open a folder…')).toBeNull()       // no second, identical button
  })

  test('is shown the workflow it is built around, not a tour', async () => {
    render(<FolderSetupScreen onProjectLoaded={() => {}} />)
    expect(await screen.findByText('Identify codes')).toBeTruthy()
    expect(screen.getByText('Assign ElementTypes')).toBeTruthy()
    expect(screen.getByText('Build recipes')).toBeTruthy()
  })

  test('can reach the docs', async () => {
    render(<FolderSetupScreen onProjectLoaded={() => {}} />)
    expect((await screen.findByText(/How this works/)).closest('a')).toHaveAttribute('href')
  })
})
