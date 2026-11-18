import { etRefOf } from './derived'
import { matchShape } from './codeShapes'
import shippedShapes from '../data/codeShapes.json'
/**
 * codeJobs.js — what JOB a product or ElementType does in a recipe, in the template slot names
 * (platform/dbSchema.js): TAPE, PROFILE, DIFFUSER, END_CAPS, CLIPS, MOUNT_CHANNEL, MOUNT_COLLAR,
 * LOCAL_DRIVER, FITTING …, plus CONNECTOR (which templates leave to the Connectors screen).
 *
 * Refs differ on every project, so the job is read from everything else as well: the family when it
 * is a house family, the words of the ref and name, the maker's own code families (LEDFlex `UN…` is
 * Ultimo Neon), and a catalogue category when one is known (a "Neon Profile" is a mounting channel,
 * not a profile). Measured against the recipes of every library project: two rows in 3,652 have no
 * job. Pure; no project data in here.
 *
 *   jobOf({ ref, family, name, description, maker, code, category, isDesign, section })
 *     → { slot, variant }      variant: TAPE tape|flex|fixed, MOUNT_COLLAR frame|sleeve|…,
 *                              CONNECTOR "2pin-socket@driver", DESIGN_ELEMENT DL|LIN|PS|…
 *   familyForJob(job)          → { family, head } in the house families (data/etCanon.js), or null
 */

const U = s => String(s ?? '').toUpperCase()
const STEM = /[-_]?\d+[A-Z]?$/
const CONN = /(\d)\s*-?PIN|SOCKET|PLUG|STRAIN|\bSR\b|-SR\b|-SR-|ST16|GLAND|CONNECTOR|WIELAND|TERMINAL|WAGO|JUNCTION|XLR/
const WRAPPER_FAMILIES = new Set(['ET-LIN', 'ET-LIN-TP', 'ET-LIN-ENCAPSULATED', 'ET-LINEAR'])

/**
 * The collection a linear wrapper (ET-LIN-NN) is filed under, from what is inside it (page 1409596):
 * flex → ET-LIN-ENCAPSULATED, fixed linear → ET-LIN-FIXED, otherwise tape and profile → ET-LIN-TP.
 * `jobs` are the jobs of its ingredients (jobOf results or jobKeys).
 */
export function linearWrapperFamily(jobs = []) {
  const keys = jobs.map(j => (typeof j === 'string' ? j : jobKey(j)))
  if (keys.includes('TAPE:flex')) return 'ET-LIN-ENCAPSULATED'
  if (keys.includes('TAPE:fixed')) return 'ET-LIN-FIXED'
  return 'ET-LIN-TP'
}
const CONNECTION_FAMILIES = new Set(['ET-CONNECTION', 'ET-CONNECTIONS', 'ET-CONNECTORS'])


function designKind(ref, fam, entityType) {
  if (U(entityType) === 'POSITIONTYPE') return 'POSITION'
  if (ref.startsWith('ET-DL') || fam === 'ET-DL') return 'DL'
  if (/^ET-LIN(EAR)?(-?\d|$)/.test(ref) || WRAPPER_FAMILIES.has(fam)) return 'LIN'
  if (ref.startsWith('ET-PS') || fam.startsWith('ET-PS')) return 'PS'
  if (ref.includes('PANEL') || fam.includes('PANEL')) return 'PANEL'
  if (fam.includes('DRIVER') || /^ET-(CC|CV)(L|R)-/.test(ref)) return 'DRIVER'
  if (ref.includes('TRACK') || fam.includes('TRACK')) return 'TRACK'
  if (/FIXED/.test(ref + fam)) return 'FIXED-LINEAR'
  return 'other:' + (fam || ref.replace(STEM, ''))
}

const EMERGENCY_WORDS = /\bEMERGENCY\b|LITEPLAN/

/**
 * What a product IS, most specific first. Order matters: "FLEX PROFILE … END CAP" is a cap, "AQUA
 * NEON 16 … PROFILE" is a neon mounting profile. Each rule matches the words of a name or
 * description (`text`), and optionally the ref's own words (`ref`) and a house family that holds
 * only that job (`family`). This is the app's only list of product words: `jobOf` walks it for
 * rows and products, and `classifyText` reads the text half as a family.
 * `notRef`: a ref with these words is not this job, whatever the text says (ET-LIN-PROF-03 "opal").
 * `hint`: `jobOf` reads only this rule's ref and family; its words are a hint for a new ElementType's
 * family (classifyText), not proof of a job: a "Vent Plug Ring" is an accessory, not a connector.
 */
