import React, { useState, useMemo } from 'react'
import { Form, Alert, Button, Badge } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { ACTION_ICONS } from '../utils/entityStyle'

/**
 * TemplatePicker — browsable list of templates with Apply / Add-connector buttons.
 *
 * Connector templates (scope='connector') appear in their own section at the
 * top. Applying them is additive (addConnection) and never replaces existing
 * rows. Regular templates (scope='project' / 'global') replace the full recipe
 * and show a confirmation when the position already has rows.
 *
 * Props:
 *   posRef      — active position ref
 *   activeTags  — current position's tags (string[])
 *   hasRows     — whether the position already has recipe rows
 *   onApply(templateId) — called after a regular template is applied
 */
export default function TemplatePicker({ posRef, activeTags, hasRows, onApply }) {
  const templates               = useStore(s => s.templates)
  const applyTemplate           = useStore(s => s.applyTemplate)
  const applyConnectorTemplate  = useStore(s => s.applyConnectorTemplate)

  const [search, setSearch]           = useState('')
  const [pendingApply, setPendingApply] = useState(null)
  const [connectorOpen, setConnectorOpen] = useState(true)

  function parseTags(raw) {
    if (Array.isArray(raw)) return raw
    try { return JSON.parse(raw || '[]') } catch { return [] }
  }

  function isMatch(tpl) {
    const tags = parseTags(tpl.applicable_tags)
    return tags.length > 0 && tags.every(t => activeTags.includes(t))
  }

  const q = search.toLowerCase().trim()

  const connectorTemplates = useMemo(() =>
    templates
      .filter(t => t.scope === 'connector')
      .filter(t => !q || t.name.toLowerCase().includes(q))
      .map(t => ({ ...t, _isMatch: isMatch(t) }))
      .sort((a, b) => (b._isMatch ? 1 : 0) - (a._isMatch ? 1 : 0))
  , [templates, q, activeTags])

  const enriched = useMemo(() =>
    templates
      .filter(t => t.scope !== 'connector')
      .filter(t => !q || t.name.toLowerCase().includes(q))
      .map(t => ({ ...t, _tags: parseTags(t.applicable_tags), _isMatch: isMatch(t) }))
  , [templates, q, activeTags])

  const projectTemplates = useMemo(() =>
    enriched
      .filter(t => t.scope === 'project')
      .sort((a, b) => (b._isMatch ? 1 : 0) - (a._isMatch ? 1 : 0))
  , [enriched])

  const globalTemplates = useMemo(() =>
    enriched
      .filter(t => t.scope === 'global')
      .sort((a, b) => (b._isMatch ? 1 : 0) - (a._isMatch ? 1 : 0))
  , [enriched])

  function handleApply(templateId) {
    if (hasRows) { setPendingApply(templateId); return }
    doApply(templateId)
  }

  function doApply(templateId) {
    if (!posRef) return
    applyTemplate(posRef, templateId)
    onApply(templateId)
    setPendingApply(null)
  }

  function handleAddConnector(templateId) {
    if (!posRef) return
    applyConnectorTemplate(posRef, templateId)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="p-2 border-bottom">
        <Form.Control
          type="text"
          size="sm"
          placeholder="Search templates…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {pendingApply && (
        <Alert variant="warning" className="mx-2 mt-2 mb-0 py-2 px-3" style={{ fontSize: 12 }}>
          <div className="mb-1 fw-semibold">Applying will replace the current recipe.</div>
          <div className="d-flex gap-2">
            <Button size="sm" variant="warning" onClick={() => doApply(pendingApply)}>Apply anyway</Button>
            <Button size="sm" variant="outline-secondary" onClick={() => setPendingApply(null)}>Cancel</Button>
          </div>
        </Alert>
      )}

      {!posRef && (
        <div className="text-muted small text-center py-3">
          Select a position to apply templates.
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>

        {/* ── Connector templates ─────────────────────────────────────── */}
        {connectorTemplates.length > 0 && (
          <div
            className="mb-3 rounded"
            style={{ border: '1px solid #c3e6cb', background: '#f0fff4' }}
          >
            {/* Section header */}
            <div
              className="d-flex align-items-center gap-1 px-2 py-1"
              style={{ cursor: 'pointer', userSelect: 'none', borderBottom: '1px solid #c3e6cb' }}
              onClick={() => setConnectorOpen(v => !v)}
            >
              <MaterialIcon name={connectorOpen ? ACTION_ICONS.expand : ACTION_ICONS.collapse} size={13} style={{ width: 13 }} />
              <span
                className="text-uppercase fw-bold"
                style={{ fontSize: 10, letterSpacing: 0.5, color: '#276749' }}
              >
                Connector Sets
              </span>
              <span className="text-muted ms-1" style={{ fontSize: 10, fontWeight: 400 }}>
                — additive, won't replace existing rows
              </span>
            </div>

            {connectorOpen && (
              <div className="p-1">
                {connectorTemplates.map(tpl => (
                  <ConnectorCard
                    key={tpl.id}
                    tpl={tpl}
                    posRef={posRef}
                    onAdd={() => handleAddConnector(tpl.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Regular templates ───────────────────────────────────────── */}
        {posRef && projectTemplates.length > 0 && (
          <TemplateGroup label="Project Templates" templates={projectTemplates} onApply={handleApply} />
        )}

        {posRef && globalTemplates.length > 0 && (
          <TemplateGroup label="Global Templates" templates={globalTemplates} onApply={handleApply} />
        )}

        {connectorTemplates.length === 0 && enriched.length === 0 && (
          <div className="text-muted small text-center py-3">No templates found.</div>
        )}
      </div>
    </div>
  )
}

// ── Connector card ────────────────────────────────────────────────────────────

function ConnectorCard({ tpl, posRef, onAdd }) {
  const ingredients = Array.isArray(tpl.ingredients)
    ? tpl.ingredients
    : (JSON.parse(tpl.ingredients || '[]'))

  const positionETs   = ingredients.filter(i => i.section === 'position').map(i => i.slotLabel)
  const dlInternalETs = ingredients.filter(i => i.section === 'dl_internal').map(i => i.slotLabel)

  return (
    <div
      style={{
        padding: '5px 8px',
        marginBottom: 3,
        borderRadius: 4,
        background: tpl._isMatch ? '#d1fae5' : '#fff',
        border: `1px solid ${tpl._isMatch ? '#6ee7b7' : '#dee2e6'}`,
        fontSize: 12,
      }}
    >
      <div className="d-flex align-items-center justify-content-between mb-1">
        <span className="fw-semibold" style={{ fontSize: 12 }}>{tpl.name}</span>
        {tpl._isMatch && (
          <span className="d-inline-flex align-items-center gap-1" style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}><MaterialIcon name={ACTION_ICONS.complete} size={13} /> match</span>
        )}
      </div>

      {/* Show the section split visually */}
      <div style={{ fontSize: 10, color: '#555', lineHeight: 1.6 }}>
        {positionETs.length > 0 && (
          <div>
            <span className="text-muted">Position: </span>
            {positionETs.join(', ')}
          </div>
        )}
        {dlInternalETs.length > 0 && (
          <div>
            <span className="text-muted">DL internal: </span>
            {dlInternalETs.join(', ')}
          </div>
        )}
      </div>

      <div className="d-flex justify-content-end mt-1">
        <Button
          variant={tpl._isMatch ? 'success' : 'outline-secondary'}
          size="sm"
          style={{ padding: '1px 10px', fontSize: 11 }}
          disabled={!posRef}
          onClick={onAdd}
          title={posRef ? 'Add connector rows to this position' : 'Select a position first'}
        >
          + Add
        </Button>
      </div>
    </div>
  )
}

// ── Regular template components ───────────────────────────────────────────────

function TemplateGroup({ label, templates, onApply }) {
  return (
    <div className="mb-3">
      <div className="text-uppercase text-muted fw-bold mb-1" style={{ fontSize: 10, letterSpacing: 0.5 }}>
        {label}
      </div>
      {templates.map(tpl => (
        <TemplateCard key={tpl.id} tpl={tpl} onApply={onApply} />
      ))}
    </div>
  )
}

function TemplateCard({ tpl, onApply }) {
  return (
    <div
      style={{
        padding: '6px 8px',
        marginBottom: 4,
        border: '1px solid #dee2e6',
        borderRadius: 4,
        background: '#fff',
        fontSize: 12,
      }}
    >
      <div className="d-flex align-items-center justify-content-between mb-1">
        <span className="fw-semibold" style={{ fontSize: 12 }}>{tpl.name}</span>
        {tpl._isMatch && (
          <span className="d-inline-flex align-items-center gap-1" style={{ fontSize: 11, color: '#198754', fontWeight: 600 }}><MaterialIcon name={ACTION_ICONS.complete} size={13} /> match</span>
        )}
      </div>
      {tpl._tags?.length > 0 && (
        <div className="d-flex flex-wrap gap-1 mb-2">
          {tpl._tags.map(tag => (
            <Badge key={tag} bg="secondary" style={{ fontSize: 10, fontWeight: 400 }}>{tag}</Badge>
          ))}
        </div>
      )}
      <div className="d-flex justify-content-end">
        <Button
          variant={tpl._isMatch ? 'primary' : 'outline-secondary'}
          size="sm"
          style={{ padding: '1px 10px', fontSize: 11 }}
          onClick={() => onApply(tpl.id)}
        >
          Apply
        </Button>
      </div>
    </div>
  )
}
