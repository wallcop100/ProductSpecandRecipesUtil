import React, { useMemo, useState, useEffect } from 'react'
import { Modal, Button } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { buildPsScript, buildRsScript, buildDbScript } from '../utils/patchScript'
import { ConceptHint, CONCEPTS } from './ConceptCard'
import MasterGapPanel from './MasterGapPanel'
import TutorialHint from '../tutorial/TutorialHint'

/**
 * ChangeSummaryModal — review every pending change, then copy the patch scripts.
 *
 * Export always emits all three: Product Spec, Recipe Spec, DesignDB ElementTypes.
 * Aligning one document without the others is exactly the drift this tool exists to
 * prevent, so there is no per-file "export".
 *
 * The review is on three tabs so the patch is one click away, never a long scroll:
 *   Changes  — every edit, with field-level before → after
 *   Patches  — the three scripts, copy and preview
 *   Resolve  — the alignment gaps to close before you export (only when there are any)
 */

const refOf = r => (r?.ElementTypeRef || r?.elementTypeRef || '')

// Human labels for the Product Spec fields we surface.
const PS_FIELD_LABELS = {
  ProductCode: 'Product code',
  Manufacturer: 'Manufacturer',
  ComponentDescription: 'Description',
  InternalNotesText: 'Notes',
}

// DesignDB ElementTypes columns.
const DB_FIELD_LABELS = {
  Name: 'Name',
  Description: 'Description',
  Details: 'Details',
  Family: 'ParentRef',
  IsCollection: 'Collection',
  SortOrder: 'Sort order',
}

const FLAG_LABELS = {
  IsDeleted: 'Deleted', IsTBC: 'TBC', IsPropertiesTBC: 'Properties TBC', IsCollection: 'Collection',
}

/** Field-level before → after for one PS/DB entry, for the detailed review. */
export function fieldChanges(entry) {
  const u = entry.updates || {}
  const before = entry.before || {}
  const show = v => (v == null || String(v).trim() === '') ? '' : String(v)
  const rows = []
  for (const [field, next] of Object.entries(u)) {
    if (field === 'ElementTypeRef') continue
    const from = show(before[field])
    const to = show(next)
    if (from === to) continue
    const label = PS_FIELD_LABELS[field] || DB_FIELD_LABELS[field] || FLAG_LABELS[field] || field
    rows.push({ field, label, from, to, flag: field in FLAG_LABELS })
  }
  return rows
}

/** Action phrases for one coalesced PS/DB entry (keyed by ElementType). */
function psPhrases(entry) {
  const u = entry.updates || {}
  const before = entry.before || {}
  const phrases = []

  if (u.IsDeleted === 'Y') return ['Marked IsDeleted']   // supersedes other edits
  if (entry._isNew) phrases.push('Spec added')

  if (u.IsTBC === 'Y') phrases.push('Marked TBC')
  else if (u.IsTBC === 'N') phrases.push('TBC cleared')
  if (u.IsPropertiesTBC === 'Y') phrases.push('Properties marked TBC')
  else if (u.IsPropertiesTBC === 'N') phrases.push('Properties TBC cleared')

  if (!entry._isNew) {
    for (const [field, val] of Object.entries(u)) {
      if (['IsDeleted', 'IsTBC', 'IsPropertiesTBC'].includes(field)) continue
      const label = PS_FIELD_LABELS[field] || field
      const had = before[field] != null && String(before[field]).trim() !== ''
      const cleared = val == null || String(val).trim() === ''
      phrases.push(cleared ? `${label} cleared` : had ? `${label} updated` : `${label} set`)
    }
  }

  if (phrases.length === 0) phrases.push('Changed')
  return phrases
}

/** Is this RS entry a removal (hard delete or soft IsDeleted)? */
function rsIsRemoval(entry) {
  if (entry.action === 'delete') return true
  if (entry.changedFields) return entry.changedFields.IsDeleted === 'Y'
  const row = entry.row || {}
  return (row.IsDeleted === 'Y' || row.isDeleted === 'Y')
}

/** Is this RS entry a brand-new append (never on disk, not deleted)? */
function rsIsAppend(entry) {
  if (entry.action === 'delete') return false
  if (entry.changedFields) return false        // field edit on an existing row
  const row = entry.row || {}
  if (row.IsDeleted === 'Y' || row.isDeleted === 'Y') return false
  return true
}

function unique(list) { return [...new Set(list.filter(Boolean))] }

