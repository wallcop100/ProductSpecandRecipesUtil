// Form spec pane gallery: every state the builder's right-drawer Form pane can show, one per
// ?s=<name>, at drawer width (480). For design review only; not part of the app build.
// Serve: npx vite build --config tools/form-gallery/vite.config.mjs, then any static server on the out dir.
import React from 'react'
import ReactDOM from 'react-dom/client'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'material-icons/iconfont/filled.css'
import { installPlatform } from '../../src/platform/api'
import useStore from '../../src/store/useStore'
import FormSpecPane from '../../src/components/FormSpecPane'

installPlatform()
try { localStorage.setItem('rb-tutorial-seen', JSON.stringify({ 'form-pane': true })) } catch { /* fine */ }

const P = 'A02hw'
const pos = (p, ref, x = {}) => ({ _id: `${p}-${ref}`, _row_num: 1, PositionTypeRef: p, ContextType: 'PositionType', ContextRef: p, ElementTypeRef: ref, Quantity: 1, ...x })
const inside = (p, c, ref) => ({ _id: `${p}-${c}-${ref}`, _row_num: 1, PositionTypeRef: p, ContextType: 'ElementType', ContextRef: c, ElementTypeRef: ref, RecipeIndex: 1, Quantity: 1 })
const row = (id, pt, rawText, x = {}) => ({ id, positionType: pt, manufacturer: 'Orluna', rawText, overrides: {}, confirmed: true, ...x })
const base = rows => ({ name: '261104 5642 - Form V3.6.xlsx', at: Date.UTC(2026, 9, 12), rows: rows.map(r => ({ formRef: r.positionType, manufacturer: r.manufacturer, rawText: r.rawText })) })
const ets = refs => refs.map(r => ({ ElementTypeRef: r, Family: r.replace(/-\d+$/, '') }))
const SRC = { name: '5642 - Form V3.6.xlsx', sheet: 'PositionTypeSpec', importedAt: new Date().toISOString() }
const cap = (byPosition, x = {}) => ({ version: 1, source: SRC, byPosition, contextByPosition: { [P]: { ProductName: 'Downlight 27°', Finish: 'RAL 9010', Notes: 'Trimless' } }, orphansByPosition: {}, ...x })

const PS = [
  { ElementTypeRef: 'ET-PS-05', Manufacturer: 'Orluna', ProductCode: 'ZH-INFD-27-D-W-NA-AWB-54H' },
  { ElementTypeRef: 'ET-PS-17', Manufacturer: 'Orluna', ProductCode: 'ZH-INFDT-27DM-X-WB-54' },
  { ElementTypeRef: 'ET-PS-18', Manufacturer: 'Orluna', ProductCode: 'HNY/31MM' },
  { ElementTypeRef: 'ET-DRV-02', Manufacturer: 'Orluna', ProductCode: 'DRV-350' },
]
const ALL_ETS = ets(['ET-PS-05', 'ET-PS-07', 'ET-PS-17', 'ET-PS-18', 'ET-DRV-02', 'ET-DL-03', 'ET-PS-ACCESSORIES-02'])
const wrapped = (...refs) => [pos(P, 'ET-DL-03', { IsDesign: 'Y' }), ...refs.map(r => inside(P, 'ET-DL-03', r))]
const capOf = (...rs) => rs.map(([ref, code]) => ({ elementTypeRef: ref, code, manufacturer: 'Orluna', formRef: P }))

const common = {
  projectId: 1, past: [], future: [], psChanges: [], dbChanges: [], rsChanges: [], localElementTypes: [],
  containerETRefs: new Set(['et-dl-03']), elementTypes: ALL_ETS, psRows: PS,
  positionTypes: [{ PositionTypeRef: P }, { PositionTypeRef: 'A05E' }, { PositionTypeRef: 'A02hw-R' }],
  positionHistory: ['A02hw-R'], importDraft: null, formCaptures: null,
}
const draft = (rows, x = {}) => ({ rows, map: { mfr: 'ManufacturerName', code: 'ProductCode', context: [] }, ...x })
// A second position the Form is not yet satisfied on, so "Next" has somewhere to go.
const other = { A05E: capOf(['ET-PS-05', 'ZH-INFD-27-D-W-NA-AWB-54H']) }