export const WORDS = [
  { slot: 'END_CAPS', text: /\bEND\s*-?CAPS?\b|\bENDCAPS?\b/, ref: /-CAPS?(-|$)|ENDCAP/, family: 'ET-LIN-CAPS' },
  { slot: 'DIFFUSER', text: /\bDIFFUSERS?\b|\bCOVERS?\b|\bLENS\b|\bOPAL\b/, ref: /-DIFF?(-|$)|DIFFUSER|\bOPAL\b|\bLENS\b/, family: 'ET-LIN-DIFF', notRef: /PROF/ },
  // ET-CLIPS-CONTINUITY-M-PROFILE is still a clip: a ref that starts ET-CLIP is exempt from notRef.
  { slot: 'CLIPS', text: /\bCLIPS?\b/, ref: /^ET-CLIP|-CLIPS?(-|$)/, family: 'ET-LIN-CLIP', notRef: /^(?!ET-CLIP).*PROF/ },
  { slot: 'MOUNT_COLLAR', variant: 'collar', ref: /COLLAR/ },
  { slot: 'MOUNT_CHANNEL', text: /\bBRACKETS?\b|(?<!DIN[\s-]?)\bRAILS?\b|\bSUSPENSION\s+KIT\b|\bMOUNT(ING|ED)?\s+KIT\b/,
    ref: /-MOUNT|CHANNEL/, family: 'ET-LIN-MOUNT', hint: true },
  { slot: 'MOUNT_CHANNEL', text: /\bMOUNTING\s+(PROFILE|CHANNEL|TRACK)\b|\bNEON\b.*\bPROFILE\b|\bPROFILE\b.*\bNEON\b/, hint: true },
  { slot: 'TRACK_ACCESSORY', text: /TRACK\b/, hint: true },
  { slot: 'PROFILE', text: /\bPROFILES?\b|\bEXTRUSION\b/, ref: /-PROF(ILE)?(-|$)/, family: 'ET-LIN-PROF' },
  // A tape that says neon is flex (said()); a tape family's own row stays tape (ET-FLEX-NEO360 in ET-LIN-TAPE).
  { slot: 'TAPE', variant: 'tape', text: /\bTAPES?\b|\bSTRIPS?\b|NANOFLEX/, ref: /-TAPE|NANOFLEX/, family: 'ET-LIN-TAPE' },
  { slot: 'TAPE', variant: 'flex', text: /NEON|\bENCAPSULATED\b|\bULTIMO\b/, ref: /-FLEX|NEON|ENCAPSULATED/, family: 'ET-LIN-FLEX' },
  { slot: 'TAPE', variant: 'fixed', text: /\bRIGID\b|\bGRAZERS?\b|\bFIXED\s+LINEAR\b/, ref: /RIGID|GRAZER/, family: 'ET-LIN-FIXED', hint: true },
  { slot: 'CONNECTOR', text: /\bPLUGS?\b|\bSOCKETS?\b|\bCONNECTORS?\b/, hint: true },
  { slot: 'EMERGENCY', text: /\bEMERGENCY\s+PACKS?\b/ },    // "from emergency UPS" is a cable, not a pack
  { slot: 'LOCAL_DRIVER', text: /\bDRIVERS?\b|\bDRIVE\b|\bPOWER\s+SUPPLY\b|\bPSU\b|TRANSFORMER/, hint: true },
  { slot: 'CONTROLLER', text: /\bARTNET\b|\bSPI\b|\bDMX\s+UNIVERSE\b|\bCONTROLLER\b/, hint: true },
  { slot: 'OPTIC_ACCESSORY', text: /\bLOUVRES?\b|\bLOUVERS?\b|\bGLARE\s+SHIELDS?\b|\bSNOOTS?\b|\bHONEYCOMB\b|\bGOBOS?\b/, hint: true },
  { slot: 'MOUNT_COLLAR', variant: 'housing', text: /\bBACK\s*-?BOX(ES)?\b|\bCASINGS?\b|\bHOUSINGS?\b/, hint: true },
  { slot: 'MOUNT_COLLAR', variant: 'frame', text: /\bFRAMES?\b/, hint: true },
  { slot: 'MOUNT_COLLAR', variant: 'sleeve', text: /\bSLEEVES?\b/, hint: true },
]

