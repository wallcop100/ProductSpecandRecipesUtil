import React, { useMemo, useState, useEffect } from 'react'
import { Modal, Button, Form } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'

/**
 * ChangeSummaryModal — the hard gate before every write (T-Q1).
 *
 * Pops first whenever Export Changes or Update ElementTypes Table is
 * triggered; the write only proceeds via onConfirm. Summarised per entity in
 * plain action phrases — "Spec added, Marked TBC" for a Product Spec row,
 * "+2 added (…), −1 removed (…)" for a recipe — with a copiable Markdown
 * mirror. Scoped to the action:
 *   scope 'export' — Product Spec + Recipe Spec registries
 *   scope 'db'     — the DesignDB ElementTypes-table registry
 *
 * Without onConfirm it is a read-only review (supersedes the Product Spec
 * "Unsaved Changes" drawer).
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
  ].filter(s => s.lines.length > 0)
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

export default function ChangeSummaryModal({
  show, onHide, scope = 'export', onConfirm, confirmLabel, note, busy = false,
}) {
  const psChanges = useStore(s => s.psChanges)
  const rsChanges = useStore(s => s.rsChanges)
  const dbChanges = useStore(s => s.dbChanges)

  const [copied, setCopied] = useState(false)
  const [exportConfig, setExportConfig] = useState(false)
  useEffect(() => { if (show) { setCopied(false); setExportConfig(false) } }, [show])

  const sections = useMemo(
    () => buildSummary({ psChanges, rsChanges, dbChanges }, scope),
    [psChanges, rsChanges, dbChanges, scope]
  )
  const totalRows = sections.reduce((n, s) => n + s.lines.length, 0)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(summaryMarkdown(sections, SCOPE_LABEL[scope]))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable */ }
  }

  return (
    <Modal show={show} onHide={onHide} centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 15 }} className="d-flex align-items-center gap-2">
          <MaterialIcon name="fact_check" size={18} />
          Change summary — {SCOPE_LABEL[scope]}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ maxHeight: '55vh' }}>
        {note && <div className="text-muted mb-2" style={{ fontSize: 12 }}>{note}</div>}
        {sections.length === 0 && (
          <div className="text-muted small fst-italic">Nothing to write — there are no pending changes for this action.</div>
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
        {onConfirm && scope === 'export' && (
          <Form.Check
            type="checkbox" id="chsum-export-config" className="mt-2"
            style={{ fontSize: 12 }}
            label="Also export the app configuration (.config.yaml) beside the Excel files"
            checked={exportConfig}
            onChange={e => setExportConfig(e.target.checked)}
          />
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" size="sm" className="d-inline-flex align-items-center gap-1 me-auto"
          onClick={handleCopy} disabled={sections.length === 0}>
          <MaterialIcon name="content_copy" size={14} /> {copied ? 'Copied!' : 'Copy as Markdown'}
        </Button>
        <Button variant="secondary" size="sm" onClick={onHide}>{onConfirm ? 'Cancel' : 'Close'}</Button>
        {onConfirm && (
          <Button variant="primary" size="sm" disabled={busy || totalRows === 0}
            onClick={() => onConfirm({ exportConfig })}>
            {busy ? 'Writing…' : (confirmLabel || 'Confirm & write')}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  )
}
