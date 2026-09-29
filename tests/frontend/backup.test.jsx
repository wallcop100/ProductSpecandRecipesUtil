import { describe, test, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const store = new Map()
vi.mock('../../src/platform/idb.js', () => ({
  idbGet: vi.fn(async k => store.get(k)), idbSet: vi.fn(async (k, v) => { store.set(k, v) }),
  idbDel: vi.fn(async k => { store.delete(k) }), idbKeys: vi.fn(async () => [...store.keys()]),
}))
const imported = []
vi.mock('../../src/platform/db.js', async (orig) => ({
  ...(await orig()),
  flush: vi.fn(async () => {}),
  importDatabase: vi.fn(async bytes => { imported.push(bytes); store.set('sqlite-db', bytes) }),
}))
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: vi.fn(),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(), fileMeta: vi.fn(),
}))

const B = await import('../../src/platform/backup.js')
const { default: BackupPanel } = await import('../../src/components/BackupPanel.jsx')

beforeEach(() => { store.clear(); imported.length = 0; localStorage.clear() })

describe('backup file', () => {
  test('round trip: the saved database and the app’s own settings, nothing else', async () => {
    store.set('sqlite-db', new Uint8Array([1, 2, 3, 250]))
    localStorage.setItem('bugReports', '[{"id":"K3F9QZ"}]')
    localStorage.setItem('some-other-site', 'x')
    const b = await B.makeBackup()
    expect(b.format).toBe('recipe-builder-backup')
    expect(b.localStorage).toEqual({ bugReports: '[{"id":"K3F9QZ"}]' })

    store.clear(); localStorage.clear()
    await B.restoreBackup(JSON.parse(JSON.stringify(b)))
    expect([...imported[0]]).toEqual([1, 2, 3, 250])
    expect(localStorage.getItem('bugReports')).toBe('[{"id":"K3F9QZ"}]')
  })

  test('refuses what is not a backup', async () => {
    expect(B.checkBackup({ hello: 1 })).toMatch(/not a Recipe Builder backup/)
    await expect(B.restoreBackup({ format: 'x' })).rejects.toThrow()
  })
})

describe('what a backup holds', () => {
  test('every project and its unexported changes, not just settings', async () => {
    const api = {
      getAllProjects: async () => [{ id: 1, project_number: '5452', project_label: 'Lighting' }, { id: 2, folder_path: 'DesignForms' }],
      getPendingChanges: async id => (id === 1 ? { ps: [{}, {}], rs: [{}] } : { ps: [], rs: [] }),
      getPref: async (id, k) => (id === 2 && k === 'pending_db_changes' ? '[{},{}]' : null),
    }
    store.set('sqlite-db', new Uint8Array([9]))
    const b = await B.makeBackup({ api })
    expect(b.contents).toEqual({ unexported: 5, projects: [{ name: '5452 Lighting', unexported: 3 }, { name: 'DesignForms', unexported: 2 }] })
    expect(B.describeBackup(b)).toBe('2 projects (5452 Lighting, DesignForms), 5 unexported changes')
  })
})

describe('start page', () => {
  test('offers Back up and Restore', () => {
    render(<BackupPanel />)
    expect(screen.getByTestId('backup-btn')).toBeInTheDocument()
    expect(screen.getByText('Restore from a file…')).toBeInTheDocument()
  })
})