/** Every rule the text's words match, in order, with the words that matched. */
function wordHits(text) {
  const t = U(text)
  return WORDS.filter(w => w.text).map(w => ({ w, m: t.match(w.text) })).filter(x => x.m)
}

/**
 * What the words alone say a product is, as a house family:
 * → { family, head, keyword, others } for the first rule the text matches, else null.
 * `others` lists the other families the text also names ("tape in aluminium profile"):
 * the words alone cannot say which product this is, so the caller should flag the guess.
 */
export function classifyText(text) {
  const hits = wordHits(text)
  if (!hits.length) return null
  const fam = ({ w }) => familyForJob({ slot: w.slot, variant: w.variant || '' })
  const lead = (hits[0].w.variant === 'tape' && hits.find(h => h.w.variant === 'flex')) || hits[0]   // a neon tape is flex
  const first = fam(lead)
  const others = [...new Set(hits.filter(h => h !== lead).map(h => fam(h).head).filter(h => h !== first.head))]
  return { ...first, keyword: lead.m[0].trim(), others }
}

/** A code's shape (codeShapes.json) names a ref head, which says the job: LEDFlex FPS…BG… is
 *  ET-LIN-PROF, but 022-#### is ET-LIN-DIFF filed in ET-LIN-PROF, so the head decides, not the family. */
const HEAD_JOB = {
  'ET-LIN-PROF': ['PROFILE'], 'ET-LIN-DIFF': ['DIFFUSER'], 'ET-LIN-CAP': ['END_CAPS'], 'ET-LIN-CLIP': ['CLIPS'],
  'ET-LIN-MOUNT': ['MOUNT_CHANNEL'], 'ET-LIN-TAPE': ['TAPE', 'tape'], 'ET-LIN-FLEX': ['TAPE', 'flex'], 'ET-LIN-FIXED': ['TAPE', 'fixed'],
  'ET-DRIVER': ['LOCAL_DRIVER'], 'ET-CONNECTION': ['CONNECTOR'], 'ET-LIGHTINGCONTROL': ['CONTROLLER'],
  'ET-PS-MOUNTING-FRAME': ['MOUNT_COLLAR', 'frame'], 'ET-PS-MOUNTING-SLEEVE': ['MOUNT_COLLAR', 'sleeve'],
  'ET-PS-MOUNTING': ['MOUNT_COLLAR', 'housing'], 'ET-PS-ACCESSORIES': ['ACCESSORY'], 'ET-TRACK': ['TRACK_ACCESSORY'], 'ET-PS': ['FITTING'],
}
function shapeJob(code, maker, shapes) {
  if (!code) return null
  const s = matchShape(code, maker, shapes)
  const hit = s.current?.family ? s.current : s.superseded?.family ? s.superseded : null
  return hit ? HEAD_JOB[U(hit.head || hit.family)] || null : null
}

/** A connector's part, from its ref: 'sr' | 'socket' | 'plug', else null. SR is checked first, as a
 *  whole segment, so it cannot match inside a word like DRIVER. */
export function connectorPart(ref) {
  const R = U(ref), seg = R.split('-')
  if (seg.includes('SR') || /STRAIN|ST16/.test(R)) return 'sr'
  if (R.includes('SOCKET') || seg.includes('SOCK')) return 'socket'
  if (R.includes('PLUG')) return 'plug'
  return null
}

function connector(ref, text) {
  const pins = ref.match(/(\d)\s*-?PIN/) || text.match(/(\d)\s*-?PIN/)
  const part = { sr: 'strain-relief', socket: 'socket', plug: 'plug' }[connectorPart(ref)] || 'connector'
  const side = ['FITTING', 'DRIVER', 'SITE', 'LIN', 'REMOTE', 'LOCAL', 'IP', 'DALI', 'MAINS', 'DATA'].find(s => ref.includes(s))
  return `${pins ? pins[1] + 'pin' : '?pin'}-${part}${side ? '@' + side.toLowerCase() : ''}`
}

/**
 * The job one row or product does. Every field is optional; more fields, better answer.
 * Evidence in order: the design flag and catalogue category, refs that name their job outright
 * (connectors, drivers, fittings), the WORDS rules (ref, family or text, first rule wins), the
 * ref's remaining words, then the code's shape (`shapes`, the shipped table unless given).
 */