/** PS/DB → [{ ref, kind, detail, fields }], one line per ElementType. */
function psLines(entries) {
  return (entries || [])
    .map(e => ({
      ref: e.elementTypeRef || '—',
      kind: (e.updates?.IsDeleted === 'Y') ? 'delete' : e._isNew ? 'add' : 'update',
      detail: psPhrases(e).join(', '),
      fields: fieldChanges(e),
    }))
    .sort((a, b) => a.ref.localeCompare(b.ref))
}

/** RS → [{ ref, detail }], one line per PositionType with added/removed refs. */
function rsLines(entries) {
  const byPos = new Map()
  for (const e of entries || []) {
    const ref = e.positionTypeRef || '—'
    if (!byPos.has(ref)) byPos.set(ref, { added: [], removed: [], changed: 0 })
    const g = byPos.get(ref)
    const etRef = refOf(e.row) || refOf(e.before)
    if (rsIsRemoval(e)) g.removed.push(etRef)
    else if (rsIsAppend(e)) g.added.push(etRef)
    else g.changed += 1
  }
  const lines = []
  for (const [ref, g] of byPos) {
    const added = unique(g.added)
    const removed = unique(g.removed)
    const parts = []
    if (added.length) parts.push(`+${added.length} added (${added.join(', ')})`)
    if (removed.length) parts.push(`−${removed.length} removed (${removed.join(', ')})`)
    if (g.changed) parts.push(`~${g.changed} changed`)
    if (parts.length) lines.push({ ref, detail: parts.join(', ') })
  }
  return lines.sort((a, b) => a.ref.localeCompare(b.ref))
}

export function buildSummary({ psChanges = [], rsChanges = [], dbChanges = [] } = {}) {
  // Unfilled primed slots are held back from export (T-E4) — not counted here
  const rsWritable = (rsChanges || []).filter(e => !(e.row && e.row.resolved === false))
  return [
    { key: 'ps', title: 'Product Spec — ElementTypes', lines: psLines(psChanges) },
    { key: 'rs', title: 'Recipe Spec — PositionTypes', lines: rsLines(rsWritable) },
    { key: 'db', title: 'DesignDB — ElementTypes table', lines: psLines(dbChanges) },
  ].filter(s => s.lines.length > 0)
}

/**
 * Changes that would REPLACE a value the DesignDB already holds.
 *
 * An insert (`_isNew`) overwrites nothing. An update whose `before` value is non-blank
 * does: the master said one thing, the patch will say another. Never silent.
 */
export function dbOverwrites(dbChanges = []) {
  const out = []
  for (const c of dbChanges) {
    if (c._isNew) continue
    for (const [field, next] of Object.entries(c.updates || {})) {
      const prev = c.before?.[field]
      if (prev == null || String(prev).trim() === '') continue
      if (String(prev) === String(next ?? '')) continue
      out.push({ ref: c.elementTypeRef, field, from: String(prev), to: String(next ?? '') })
    }
  }
  return out
}

export function summaryMarkdown(sections) {
  const out = ['## Change summary', '']
  for (const s of sections) {
    out.push(`### ${s.title}`)
    for (const l of s.lines) out.push(`- **${l.ref}** — ${l.detail}`)
    out.push('')
  }
  return out.join('\n').trimEnd() + '\n'
}

/**
 * The three patch files, with their generated scripts. Only files that actually have
 * changes (a non-empty script) are returned. The master learns about new ElementTypes
 * here or nowhere, so the DesignDB script always travels with the other two.
 */
function patchFilesFor({ psChanges, rsChanges, dbChanges }) {
  return [
    { key: 'ps', label: 'Product Spec', file: 'ProductSpec.xlsx', script: buildPsScript(psChanges) },
    { key: 'rs', label: 'Recipe Spec', file: 'RecipesSpec.xlsx', script: buildRsScript(rsChanges) },
    { key: 'db', label: 'DesignDB ElementTypes', file: 'DesignDB.xlsx', script: buildDbScript(dbChanges) },
  ].filter(f => f.script)
}

const KIND = {
  add:    { icon: 'add_circle', color: '#0f5132', label: 'new' },
  update: { icon: 'edit',       color: '#856404', label: 'edit' },
  delete: { icon: 'delete',     color: '#842029', label: 'removed' },
  recipe: { icon: 'tune',       color: '#495057', label: '' },
}

