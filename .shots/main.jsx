import React from 'react'
import ReactDOM from 'react-dom/client'
import 'bootstrap/dist/css/bootstrap.min.css'
import 'material-icons/iconfont/filled.css'
import useStore from '../src/store/useStore'
import BuilderScreen from '../src/screens/BuilderScreen'

window.electronAPI = { db: new Proxy({}, { get: () => async () => null }), reopenFormFile: async () => null }
const st = new URLSearchParams(location.search).get('s')
const R = (id, p, ref) => ({ _id: id, _row_num: 1, PositionTypeRef: p, ContextType: 'PositionType', ContextRef: p, ElementTypeRef: ref, Quantity: 1 })
const row = (id, rawText, pt, x = {}) => ({ id, rawText, positionType: pt, manufacturer: 'iGuzzini', context: {}, overrides: { 0: 'code' }, noteOverride: {}, confirmed: true, autoConfirmed: true, ...x })
const draft = (rows, extra = {}) => ({ version: 1, step: 'review', source: { name: '5642 - Form V3.6.xlsx', sheet: 'Form' },
  map: { pt: '', code: 'ProductCode', mfr: 'ManufacturerName', exclude: '', acc: '', context: [] },
  rules: {}, assignments: {}, resolutions: [], refOverrides: {}, dirStats: { forward: 0, backward: 0 }, stagedRefs: [], keptSeparate: [], rows, ...extra })
const cap = (et, code) => ({ elementTypeRef: et, code, manufacturer: 'iGuzzini', role: 'lead' })
const base = {
  projectId: 1, positionTypes: ['A05'].map(r => ({ PositionTypeRef: r })), containerETRefs: new Set(),
  elementTypes: ['ET-PS-10', 'ET-PS-11', 'ET-TR-01'].map(r => ({ ElementTypeRef: r })),
  psRows: [{ ElementTypeRef: 'ET-PS-10', Manufacturer: 'iGuzzini', ProductCode: 'QC50' }, { ElementTypeRef: 'ET-PS-11', Manufacturer: 'iGuzzini', ProductCode: 'QC53' }, { ElementTypeRef: 'ET-TR-01', Manufacturer: 'iGuzzini', ProductCode: 'TRIM-1' }],
  recipes: [R('a', 'A05', 'ET-PS-10')], importDraft: null, formCaptures: null,
}
const S = {
  noform: {},
  newcode: { importDraft: draft([row(0, 'QC50', 'A05'), row(1, 'EM-PACK-3H emergency', 'A05', { confirmed: false, autoConfirmed: false })], { stagedRefs: ['A05'] }),
    formCaptures: { byPosition: { A05: [cap('ET-PS-10', 'QC50')] } } },
  missing: { importDraft: draft([row(0, 'QC50', 'A05'), row(1, 'TRIM-1', 'A05')], { stagedRefs: ['A05'] }),
    formCaptures: { byPosition: { A05: [cap('ET-PS-10', 'QC50'), { ...cap('ET-TR-01', 'TRIM-1'), role: 'extra' }] } } },
  done: { importDraft: draft([row(0, 'QC50', 'A05')], { stagedRefs: ['A05'] }), formCaptures: { byPosition: { A05: [cap('ET-PS-10', 'QC50')] } } },
  changed: { importDraft: draft([row(0, 'QC53', 'A05')], { stagedRefs: ['A05'], compareBase: { name: '5642 - Form V3.5.xlsx', rows: [{ formRef: 'A05', manufacturer: 'iGuzzini', rawText: 'QC50' }] } }),
    formCaptures: { byPosition: { A05: [cap('ET-PS-11', 'QC53')] }, orphansByPosition: { A05: ['ET-PS-10'] } } },
  nothing: { importDraft: draft([row(0, 'n/a', 'A05', { overrides: {} })]), formCaptures: { byPosition: { B1: [cap('ET-PS-10', 'QC50')] } } },
  notinform: { importDraft: draft([row(0, 'QC50', 'B1')]), formCaptures: { byPosition: { B1: [cap('ET-PS-10', 'QC50')] } } },
}
useStore.setState({ ...base, ...S[st] })
{
  const rows = []
  const P = (p, id, ref, x = {}) => ({ _id: p + id, _row_num: 1, PositionTypeRef: p, ContextType: 'PositionType', ContextRef: p, ElementTypeRef: ref, Quantity: 1, ...x })
  for (const p of ['A05', 'A06', 'A07', 'A08']) {
    rows.push(P(p, 'a', 'ET-PS-10'), P(p, 'b', `ET-DL-${p}`, { IsDesign: 'Y' }), P(p, 'c', 'ET-5PIN-SOCKET'), P(p, 'd', 'ET-5PIN-SR'),
      { _id: p + 'e', _row_num: 1, PositionTypeRef: p, ContextType: 'ElementType', ContextRef: `ET-DL-${p}`, ElementTypeRef: 'ET-5PIN-PLUG', Quantity: 1 })
  }
  useStore.setState({
    recipes: rows, positionTypes: ['A05', 'A06', 'A07', 'A08'].map(r => ({ PositionTypeRef: r })),
    elementTypes: ['ET-PS-10', 'ET-5PIN-SOCKET', 'ET-5PIN-SR', 'ET-5PIN-PLUG'].map(r => ({ ElementTypeRef: r, Family: r.includes('PIN') ? 'ET-CONNECTORS' : 'ET-PS' })),
    etCollections: [], connectorPins: {}, connectorExcludes: {}, connectorFamilies: [], drawerTab: 'connectors', drawerOpen: true,
  })
}
useStore.setState({ activePositionRef: 'A05', rootView: 'positions', positionUI: {}, templates: [], favorites: [], validationResults: [] }); const n = () => {}; ReactDOM.createRoot(document.getElementById('root')).render(<div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}><BuilderScreen onBackToSetup={n} onOpenProductSpec={n} onOpenTemplateEditor={n} onOpenCodeImport={n} onOpenConnectors={n} /></div>)
