/**
 * specSuggest.js — two inline hints for one ElementType in the Product Spec editor. Pure.
 *
 *   familyFix(et, ps, elementTypes)  → { family, job } when its family is no home for what it does
 *                                      (a cap filed in a catch-all ET-LIN-COMPONENTS → ET-LIN-PROF)
 *   codeElsewhere(et, ps, { … })     → { maker, code, ref, description, source } — the code the same
 *                                      part has on another project, when this one has none yet
 *                                      (ET-3Pin-Mains-SR ← ET-3Pin-SR, WAGO 770-503)
 */
import { jobOf, familyForJob, familiesForJob } from './codeJobs'

const U = s => String(s ?? '').trim().toUpperCase()
const mk = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const NO_CODE = /^(TBC|N\/?A|-)?$/
const NOT_FILED_BY_JOB = new Set(['CONNECTOR', 'FITTING', 'DESIGN_ELEMENT', 'OTHER', 'LOCKING_LEVER'])

export function familyFix(et, ps, elementTypes = []) {
  if (!et || U(et.IsCollection) === 'Y') return null
  const fam = U(et.Family)
  const job = jobOf({ ref: et.ElementTypeRef, family: fam, name: et.Name, description: et.Description,
    maker: ps?.Manufacturer, code: ps?.ProductCode })
  if (NOT_FILED_BY_JOB.has(job.slot)) return null
  const house = familyForJob(job)
  if (!house) return null
  const familyRows = new Set(elementTypes.map(e => U(e.ElementTypeRef)))
  const ok = familiesForJob(job, { elementTypes, familyRows })
  if (ok.has(fam)) return null
  const own = [...ok].find(f => f !== U(house.family))
  return { family: own ? elementTypes.find(e => U(e.ElementTypeRef) === own).ElementTypeRef : house.family, job }
}

/** A connector's kind without the side it sits on: 3pin-strain-relief@mains → 3pin-strain-relief. */
const kindOf = j => (j.slot === 'CONNECTOR' ? j.variant.replace(/@.*/, '') : null)

export function codeElsewhere(et, ps, { elementTypes = [], psRows = [], exemplars = [] } = {}) {
  if (!et || (ps && !NO_CODE.test(U(ps.ProductCode)))) return null
  const ref = U(et.ElementTypeRef)
  const want = kindOf(jobOf({ ref, family: et.Family, name: et.Name, description: et.Description }))
  const psByRef = new Map(psRows.map(r => [U(r.ElementTypeRef), r]))
  const taken = new Set(psRows.filter(r => U(r.ElementTypeRef) !== ref).map(r => `${mk(r.Manufacturer)}|${U(r.ProductCode)}`))
  // The maker it has, else the makers of its own family here (its plug and socket are WAGO: so is it).
  const own = mk(ps?.Manufacturer)
  const famMakers = new Set(elementTypes
    .filter(e => U(e.Family) && U(e.Family) === U(et.Family) && U(e.ElementTypeRef) !== ref)
    .map(e => mk(psByRef.get(U(e.ElementTypeRef))?.Manufacturer)).filter(Boolean))
  let best = null
  for (const ex of exemplars) {
    if (!ex.code || NO_CODE.test(U(ex.code))) continue
    const m = mk(ex.maker)
    if (own ? m !== own : famMakers.size && !famMakers.has(m)) continue
    if (taken.has(`${m}|${U(ex.code)}`)) continue
    const score = U(ex.ref) === ref ? 2
      : want && kindOf(jobOf({ ref: ex.ref, family: ex.family, name: ex.name, description: ex.description })) === want ? 1 : 0
    if (score && (!best || score > best.score)) best = { score, ex }
  }
  if (!best) return null
  const { ex } = best
  return { maker: ex.maker, code: ex.code, ref: ex.ref, description: ex.description || ex.name || '', source: ex.source || '' }
}
