/**
 * etCanon.js — the company's lighting ElementType families, as shipped defaults.
 *
 * Source: the company wiki "Element Type Ref and Naming Guide" (Lighting Families)
 * and "Lighting - Linear LED - Element types" (page 140959). A remote `families` dataset (see
 * docs/SEED_DATABASE_SPEC.md) replaces this list when synced; this copy only makes the tool work
 * before the first sync.
 *
 * Only refs, parents and descriptions — no project data.
 */

export const CANON_FAMILIES = [
  { ref: 'ET-DRIVER', parent: null, description: 'Driver, Power Supply and Emergency Pack Family' },
  { ref: 'ET-CABLE', parent: null, description: 'Cable Family' },
  { ref: 'ET-CONNECTION', parent: null, description: 'Connection Family' },
  { ref: 'ET-PS', parent: null, description: 'Point Source Family' },
  { ref: 'ET-PS-ACCESSORIES', parent: null, description: 'Point Source Accessory Family' },
  { ref: 'ET-PS-MOUNTING', parent: null, description: 'Point Source Mounting Family' },
  { ref: 'ET-PS-MOUNTING-FRAME', parent: 'ET-PS-MOUNTING', description: 'Point Source Frame Family' },
  { ref: 'ET-PS-MOUNTING-SLEEVE', parent: 'ET-PS-MOUNTING', description: 'Point Source Sleeve Family' },
  { ref: 'ET-DL', parent: null, description: 'Assembled Down Light Family' },
  { ref: 'ET-FF&E', parent: null, description: 'FF&E Family' },
  { ref: 'ET-LIN', parent: null, description: 'Assembled Linear LED Family' },
  { ref: 'ET-LIN-TP', parent: 'ET-LIN', description: 'Assembled Tape and Profile family' },
  { ref: 'ET-LIN-ENCAPSULATED', parent: 'ET-LIN', description: 'Assembled Encapsulated family' },
  { ref: 'ET-LIN-INGREDIENTS', parent: null, description: 'Linear Ingredients' },
  { ref: 'ET-LIN-PROF', parent: 'ET-LIN-INGREDIENTS', description: 'Linear Profile Family' },
  { ref: 'ET-LIN-DIFF', parent: 'ET-LIN-INGREDIENTS', description: 'Linear Diffuser Family' },
  { ref: 'ET-LIN-CAPS', parent: 'ET-LIN-INGREDIENTS', description: 'Linear End Cap Family' },
  { ref: 'ET-LIN-CLIP', parent: 'ET-LIN-INGREDIENTS', description: 'Metal clips for profile mounting' },
  { ref: 'ET-LIN-MOUNT', parent: 'ET-LIN-INGREDIENTS', description: 'Mounting profile for Encapsulated Linear' },
  { ref: 'ET-LIN-TAPE', parent: 'ET-LIN-INGREDIENTS', description: 'Linear LED Tape Family' },
  { ref: 'ET-LIN-FLEX', parent: 'ET-LIN-INGREDIENTS', description: 'Encapsulated Linear Family' },
  { ref: 'ET-LIN-FIXED', parent: 'ET-LIN-INGREDIENTS', description: 'Fixed Linear Family' },
  { ref: 'ET-LIGHTINGCONTROL', parent: null, description: 'Lighting Control Family' },
  { ref: 'ET-TRACK', parent: null, description: 'Track Family' },
  { ref: 'ET-TRACK-PS', parent: 'ET-TRACK', description: 'Track mounted Point Source Family' },
]

// The product words (what a description says a product is) live in utils/codeJobs.js: WORDS, classifyText.