const S = {
  'empty': { note: 'No Form, no Product Spec codes', st: { psRows: [], positionHistory: [] } },
  'start': { note: 'No Form yet, Product Spec has codes', st: {} },
  'not-in-form': { note: 'Form loaded, this position not in it', st: {
    formCaptures: cap(other), importDraft: draft([row(0, 'A05E', 'ZH-INFD-27-D-W-NA-AWB-54H')]), recipes: wrapped('ET-PS-05') } },
  'nothing': { note: 'Form says n/a here', st: {
    formCaptures: cap(other), importDraft: draft([row(0, P, 'n/a')]), recipes: wrapped() } },
  'needs-et': { note: 'A code with no ElementType, painter closed', st: {
    formCaptures: cap(other), importDraft: draft([row(0, P, 'ZH-INFDT-27DM-X-WB-54 NEWCODE-9', { confirmed: false })]), recipes: wrapped('ET-PS-17') } },
  'painting': { note: 'Paint mode on: the inline painter', st: {
    formCaptures: cap(other), importDraft: draft([row(0, P, 'ZH-INFDT-27DM-X-WB-54 NEWCODE-9', { confirmed: false })]), recipes: wrapped('ET-PS-17') } },
  'all-present': { note: 'Everything present (Erik\'s screenshot, no diff)', st: {
    formCaptures: cap({ [P]: capOf(['ET-PS-17', 'ZH-INFDT-27DM-X-WB-54'], ['ET-PS-18', 'HNY/31MM']), ...other }),
    importDraft: draft([row(0, P, 'ZH-INFDT-27DM-X-WB-54 HNY/31MM')]), recipes: wrapped('ET-PS-17', 'ET-PS-18') } },
  'all-present-diff': { note: 'Erik\'s screenshot: present, with a diff against an older Form', st: {
    formCaptures: cap({ [P]: capOf(['ET-PS-17', 'ZH-INFDT-27DM-X-WB-54']), ...other }),
    importDraft: draft([row(0, P, 'ZH-INFDT-27DM-X-WB-54 HNY/31MM', { confirmed: false })], { compareBase: base([row(0, P, 'ZH-INFD-27-D-W-NA-AWB-54H')]) }),
    recipes: wrapped('ET-PS-17') } },
  'missing-one': { note: 'One product missing from the recipe', st: {
    formCaptures: cap({ [P]: capOf(['ET-PS-17', 'ZH-INFDT-27DM-X-WB-54'], ['ET-DRV-02', 'DRV-350']), ...other }),
    importDraft: draft([row(0, P, 'ZH-INFDT-27DM-X-WB-54 DRV-350')]), recipes: wrapped('ET-PS-17') } },
  'missing-many': { note: 'Several missing: Add all', st: {
    formCaptures: cap({ [P]: capOf(['ET-PS-17', 'ZH-INFDT-27DM-X-WB-54'], ['ET-PS-18', 'HNY/31MM'], ['ET-DRV-02', 'DRV-350']), ...other }),
    importDraft: draft([row(0, P, 'ZH-INFDT-27DM-X-WB-54 HNY/31MM DRV-350')]), recipes: wrapped() } },
  'no-wrapper': { note: 'Blank position: offer a wrapper', st: {
    formCaptures: cap({ [P]: capOf(['ET-PS-17', 'ZH-INFDT-27DM-X-WB-54']), ...other }),
    importDraft: draft([row(0, P, 'ZH-INFDT-27DM-X-WB-54')]), recipes: [] } },
  'pending': { note: 'Saved product with no ElementType (red card, candidate)', st: {
    formCaptures: cap({ [P]: capOf(['ET-PS-17', 'ZH-INFDT-27DM-X-WB-54']), ...other }, { pendingByPosition: { [P]: [{ code: 'HNY/31MM-B', manufacturer: 'Orluna', note: 'honeycomb louvre', formRef: P }] } }),
    importDraft: draft([row(0, P, 'ZH-INFDT-27DM-X-WB-54 HNY/31MM-B')]), recipes: wrapped('ET-PS-17', 'ET-PS-ACCESSORIES-02') } },
  'waiting-et': { note: 'Nothing missing, but a draft code still needs an ElementType (amber)', st: {
    formCaptures: cap({ [P]: capOf(['ET-PS-17', 'ZH-INFDT-27DM-X-WB-54']), ...other }),
    importDraft: draft([row(0, P, 'ZH-INFDT-27DM-X-WB-54 NEWCODE-9', { confirmed: false })]), recipes: wrapped('ET-PS-17') } },
  'reference': { note: 'Rail open: Form columns, extra and orphaned (click the rail)', st: {
    formCaptures: cap({ [P]: capOf(['ET-PS-17', 'ZH-INFDT-27DM-X-WB-54']), ...other }, { orphansByPosition: { [P]: ['ET-PS-05'] } }),
    importDraft: draft([row(0, P, 'ZH-INFDT-27DM-X-WB-54')]), recipes: [...wrapped('ET-PS-17', 'ET-DRV-02'), pos(P, 'ET-PS-05')] } },
  'divergence': { note: 'Shared wrapper the Form changed for one sharer', st: {
    formCaptures: cap({ [P]: capOf(['ET-PS-17', 'ZH-INFDT-27DM-X-WB-54']), ...other }, { divergence: [{ wrapper: 'ET-DL-03', consistent: false, sharers: [P, 'A05E'], changedPositions: [P], unchangedPositions: ['A05E'] }] }),
    importDraft: draft([row(0, P, 'ZH-INFDT-27DM-X-WB-54')]), recipes: [...wrapped('ET-PS-17'), pos('A05E', 'ET-DL-03', { IsDesign: 'Y' })] } },
  'diff-swap': { note: 'Diff: the Form swapped a product the recipe holds (Swap)', st: {
    formCaptures: cap({ [P]: capOf(['ET-PS-17', 'ZH-INFDT-27DM-X-WB-54']), ...other }),
    importDraft: draft([row(0, P, 'ZH-INFDT-27DM-X-WB-54')], { compareBase: base([row(0, P, 'ZH-INFD-27-D-W-NA-AWB-54H')]) }), recipes: wrapped('ET-PS-05') } },
  'diff-respec': { note: 'Diff: a new code for an ElementType only this position uses (Update)', st: {
    formCaptures: cap({ [P]: [], ...other }),
    importDraft: draft([row(0, P, 'ZH-INFD-27-D-W-NA-AWB-60H', { confirmed: false })], { compareBase: base([row(0, P, 'ZH-INFD-27-D-W-NA-AWB-54H')]) }), recipes: wrapped('ET-PS-05') } },
  'diff-respec-shared': { note: 'Diff: a new code for a shared ElementType (Fork / New)', st: {
    formCaptures: cap({ [P]: [], ...other }),
    importDraft: draft([row(0, P, 'ZH-INFD-27-D-W-NA-AWB-60H', { confirmed: false }), row(1, 'A05E', 'ZH-INFD-27-D-W-NA-AWB-54H')], { compareBase: base([row(0, P, 'ZH-INFD-27-D-W-NA-AWB-54H'), row(1, 'A05E', 'ZH-INFD-27-D-W-NA-AWB-54H')]) }),
    recipes: [...wrapped('ET-PS-05'), pos('A05E', 'ET-PS-05')] } },
  'diff-remove-add': { note: 'Diff: a product dropped (Remove) and one added (Add)', st: {
    formCaptures: cap({ [P]: capOf(['ET-PS-17', 'ZH-INFDT-27DM-X-WB-54'], ['ET-DRV-02', 'DRV-350']), ...other }),
    importDraft: draft([row(0, P, 'ZH-INFDT-27DM-X-WB-54 DRV-350')], { compareBase: base([row(0, P, 'ZH-INFDT-27DM-X-WB-54 HNY/31MM')]) }), recipes: wrapped('ET-PS-17', 'ET-PS-18') } },
}

const name = new URLSearchParams(location.search).get('s')
const root = ReactDOM.createRoot(document.getElementById('root'))
if (!S[name]) {
  root.render(<div className="p-3"><h5>Form spec pane gallery</h5><ol>{Object.entries(S).map(([k, v]) => <li key={k}><a href={`?s=${k}`}>{k}</a> — {v.note}</li>)}</ol></div>)
} else {
  useStore.setState({ ...common, recipes: [], ...S[name].st })
  root.render(
    <div style={{ display: 'flex', gap: 16, padding: 8, background: '#f6f8fb', minHeight: '100vh' }}>
      <div data-shot style={{ width: 480, background: '#fff', border: '1px solid #dee2e6', display: 'flex', minHeight: 300 }}>
        <FormSpecPane posRef={P} inDrawer />
      </div>
      <div className="text-muted small" style={{ width: 200 }}><b>{name}</b><br />{S[name].note}</div>
    </div>,
  )
}