export function jobOf({ ref = '', family = '', name = '', description = '', maker = '', code = '', category = '',
  isDesign = false, section = 'position', entityType = '', shapes = shippedShapes.shapes || [] } = {}) {
  const R = U(ref).trim(), F = U(family).trim(), C = U(code).trim(), CAT = U(category).trim()
  const T = [U(name), U(description), CAT].join(' '), RT = R + ' ' + T     // T: words only, for the WORDS table
  const job = (slot, variant = '') => ({ slot, variant })

  if (isDesign === true || U(isDesign) === 'Y') {
    return section === 'position' ? job('DESIGN_ELEMENT', designKind(R, F, entityType)) : job('FITTING')
  }
  const neon = U(maker).replace(/\s/g, '') === 'LEDFLEX' && C.startsWith('UN')       // LEDFlex Ultimo Neon
  if (CAT === 'NEON PROFILE' || CAT === 'NEON BRACKET') return job('MOUNT_CHANNEL')
  if (CAT === 'NEON CLIP') return job('CLIPS')
  if (/-FIXED|FIXEDLIN/.test(R)) return job('TAPE', 'fixed')
  if (R.includes('LEVER')) return job('LOCKING_LEVER')
  if (CONN.test(R) || CONNECTION_FAMILIES.has(F)) return job('CONNECTOR', connector(R, T))
  if (/DOOR|HERA-DS/.test(R)) return job('DOOR_SWITCH')
  if (/ENCLOSURE|-ENC\b|-ENC-/.test(R)) return job('ENCLOSURE')
  if (R.startsWith('ET-PS') || (F === 'ET-PS' && !R.startsWith('ET-FRAME'))) return job('FITTING')
  const drv = R.match(/^ET-(CC|CV)(L|R)-/)
  if (drv) return job(drv[2] === 'L' ? 'LOCAL_DRIVER' : 'REMOTE_DRIVER', drv[1])
  if (R.includes('EM-PACK') || EMERGENCY_WORDS.test(RT)) return job('EMERGENCY')
  // A constant-voltage/current part with a channel count (DALI-CV-1CH, 5PWQ9L) is a driver.
  const cvch = /\b(CC|CV)\b/.test(RT) && /\b\d+CH\b/.test(RT)
  // A wrapper named "Downlight with LED Lamp and driver" counts as its driver (the recipe kinds rely on it).
  if (F.includes('DRIVER') || /PSU|DRIVER/.test(R) || cvch || (/\bDRIVER|\bPSU\b|TRANSFORMER/.test(RT) && !/PROF|TAPE|CLIP/.test(R))) {
    return job(RT.includes('REMOTE') ? 'REMOTE_DRIVER' : 'LOCAL_DRIVER')
  }
  if (R.includes('FIRE') || R.includes('HOOD')) return job('FIRE_HOOD')

  const ok = w => !(w.notRef && w.notRef.test(R))
  const fam = w => w.family && (F === w.family || (w.family === 'ET-LIN-FIXED' && F.startsWith(w.family)))
  const said = hit => {
    if (hit.slot === 'TAPE' && hit.variant === 'tape' && (neon || /NEON|ULTIMO|ENCAPSULATED/.test(RT))) return job('TAPE', 'flex')
    return job(hit.slot, hit.variant || '')
  }
  const hit = WORDS.find(w => ok(w) && ((w.ref && w.ref.test(R)) || fam(w) || (!w.hint && w.text && w.text.test(T))))
  if (hit) return said(hit)
  if (/CONTROL|KNX/.test(F)) return job('CONTROLLER')

  if (/FRAME|SLEEVE|PLASTER|TRIM|MOUNTING|BEZEL|HOUSING|TUBE|\bMPS\b/.test(R + ' ' + F)) {
    return job('MOUNT_COLLAR', ['frame', 'sleeve', 'plaster', 'trim', 'housing', 'tube'].find(v => R.includes(v.toUpperCase())) || 'mount')
  }
  if (/HCOMB|HONEYCOMB|LOUVRE|LOUVER|GLARE|SNOOT|FILTER|GOBO/.test(RT)) return job('OPTIC_ACCESSORY')
  if (R.includes('TAIL') || R.includes('CABLE')) return job('CABLE_TAIL')
  if (R.includes('TRACK') || F.includes('TRACK')) return job('TRACK_ACCESSORY')
  if (/BUNG|ACCHOLD|HOLDER|STRAP|SPIKE|VISOR|COWL|TOOL|VENT|SHIELD/.test(R) || F.includes('ACCESSOR')) {
    return job('ACCESSORY', R.replace(STEM, '').replace('ET-', '').split('-')[0].toLowerCase())
  }
  if (R.startsWith('ET-DL')) return job('FITTING', 'dl')
  if (neon) return job('TAPE', 'flex')
  const shaped = shapeJob(C, maker, shapes)
  if (shaped) return job(...shaped)
  return job('OTHER', F || R.replace(STEM, ''))
}

