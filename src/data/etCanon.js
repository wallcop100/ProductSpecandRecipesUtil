/**
 * etCanon.js — the company's lighting ElementType families, as shipped defaults.
 *
 * Source: Kaizen company KB "Element Type Ref and Naming Guide" (page 1217215, Lighting Families)
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
  { ref: 'ET-LIN-PROF', parent: 'ET-LIN-INGREDIENTS', description: 'Linear profile, diffuser and end cap Family' },
  { ref: 'ET-LIN-CLIP', parent: 'ET-LIN-INGREDIENTS', description: 'Metal clips for profile mounting' },
  { ref: 'ET-LIN-MOUNT', parent: 'ET-LIN-INGREDIENTS', description: 'Mounting profile for Encapsulated Linear' },
  { ref: 'ET-LIN-TAPE', parent: 'ET-LIN-INGREDIENTS', description: 'Linear LED Tape Family' },
  { ref: 'ET-LIN-FLEX', parent: 'ET-LIN-INGREDIENTS', description: 'Encapsulated Linear Family' },
  { ref: 'ET-LIN-FIXED', parent: 'ET-LIN-INGREDIENTS', description: 'Fixed Linear Family' },
  { ref: 'ET-LIGHTINGCONTROL', parent: null, description: 'Lighting Control Family' },
]

/**
 * What a product IS, from words in its description, most specific first — the order matters:
 * "FLEX PROFILE … END CAP" is a cap, "AQUA NEON 16 … PROFILE" is a neon mounting profile.
 *
 * `head` is the ref prefix: linear ingredient refs must carry their keyword (page 140959), so a
 * diffuser is `ET-LIN-DIFF-NN` though it files under the profile family.
 */
export const CANON_KEYWORDS = [
  { test: /\bEND\s*-?CAPS?\b|\bENDCAPS?\b/, family: 'ET-LIN-PROF', head: 'ET-LIN-CAP' },
  { test: /\bDIFFUSERS?\b|\bCOVERS?\b|\bLENS\b/, family: 'ET-LIN-PROF', head: 'ET-LIN-DIFF' },
  { test: /\bCLIPS?\b/, family: 'ET-LIN-CLIP', head: 'ET-LIN-CLIP' },
  { test: /\bBRACKETS?\b|\bSUSPENSION\s+KIT\b|\bMOUNT(ING|ED)?\s+KIT\b/, family: 'ET-LIN-MOUNT', head: 'ET-LIN-MOUNT' },
  { test: /\bMOUNTING\s+(PROFILE|CHANNEL|TRACK)\b|\bNEON\b.*\bPROFILE\b|\bPROFILE\b.*\bNEON\b/, family: 'ET-LIN-MOUNT', head: 'ET-LIN-MOUNT' },
  { test: /\bPROFILES?\b|\bEXTRUSION\b/, family: 'ET-LIN-PROF', head: 'ET-LIN-PROF' },
  { test: /\bNEON\b|\bENCAPSULATED\b/, family: 'ET-LIN-FLEX', head: 'ET-LIN-FLEX' },
  { test: /\bTAPES?\b|\bSTRIPS?\b/, family: 'ET-LIN-TAPE', head: 'ET-LIN-TAPE' },
  { test: /\bRIGID\b|\bGRAZERS?\b|\bFIXED\s+LINEAR\b/, family: 'ET-LIN-FIXED', head: 'ET-LIN-FIXED' },
  { test: /\bPLUGS?\b|\bSOCKETS?\b|\bCONNECTORS?\b/, family: 'ET-CONNECTION', head: 'ET-CONNECTION' },
  { test: /\bDRIVERS?\b|\bDRIVE\b|\bPOWER\s+SUPPLY\b|\bPSU\b|\bEMERGENCY\s+PACK\b/, family: 'ET-DRIVER', head: 'ET-DRIVER' },
  { test: /\bARTNET\b|\bSPI\b|\bDMX\s+UNIVERSE\b|\bCONTROLLER\b/, family: 'ET-LIGHTINGCONTROL', head: 'ET-LIGHTINGCONTROL' },
  { test: /\bFRAMES?\b/, family: 'ET-PS-MOUNTING-FRAME', head: 'ET-PS-MOUNTING-FRAME' },
  { test: /\bSLEEVES?\b/, family: 'ET-PS-MOUNTING-SLEEVE', head: 'ET-PS-MOUNTING-SLEEVE' },
]

/** → { family, head, keyword } for the first rule the text matches, else null. */
export function classifyText(text) {
  const t = String(text ?? '').toUpperCase()
  if (!t.trim()) return null
  for (const rule of CANON_KEYWORDS) {
    const m = t.match(rule.test)
    if (m) return { family: rule.family, head: rule.head, keyword: m[0].trim() }
  }
  return null
}
