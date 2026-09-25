#!/usr/bin/env node
/**
 * build-code-shapes.mjs — rebuild src/data/codeShapes.json from real examples.
 *
 *   node scripts/build-code-shapes.mjs \
 *     --catalogue "LEDFlex - New SKUs December 2025.xlsx" --maker LEDFlex \
 *     --project "LIGHTING.DesignDB~V4.5.xlsx" "ProductSpecForm~V3.xlsx" \
 *     [--out src/data/codeShapes.json]
 *
 * --catalogue  a supplier SKU-change workbook: any sheet whose header row has "New Item Code"
 *              (and optionally "Old Item code", "…Category", "New Description"). New codes are
 *              current; old codes are marked superseded. Repeat with its own --maker.
 * --examples   a JSON list [{ maker, code, family, head }] — e.g. the output of
 *              scripts/kaizen-scope-examples.mjs (Kaizen lighting Scope Spec sheets).
 * --project    a DesignDB and its Product Spec. Each product's ElementType family is mapped
 *              to the company canon (src/data/etCanon.js) — directly, or from its name and
 *              description; products that map to nothing are skipped.
 *
 * The output holds shapes only (see src/utils/codeShapes.js): maker, shape, family, ref head,
 * how many examples agreed, and one masked example (SL####A#-###xx). No real codes, project
 * names, refs or descriptions.
 * Existing shapes are kept unless this run produces the same (maker, shape, status).
 */
import fs from 'node:fs'
import path from 'node:path'
import * as XLSX from 'xlsx'
import { parseDb, parsePs } from '../src/platform/xlsx.js'
import { CANON_FAMILIES, classifyText } from '../src/data/etCanon.js'
import { buildShapes, makerKey, maskCode } from '../src/utils/codeShapes.js'

const args = process.argv.slice(2)
const catalogues = [], projects = [], exampleFiles = []
let out = 'src/data/codeShapes.json'
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--catalogue') catalogues.push({ file: args[++i], maker: args[i + 1] === '--maker' ? (i += 2, args[i]) : '' })
  else if (args[i] === '--project') projects.push({ db: args[++i], ps: args[++i] })
  else if (args[i] === '--examples') exampleFiles.push(args[++i])
  else if (args[i] === '--out') out = args[++i]
}
if (!catalogues.length && !projects.length && !exampleFiles.length) {
  console.error('Nothing to learn from: pass --catalogue <xlsx> --maker <name>, --project <db.xlsx> <ps.xlsx>, and/or --examples <json>')
  process.exit(1)
}

const canon = new Map(CANON_FAMILIES.map(f => [f.ref.toLowerCase(), f.ref]))
const examples = []

for (const { file, maker } of catalogues) {
  if (!maker) throw new Error(`--catalogue ${file}: give its --maker`)
  const wb = XLSX.read(fs.readFileSync(file))
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' })
    const hi = rows.findIndex(r => r.some(v => /new item code/i.test(String(v))))
    if (hi < 0) continue
    const h = rows[hi].map(v => String(v).toLowerCase())
    const col = re => h.findIndex(v => re.test(v))
    const cNew = col(/new item code/), cOld = col(/old item code/), cDesc = col(/new description/), cCat = col(/category/)
    for (const r of rows.slice(hi + 1)) {
      const code = String(r[cNew] ?? '').trim()
      if (!code) continue
      const c = classifyText(`${r[cDesc] ?? ''} ${cCat >= 0 ? r[cCat] : ''}`)
      if (!c) continue
      examples.push({ maker, code, family: c.family, head: c.head, from: 'catalogue' })
      const old = cOld >= 0 ? String(r[cOld] ?? '').trim() : ''
      if (old && old.toUpperCase() !== code.toUpperCase()) examples.push({ maker, code: old, family: c.family, head: c.head, status: 'superseded', from: 'catalogue' })
    }
  }
}

let projectCount = 0
for (const { db, ps } of projects) {
  const d = parseDb(fs.readFileSync(db))
  const spec = parsePs(fs.readFileSync(ps))
  const ets = new Map(d.element_types.map(e => [String(e.ElementTypeRef).toLowerCase(), e]))
  for (const row of spec) {
    if (row.IsDeleted === 'Y') continue
    const et = ets.get(String(row.ElementTypeRef).toLowerCase())
    const maker = String(row.Manufacturer ?? '').trim()
    const code = String(row.ProductCode ?? '').trim()
    if (!et || !maker || !code || /^(n\/a|tbc)$/i.test(code)) continue
    const fromText = classifyText(`${et.Name ?? ''} ${et.Description ?? ''} ${et.ElementTypeRef}`)
    const family = canon.get(String(et.Family ?? '').toLowerCase()) || fromText?.family
    if (!family) continue
    examples.push({ maker, code, family, head: fromText?.family === family ? fromText.head : family })
  }
  projectCount++
}

// Ready-made examples, e.g. from scripts/kaizen-scope-examples.mjs: [{ maker, code, family, head }].
for (const file of exampleFiles) {
  for (const ex of JSON.parse(fs.readFileSync(file, 'utf8'))) {
    if (ex.maker && ex.code && canon.has(String(ex.family).toLowerCase())) examples.push({ maker: ex.maker, code: ex.code, family: ex.family, head: ex.head || ex.family })
  }
}

const learned = buildShapes(examples)
const key = s => `${makerKey(s.maker)}|${s.shape}|${s.status}|${s.level}`
let previous = []
try { previous = JSON.parse(fs.readFileSync(out, 'utf8')).shapes || [] } catch { /* first build */ }
const merged = new Map(previous.map(s => [key(s), s]))
for (const s of learned) merged.set(key(s), s)
// The table is published with the app: examples are masked (SL####A#-###xx), never real codes.
const shapes = [...merged.values()].map(s => ({ ...s, example: maskCode(s.example) })).sort((a, b) =>
  a.maker.toLowerCase().localeCompare(b.maker.toLowerCase()) || a.shape.localeCompare(b.shape) || a.status.localeCompare(b.status) || a.level.localeCompare(b.level))

fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify({
  version: 1,
  note: 'Generated by scripts/build-code-shapes.mjs. Shapes only: maker, code shape, canon family, ref head, agreement, one masked example.',
  updatedAt: new Date().toISOString().slice(0, 10),
  shapes,
}, null, 2) + '\n')
console.log(`${examples.length} examples (${catalogues.length} catalogue(s), ${projectCount} project(s), ${exampleFiles.length} example file(s)) → ${learned.length} shapes learned, ${shapes.length} in ${out}`)
