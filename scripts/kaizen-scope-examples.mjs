#!/usr/bin/env node
/**
 * kaizen-scope-examples.mjs — turn Kaizen lighting Scope Spec rows into shape examples.
 *
 *   node scripts/kaizen-scope-examples.mjs raw1.json [raw2.json …] > examples.json
 *   node scripts/build-code-shapes.mjs --examples examples.json
 *
 * INPUT is the saved output of this Kaizen `run_sql` (one row, `rows` = newline-joined lines of
 * `notes|ElementTypeRef|ParentRef|Name|Description`), over the lighting Scope Spec delivery
 * sheets (find_delivery "Scope Spec"; each sheet's delivery_id and pinned set_id):
 *
 *   WITH s(did, sid) AS (SELECT * FROM (VALUES (<delivery_id>,<set_id>), …) v(did,sid))
 *   SELECT COUNT(*) AS n, STRING_AGG(CAST(
 *       REPLACE(REPLACE(REPLACE(dc.ProgressNotesText, CHAR(13), ''), CHAR(10), ' ;; '),'|','/')
 *       + '|' + et.Ref + '|' + ISNULL(par.Ref,'') + '|' + ISNULL(LEFT(et.Name,60),'')
 *       + '|' + ISNULL(LEFT(REPLACE(REPLACE(et.Description,CHAR(10),' '),'|','/'),50),'')
 *     AS nvarchar(max)), CHAR(10)) AS rows
 *   FROM s JOIN SystemDeliveryCodes dc ON dc.SystemDeliveryID = s.did AND dc.IsDeleted IS NULL
 *        AND LEN(ISNULL(dc.ProgressNotesText,'')) > 3
 *   JOIN SystemSetElementTypes et ON et.SystemCodeID = dc.SystemCodeID AND et.SystemSetID = s.sid
 *        AND et.IsSetDeleted IS NULL
 *   LEFT JOIN SystemSetElementTypes par ON par.SystemCodeID = et.ParentSystemCodeID AND par.SystemSetID = s.sid
 *
 * The notes hold "Maker CODE" / "Maker - CODE", or recipe lines "* (n) Maker CODE `ET-REF`".
 * Each (maker, code) is given a COMPANY family (src/data/etCanon.js) from its ElementType's
 * family, ref or text; anything that maps to no lighting family (AV kit on a combined sheet,
 * cables, client-supplied items) is dropped, never guessed.
 *
 * OUTPUT: [{ maker, code, family, head }] — only what a shape needs. The raw input holds project
 * data and belongs outside the repo; so does this output.
 */
import fs from 'node:fs'
import { CANON_FAMILIES, classifyText } from '../src/data/etCanon.js'

const canon = new Map(CANON_FAMILIES.map(f => [f.ref.toLowerCase(), f.ref]))

/** A project's own family name → the company family it corresponds to, if any. */
function familyOf(parent, ref, text) {
  const p = String(parent || '').toUpperCase()
  const r = String(ref || '').toUpperCase()
  // Cables share their family name with AV (ET-CABLE) and carry no lighting product code.
  if (/CABLE/.test(p)) return null
  if (canon.has(p.toLowerCase()) && !/^ET-LIN(-INGREDIENTS)?$/.test(p)) return { family: canon.get(p.toLowerCase()), from: 'family' }
  // A linear ingredient's ref carries its keyword (Kaizen page 140959).
  const kw = r.match(/^ET-LIN-(TAPE|FLEX|FIXED|PROF|DIFF|CAP|CLIP|MOUNT|PLUG)\b/)
  if (kw) {
    const head = `ET-LIN-${kw[1]}`
    const family = { DIFF: 'ET-LIN-PROF', CAP: 'ET-LIN-PROF', PLUG: 'ET-CONNECTION' }[kw[1]] || head
    return { family, head }
  }
  if (/DRIVER/.test(p) && !/PIN/.test(r)) return { family: 'ET-DRIVER' }
  if (/^ET-C[CV][RL]?-/.test(r)) return { family: 'ET-DRIVER' }
  if (/CONNECT/.test(p) || /\dPIN|PLUG|SOCKET|STRAIN-RELIEF/.test(r)) return { family: 'ET-CONNECTION' }
  if (/^ET-PS\b/.test(p) || /^ET-PS-\d/.test(r)) return { family: 'ET-PS' }
  if (/^ET-LIN/.test(p) || /^ET-LIN/.test(r)) {
    const c = classifyText(text)
    if (c && c.family.startsWith('ET-LIN')) return { family: c.family, head: c.head }
  }
  return null
}

const lines = []
for (const file of process.argv.slice(2)) {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'))
  for (const row of d.rows || []) lines.push(...String(row.rows || '').split('\n'))
}

// Known makers, from ElementType names written "Maker - Product".
const makers = new Map()   // key (letters only, lower) -> spelling counts
const makerKey = m => String(m).toLowerCase().replace(/[^a-z0-9]/g, '')
for (const l of lines) {
  const name = l.split('|')[3] || ''
  const m = name.match(/^([A-Za-z][A-Za-z0-9&.' ]{1,30}?)\s+-\s+/)
  if (m) {
    const k = makerKey(m[1])
    if (!makers.has(k)) makers.set(k, new Map())
    makers.get(k).set(m[1].trim(), (makers.get(k).get(m[1].trim()) || 0) + 1)
  }
}
const spell = k => [...(makers.get(k) || new Map()).entries()].sort((a, b) => b[1] - a[1])[0]?.[0]

/** "LightGraphix LD72DR-C1-…" → { maker: 'Light Graphix', code: 'LD72DR-C1-…' } */
function splitMaker(s) {
  const t = s.replace(/^\*\s*(\(\d+\)\s*)?/, '').replace(/`[^`]*`/g, '').trim()
  const dash = t.match(/^(.{2,30}?)\s+-\s+(\S.*)$/)
  if (dash && makers.has(makerKey(dash[1]))) return { maker: spell(makerKey(dash[1])), code: dash[2].trim() }
  const words = t.split(/\s+/)
  for (let n = Math.min(3, words.length - 1); n >= 1; n--) {
    const k = makerKey(words.slice(0, n).join(' '))
    if (makers.has(k)) return { maker: spell(k), code: words.slice(n).join(' ').trim() }
  }
  return null
}

const out = new Map()
let kept = 0, dropped = 0
for (const l of lines) {
  const [notes, ref, parent, name, desc] = l.split('|')
  for (const part of String(notes || '').split(' ;; ').map(x => x.trim()).filter(Boolean)) {
    const tick = part.match(/`([^`]+)`/)
    const ownRef = tick ? tick[1] : ref
    const ownParent = tick && tick[1] !== ref ? '' : parent
    const mc = splitMaker(part)
    if (!mc || !mc.code || /^(tbc|n\/a|client supplied|by .+)$/i.test(mc.code)) { dropped++; continue }
    const code = mc.code.split(/\s+-\s+|,\s/)[0].trim()
    const fam = familyOf(ownParent, ownRef, `${name || ''} ${desc || ''} ${ownRef}`)
    if (!fam) { dropped++; continue }
    const key = `${makerKey(mc.maker)}|${code.toUpperCase()}`
    if (!out.has(key)) { out.set(key, { maker: mc.maker, code, family: fam.family, head: fam.head || fam.family }); kept++ }
  }
}
process.stderr.write(`${lines.length} rows → ${out.size} distinct lighting products (${dropped} parts dropped: not lighting, no maker, or placeholder)\n`)
process.stdout.write(JSON.stringify([...out.values()], null, 1) + '\n')
