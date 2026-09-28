/**
 * bugReports.js — alpha bug reports: a free-text note plus what was on screen when it was
 * written, so it can be traced. Kept on this computer (localStorage), across projects; each
 * report says which project it came from. Exported as Markdown to paste wherever reports go.
 *
 * Nothing here reads file contents: only what the clicked element shows and a few counts.
 */
import { CHANGELOG } from '../changelog'

const KEY = 'bugReports'
const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'
const clip = (s, n = 120) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t }
const live = r => (r.IsDeleted || r.isDeleted) !== 'Y'

const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'   // no 0/O, 1/I: read aloud without mix-ups

/** A 6-character random ID (e.g. K3F9QZ), so a report can be named on its own. */
export function newReportId(taken = []) {
  const used = new Set(taken)
  for (;;) {
    let id = ''
    const bytes = typeof crypto !== 'undefined' && crypto.getRandomValues ? crypto.getRandomValues(new Uint8Array(6)) : null
    for (let i = 0; i < 6; i++) id += ID_CHARS[(bytes ? bytes[i] : Math.floor(Math.random() * 256)) % ID_CHARS.length]
    if (!used.has(id)) return id
  }
}

/** The ID a report is shown by: its own, or one made from an older report's id. */
export const reportId = r => (/^[A-Z2-9]{6}$/.test(r?.id || '') ? r.id : String(r?.id || '').slice(-6).toUpperCase())

export function loadReports() {
  try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v : [] } catch { return [] }
}
export function saveReports(reports) {
  try { localStorage.setItem(KEY, JSON.stringify(reports)) } catch { /* private window: kept for this session only */ }
}

/** A short human label for an element: its accessible name, else its text. */
export function describeElement(el) {
  if (!el || el.nodeType !== 1) return ''
  const label = el.getAttribute('aria-label') || el.getAttribute('title')
  const tag = el.tagName.toLowerCase()
  const role = el.getAttribute('role') || (['button', 'a', 'input', 'select', 'textarea', 'th', 'td'].includes(tag) ? tag : '')
  const text = label || (tag === 'input' || tag === 'textarea' ? el.value || el.placeholder : el.textContent)
  return [role, clip(text, 60) && `“${clip(text, 60)}”`].filter(Boolean).join(' ')
}

const REF_RE = /\bET-[A-Z0-9][A-Z0-9-]*\b/gi

/**
 * What the right-click landed on, from the DOM.
 * → { element, areas, dialogs, row, refs }
 */
export function domContext(target) {
  const el = target && target.nodeType === 1 ? target : target?.parentElement
  const areas = []
  const attrs = {}
  for (let n = el; n && n !== document.body && areas.length < 6; n = n.parentElement) {
    const id = n.getAttribute?.('data-debug-id') || n.getAttribute?.('data-testid')
    if (id && !areas.includes(id)) areas.push(id)
    for (const a of ['data-code', 'data-active']) if (n.getAttribute?.(a) && !attrs[a]) attrs[a] = n.getAttribute(a)
  }
  const tr = el?.closest?.('tr')
  const row = tr ? [...tr.children].slice(0, 10).map(c => clip(c.textContent, 40)) : null
  const dialogs = [...document.querySelectorAll('.modal.show .modal-title')].map(t => clip(t.textContent, 60))
  const refs = [...new Set([el?.textContent || '', (row || []).join(' '), attrs['data-code'] || '']
    .join(' ').match(REF_RE) || [])].slice(0, 8)
  return { element: describeElement(el), areas, dialogs, row, refs, code: attrs['data-code'] || null }
}

/** What the app was doing: where you were and how big the project is. */
export function appContext(state, screen) {
  const recipes = (state.recipes || []).filter(live)
  return {
    screen: screen || null,
    project: state.projectLabel || state.projectNumber || (state.projectId != null ? `#${state.projectId}` : null),
    position: state.activePositionRef || null,
    elementType: state.activeETRef || null,
    teaching: state.teaching ? `${state.teaching.label} on ${state.teaching.posRef}` : null,
    form: state.formCaptures?.source?.name || (state.formCaptures ? 'attached' : null),
    counts: {
      positionTypes: (state.positionTypes || []).length,
      elementTypes: (state.elementTypes || []).length,
      recipeRows: recipes.length,
      specRows: (state.psRows || []).length,
      pendingChanges: (state.dbChanges || []).length + (state.psChanges || []).length + (state.rsChanges || []).length,
    },
  }
}

export function buildReport({ note, target, state, screen, trail = [], capture = true, now = new Date(), taken = [] }) {
  return {
    id: newReportId(taken),
    at: now.toISOString(),
    note: String(note || '').trim(),
    version: APP_VERSION,
    build: CHANGELOG[0]?.date || null,
    ...(capture ? {
      app: appContext(state, screen),
      dom: domContext(target),
      trail: trail.slice(-10),
      viewport: typeof window !== 'undefined' ? `${window.innerWidth}×${window.innerHeight}` : null,
    } : {}),
  }
}

const line = (k, v) => (v == null || v === '' || (Array.isArray(v) && v.length === 0) ? null : `- **${k}:** ${Array.isArray(v) ? v.join(' › ') : v}`)

/** All reports as one Markdown document, oldest first. */
export function reportsToMarkdown(reports, { title = 'Bug reports' } = {}) {
  const out = [`# ${title} (${reports.length})`, '']
  reports.forEach(r => {
    out.push(`## ${reportId(r)} · ${clip(r.note.split('\n')[0], 80) || '(no note)'}`, '')
    out.push(r.note || '_(no note)_', '')
    const a = r.app, d = r.dom
    const meta = [
      line('When', r.at?.replace('T', ' ').slice(0, 19)),
      line('Version', [r.version, r.build && `build ${r.build}`].filter(Boolean).join(', ')),
      a && line('Project', a.project),
      a && line('Screen', a.screen),
      d && line('Window', d.dialogs),
      a && line('Position', a.position),
      a && line('ElementType', a.elementType),
      a && line('Setting up', a.teaching),
      a && line('Form', a.form),
      d && line('Clicked', d.element),
      d && line('Area', d.areas.length ? d.areas.map(x => `\`${x}\``) : null),
      d && line('Refs', d.refs),
      d && line('Code', d.code),
      d?.row && line('Row', `| ${d.row.join(' | ')} |`),
      a && line('Counts', Object.entries(a.counts).map(([k, v]) => `${k} ${v}`).join(', ')),
      line('Viewport', r.viewport),
    ].filter(Boolean)
    if (meta.length) out.push(...meta, '')
    if (r.trail?.length) {
      out.push('<details><summary>Last clicks</summary>', '')
      r.trail.forEach(t => out.push(`1. ${t.at?.slice(11, 19) || ''} ${t.screen ? `[${t.screen}] ` : ''}${t.label}`))
      out.push('', '</details>', '')
    }
  })
  return out.join('\n')
}
