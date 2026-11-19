/**
 * formNotes.js — Form Template Notes (NAL5HU). Pure.
 *
 * A note is the builder saying something about the Form, for whoever owns it:
 *   cell        a note on one Form value; changes nothing
 *   notNeeded   the Form asks for this code, the recipe doesn't need it: settled, counts as done
 *   wrongCode   the Form's code is wrong, `shouldBe` is right: the painter uses `shouldBe`
 *   missing     the recipe holds this ElementType and the Form should list it: settled
 *   wholeEntry  this PositionType's Form entry is wrong: set aside, the recipe alone decides
 *
 * Notes never edit the import. applyFormNotes() reshapes what the readers see, so every
 * check (pip, rail, chip, worklist, pane) follows without its own filter.
 *
 * Shape: { key, posRef, formRef, kind, column?, code?, et?, manufacturer?, desc?, formText, note, shouldBe? }
 */
import { makeRow, findProductET } from './productCodes'
import { rowCells } from './formPositions'
import { codeKey } from './derived'

const up = codeKey
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function noteKey(n) {
  if (n.kind === 'cell') return `${n.posRef}|cell|${n.column}|${n.formText}`
  if (n.kind === 'missing') return `${n.posRef}|et|${up(n.et)}`
  if (n.kind === 'wholeEntry') return `${n.posRef}|entry`
  return `${n.posRef}|code|${up(n.code || n.et)}`   // notNeeded and wrongCode: one per code
}

/** Where `code` sits in `text` as a whole word (not inside a longer code): its index, or -1. */
export function wordAt(text, code) {
  if (!code) return -1
  const m = new RegExp(`(?<![A-Za-z0-9])${esc(code)}(?![A-Za-z0-9])`, 'i').exec(String(text ?? ''))
  return m ? m.index : -1
}

const strip = (text, code) => {
  const i = wordAt(text, code)
  return (i < 0 ? String(text ?? '') : String(text).slice(0, i) + String(text).slice(i + code.length)).replace(/\s+/g, ' ').trim()
}

/** One row with `from` replaced by `to`. Painted rows (tokens) keep their paint around it. */
function fixRow(r, from, to) {
  const raw = String(r.rawText ?? '')
  const at = wordAt(raw, from)
  if (at < 0) return r
  const end = at + from.length
  const text = raw.slice(0, at) + to + raw.slice(end)
  const delta = to.length - from.length
  const base = {
    ...r, rawText: text,
    accFrom: r.accFrom != null && r.accFrom > at ? r.accFrom + delta : r.accFrom,
    leadCode: r.leadCode && up(r.leadCode) === up(from) ? to : r.leadCode,
    noteOverride: r.noteOverride && from in r.noteOverride && !(to in r.noteOverride)
      ? Object.fromEntries(Object.entries(r.noteOverride).map(([k, v]) => [k === from ? to : k, v])) : r.noteOverride,
    _rawText: r._rawText ?? raw, _rawAccFrom: r._rawAccFrom !== undefined ? r._rawAccFrom : r.accFrom,
    _fixes: [...(r._fixes || []), { from, to }],
  }
  if (!r.tokens) return base   // a saved draft row: text only
  const next = makeRow(r.id, text, { positionType: r.positionType, manufacturer: r.manufacturer, context: r.context })
  // Overrides are by token index: before the code they stand, after it they shift, the code is painted code.
  const a = r.tokens.findIndex(t => t.end > at)
  const b = r.tokens.findLastIndex(t => t.start < end)
  const nb = next.tokens.findLastIndex(t => t.start < at + to.length)
  const shift = nb - b
  const overrides = {}
  for (const [k, v] of Object.entries(r.overrides || {})) {
    const i = Number(k)
    if (i < a) overrides[i] = v
    else if (i > b) overrides[i + shift] = v
  }
  for (let i = a; i <= nb; i++) overrides[i] = 'code'
  return { ...next, ...base, tokens: next.tokens, roles: next.roles, overrides }
}

/** The rows with every wrong code (of their own Form ref) replaced by what it should be. */
export function correctRows(rows, notes = []) {
  const fixes = (notes || []).filter(n => n.kind === 'wrongCode' && n.code && n.shouldBe)
  if (!fixes.length || !rows) return rows
  return rows.map(r => fixes.filter(n => up(n.formRef) === up(r.positionType))
    .reduce((row, n) => fixRow(row, n.code, n.shouldBe), r))
}

