import React, { useMemo, useState, useEffect } from 'react'
import { Modal, Button } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { buildPsScript, buildRsScript, buildDbScript } from '../utils/patchScript'
import { ConceptHint, CONCEPTS } from './ConceptCard'
import MasterGapPanel from './MasterGapPanel'

/**
 * ChangeSummaryModal — review pending changes and copy per-file patch scripts.
 *
 * Opened by Export Changes / Update ElementTypes Table (and read-only from the
 * Product Spec changes chip). Summarises changes per entity in plain action
 * phrases — "Spec added, Marked TBC" for a Product Spec row, "+2 added (…),
 * −1 removed (…)" for a recipe — then offers a "Copy Patch for <file>" button
 * per changed file. The tool never writes the xlsx; the user runs each copied
 * script in Excel. Scoped to the action:
 *   scope 'export' — all three: Product Spec, Recipe Spec, DesignDB ElementTypes
 *   scope 'db'     — the DesignDB ElementTypes table alone
 *
 * Export aligns all three documents or it aligns none of them: an ElementType that
 * reaches the Product Spec without reaching the DesignDB master is exactly the drift
 * this tool exists to prevent.
 */

const refOf = r => (r?.ElementTypeRef || r?.elementTypeRef || '')

// Human labels for the Product Spec fields we surface.
const PS_FIELD_LABELS = {
  ProductCode: 'Product code',
  Manufacturer: 'Manufacturer',
  ComponentDescription: 'Description',
  InternalNotesText: 'Notes',
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

/** PS/DB → [{ ref, detail }], one line per ElementType. */
function psLines(entries) {
  return (entries || [])
    .map(e => ({ ref: e.elementTypeRef || '—', detail: psPhrases(e).join(', ') }))
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

export function buildSummary({ psChanges = [], rsChanges = [], dbChanges = [] }, scope) {
  if (scope === 'db') {
    return [{ title: 'DesignDB — ElementTypes table', lines: psLines(dbChanges) }]
      .filter(s => s.lines.length > 0)
  }
  // Unfilled primed slots are held back from export (T-E4) — not counted here
  const rsWritable = (rsChanges || []).filter(e => !(e.row && e.row.resolved === false))
  return [
    { title: 'Product Spec — ElementTypes', lines: psLines(psChanges) },
    { title: 'Recipe Spec — PositionTypes', lines: rsLines(rsWritable) },
    { title: 'DesignDB — ElementTypes table', lines: psLines(dbChanges) },
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

export function summaryMarkdown(sections, scopeLabel) {
  const out = [`## Change summary — ${scopeLabel}`, '']
  for (const s of sections) {
    out.push(`### ${s.title}`)
    for (const l of s.lines) out.push(`- **${l.ref}** — ${l.detail}`)
    out.push('')
  }
  return out.join('\n').trimEnd() + '\n'
}

const SCOPE_LABEL = {
  export: 'Product Spec & Recipe Spec',
  db: 'ElementTypes table (DesignDB)',
}

/**
 * Which patch files this scope produces, with their generated scripts.
 * Only files that actually have changes (non-empty script) are returned.
 */
function patchFilesFor(scope, { psChanges, rsChanges, dbChanges }) {
  const files = scope === 'db'
    ? [{ key: 'db', label: 'ElementTypes (DB)', script: buildDbScript(dbChanges) }]
    : [
        { key: 'ps', label: 'Product Spec', script: buildPsScript(psChanges) },
        { key: 'rs', label: 'Recipe Spec', script: buildRsScript(rsChanges) },
        // The master learns about new ElementTypes here or nowhere.
        { key: 'db', label: 'ElementTypes (DB)', script: buildDbScript(dbChanges) },
      ]
  return files.filter(f => f.script)
}

export default function ChangeSummaryModal({ show, onHide, scope = 'export', note }) {
  const psChanges = useStore(s => s.psChanges)
  const rsChanges = useStore(s => s.rsChanges)
  const dbChanges = useStore(s => s.dbChanges)

  const alignmentGaps = useStore(s => s.alignmentGaps)
  const fillWrapperSpecRows = useStore(s => s.fillWrapperSpecRows)

  const [copiedKey, setCopiedKey] = useState(null)
  useEffect(() => { if (show) setCopiedKey(null) }, [show])

  // Two invariants, one selector (see specAlignment):
  //   the DesignDB is the master   — everything in PS or RS must exist in it
  //   a recipe implies a spec      — everything a recipe uses must have a spec row
  const gaps = useMemo(
    () => (show && scope === 'export' ? alignmentGaps() : { specRows: { wrappers: [], products: [] }, dbRows: [] }),
    [show, scope, psChanges, rsChanges, dbChanges, alignmentGaps]
  )
  const overwrites = useMemo(() => dbOverwrites(dbChanges), [dbChanges])

  const sections = useMemo(
    () => buildSummary({ psChanges, rsChanges, dbChanges }, scope),
    [psChanges, rsChanges, dbChanges, scope]
  )
  const patchFiles = useMemo(
    () => patchFilesFor(scope, { psChanges, rsChanges, dbChanges }),
    [scope, psChanges, rsChanges, dbChanges]
  )

  async function copyPatch(file) {
    try {
      await navigator.clipboard.writeText(file.script)
      setCopiedKey(file.key)
      setTimeout(() => setCopiedKey(k => (k === file.key ? null : k)), 2000)
    } catch { /* clipboard unavailable */ }
  }

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(summaryMarkdown(sections, SCOPE_LABEL[scope]))
      setCopiedKey('md')
      setTimeout(() => setCopiedKey(k => (k === 'md' ? null : k)), 2000)
    } catch { /* clipboard unavailable */ }
  }

  return (
    <Modal show={show} onHide={onHide} centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 15 }} className="d-flex align-items-center gap-2">
          <MaterialIcon name="fact_check" size={18} />
          Change summary — {SCOPE_LABEL[scope]}
          <ConceptHint concept={CONCEPTS.READONLY} size={14}
            title="Why is there no Save button?" />
        </Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ maxHeight: '60vh' }}>
        {note && <div className="text-muted mb-2" style={{ fontSize: 12 }}>{note}</div>}

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
              onClick={() => fillWrapperSpecRows()}>
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

        {/* The DesignDB is the master list. Anything absent from it is drift — and each
            row needs a family, which is guessed from siblings, never inferred from the ref. */}
        <MasterGapPanel gaps={gaps} />

        {sections.length === 0 && gaps.dbRows.length === 0 &&
         gaps.specRows.wrappers.length === 0 && gaps.specRows.products.length === 0 && (
          <div className="text-muted small fst-italic">No pending changes for this action.</div>
        )}
        {sections.map(s => (
          <div key={s.title} className="mb-3">
            <div className="fw-semibold text-muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              {s.title}
            </div>
            {s.lines.map(l => (
              <div key={l.ref} className="d-flex align-items-baseline gap-2 py-1 border-bottom" style={{ fontSize: 12 }}>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, flexShrink: 0 }}>{l.ref}</span>
                <span className="ms-auto text-end" style={{ fontSize: 11, color: '#495057' }}>{l.detail}</span>
              </div>
            ))}
          </div>
        ))}

        {/* Copy-patch section — one script per changed file (T: export as patches) */}
        {patchFiles.length > 0 && (
          <div className="mt-3 pt-2 border-top">
            <div className="fw-semibold text-muted mb-2" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Apply these patches
            </div>
            {patchFiles.map(f => (
              <div key={f.key} className="d-flex align-items-center gap-2 py-1">
                <span style={{ fontSize: 12 }}>{f.label}</span>
                <Button
                  variant={copiedKey === f.key ? 'success' : 'outline-primary'}
                  size="sm"
                  className="ms-auto d-inline-flex align-items-center gap-1"
                  style={{ fontSize: 11 }}
                  onClick={() => copyPatch(f)}
                >
                  <MaterialIcon name="rebase_edit" size={14} />
                  {copiedKey === f.key ? 'Copied!' : `Copy Patch for ${f.label}`}
                </Button>
              </div>
            ))}
            <div className="text-muted mt-2" style={{ fontSize: 11 }}>
              Each patch is a script for its Excel file. To apply: open the file →
              <strong> Automate</strong> tab → <strong>New Script</strong> → paste → <strong>Run</strong>.
              The tool no longer edits the files itself.
            </div>
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" size="sm" className="d-inline-flex align-items-center gap-1 me-auto"
          onClick={copyMarkdown} disabled={sections.length === 0}>
          <MaterialIcon name="content_copy" size={14} /> {copiedKey === 'md' ? 'Copied!' : 'Copy summary (Markdown)'}
        </Button>
        <Button variant="secondary" size="sm" onClick={onHide}>Close</Button>
      </Modal.Footer>
    </Modal>
  )
}
