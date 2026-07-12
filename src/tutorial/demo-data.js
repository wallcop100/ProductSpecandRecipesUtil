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

/**
 * A freehand ProductCode cell, as the paint surface really sees one.
 *
 * This is shaped on a genuine linear row: FOUR products in one sentence, each with a
 * superseded code sitting next to its current one. That messiness is the whole reason the
 * paint surface exists — the field stays readable as prose precisely so you can tell that
 * `021-1103` is what `FPS2020BG2000` replaced.
 *
 * Roles (confirmed against how the tool is actually used):
 *   code     the current code, and only that
 *   note     EVERYTHING else that carries meaning — the label words (Tape, Profile, opal)
 *            AND the superseded codes. A note is not junk: it promotes onto its code's line
 *            and travels with it.
 *   discard  is rare. In practice it is the punctuation and the `+` separators — which the
 *            tool suggests for you. Discarding `+` is what makes it a learned DELIMITER, and
 *            the delimiter is what segments the row so each product's note attaches to ITS
 *            code instead of drifting to whichever code is nearest (see noteOwnerOf).
 *
 * `at` is the beat at which a token stops being a note. Everything begins as a note.
 */
export const DEMO_PAINT = {
  row: 'C01r',
  mfr: 'LEDFlex',
  tokens: [
    { text: 'Tape', role: 'note' },
    { text: 'LL240272024', role: 'code', at: 1 },
    { text: '+', role: 'discard', at: 3 },
    { text: 'Profile', role: 'note' },
    { text: '021-1103', role: 'note' },
    { text: '(', role: 'discard', at: 3, tight: true },
    { text: 'new', role: 'note', tight: true },
    { text: 'code', role: 'note' },
    { text: 'FPS2020BG2000', role: 'code', at: 2 },
    { text: ')', role: 'discard', at: 3, tight: true },
    { text: '+', role: 'discard', at: 3 },
    { text: 'Diffuser', role: 'note' },
    { text: '022-1105', role: 'note' },
    { text: '(', role: 'discard', at: 3, tight: true },
    { text: 'old', role: 'note', tight: true },
    { text: 'code', role: 'note' },
    { text: '022-1102?', role: 'note' },
    { text: ')', role: 'discard', at: 3, tight: true },
    { text: '(', role: 'discard', at: 3, tight: true },
    { text: 'opal', role: 'note', tight: true },
    { text: '-', role: 'discard', at: 3 },
    { text: 'FPS2020PCOPD2000', role: 'code', at: 4 },
    { text: ')', role: 'discard', at: 3, tight: true },
    { text: '+', role: 'discard', at: 3 },
    { text: 'End', role: 'note' },
    { text: 'cap', role: 'note' },
    { text: '021-1111', role: 'note' },
    { text: '(', role: 'discard', at: 3, tight: true },
    { text: 'FPS2020ECG', role: 'code', at: 4 },
    { text: ')', role: 'discard', at: 3, tight: true },
  ],
  /**
   * What the field yields once painted — one line per code, carrying the note that sat in
   * its `+` segment. `at` is the beat the line appears.
   */
  captures: [
    { code: 'LL240272024', note: 'Tape', et: 'ET-LIN-TAPE-01', at: 1 },
    { code: 'FPS2020BG2000', note: 'Profile 021-1103 new code', et: 'ET-LIN-PROF-01', at: 2 },
    { code: 'FPS2020PCOPD2000', note: 'Diffuser 022-1105 old code 022-1102? opal', et: 'ET-LIN-DIFF-01', at: 4 },
    { code: 'FPS2020ECG', note: 'End cap 021-1111', et: 'ET-LIN-END-01', at: 4 },
  ],
}

/**
 * Connector coverage, in the shapes the real screen uses.
 *
 * A collection (the UI calls it a CONNECTOR TEMPLATE) is a NAME + APPLICABLE TAGS + a list of
 * INGREDIENTS, and each ingredient carries a section: `position` is free-issued to site on its
 * own, `lin_internal` / `dl_internal` land inside the wrapper the position actually has. The
 * tags are the gate: a position whose tags do not match is not expected to carry the template
 * at all, which is what N/A means — it is not a gap.
 *
 * The three demo positions deliberately cover all three live statuses, so the two column
 * buttons (Apply all → the missing ones, Fill → the partial ones) both have something to do.
 */
export const DEMO_COLLECTIONS = [
  {
    name: 'LIN 2-Pin Connectors',
    tags: ['LIN'],
    ingredients: [
      { ref: 'ET-2Pin-LIN-Socket', section: 'position', qty: 1 },
      { ref: 'ET-2Pin-LIN-Plug', section: 'lin_internal', qty: 1 },
    ],
  },
  {
    name: 'Local Driver Kit',
    tags: ['Local'],
    ingredients: [
      { ref: 'ET-CCL-D-250-1CH-01', section: 'position', qty: 1 },
      { ref: 'LC2', section: 'position', qty: 1 },
    ],
  },
]

export const DEMO_MATRIX = {
  rows: [
    { ref: 'C01r', tags: ['LIN'], cells: { 'LIN 2-Pin Connectors': 'complete', 'Local Driver Kit': 'na' } },
    { ref: 'A02m', tags: ['DL', 'Local'], cells: { 'LIN 2-Pin Connectors': 'na', 'Local Driver Kit': 'partial' } },
    { ref: 'A02wE', tags: ['DL', 'Local'], cells: { 'LIN 2-Pin Connectors': 'na', 'Local Driver Kit': 'missing' } },
  ],
  /** The cell the card opens: A02m has the cable but not the driver. */
  cell: { posRef: 'A02m', collection: 'Local Driver Kit' },
  present: ['LC2'],
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