function TabBtn({ id, tab, onClick, count, warn, children }) {
  const active = tab === id
  const accent = warn ? '#842029' : '#0d6efd'
  return (
    <button type="button" onClick={() => onClick(id)}
      className="btn btn-sm border-0 rounded-0 d-inline-flex align-items-center gap-1 px-2"
      style={{
        fontSize: 12, fontWeight: active ? 600 : 400,
        color: active ? accent : '#6c757d',
        borderBottom: active ? `2px solid ${accent}` : '2px solid transparent',
      }}>
      {warn && <MaterialIcon name="warning" size={12} />}
      {children}
      {count > 0 && (
        <span className="rounded-pill px-1" style={{
          fontSize: 9, background: warn ? '#f8d7da' : '#e7f1ff', color: warn ? '#842029' : '#084298',
        }}>{count}</span>
      )}
    </button>
  )
}

/** One edited entity: the ref, what happened, and field-level before → after. */
function ChangeLine({ line, isRecipe }) {
  const k = KIND[isRecipe ? 'recipe' : (line.kind || 'update')]
  return (
    <div className="py-1 border-bottom" style={{ fontSize: 12 }}>
      <div className="d-flex align-items-center gap-2">
        <MaterialIcon name={k.icon} size={14} style={{ color: k.color, flexShrink: 0 }} />
        <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{line.ref}</span>
        {k.label && (
          <span className="rounded px-1" style={{ fontSize: 9, background: '#f1f3f5', color: k.color }}>{k.label}</span>
        )}
        <span className="text-muted ms-auto text-end" style={{ fontSize: 11 }}>{line.detail}</span>
      </div>
      {line.fields && line.fields.length > 0 && (
        <div className="ps-4 mt-1">
          {line.fields.map(f => (
            <div key={f.field} className="d-flex align-items-baseline gap-1" style={{ fontSize: 10 }}>
              <span className="text-muted" style={{ minWidth: 92, flexShrink: 0 }}>{f.label}</span>
              {f.from && (
                <>
                  <span style={{ textDecoration: 'line-through', color: '#b02a37' }}>{f.from}</span>
                  <MaterialIcon name="arrow_right_alt" size={12} className="text-muted" />
                </>
              )}
              <span style={{ color: f.to ? '#0f5132' : '#6c757d', fontStyle: f.to ? 'normal' : 'italic' }}>
                {f.to || '(cleared)'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ChangesTab({ sections }) {
  if (sections.length === 0) {
    return <div className="text-muted small fst-italic">
      No edits queued. Anything to fix up is on the Resolve tab.
    </div>
  }
  return sections.map(sec => (
    <div key={sec.key} className="mb-3">
      <div className="fw-semibold text-muted mb-1" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
        {sec.title}
      </div>
      {sec.lines.map(l => <ChangeLine key={l.ref} line={l} isRecipe={sec.key === 'rs'} />)}
    </div>
  ))
}

function PatchesTab({ files, copiedKey, previewKey, onCopy, onPreview }) {
  if (files.length === 0) return <div className="text-muted small fst-italic">Nothing to patch.</div>
  return (
    <>
      <div className="text-muted mb-2" style={{ fontSize: 11 }}>
        One script per file. Open it → <strong>Automate</strong> → <strong>New Script</strong> → paste → <strong>Run</strong>.
        Each is safe to run twice.
      </div>
      {files.map(f => (
        <div key={f.key} className="mb-2 rounded" style={{ border: '1px solid #e9ecef' }}>
          <div className="d-flex align-items-center gap-2 px-2 py-2">
            <MaterialIcon name="description" size={15} className="text-muted" style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{f.label}</div>
              <div className="text-muted" style={{ fontSize: 10 }}>paste into {f.file}</div>
            </div>
            <Button size="sm" variant="link" className="p-0" style={{ fontSize: 11 }}
              onClick={() => onPreview(previewKey === f.key ? null : f.key)}>
              {previewKey === f.key ? 'Hide' : 'Preview'}
            </Button>
            <Button size="sm" variant={copiedKey === f.key ? 'success' : 'outline-primary'}
              className="d-inline-flex align-items-center gap-1" style={{ fontSize: 11 }}
              onClick={() => onCopy(f.script, f.key)}>
              <MaterialIcon name="content_paste" size={13} /> {copiedKey === f.key ? 'Copied!' : 'Copy'}
            </Button>
          </div>
          {previewKey === f.key && (
            <pre className="m-0 px-2 py-2" style={{
              fontSize: 10, maxHeight: 220, overflow: 'auto', background: '#f8f9fa', borderTop: '1px solid #e9ecef',
            }}>{f.script}</pre>
          )}
        </div>
      ))}
    </>
  )
}

function ResolveTab({ gaps, overwrites, onFillWrappers }) {
  const clean = overwrites.length === 0 && gaps.specRows.wrappers.length === 0 &&
    gaps.specRows.products.length === 0 && gaps.dbRows.length === 0
  if (clean) {
    return (
      <div className="text-success small d-inline-flex align-items-center gap-1">
        <MaterialIcon name="check_circle" size={14} /> The three documents already agree.
      </div>
    )
  }
  return (
    <>
      {/* This patch will replace something the master already says. Never silent. */}
      {overwrites.length > 0 && (
        <div className="mb-3 px-2 py-2 rounded" style={{ background: '#f8d7da', border: '1px solid #f1aeb5' }}>
          <div className="fw-semibold d-flex align-items-center gap-1" style={{ fontSize: 11, color: '#842029' }}>
            <MaterialIcon name="warning" size={13} />
            {overwrites.length} DesignDB value{overwrites.length === 1 ? '' : 's'} will be overwritten
          </div>
          <div className="text-muted my-1" style={{ fontSize: 11 }}>
            The master already holds a value here. Running the ElementTypes patch replaces it.
          </div>
          <div style={{ fontSize: 10, maxHeight: 80, overflowY: 'auto' }}>
            {overwrites.map(o => (
              <div key={`${o.ref}.${o.field}`}>
                <span style={{ fontFamily: 'monospace' }}>{o.ref}</span>
                <span className="text-muted"> · {o.field}: </span>
                <span style={{ textDecoration: 'line-through', color: '#842029' }}>{o.from}</span>
                <span className="text-muted"> → </span>
                <span>{o.to}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* A wrapper's spec is fully determined, so one click is safe. */}
      {gaps.specRows.wrappers.length > 0 && (
        <div className="mb-3 px-2 py-2 rounded" style={{ background: '#fff3cd', border: '1px solid #f0e0a8' }}>
          <div className="fw-semibold d-flex align-items-center gap-1" style={{ fontSize: 11, color: '#856404' }}>
            <MaterialIcon name="inventory_2" size={13} />
            {gaps.specRows.wrappers.length} wrapper{gaps.specRows.wrappers.length === 1 ? '' : 's'} with no Product Spec row
          </div>
          <div className="text-muted my-1" style={{ fontSize: 11 }}>
            A wrapper is a virtual assembly — its contents are what you buy. It takes{' '}
            <span style={{ fontFamily: 'monospace' }}>Ideaworks / N/A</span>, so nothing here needs deciding.
          </div>
          <div style={{ fontFamily: 'monospace', fontSize: 10, color: '#6c757d', maxHeight: 60, overflowY: 'auto' }}>
            {gaps.specRows.wrappers.map(w => w.ref).join(', ')}
          </div>
          <Button size="sm" variant="outline-warning" className="mt-2" style={{ fontSize: 11 }}
            onClick={onFillWrappers}>
            <MaterialIcon name="playlist_add_check" size={13} /> Add {gaps.specRows.wrappers.length} wrapper
            spec row{gaps.specRows.wrappers.length === 1 ? '' : 's'}
          </Button>
        </div>
      )}

      {/* A real product needs a manufacturer and a code. A blank row is not progress. */}
      {gaps.specRows.products.length > 0 && (
        <div className="mb-3 px-2 py-2 rounded" style={{ background: '#fdecec', border: '1px solid #f5c2c7' }}>
          <div className="fw-semibold d-flex align-items-center gap-1" style={{ fontSize: 11, color: '#842029' }}>
            <MaterialIcon name="error" size={13} />
            {gaps.specRows.products.length} product{gaps.specRows.products.length === 1 ? '' : 's'} used in a recipe with no Product Spec row
          </div>
          <div className="text-muted my-1" style={{ fontSize: 11 }}>
            Each needs a manufacturer and a product code, which only you know. Open it in the Product
            Spec — appending a blank row would only trade one warning for another.
          </div>
          {gaps.specRows.products.map(p => (
            <div key={p.ref} className="d-flex align-items-baseline gap-2" style={{ fontSize: 10 }}>
              <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{p.ref}</span>
              <span className="text-muted">used by {p.usedBy.join(', ')}</span>
            </div>
          ))}
        </div>
      )}

      {/* The DesignDB is the master list. Each gap needs a family, guessed from siblings. */}
      <MasterGapPanel gaps={gaps} />
    </>
  )
}

export default function ChangeSummaryModal({ show, onHide }) {
  const psChanges = useStore(s => s.psChanges)
  const rsChanges = useStore(s => s.rsChanges)
  const dbChanges = useStore(s => s.dbChanges)
  const alignmentGaps = useStore(s => s.alignmentGaps)
  const fillWrapperSpecRows = useStore(s => s.fillWrapperSpecRows)

  const [tab, setTab] = useState('changes')
  const [copiedKey, setCopiedKey] = useState(null)
  const [previewKey, setPreviewKey] = useState(null)
  useEffect(() => { if (show) { setCopiedKey(null); setPreviewKey(null); setTab('changes') } }, [show])

  // Two invariants, one selector (see specAlignment): the DesignDB is the master, and a
  // recipe implies a spec.
  const gaps = useMemo(
    () => (show ? alignmentGaps() : { specRows: { wrappers: [], products: [] }, dbRows: [] }),
    [show, psChanges, rsChanges, dbChanges, alignmentGaps]
  )
  const overwrites = useMemo(() => dbOverwrites(dbChanges), [dbChanges])
  const sections = useMemo(() => buildSummary({ psChanges, rsChanges, dbChanges }), [psChanges, rsChanges, dbChanges])
  const patchFiles = useMemo(() => patchFilesFor({ psChanges, rsChanges, dbChanges }), [psChanges, rsChanges, dbChanges])

  // A master gap whose fix already sits in the ElementTypes patch is queued, not open —
  // it should not keep the "Resolve first" tab lit. (The panel itself shows the queued
  // count; the badge counts only what still needs a decision.)
  const queuedDb = useMemo(() => new Set(dbChanges.map(c => (c.elementTypeRef || '').toLowerCase())), [dbChanges])
  const openDbRows = gaps.dbRows.filter(d => !queuedDb.has((d.ref || '').toLowerCase())).length

  const changeCount = sections.reduce((n, sec) => n + sec.lines.length, 0)
  const resolveCount = overwrites.length + gaps.specRows.wrappers.length +
    gaps.specRows.products.length + openDbRows

  async function copy(text, key) {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(k => (k === key ? null : k)), 2000)
    } catch { /* clipboard unavailable */ }
  }

  const nothing = changeCount === 0 && resolveCount === 0 && patchFiles.length === 0

  return (
    <Modal show={show} onHide={onHide} centered scrollable size="lg">
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 15 }} className="d-flex align-items-center gap-2">
          <MaterialIcon name="fact_check" size={18} />
          Review changes before export
          <ConceptHint concept={CONCEPTS.READONLY} size={14} title="Why is there no Save button?" />
          <TutorialHint id="export" />
        </Modal.Title>
      </Modal.Header>

      {/* The patch is one click away on its own tab, never a long scroll past warnings. */}
      <div className="d-flex gap-1 px-3 pt-2" style={{ borderBottom: '1px solid #dee2e6' }}>
        <TabBtn id="changes" tab={tab} onClick={setTab} count={changeCount}>Changes</TabBtn>
        <TabBtn id="patches" tab={tab} onClick={setTab} count={patchFiles.length}>Patches</TabBtn>
        {resolveCount > 0 && (
          <TabBtn id="resolve" tab={tab} onClick={setTab} count={resolveCount} warn>Resolve first</TabBtn>
        )}
      </div>

      <Modal.Body style={{ minHeight: 260, maxHeight: '58vh' }}>
        {nothing
          ? <div className="text-muted small fst-italic">No pending changes.</div>
          : tab === 'changes' ? <ChangesTab sections={sections} />
          : tab === 'patches' ? (
              <PatchesTab files={patchFiles} copiedKey={copiedKey} previewKey={previewKey}
                onCopy={copy} onPreview={setPreviewKey} />
            )
          : <ResolveTab gaps={gaps} overwrites={overwrites} onFillWrappers={() => fillWrapperSpecRows()} />}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="outline-secondary" size="sm" className="d-inline-flex align-items-center gap-1 me-auto"
          onClick={() => copy(summaryMarkdown(sections), 'md')} disabled={sections.length === 0}>
          <MaterialIcon name="content_copy" size={14} /> {copiedKey === 'md' ? 'Copied!' : 'Copy summary'}
        </Button>
        {tab !== 'patches' && patchFiles.length > 0 && (
          <Button variant="primary" size="sm" className="d-inline-flex align-items-center gap-1"
            onClick={() => setTab('patches')}>
            <MaterialIcon name="content_paste" size={14} /> Get the {patchFiles.length} patch{patchFiles.length === 1 ? '' : 'es'}
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  )
}