/**
 * What the Form says now about the thing a note is on: 'ok', 'stale' (changed since: `then`
 * and `now`, to ask once) or 'gone' (the note's subject has left the Form: it clears itself).
 */
export function noteState(n, draft, formCaptures = null) {
  if (n.kind === 'missing') {
    const listed = (formCaptures?.byPosition?.[n.posRef] || []).some(e => up(e.elementTypeRef) === up(n.et))
    return { state: listed ? 'gone' : 'ok' }
  }
  if (!draft?.rows?.length) return { state: 'ok' }
  const rows = draft.rows.filter(r => up(r.positionType) === up(n.formRef))
  if (!rows.length) return { state: 'gone' }
  if (n.kind === 'wholeEntry') {
    const now = rows.map(r => String(r.rawText ?? '').trim()).join(' / ')
    return now === n.formText ? { state: 'ok' } : { state: 'stale', then: n.formText, now }
  }
  if (n.kind === 'cell') {
    const vals = rows.map(r => rowCells(r, draft.map).find(c => c.col === n.column)?.value).filter(v => v != null)
    if (vals.includes(n.formText)) return { state: 'ok' }
    return vals.length ? { state: 'stale', then: n.formText, now: vals[0] } : { state: 'gone' }
  }
  if (!n.code) return { state: 'ok' }
  const hit = rows.find(r => wordAt(r.rawText, n.code) >= 0)
  if (!hit) return { state: 'gone' }
  if (n.kind === 'wrongCode') return { state: 'ok' }
  const then = strip(n.formText, n.code), now = strip(hit.rawText, n.code)
  return then === now ? { state: 'ok' } : { state: 'stale', then, now }
}

/** Notes still about something on the Form, with their state. */
export function liveNotes(notes, draft, formCaptures) {
  return (notes || []).map(n => ({ ...n, ...noteState(n, draft, formCaptures) })).filter(n => n.state !== 'gone')
}

/**
 * The import and captures as the notes say they should be read.
 *   draft     wrong codes corrected; `settledCodes[POS]` (not needed) and `setAside` (POS) added
 *   captures  not-needed codes and set-aside positions dropped, missing ETs no longer orphans,
 *             a wrong code swapped for its right one (and promoted when the spec knows it)
 */
export function applyFormNotes({ importDraft, formCaptures, psRows = [] }, notes = []) {
  if (!notes?.length) return { importDraft, formCaptures }
  const live = liveNotes(notes, importDraft, formCaptures)
  const settledCodes = {}
  const setAside = new Set()
  for (const n of live) {
    if (n.kind === 'notNeeded' && n.code) (settledCodes[up(n.posRef)] ||= new Set()).add(up(n.code))
    if (n.kind === 'wholeEntry') setAside.add(up(n.posRef))
  }
  const draft = importDraft && { ...importDraft, rows: correctRows(importDraft.rows, live), settledCodes, setAside }
  if (!formCaptures) return { importDraft: draft, formCaptures }

  const by = { ...(formCaptures.byPosition || {}) }
  const pend = { ...(formCaptures.pendingByPosition || {}) }
  const orph = { ...(formCaptures.orphansByPosition || {}) }
  const notThis = n => e => !(n.code ? up(e.code) === up(n.code) : up(e.elementTypeRef) === up(n.et))
  for (const n of live) {
    const p = n.posRef
    if (n.kind === 'wholeEntry') { delete by[p]; delete pend[p]; delete orph[p] }
    else if (n.kind === 'notNeeded') {
      if (by[p]) by[p] = by[p].filter(notThis(n))
      if (pend[p] && n.code) pend[p] = pend[p].filter(notThis(n))
    } else if (n.kind === 'missing') {
      if (orph[p]) orph[p] = orph[p].filter(ref => up(ref) !== up(n.et))
    } else if (n.kind === 'wrongCode' && n.shouldBe) {
      const is = e => up(e.code) === up(n.code)
      const etOf = e => findProductET(psRows, e.manufacturer, n.shouldBe)
      // The old code's ElementType is not the right code's. An unknown right code leaves the captures:
      // the corrected Form row now needs painting, so the painter's own card asks for it (one card, not two).
      if (by[p]) by[p] = by[p].filter(e => !is(e) || etOf(e)).map(e => (is(e) ? { ...e, code: n.shouldBe, elementTypeRef: etOf(e) } : e))
      const moving = (pend[p] || []).filter(is)
      if (moving.length) {
        pend[p] = pend[p].filter(e => !is(e) || !etOf(e)).map(e => (is(e) ? { ...e, code: n.shouldBe } : e))
        for (const e of moving.filter(etOf)) {
          const ref = etOf(e)
          if (!(by[p] || []).some(x => up(x.elementTypeRef) === up(ref))) by[p] = [...(by[p] || []), { ...e, code: n.shouldBe, elementTypeRef: ref }]
        }
      }
    }
  }
  return { importDraft: draft, formCaptures: { ...formCaptures, byPosition: by, pendingByPosition: pend, orphansByPosition: orph } }
}

