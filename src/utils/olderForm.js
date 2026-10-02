/**
 * olderForm.js — read an older revision of the Form to compare with (LH5EC2). Its columns
 * are found by the same header names as the loaded Form's mapping (else guessed); it is only
 * read, never imported. Used by Import and by the builder's Form spec pane.
 */
import { joinAccessories } from './accessories'

const nh = h => String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '')
function detect(headers, want) {
  const list = headers.filter(Boolean)
  return list.find(h => nh(h) === want)
    || list.filter(h => nh(h).includes(want)).sort((a, b) => a.length - b.length)[0]
    || ''
}
const isExcluded = v => { const s = String(v ?? '').trim(); return s !== '' && !/^(n|no|0|false)$/i.test(s) }

/**
 * readOlderForm(path, map, { readSheet, fileMeta }) → { name, rows } — throws with a
 * readable message when the sheet has no product code / PositionType column.
 */
export async function readOlderForm(path, map = {}, { readSheet, fileMeta }) {
  let data = await readSheet(path, null)
  const col = (mapped, want, hs) => (mapped && hs.includes(mapped) ? mapped : detect(hs, want))
  if (!col(map.code, 'productcode', data.headers || [])) {
    for (const sname of data.sheets || []) {
      if (sname === data.sheet) continue
      const alt = await readSheet(path, sname)
      if (col(map.code, 'productcode', alt.headers || [])) { data = alt; break }
    }
  }
  const hs = data.headers || []
  const c = {
    pt: col(map.pt, 'positiontype', hs), code: col(map.code, 'productcode', hs),
    mfr: col(map.mfr, 'manufacturer', hs), acc: col(map.acc, 'accessor', hs), exclude: col(map.exclude, 'exclude', hs),
  }
  if (!c.code || !c.pt) throw new Error(`That spreadsheet has no ${!c.code ? 'product code' : 'PositionType'} column to compare with.`)
  const rows = (data.rows || [])
    .filter(r => !(c.exclude && isExcluded(r[c.exclude])))
    .map(r => ({ formRef: String(r[c.pt] ?? '').trim(), manufacturer: String(r[c.mfr] ?? '').trim(),
      rawText: joinAccessories(r[c.code], c.acc ? r[c.acc] : null) }))
    .filter(r => r.rawText !== '')
  const meta = await fileMeta(path).catch(() => null)
  return { name: meta?.name || 'the older Form', rows }
}
