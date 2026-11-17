/**
 * Backtest: how much of a new ElementType would a user still have to retype?
 *
 * Every real product on every mirrored project is hidden in turn and proposed by the app's own
 * code (etSeed.proposeElementTypes), then compared with what the project actually did:
 * family, ref (its stem — the counter is just the next free number), name.
 *
 *   loo   — the project otherwise finished (leave one out): the project's own style is there
 *   fresh — the project's first product: only other projects' exemplars to go on
 *
 *   npx vite-node tools/backtest-forms.mjs <dir of project JSON> [project…]
 * JSON per project: { project, elementTypes, psRows, recipes, positionTypes } in app row shape.
 */
import fs from 'node:fs'
import path from 'node:path'
import { proposeElementTypes } from '../src/utils/etSeed.js'
import { harvestExemplars } from '../src/utils/styleLibrary.js'
import { hasProductIdentity } from '../src/utils/productCodes.js'

const [dir, ...only] = process.argv.slice(2)
const lc = s => String(s ?? '').trim().toLowerCase()
const stem = ref => lc(ref).replace(/-\d+[a-z]?$/, '')
// The ref's first two segments (ET-TAPE of ET-TAPE-LUMENLINE160-01): right means only the middle is left to type.
const head = ref => stem(ref).split('-').slice(0, 2).join('-')
const live = r => (r.IsDeleted || '') !== 'Y'

const projects = fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => JSON.parse(fs.readFileSync(path.join(dir, f))))
const exemplars = new Map(projects.map(p => [p.project, harvestExemplars({ elementTypes: p.elementTypes.filter(live), psRows: p.psRows, source: p.project })]))

function cases(p) {
  const byRef = new Map(p.elementTypes.filter(live).map(e => [lc(e.ElementTypeRef), e]))
  const out = []
  for (const r of p.psRows.filter(live)) {
    const et = byRef.get(lc(r.ElementTypeRef))
    const code = String(r.ProductCode ?? '').trim()
    if (!et || !et.Family || et.IsCollection === 'Y' || !hasProductIdentity(code)) continue
    if (/^ET-(DL|LIN)$/i.test(et.Family)) continue
    out.push({ et, ps: r, code, maker: String(r.Manufacturer ?? '').trim() })
  }
  return out
}

function propose(p, c, mode, later = null, session = []) {
  const hide = lc(c.et.ElementTypeRef)
  const keep = mode === 'loo' || mode === 'session'
  // session: replayed in ref-counter order; this product and every later one are not made yet.
  const gone = later || new Set([hide])
  const elementTypes = keep ? p.elementTypes.filter(e => live(e) && !gone.has(lc(e.ElementTypeRef))) : []
  const psRows = keep ? p.psRows.filter(r => !gone.has(lc(r.ElementTypeRef))) : []
  const recipes = keep ? p.recipes : []
  const library = [...exemplars].flatMap(([proj, ex]) => proj !== p.project ? ex : keep ? ex.filter(e => lc(e.ref) !== hide) : [])
  const uses = p.recipes.filter(x => live(x) && lc(x.ElementTypeRef) === hide && x.ContextType !== 'ElementType')
  const entry = {
    text: c.code, manufacturers: [c.maker], variants: [{ note: c.ps.ProductDescription || '' }],
    positionTypes: [...new Set(uses.map(x => x.PositionTypeRef).filter(Boolean))],
    lead: uses.some(x => x.IsDesign === 'Y'), reuse: [],
  }
  const { proposals } = proposeElementTypes([entry], {
    elementTypes, psRows, recipes, positionTypes: keep ? p.positionTypes : [],
    roleOf: e => (e.lead ? 'lead' : 'extra'), library, session,
  })
  return proposals[0]
}

const tally = () => ({ n: 0, family: 0, head: 0, ref: 0, name: 0, why: {} })
const MODES = (process.env.MODES || 'loo,fresh,session').split(',')
const total = Object.fromEntries(MODES.map(m => [m, tally()]))
const counter = ref => Number(String(ref).match(/-(\d+)[a-z]?$/i)?.[1] ?? 999)
const rows = []
for (const p of projects) {
  if (only.length && !only.includes(p.project)) continue
  const per = Object.fromEntries(MODES.map(m => [m, tally()]))
  // A sitting, approximated: products made in ref-counter order (every -01 before any -02).
  // ORDER=shuffle (seeded) or mirror checks the counter order is not leaking the answer.
  const rnd = (seed => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648))(Number(process.env.SEED || 7))
  const order = cases(p).map((c, i) => ({ c, i, r: rnd() })).sort((a, b) => process.env.ORDER === 'shuffle' ? a.r - b.r : process.env.ORDER === 'mirror' ? a.i - b.i
    : counter(a.c.et.ElementTypeRef) - counter(b.c.et.ElementTypeRef) || a.i - b.i).map(x => x.c)
  const session = []
  for (const [k, c] of order.entries()) {
    const later = new Set(order.slice(k).map(x => lc(x.et.ElementTypeRef)))
    for (const mode of MODES) {
      const got = mode === 'session' ? propose(p, c, mode, later, process.env.NO_SITTING ? [] : session) : propose(p, c, mode)
      if (mode === 'session') session.push({ code: c.code, maker: c.maker, proposed: { family: got.family, ref: got.ref, name: got.name }, kept: { family: c.et.Family, ref: c.et.ElementTypeRef, name: c.et.Name } })
      const ok = {
        family: lc(got.family) === lc(c.et.Family),
        ref: stem(got.ref) === stem(c.et.ElementTypeRef),
        head: head(got.ref) === head(c.et.ElementTypeRef),
        name: lc(got.name) === lc(c.et.Name),
      }
      for (const t of [per[mode], total[mode]]) {
        t.n++; for (const k of ['family', 'head', 'ref', 'name']) t[k] += ok[k] ? 1 : 0
        const w = (t.why[got.why || 'none'] ||= { n: 0, family: 0, ref: 0 }); w.n++; w.family += ok.family; w.ref += ok.ref
      }
      rows.push({ project: p.project, mode, code: c.code, maker: c.maker, truth: { ref: c.et.ElementTypeRef, family: c.et.Family, name: c.et.Name },
        got: { ref: got.ref, family: got.family, name: got.name, why: got.why, flag: got.checkRef }, ok })
    }
  }
  const pct = (t, k) => (t.n ? Math.round(100 * t[k] / t.n) : 0)
  const t0 = Object.values(per)[0]
  if (t0.n) console.log(`${p.project.padEnd(5)} n=${String(t0.n).padStart(3)}  ` + MODES.map(m => `${m} fam ${pct(per[m], 'family')}% head ${pct(per[m], 'head')}% ref ${pct(per[m], 'ref')}% name ${pct(per[m], 'name')}%`).join('   '))
}
for (const mode of MODES) {
  const t = total[mode]
  console.log(`\nALL ${mode}: n=${t.n} family ${Math.round(100 * t.family / t.n)}% head ${Math.round(100 * t.head / t.n)}% ref ${Math.round(100 * t.ref / t.n)}% name ${Math.round(100 * t.name / t.n)}%`)
  for (const [w, v] of Object.entries(t.why).sort((a, b) => b[1].n - a[1].n)) console.log(`   ${w.padEnd(9)} n=${String(v.n).padStart(4)} family ${Math.round(100 * v.family / v.n)}% ref ${Math.round(100 * v.ref / v.n)}%`)
}
if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(rows))