/** The changed part of `to` against `from`: [same prefix, removed, added, same suffix]. */
export function diffParts(from, to) {
  const a = String(from ?? ''), b = String(to ?? '')
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  let j = 0
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++
  return [a.slice(0, i), a.slice(i, a.length - j), b.slice(i, b.length - j), a.slice(a.length - j)]
}

// The export asks; the app states (Erik: the builder has decided, the Form owner has not).
const ORDER = ['wholeEntry', 'notNeeded', 'wrongCode', 'missing', 'cell']
const day = at => new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

function bullet(n) {
  if (n.kind === 'wholeEntry') return `**Whole entry wrong?** · ${n.posRef} entry set aside`
  if (n.kind === 'notNeeded') {
    return `**Not needed?** · \`${n.code || n.et}\`${n.et && n.code ? ` → ${n.et}` : ''}`
      + `${!n.et && n.manufacturer ? ` (${n.manufacturer})` : ''}${!n.et && n.desc ? ` “${n.desc}”` : ''}`
  }
  if (n.kind === 'wrongCode') return `**Wrong code?** · ${n.column || 'ProductCode'} \`${n.code}\`, should it be \`${n.shouldBe}\`?`
  if (n.kind === 'missing') return `**Missing from Form?** · ${n.et} (in the recipe)`
  return `**Note** · ${n.column} “${n.formText}”`
}

/**
 * formNotesToMarkdown(notes, { project, sourceName, importedAt, positionNames, today, gone })
 * One section per position, notes in a fixed order, each note's text indented under it.
 * `gone`: notes whose subject has left the Form since, listed as fixed.
 */
export function formNotesToMarkdown(notes = [], { project = '', sourceName = '', importedAt = null, positionNames = {}, today = new Date(), gone = [] } = {}) {
  const all = [...notes.map(n => ({ n, fixed: false })), ...gone.map(n => ({ n, fixed: true }))]
  const out = [`# Form Template Notes${project ? ` · ${project}` : ''} · ${day(today)}`]
  if (sourceName) out.push(`Form: ${sourceName}${importedAt ? `, imported ${day(importedAt)}` : ''}`)
  const refs = [...new Set(all.map(x => x.n.posRef))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  for (const ref of refs) {
    out.push('', `## ${ref}${positionNames[ref] ? ` · ${positionNames[ref]}` : ''}`)
    const here = all.filter(x => x.n.posRef === ref).sort((a, b) => a.fixed - b.fixed || ORDER.indexOf(a.n.kind) - ORDER.indexOf(b.n.kind))
    for (const { n, fixed } of here) {
      out.push(`- ${fixed ? `**Fixed in the Form** · ${bullet(n).replace(/^\*\*.*?\*\* · /, '')}` : bullet(n)}`)
      for (const line of String(n.note || '').trim().split('\n').filter(Boolean)) out.push(`  ${line}`)
    }
  }
  return `${out.join('\n')}\n`
}

/** (formRef, code) → is that code marked not needed there? For the import screen, which works in Form refs. */
export function notNeededIn(notes = []) {
  const s = new Set((notes || []).filter(n => n.kind === 'notNeeded' && n.code).map(n => `${up(n.formRef)}|${up(n.code)}`))
  return (formRef, code) => s.has(`${up(formRef)}|${up(code)}`)
}

/** The word that changed between two cell values, when only one did; else the whole values. */
export function changedWord(from, to) {
  const a = String(from ?? '').trim().split(/\s+/), b = String(to ?? '').trim().split(/\s+/)
  const diff = a.map((w, i) => i).filter(i => a[i] !== b[i])
  return a.length === b.length && diff.length === 1 ? [a[diff[0]], b[diff[0]]] : [a.join(' '), b.join(' ')]
}