/** A job key as kinds and templates use it: TAPE carries its variant (TAPE:flex). */
export const jobKey = j => (j.slot === 'TAPE' && j.variant ? `TAPE:${j.variant}` : j.slot)

/** The house family (and ref head) for a job, or null when the job does not decide one. */
export function familyForJob({ slot, variant } = {}) {
  switch (slot) {
    case 'TAPE': return variant === 'flex' ? { family: 'ET-LIN-FLEX', head: 'ET-LIN-FLEX' }
      : variant === 'fixed' ? { family: 'ET-LIN-FIXED', head: 'ET-LIN-FIXED' } : { family: 'ET-LIN-TAPE', head: 'ET-LIN-TAPE' }
    case 'PROFILE': return { family: 'ET-LIN-PROF', head: 'ET-LIN-PROF' }
    case 'DIFFUSER': return { family: 'ET-LIN-DIFF', head: 'ET-LIN-DIFF' }
    case 'END_CAPS': return { family: 'ET-LIN-CAPS', head: 'ET-LIN-CAP' }
    case 'CLIPS': return { family: 'ET-LIN-CLIP', head: 'ET-LIN-CLIP' }
    case 'MOUNT_CHANNEL': return { family: 'ET-LIN-MOUNT', head: 'ET-LIN-MOUNT' }
    case 'MOUNT_COLLAR': return variant === 'frame' ? { family: 'ET-PS-MOUNTING-FRAME', head: 'ET-PS-MOUNTING-FRAME' }
      : variant === 'sleeve' ? { family: 'ET-PS-MOUNTING-SLEEVE', head: 'ET-PS-MOUNTING-SLEEVE' }
        : { family: 'ET-PS-MOUNTING', head: 'ET-PS-MOUNTING' }
    case 'LOCAL_DRIVER': case 'REMOTE_DRIVER': case 'EMERGENCY': return { family: 'ET-DRIVER', head: 'ET-DRIVER' }
    case 'OPTIC_ACCESSORY': case 'ACCESSORY': case 'FIRE_HOOD': return { family: 'ET-PS-ACCESSORIES', head: 'ET-PS-ACCESSORIES' }
    case 'CONNECTOR': case 'LOCKING_LEVER': return { family: 'ET-CONNECTION', head: 'ET-CONNECTION' }
    case 'FITTING': return { family: 'ET-PS', head: 'ET-PS' }
    case 'CONTROLLER': return { family: 'ET-LIGHTINGCONTROL', head: 'ET-LIGHTINGCONTROL' }
    case 'TRACK_ACCESSORY': return { family: 'ET-TRACK', head: 'ET-TRACK' }
    default: return null
  }
}

/** Every family a job may sit in on a project: the house one, plus this project's own family rows
 *  whose ElementTypes MOSTLY do that job, or jobs the house files with it (at least `share` of
 *  them). A catch-all family holding tape, profiles and clips alike (ET-LIN-COMPONENTS) is no home
 *  for any of them. A family with no
 *  row of its own never counts. */
export function familiesForJob(job, { elementTypes = [], familyRows = new Set(), share = 0.8 } = {}) {
  const out = new Set()
  const house = familyForJob(job)
  if (house) out.add(house.family.toUpperCase())
  const tally = new Map()   // family → [doing this job, all]
  for (const e of elementTypes) {
    const fam = U(e.Family || e.family).trim()
    if (!fam || !familyRows.has(fam)) continue
    // 6K5ACV: a family's own row (ET-LIN-PROF in ET-LIN-INGREDIENTS) is not a member doing its job.
    if ((e.IsCollection || e.isCollection) === 'Y') continue
    const j = jobOf({ ref: etRefOf(e), family: fam, name: e.Name || e.name, description: e.Description || e.description })
    const t = tally.get(fam) || [0, 0]
    // Jobs filed together in the house (profile, caps and diffuser in ET-LIN-PROF) count as one.
    const same = j.slot === job.slot && (job.slot !== 'TAPE' || j.variant === job.variant)
    if (same || (house && familyForJob(j)?.family === house.family)) t[0]++
    t[1]++
    tally.set(fam, t)
  }
  for (const [fam, [n, all]] of tally) if (n && n / all >= share) out.add(fam)
  return out
}
