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
const CONNECTION_FAMILIES = new Set(['ET-CONNECTION', 'ET-CONNECTIONS', 'ET-CONNECTORS'])

function connector(ref, text) {
  const pins = ref.match(/(\d)\s*-?PIN/) || text.match(/(\d)\s*-?PIN/)
  const part = /STRAIN|-SR\b|-SR-|\bSR\b|ST16|-ST\b/.test(ref) ? 'strain-relief'
    : ref.includes('SOCKET') ? 'socket' : ref.includes('PLUG') ? 'plug' : 'connector'
  const side = ['FITTING', 'DRIVER', 'SITE', 'LIN', 'REMOTE', 'LOCAL', 'IP', 'DALI', 'MAINS', 'DATA'].find(s => ref.includes(s))
  return `${pins ? pins[1] + 'pin' : '?pin'}-${part}${side ? '@' + side.toLowerCase() : ''}`
}

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

/** The job one row or product does. Every field is optional; more fields, better answer. */
export function jobOf({ ref = '', family = '', name = '', description = '', maker = '', code = '', category = '',
  isDesign = false, section = 'position', entityType = '' } = {}) {
  const R = U(ref).trim(), F = U(family).trim(), C = U(code).trim(), CAT = U(category).trim()
  const T = [R, U(name), U(description), CAT].join(' ')
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
  if (R.includes('EM-PACK') || /\bEMERGENCY\b|LITEPLAN/.test(T)) return job('EMERGENCY')
  if (F.includes('DRIVER') || R.includes('PSU') || (/\bDRIVER|\bPSU\b|TRANSFORMER/.test(T) && !/PROF|TAPE|CLIP/.test(R))) {
    return job(T.includes('REMOTE') ? 'REMOTE_DRIVER' : 'LOCAL_DRIVER')
  }
  if (/-CAPS?(-|$)|END\s*-?CAP/.test(R + ' ' + T)) return job('END_CAPS')
  if (/-DIFF?(-|$)|DIFFUSER|\bOPAL\b|\bLENS\b/.test(R + ' ' + T) && !R.includes('PROF')) return job('DIFFUSER')
  if (R.startsWith('ET-CLIP') || (/-CLIPS?(-|$)|\bCLIPS?\b/.test(R + ' ' + T) && !R.includes('PROF'))) return job('CLIPS')
  if (R.includes('COLLAR')) return job('MOUNT_COLLAR', 'collar')
  if (/-MOUNT|CHANNEL|\bMOUNTING PROFILE\b/.test(R) || F === 'ET-LIN-MOUNT') return job('MOUNT_CHANNEL')
  if (/-PROF(ILE)?(-|$)/.test(R) || F === 'ET-LIN-PROF' || /\bPROFILE\b|EXTRUSION/.test(T)) return job('PROFILE')
  if (/-TAPE|NANOFLEX|\bTAPE\b|\bSTRIP\b/.test(R + ' ' + T) || F === 'ET-LIN-TAPE') {
    return job('TAPE', neon || /NEON|ULTIMO|ENCAPSULATED/.test(T) ? 'flex' : 'tape')
  }
  if (/-FLEX|NEON|ENCAPSULATED/.test(R + ' ' + T) || F === 'ET-LIN-FLEX' || neon) return job('TAPE', 'flex')
  if (/-FIXED|FIXEDLIN|RIGID|GRAZER/.test(R) || F.startsWith('ET-LIN-FIXED')) return job('TAPE', 'fixed')
  if (/FRAME|SLEEVE|PLASTER|TRIM|MOUNTING|BEZEL|HOUSING|TUBE|\bMPS\b/.test(R + ' ' + F)) {
    return job('MOUNT_COLLAR', ['frame', 'sleeve', 'plaster', 'trim', 'housing', 'tube'].find(v => R.includes(v.toUpperCase())) || 'mount')
  }
  if (R.includes('FIRE') || R.includes('HOOD')) return job('FIRE_HOOD')
  if (/HCOMB|HONEYCOMB|LOUVRE|LOUVER|GLARE|SNOOT|FILTER|GOBO/.test(R + ' ' + T)) return job('OPTIC_ACCESSORY')
  if (R.includes('TAIL') || R.includes('CABLE')) return job('CABLE_TAIL')
  if (R.includes('TRACK') || F.includes('TRACK')) return job('TRACK_ACCESSORY')
  if (/BUNG|ACCHOLD|HOLDER|STRAP|SPIKE|VISOR|COWL|TOOL|VENT|SHIELD/.test(R) || F.includes('ACCESSOR')) {
    return job('ACCESSORY', R.replace(STEM, '').replace('ET-', '').split('-')[0].toLowerCase())
  }
  if (R.startsWith('ET-DL')) return job('FITTING', 'dl')
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
    case 'DIFFUSER': return { family: 'ET-LIN-PROF', head: 'ET-LIN-DIFF' }
    case 'END_CAPS': return { family: 'ET-LIN-PROF', head: 'ET-LIN-CAP' }
    case 'CLIPS': return { family: 'ET-LIN-CLIP', head: 'ET-LIN-CLIP' }
    case 'MOUNT_CHANNEL': return { family: 'ET-LIN-MOUNT', head: 'ET-LIN-MOUNT' }
    case 'MOUNT_COLLAR': return variant === 'frame' ? { family: 'ET-PS-MOUNTING-FRAME', head: 'ET-PS-MOUNTING-FRAME' }
      : variant === 'sleeve' ? { family: 'ET-PS-MOUNTING-SLEEVE', head: 'ET-PS-MOUNTING-SLEEVE' }
        : { family: 'ET-PS-MOUNTING', head: 'ET-PS-MOUNTING' }
    case 'LOCAL_DRIVER': case 'REMOTE_DRIVER': case 'EMERGENCY': return { family: 'ET-DRIVER', head: 'ET-DRIVER' }
    case 'OPTIC_ACCESSORY': case 'ACCESSORY': case 'FIRE_HOOD': return { family: 'ET-PS-ACCESSORIES', head: 'ET-PS-ACCESSORIES' }
    case 'CONNECTOR': case 'LOCKING_LEVER': return { family: 'ET-CONNECTION', head: 'ET-CONNECTION' }
    case 'FITTING': return { family: 'ET-PS', head: 'ET-PS' }
    case 'TRACK_ACCESSORY': return { family: 'ET-TRACK', head: 'ET-TRACK' }
    default: return null
  }
}

/** Every family a job may sit in on a project: the house one, plus this project's own family rows
 *  whose ElementTypes MOSTLY do that job, or jobs the house files with it (at least `share` of
 *  them). A catch-all family holding tape, profiles and clips alike (ET-LIN-COMPONENTS) is no home
 *  for any of them. A family with no
 *  row of its own never counts. */
export function familiesForJob(job, { elementTypes = [], familyRows = new Set(), share = 0.6 } = {}) {
  const out = new Set()
  const house = familyForJob(job)
  if (house) out.add(house.family.toUpperCase())
  const tally = new Map()   // family → [doing this job, all]
  for (const e of elementTypes) {
    const fam = U(e.Family || e.family).trim()
    if (!fam || !familyRows.has(fam)) continue
    const j = jobOf({ ref: e.ElementTypeRef || e.elementTypeRef, family: fam, name: e.Name || e.name, description: e.Description || e.description })
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
