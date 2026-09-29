/**
 * formDiff.js — what changed between two Form spreadsheets, row by row.
 *
 * The old side is the Form imported last time (kept when you re-import) or any older
 * spreadsheet you pick; the new side is the import on screen. Each new row is:
 *
 *   unchanged — same Form ref, same text and maker
 *   changed   — same Form ref, different text or maker (`prev` is the old row)
 *   new       — nothing under that ref is left to pair it with
 *
 * and old rows nobody paired with are `removed`. Rows are matched within a Form ref:
 * identical text first, then the most similar remaining text (a ref with several rows
 * pairs up sensibly), else in order. Pure.
 */

const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
const refKey = r => norm(r.formRef ?? r.positionType)
const words = s => new Set(norm(s).split(/[\s,;+/]+/).filter(Boolean))

/** The part of a row the diff looks at. */
export const diffRow = r => ({
  formRef: String(r.formRef ?? r.positionType ?? '').trim(),
  manufacturer: String(r.manufacturer ?? '').trim(),
  rawText: String(r.rawText ?? ''),
})

function similarity(a, b) {
  const A = words(a), B = words(b)
  if (!A.size && !B.size) return 1
  let n = 0
  for (const w of A) if (B.has(w)) n++
  return n / (A.size + B.size - n)
}

/**
 * matchForms(oldRows, newRows) → { rows: [{ state, prev }], removed: [oldRow], counts }
 * `rows[i]` is for newRows[i].
 */
export function matchForms(oldRows = [], newRows = []) {
  const out = newRows.map(() => ({ state: 'new', prev: null }))
  const byRef = new Map()
  oldRows.forEach((p, i) => {
    const k = refKey(p)
    if (!byRef.has(k)) byRef.set(k, [])
    byRef.get(k).push(i)
  })
  const used = new Set()
  const same = (a, b) => norm(a.rawText) === norm(b.rawText)
  const sameMaker = (a, b) => norm(a.manufacturer) === norm(b.manufacturer)

  // 1. Identical text under the same ref (the maker decides unchanged vs changed).
  newRows.forEach((r, i) => {
    const pool = (byRef.get(refKey(r)) || []).filter(j => !used.has(j))
    const j = pool.find(j => same(oldRows[j], r) && sameMaker(oldRows[j], r)) ?? pool.find(j => same(oldRows[j], r))
    if (j == null) return
    used.add(j)
    out[i] = { state: sameMaker(oldRows[j], r) ? 'unchanged' : 'changed', prev: oldRows[j] }
  })
  // 2. Same ref, different text: the most similar old row left, else the first.
  newRows.forEach((r, i) => {
    if (out[i].state !== 'new') return
    const pool = (byRef.get(refKey(r)) || []).filter(j => !used.has(j))
    if (!pool.length) return
    const j = pool.map(j => [j, similarity(oldRows[j].rawText, r.rawText)]).sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0]
    used.add(j)
    out[i] = { state: 'changed', prev: oldRows[j] }
  })
  const removed = oldRows.filter((_, j) => !used.has(j))
  const counts = { unchanged: 0, changed: 0, new: 0, removed: removed.length }
  for (const o of out) counts[o.state]++
  return { rows: out, removed, counts }
}

/** Word-level difference for display: [{ text, kind: 'same' | 'added' | 'removed' }]. */
export function wordDiff(before, after) {
  const a = String(before ?? '').split(/\s+/).filter(Boolean)
  const b = String(after ?? '').split(/\s+/).filter(Boolean)
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) {
    dp[i][j] = norm(a[i]) === norm(b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  }
  const out = []
  let i = 0, j = 0
  while (i < a.length && j < b.length) {
    if (norm(a[i]) === norm(b[j])) { out.push({ text: b[j], kind: 'same' }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) out.push({ text: a[i++], kind: 'removed' })
    else out.push({ text: b[j++], kind: 'added' })
  }
  while (i < a.length) out.push({ text: a[i++], kind: 'removed' })
  while (j < b.length) out.push({ text: b[j++], kind: 'added' })
  return out
}
