/**
 * How often jobOf and classifyText name different families for the same ElementType (docs/DERIVED.md).
 *   npx vite-node tools/classifier-agreement.mjs <dir of project JSON>   (same input as backtest-forms.mjs)
 * A: both given the same words (name + description), so only the table's own order differs.
 * B: what each caller really gets: jobOf with the row's ref, family and code; classifyText with its words.
 * The project's own Family is the referee, so "neither right" includes projects' own spellings.
 */
import fs from 'node:fs'
import path from 'node:path'
const m = await import('../src/utils/codeJobs.js')
const dir = process.argv[2]
const U = s => String(s ?? '').trim().toUpperCase()
const tally = {}, ex = {}, pair = {}
const pr = (k, a, b, t) => { const x = `${k}: ${a} vs ${b}`; (pair[x] ||= []).push(t) }
const bump = (k, e) => { tally[k] = (tally[k] || 0) + 1; (ex[k] ||= []).length < 4 && ex[k].push(e) }
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const p = JSON.parse(fs.readFileSync(path.join(dir, f)))
  const ps = new Map(p.psRows.map(r => [U(r.ElementTypeRef), r]))
  for (const e of p.elementTypes) {
    if (e.IsDeleted === 'Y') continue
    const r = ps.get(U(e.ElementTypeRef)) || {}
    const text = [e.Name, e.Description, r.Description].filter(Boolean).join(' ')
    const fam = U(e.Family)
    const full = m.familyForJob(m.jobOf({ ref: e.ElementTypeRef, family: e.Family, name: e.Name, description: e.Description, maker: r.Manufacturer, code: r.ProductCode, category: e.CategoryText }))?.family
    const same = m.familyForJob(m.jobOf({ name: text, shapes: [] }))?.family          // jobOf on the very same words
    const w = m.classifyText(text)?.family
    const tag = `${p.project}|${e.ElementTypeRef} fam=${fam} job=${full} words=${w}`
    bump('n', '')
    // A. same words in: does the table give one answer?
    if (same && w && same !== w) pr('A jobOf-words vs classifyText', same, w, `${p.project}|${e.ElementTypeRef}`)
    if (full && w && full !== w) pr('B jobOf-row vs classifyText', full, w, `${p.project}|${e.ElementTypeRef} fam=${fam}`)
    bump(`A ${!same && !w ? 'both none' : same === w ? 'agree' : !same ? 'words only (hint rule)' : !w ? 'job only' : 'DIFFER'}`, `${tag} jobWords=${same}`)
    // B. what each caller actually gets: jobOf with the row's full evidence vs classifyText of its words.
    if (!full && !w) bump('B both none', tag)
    else if (full === w) bump(`B agree ${fam === U(full) ? '(family right)' : '(family other)'}`, tag)
    else if (!full) bump(`B words only ${fam === U(w) ? '(right)' : '(wrong)'}`, tag)
    else if (!w) bump(`B job only ${fam === U(full) ? '(right)' : '(wrong)'}`, tag)
    else bump(`B DIFFER ${fam === U(full) ? 'job right' : fam === U(w) ? 'words right' : 'neither right'}`, tag)
  }
}
for (const k of Object.keys(tally).sort()) console.log(String(tally[k]).padStart(5), k, k === 'n' ? '' : '\n        ' + ex[k].slice(0, 3).join('\n        '))

for (const [k, v] of Object.entries(pair).sort((a, b) => b[1].length - a[1].length).slice(0, 40)) console.log(String(v.length).padStart(5), k, '  e.g.', v.slice(0, 2).join(', '))
