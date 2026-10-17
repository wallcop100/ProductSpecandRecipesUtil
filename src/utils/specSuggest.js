/**
 * specSuggest.js — two inline hints for one ElementType in the Product Spec editor. Pure.
 *
 *   familyFix(et, ps, elementTypes, { recipes, psRows })
 *                                    → { family, job } when it has no family, or sits in a mixed
 *                                      catch-all (a cap in ET-LIN-COMPONENTS → ET-LIN-CAPS); a linear
 *                                      wrapper is filed by its contents (ET-LIN-01 → ET-LIN-TP)
 *   codeElsewhere(et, ps, { … })     → { maker, code, ref, description, source } — the code the same
 *                                      part has on another project, when this one has none yet
 *                                      (ET-3Pin-Mains-SR ← ET-3Pin-SR, WAGO 770-503)
 */
import { jobOf, familyForJob, familiesForJob, linearWrapperFamily } from './codeJobs'

const U = s => String(s ?? '').trim().toUpperCase()
const mk = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const NO_CODE = /^(TBC|N\/?A|-)?$/
const NOT_FILED_BY_JOB = new Set(['CONNECTOR', 'FITTING', 'DESIGN_ELEMENT', 'OTHER', 'LOCKING_LEVER'])


export function familyFix(et, ps, elementTypes = [], { recipes = [], psRows = [] } = {}) {
  if (!et) return null
  const fam = U(et.Family)
  // A linear wrapper (ET-LIN-NN): its collection follows what is inside it (page 1409596).
  if (/^ET-LIN-?\d+$/.test(U(et.ElementTypeRef))) {
    const inside = recipes.filter(r => (r.ContextType || r.contextType) === 'ElementType'
      && U(r.ContextRef || r.contextRef) === U(et.ElementTypeRef) && U(r.IsDeleted || r.isDeleted) !== 'Y')
    if (!inside.length) return null
    const psBy = new Map(psRows.map(r => [U(r.ElementTypeRef), r]))
    const etBy = new Map(elementTypes.map(e => [U(e.ElementTypeRef), e]))
    const jobs = inside.map(r => {
      const ref = r.ElementTypeRef || r.elementTypeRef, e = etBy.get(U(ref)) || {}, p = psBy.get(U(ref)) || {}
      return jobOf({ ref, family: e.Family, name: e.Name, description: e.Description, maker: p.Manufacturer, code: p.ProductCode })
    })
    const want = linearWrapperFamily(jobs)
    return fam === want ? null
      : { family: want, job: { slot: 'DESIGN_ELEMENT', variant: 'LIN' } }
  }
  if (U(et.IsCollection) === 'Y') return null
  const job = jobOf({ ref: et.ElementTypeRef, family: fam, name: et.Name, description: et.Description,
    maker: ps?.Manufacturer, code: ps?.ProductCode })
  if (NOT_FILED_BY_JOB.has(job.slot)) return null
  const house = familyForJob(job)
  if (!house) return null
  // A family in use counts here even without a row of its own: only its make-up decides.
  const familyRows = new Set([...elementTypes.map(e => U(e.ElementTypeRef)), ...elementTypes.map(e => U(e.Family)).filter(Boolean)])
  const ok = familiesForJob(job, { elementTypes, familyRows })
  if (ok.has(fam)) return null
  // A family of things no house family covers (cables…) is a scheme of its own: an odd member is
  // left alone. A mixed catch-all, or no family at all, gets the hint.
  if (fam) {
    const houses = new Map()
    const members = elementTypes.filter(e => U(e.Family) === fam)
    for (const e of members) {
      const h = familyForJob(jobOf({ ref: e.ElementTypeRef, family: fam, name: e.Name, description: e.Description }))?.family || '-'
      houses.set(h, (houses.get(h) || 0) + 1)
    }
    const [top, n] = [...houses.entries()].sort((a, b) => b[1] - a[1])[0] || ['-', 0]
    if (top === '-' && n / Math.max(1, members.length) >= 0.6) return null
  }
  const own = [...ok].find(f => f !== U(house.family))
  const ownRow = own && elementTypes.find(e => U(e.ElementTypeRef) === own)
  return { family: own ? (ownRow ? ownRow.ElementTypeRef : elementTypes.find(e => U(e.Family) === own).Family) : house.family, job }
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

/**
 * A ref with no number where its siblings have one: ET-PS-MINI-TINI among ET-PS-01, ET-PS-02 …
 * → { ref: 'ET-PS-MINI-TINI-01', head: 'ET-PS' }. Only where most refs sharing its head are
 * numbered (connector refs such as ET-2Pin-LIN-Socket carry none, and none is asked for).
 */
export function refNumberFix(et, elementTypes = []) {
  const ref = String(et?.ElementTypeRef || '').trim()
  if (!ref || /-\d+[A-Z]?$/i.test(ref)) return null
  if (elementTypes.some(e => U(e.Family) === U(ref))) return null          // a family row
  const head = ref.split('-').slice(0, 2).join('-')
  const sibs = elementTypes.map(e => String(e.ElementTypeRef || '')).filter(r => U(r).startsWith(U(head) + '-') && U(r) !== U(ref))
  const numbered = sibs.filter(r => /-\d+[A-Z]?$/i.test(r))
  if (sibs.length < 2 || numbered.length / sibs.length < 0.6) return null
  const taken = new Set(elementTypes.map(e => U(e.ElementTypeRef)))
  for (let n = 1; n < 100; n++) {
    const cand = `${ref}-${String(n).padStart(2, '0')}`
    if (!taken.has(U(cand))) return { ref: cand, head }
  }
  return null
}
