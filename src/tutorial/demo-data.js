/**
 * demo-data.js — the mini-project every tutorial scene draws from.
 *
 * Its refs, families and naming follow the REAL conventions from a live project, because a
 * tutorial that invents its own vocabulary teaches the wrong vocabulary:
 *
 *   PositionTypes  A02m / A02w / A02wE  are downlights, under the family DOWNLIGHT.
 *                  C01r / C03r are architectural linear, under LINEAR-HL-ARCHITECTURAL.
 *                  The bare C01 exists too — it is the "parents" row whose ExtRef points at
 *                  C01r, and C01r is where the recipe actually lives.
 *                  Their Name is blank; the Description carries the words.
 *   ElementTypes   ET-LIN-01 is the linear wrapper; ET-LIN-TAPE-01 / -PROF-01 / -DIFF-01 sit
 *                  inside it. Connectors are ET-2Pin-LIN-Socket / -Plug (WAGO). Cables are
 *                  bare refs: LC2, LC9. Drivers are ET-CCR-D-300-1CH-01 and friends.
 *   Wrappers       carry Ideaworks / N/A in the Product Spec, on purpose.
 *
 * ET-LIN-02 really is a fork of ET-LIN-01 in the source data — same profile, diffuser and
 * plug, a different tape. The wrapper card teaches that exact story.
 *
 * Nothing in src/tutorial/ may import useStore: the store holds the user's live project.
 * A source-scan test enforces it.
 */

/**
 * Positions, grouped as the tree groups them: by FAMILY REF (positionFamilyOf = ParentRef).
 * The tree prints that ref — DOWNLIGHT, LINEAR-HL-ARCHITECTURAL — not a friendly name, and
 * it prints no description, because the DesignDB leaves PositionType.Name blank.
 */
export const DEMO_POSITIONS = [
  { ref: 'A02m', family: 'DOWNLIGHT', tags: ['DL', 'Local'], rows: 4 },
  { ref: 'A02wE', family: 'DOWNLIGHT', tags: ['DL'], rows: 0 },
  { ref: 'C01r', family: 'LINEAR-HL-ARCHITECTURAL', tags: ['LIN'], rows: 2 },
  { ref: 'C03r', family: 'LINEAR-HL-ARCHITECTURAL', tags: ['LIN'], rows: 2 },
]

/** The shared linear wrapper, and the fork the source data really contains. */
export const DEMO_WRAPPER = {
  ref: 'ET-LIN-01',
  usedBy: ['C01r', 'C03r'],
  forkRef: 'ET-LIN-02',
  internals: [
    { ref: 'ET-LIN-TAPE-01', desc: 'LED tape' },
    { ref: 'ET-LIN-PROF-01', desc: 'Extrusion profile' },
    { ref: 'ET-LIN-DIFF-01', desc: 'Diffuser' },
    { ref: 'ET-2Pin-LIN-Plug', desc: 'WAGO 890-292' },
  ],
  /** What the fork changes: a different tape, everything else the same. */
  forkInternals: [
    { ref: 'ET-LIN-TAPE-02', desc: 'LED tape (warmer)' },
    { ref: 'ET-LIN-PROF-01', desc: 'Extrusion profile' },
    { ref: 'ET-LIN-DIFF-01', desc: 'Diffuser' },
    { ref: 'ET-2Pin-LIN-Plug', desc: 'WAGO 890-292' },
  ],
}

/**
 * C01r's real position-level recipe: the wrapper is the Design element; the socket is the
 * free-issued contract item. (The plug lives INSIDE the wrapper — that is the pairing.)
 */
export const DEMO_RECIPE = [
  { ref: 'ET-LIN-01', family: 'ET-LIN-COMPONENTS', qty: 1, isDesign: 'Y', mfr: 'Ideaworks', code: 'N/A', container: true },
  { ref: 'ET-2Pin-LIN-Socket', family: 'ET-CONNECTORS', qty: 1, isContractItem: 'Y', mfr: 'WAGO', code: '890-282' },
]

/** The row the demo adds — a real cable from the ET-CABLE family. */
export const DEMO_NEW_ROW = { ref: 'LC2', family: 'ET-CABLE', qty: 1, isContractItem: 'Y', desc: 'LV 2-core min 1.5mm cable' }

/** Product Spec: a real product, a gap, and a wrapper whose N/A is deliberate. */
export const DEMO_PS = [
  { ref: 'ET-2Pin-LIN-Socket', mfr: 'WAGO', code: '890-282', status: 'complete' },
  { ref: 'ET-LIN-TAPE-01', mfr: '', code: '', status: 'missing' },
  { ref: 'ET-LIN-01', mfr: 'Ideaworks', code: 'N/A', status: 'wrapper' },
]

/** The Form pathway. The Form says C01; ExtRef routes it to C01r, where the recipe lives. */
export const DEMO_FORM = {
  source: '5642 - Form V3.6.xlsx',
  formRef: 'C01',
  target: 'C01r',
  asks: [
    { code: 'LL240272024', mfr: 'Nichia', inRecipe: true, ref: 'ET-LIN-TAPE-01' },
    { code: 'FPS2020BG2000', mfr: 'Flexalighting', inRecipe: false, ref: 'ET-LIN-PROF-01' },
  ],
  /** A product the Form asks for that nobody has named — and the ET the recipe already has. */
  pending: { code: 'Light Sheet Custom', mfr: 'Applelec', matches: 'ET-LS-01' },
}

/** A freehand ProductCode cell, as the paint surface sees it. */
export const DEMO_PAINT = {
  tokens: [
    { text: 'Nichia', role: null },
    { text: 'LL240272024', role: 'code' },
    { text: '2700K 24V', role: 'note' },
    { text: 'cut to suit', role: 'discard' },
  ],
}

/** Connector coverage: positions × collections. */
export const DEMO_MATRIX = {
  collections: ['LIN connectors', 'Local driver kit'],
  rows: [
    { ref: 'C01r', cells: { 'LIN connectors': 'complete', 'Local driver kit': 'na' } },
    { ref: 'A02m', cells: { 'LIN connectors': 'na', 'Local driver kit': 'missing' } },
  ],
  /** What the red cell is missing. */
  missingRef: 'ET-CCL-D-250-1CH-01',
}

/** A template: one fill-later slot, one exact ref. */
export const DEMO_TEMPLATE = {
  name: 'Local Downlight',
  slots: [
    { label: 'DL Virtual Element', kind: 'slot' },
    { label: 'Local driver', kind: 'exact', ref: 'ET-CCL-D-250-1CH-01' },
  ],
}
