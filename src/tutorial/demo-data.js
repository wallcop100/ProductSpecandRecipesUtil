/**
 * demo-data.js — the fictional mini-project every tutorial scene draws from.
 *
 * One coherent little world, so a wrapper met in the recipe card is the same wrapper the
 * fork is taught on and the same one whose tape shows up in the Product Spec card.
 *
 * ENTIRELY FICTIONAL. Nothing here comes from samplefiles/ (real client data, gitignored):
 * fake manufacturers, fake codes, generic refs. Row shapes are the app's real ones
 * (PositionTypeRef / ContextType / ElementTypeRef / …) so scenes read naturally.
 *
 * No scene, and nothing in src/tutorial/, may import useStore — the store is the user's
 * live project. This module is the only data a scene needs.
 */

/** Positions: one downlight family, one linear family sharing a wrapper. */
export const DEMO_POSITIONS = [
  { ref: 'D01', name: 'Lobby downlight', family: 'Downlights', tags: ['DL', 'Local'], reciped: true },
  { ref: 'L01', name: 'Reception cove', family: 'Linear', tags: ['LIN'], reciped: true },
  { ref: 'L02', name: 'Corridor cove', family: 'Linear', tags: ['LIN'], reciped: false },
  { ref: 'X01', name: 'Feature chandelier', family: 'Specials', tags: [], reciped: false },
]

/** The shared wrapper and what lives inside it. */
export const DEMO_WRAPPER = {
  ref: 'ET-LIN-01',
  usedBy: ['L01', 'L02'],
  forkRef: 'ET-LIN-02',
  internals: [
    { ref: 'ET-TAPE-01', name: 'LED tape 9W/m' },
    { ref: 'ET-PROF-01', name: 'Extrusion profile' },
    { ref: 'ET-DIFF-01', name: 'Opal diffuser' },
  ],
}

/** Recipe rows for the focused-editor card (D01's recipe). */
export const DEMO_RECIPE = [
  { ref: 'ET-DL-01', label: 'Downlight fitting', qty: 1, isDesign: 'Y', manufacturer: 'Lumina', code: 'LM-D200' },
  { ref: 'ET-SOCK-3P', label: 'Site socket', qty: 1, isContractItem: 'Y', manufacturer: 'Konek', code: 'K3-SOCK' },
]

/** A row the demos add during their animations. */
export const DEMO_NEW_ROW = { ref: 'ET-SR-01', label: 'Strain relief', qty: 1, isContractItem: 'Y' }

/** Product Spec rows: one complete, one missing its identity, the wrapper's deliberate N/A. */
export const DEMO_PS = [
  { ref: 'ET-DL-01', manufacturer: 'Lumina', code: 'LM-D200', status: 'complete' },
  { ref: 'ET-TAPE-01', manufacturer: '', code: '', status: 'missing' },
  { ref: 'ET-LIN-01', manufacturer: 'Ideaworks', code: 'N/A', status: 'wrapper' },
]

/** The Form pathway: what the Form asks for vs what the recipe has. */
export const DEMO_FORM = {
  source: 'Demo - Form V1.xlsx',
  formRef: 'L01',            // the Form says L01; ExtRef routes it to the recipe position
  asks: [
    { code: 'TP-940-24V', manufacturer: 'Brightline', inRecipe: true, ref: 'ET-TAPE-01' },
    { code: 'DIF-OPAL-3M', manufacturer: 'Brightline', inRecipe: false, ref: 'ET-DIFF-01' },
  ],
  pending: { code: 'Light Panel Custom', manufacturer: 'Panelux', matches: 'ET-DL-01' },
}

/** A freehand spreadsheet cell for the paint-surface card, split into tokens. */
export const DEMO_PAINT = {
  raw: 'Brightline TP-940-24V 940lm tape, cut to suit',
  tokens: [
    { text: 'Brightline', role: null },
    { text: 'TP-940-24V', role: 'code' },
    { text: '940lm tape', role: 'note' },
    { text: 'cut to suit', role: 'discard' },
  ],
}

/** Connector matrix: positions × collections for the coverage card. */
export const DEMO_MATRIX = {
  collections: ['3-Pin kit', 'Strain reliefs'],
  cells: {
    D01: { '3-Pin kit': 'complete', 'Strain reliefs': 'missing' },
    L01: { '3-Pin kit': 'na', 'Strain reliefs': 'complete' },
  },
}

/** A template for the templates card: one exact ref, one fill-later slot. */
export const DEMO_TEMPLATE = {
  name: 'Local Downlight',
  scope: 'global',
  slots: [
    { label: 'DL Virtual Element', kind: 'slot' },
    { label: 'Mounting collar', kind: 'exact', ref: 'ET-COLLAR-01' },
  ],
}
