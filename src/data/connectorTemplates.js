/**
 * connectorTemplates.js
 *
 * Bundled connector set templates. These are in-memory only — never persisted
 * to SQLite. They use abstract ET refs (ET-5PIN-PLUG, ET-SR, etc.) that have
 * no product spec against them at this level. Each project maps those abstract
 * refs to real products via its own PS rows.
 *
 * When applying a connector template, rows are ADDED to an existing recipe
 * (via addConnection) rather than replacing it — connectors are a late-stage
 * addition to an already-built position recipe.
 *
 * Local sets:  socket + SR at PositionType level (free-issued first-fix kit)
 *              plug at DL internal (fitted into the DL assembly)
 * Remote sets: plug at DL internal only — the mains/DALI socket belongs with
 *              the remote driver unit, not the fitting.
 */

function ing(slotKey, etRef, section, recipeIndex) {
  return {
    slotKey,
    slotLabel: etRef,
    section,
    recipeIndex,
    quantity: 1,
    fixed: true,
    isDesign: null,
    isContractItem: null,
    isTBC: null,
    isPropertiesTBC: null,
    dimQtyMultiplier: null,
    dimQuantity: null,
    isInteger: null,
    notes: null,
  }
}

export const CONNECTOR_TEMPLATES = [
  // ── Local ────────────────────────────────────────────────────────────────
  {
    id: 'ct-2pin-local',
    name: '2-Pin  ·  Local',
    scope: 'connector',
    applicable_tags: ['Local'],
    ingredients: [
      ing('SOCK_2PIN', 'ET-2PIN-SOCK', 'position',    1),
      ing('SR',        'ET-SR',        'position',    2),
      ing('PLUG_2PIN', 'ET-2PIN-PLUG', 'dl_internal', 1),
    ],
  },
  {
    id: 'ct-3pin-local',
    name: '3-Pin  ·  Local',
    scope: 'connector',
    applicable_tags: ['Local'],
    ingredients: [
      ing('SOCK_3PIN', 'ET-3PIN-SOCK', 'position',    1),
      ing('SR',        'ET-SR',        'position',    2),
      ing('PLUG_3PIN', 'ET-3PIN-PLUG', 'dl_internal', 1),
    ],
  },
  {
    id: 'ct-4pin-local',
    name: '4-Pin  ·  Local',
    scope: 'connector',
    applicable_tags: ['Local'],
    ingredients: [
      ing('SOCK_4PIN', 'ET-4PIN-SOCK', 'position',    1),
      ing('SR',        'ET-SR',        'position',    2),
      ing('PLUG_4PIN', 'ET-4PIN-PLUG', 'dl_internal', 1),
    ],
  },
  {
    id: 'ct-5pin-local',
    name: '5-Pin  ·  Local',
    scope: 'connector',
    applicable_tags: ['Local'],
    ingredients: [
      ing('SOCK_5PIN', 'ET-5PIN-SOCK', 'position',    1),
      ing('SR',        'ET-SR',        'position',    2),
      ing('PLUG_5PIN', 'ET-5PIN-PLUG', 'dl_internal', 1),
    ],
  },

  // ── Remote-CC ─────────────────────────────────────────────────────────────
  {
    id: 'ct-2pin-remote-cc',
    name: '2-Pin  ·  Remote-CC',
    scope: 'connector',
    applicable_tags: ['Remote-CC'],
    ingredients: [
      ing('PLUG_2PIN', 'ET-2PIN-PLUG', 'dl_internal', 1),
    ],
  },
  {
    id: 'ct-3pin-remote-cc',
    name: '3-Pin  ·  Remote-CC',
    scope: 'connector',
    applicable_tags: ['Remote-CC'],
    ingredients: [
      ing('PLUG_3PIN', 'ET-3PIN-PLUG', 'dl_internal', 1),
    ],
  },
  {
    id: 'ct-4pin-remote-cc',
    name: '4-Pin  ·  Remote-CC',
    scope: 'connector',
    applicable_tags: ['Remote-CC'],
    ingredients: [
      ing('PLUG_4PIN', 'ET-4PIN-PLUG', 'dl_internal', 1),
    ],
  },
  {
    id: 'ct-5pin-remote-cc',
    name: '5-Pin  ·  Remote-CC',
    scope: 'connector',
    applicable_tags: ['Remote-CC'],
    ingredients: [
      ing('PLUG_5PIN', 'ET-5PIN-PLUG', 'dl_internal', 1),
    ],
  },

  // ── Remote-CV ─────────────────────────────────────────────────────────────
  {
    id: 'ct-2pin-remote-cv',
    name: '2-Pin  ·  Remote-CV',
    scope: 'connector',
    applicable_tags: ['Remote-CV'],
    ingredients: [
      ing('PLUG_2PIN', 'ET-2PIN-PLUG', 'dl_internal', 1),
    ],
  },
  {
    id: 'ct-3pin-remote-cv',
    name: '3-Pin  ·  Remote-CV',
    scope: 'connector',
    applicable_tags: ['Remote-CV'],
    ingredients: [
      ing('PLUG_3PIN', 'ET-3PIN-PLUG', 'dl_internal', 1),
    ],
  },
  {
    id: 'ct-4pin-remote-cv',
    name: '4-Pin  ·  Remote-CV',
    scope: 'connector',
    applicable_tags: ['Remote-CV'],
    ingredients: [
      ing('PLUG_4PIN', 'ET-4PIN-PLUG', 'dl_internal', 1),
    ],
  },
  {
    id: 'ct-5pin-remote-cv',
    name: '5-Pin  ·  Remote-CV',
    scope: 'connector',
    applicable_tags: ['Remote-CV'],
    ingredients: [
      ing('PLUG_5PIN', 'ET-5PIN-PLUG', 'dl_internal', 1),
    ],
  },
]

/** All abstract ET refs introduced by connector templates. */
export const CONNECTOR_ET_REFS = new Set([
  'ET-2PIN-SOCK', 'ET-2PIN-PLUG',
  'ET-3PIN-SOCK', 'ET-3PIN-PLUG',
  'ET-4PIN-SOCK', 'ET-4PIN-PLUG',
  'ET-5PIN-SOCK', 'ET-5PIN-PLUG',
  'ET-SR',
])
