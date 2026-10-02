import { test, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const readSheet = vi.fn()
vi.mock('../../src/utils/backend.js', () => ({
  importFiles: vi.fn(), detectFiles: vi.fn(), readSheet: (...a) => readSheet(...a),
  registerFile: vi.fn(), setActiveDirectory: vi.fn(), getActiveDirectory: vi.fn(),
  fileMeta: vi.fn().mockResolvedValue({ name: 'form.xlsx', lastModified: 2000 }),
}))
const prefs = {}
window.electronAPI = {
  reopenFormFile: vi.fn().mockResolvedValue({ token: 'tok-1', name: 'form.xlsx' }),
  db: { setPref: vi.fn(async (_p, k, v) => { prefs[k] = v }), getPref: vi.fn(async (_p, k) => prefs[k] ?? null) },
}
window.matchMedia ||= () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} })

const { default: useStore } = await import('../../src/store/useStore.js')
const { default: FormFileWatch } = await import('../../src/components/FormFileWatch.jsx')

const row = (id, pt, rawText, x = {}) => ({ id, rawText, positionType: pt, manufacturer: 'iGuzzini', context: {}, overrides: {}, noteOverride: {}, confirmed: true, ...x })

test('the Form file changed: prompt, then Refresh keeps unchanged rows, compares with the old copy, re-saves changed positions', async () => {
  readSheet.mockResolvedValue({ sheets: ['S'], sheet: 'S', headers: ['PositionTypeRef', 'ManufacturerName', 'ProductCode'], rows: [
    { PositionTypeRef: 'C01', ManufacturerName: 'iGuzzini', ProductCode: 'QC50' },
    { PositionTypeRef: 'C02', ManufacturerName: 'iGuzzini', ProductCode: 'QC52' },
  ] })
  useStore.setState({
    projectId: 1, recipes: [], containerETRefs: new Set(),
    positionTypes: [{ PositionTypeRef: 'C01' }, { PositionTypeRef: 'C02' }],
    psRows: [{ ElementTypeRef: 'ET-PS-01', Manufacturer: 'iGuzzini', ProductCode: 'QC50' }],
    formCaptures: { version: 1, byPosition: { C01: [{ elementTypeRef: 'ET-PS-01', code: 'QC50' }], C02: [{ elementTypeRef: 'ET-PS-02', code: 'QC51' }] } },
    importDraft: {
      version: 1, step: 'review', source: { name: 'form.xlsx', sheet: 'S', lastModified: 1000 },
      map: { pt: 'PositionTypeRef', code: 'ProductCode', mfr: 'ManufacturerName', exclude: '', acc: '', context: [] },
      rules: {}, assignments: {}, resolutions: [], refOverrides: {}, dirStats: { forward: 0, backward: 0 }, stagedRefs: ['C01', 'C02'], keptSeparate: [],
      rows: [row(0, 'C01', 'QC50', { leadCode: 'QC50' }), row(1, 'C02', 'QC51')],
    },
  })
  render(<FormFileWatch />)
  expect(await screen.findByTestId('form-file-changed')).toHaveTextContent('form.xlsx has changed')
  fireEvent.click(screen.getByTestId('form-refresh'))
  await waitFor(() => expect(screen.getByTestId('form-refreshed')).toHaveTextContent('1 Form ref changed'), { timeout: 3000 })
  const d = useStore.getState().importDraft
  expect(d.source.lastModified).toBe(2000)
  expect(d.rows.map(r => r.rawText)).toEqual(['QC50', 'QC52'])
  expect(d.rows[0].leadCode).toBe('QC50')                       // what you did to an unchanged row stays
  expect(d.compareBase.name).toMatch(/before refresh/)
  expect(d.compareBase.rows.map(r => r.rawText)).toEqual(['QC50', 'QC51'])
  expect(d.stagedRefs).toEqual(['C01'])
  expect(Object.keys(useStore.getState().formCaptures.byPosition)).toEqual(['C01'])   // C02 is saved afresh
  expect(screen.queryByTestId('form-file-changed')).toBeNull()
})
