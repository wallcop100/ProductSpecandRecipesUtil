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

function propose(p, c, mode) {
  const hide = lc(c.et.ElementTypeRef)
  const keep = mode === 'loo'
  const elementTypes = keep ? p.elementTypes.filter(e => live(e) && lc(e.ElementTypeRef) !== hide) : []
  const psRows = keep ? p.psRows.filter(r => lc(r.ElementTypeRef) !== hide) : []
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
    roleOf: e => (e.lead ? 'lead' : 'extra'), library,
  })
  return proposals[0]
}

const tally = () => ({ n: 0, family: 0, head: 0, ref: 0, name: 0, why: {} })
const total = { loo: tally(), fresh: tally() }
const rows = []
for (const p of projects) {
  if (only.length && !only.includes(p.project)) continue
  const per = { loo: tally(), fresh: tally() }
  for (const c of cases(p)) {
    for (const mode of ['loo', 'fresh']) {
      const got = propose(p, c, mode)
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
  if (per.loo.n) console.log(`${p.project.padEnd(5)} n=${String(per.loo.n).padStart(3)}  loo fam ${pct(per.loo, 'family')}% head ${pct(per.loo, 'head')}% ref ${pct(per.loo, 'ref')}% name ${pct(per.loo, 'name')}%   fresh fam ${pct(per.fresh, 'family')}% ref ${pct(per.fresh, 'ref')}% name ${pct(per.fresh, 'name')}%`)
}
for (const mode of ['loo', 'fresh']) {
  const t = total[mode]
  console.log(`\nALL ${mode}: n=${t.n} family ${Math.round(100 * t.family / t.n)}% head ${Math.round(100 * t.head / t.n)}% ref ${Math.round(100 * t.ref / t.n)}% name ${Math.round(100 * t.name / t.n)}%`)
  for (const [w, v] of Object.entries(t.why).sort((a, b) => b[1].n - a[1].n)) console.log(`   ${w.padEnd(9)} n=${String(v.n).padStart(4)} family ${Math.round(100 * v.family / v.n)}% ref ${Math.round(100 * v.ref / v.n)}%`)
}
if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(rows))
