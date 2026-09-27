import React, { useState, useMemo } from 'react'
import { Form, Alert, Button, Badge } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { ACTION_ICONS } from '../utils/entityStyle'

/**
 * TemplatePicker — browsable list of templates. Applying one replaces the full recipe,
 * so it confirms first when the position already has rows.
 *
 * There is no "Connector Sets" section any more. It listed a fixed grid of built-ins
 * (2/3/4/5-Pin × Local / Remote-CC / Remote-CV) whose refs were abstract placeholders no
 * project ever mapped to a real product. The Connectors screen and its wizard configure
 * connectors against the project's actual ElementTypes; a second, dumber copy of the same
 * idea sitting in the template list only ever added rows nobody could buy.
 *
 * Props:
 *   posRef      — active position ref
 *   activeTags  — current position's tags (string[])
 *   hasRows     — whether the position already has recipe rows
 *   onApply(templateId) — called after a regular template is applied
 */
export default function TemplatePicker({ posRef, activeTags, hasRows, onApply, query }) {
  const templates               = useStore(s => s.templates)
  const applyTemplate           = useStore(s => s.applyTemplate)
  const applyTemplateMany       = useStore(s => s.applyTemplateMany)
  const positionTypes           = useStore(s => s.positionTypes)
  const positionUI              = useStore(s => s.positionUI)
  const recipes                 = useStore(s => s.recipes)
  const [applyingTo, setApplyingTo] = useState(null)   // template being applied to many
  const [picked, setPicked]     = useState(() => new Set())
  const [doneMsg, setDoneMsg]   = useState(null)

  const [ownSearch, setSearch]        = useState('')
  const search = query ?? ownSearch
  const [pendingApply, setPendingApply] = useState(null)

  function parseTags(raw) {
    if (Array.isArray(raw)) return raw
    try { return JSON.parse(raw || '[]') } catch { return [] }
  }

  function isMatch(tpl) {
    const tags = parseTags(tpl.applicable_tags)
    return tags.length > 0 && tags.every(t => activeTags.includes(t))
  }

  const q = search.toLowerCase().trim()

  const enriched = useMemo(() =>
    templates
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {query === undefined && (
        <div className="p-2 border-bottom">
          <Form.Control
            type="text"
            size="sm"
            placeholder="Search templates…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      )}

      {doneMsg && (
        <Alert variant="success" className="mx-2 mt-2 mb-0 py-1 px-2" style={{ fontSize: 12 }} dismissible onClose={() => setDoneMsg(null)}>
          {doneMsg}
        </Alert>
      )}

      {applyingTo && (() => {
        const tplTags = parseTags(applyingTo.applicable_tags)
        const refs = positionTypes.map(p => p.PositionTypeRef || p.positionTypeRef).filter(Boolean)
        const tagsOf = r => positionUI[r]?.tags || []
        const matches = r => tplTags.length > 0 && tplTags.every(t => tagsOf(r).includes(t))
        const hasRecipe = r => recipes.some(x => (x.PositionTypeRef || x.positionTypeRef) === r && (x.IsDeleted || x.isDeleted) !== 'Y')
        const sorted = [...refs].sort((a, b) => (matches(b) - matches(a)) || a.localeCompare(b))
        const replacing = [...picked].filter(hasRecipe).length
        return (
          <div className="mx-2 mt-2 p-2 rounded" style={{ background: '#e7f1ff', border: '1px solid #b6d4fe', fontSize: 12 }} data-testid="apply-to">
            <div className="fw-semibold mb-1">Apply “{applyingTo.name}” to…</div>
            {tplTags.length > 0 && (
              <Button variant="link" size="sm" className="p-0 mb-1" style={{ fontSize: 11 }}
                onClick={() => setPicked(new Set(refs.filter(matches)))}>
                Tick every position tagged {tplTags.join(' + ')}
              </Button>
            )}
            <div style={{ maxHeight: 220, overflowY: 'auto', background: '#fff' }} className="rounded px-2 py-1 mb-1">
              {sorted.map(r => (
                <Form.Check key={r} type="checkbox" id={`apply-${r}`} checked={picked.has(r)}
                  onChange={() => setPicked(p => { const n = new Set(p); n.has(r) ? n.delete(r) : n.add(r); return n })}
                  label={<span style={{ fontSize: 11 }}><span style={{ fontFamily: 'monospace' }}>{r}</span>
                    {hasRecipe(r) && <span className="text-muted"> · has a recipe</span>}
                    {matches(r) && <span className="text-success"> · tags match</span>}</span>} />
              ))}
            </div>
            {replacing > 0 && <div className="text-danger mb-1" style={{ fontSize: 11 }}>{replacing} already have a recipe — it will be replaced.</div>}
            <div className="d-flex gap-2">
              <Button size="sm" variant="primary" disabled={picked.size === 0}
                onClick={() => {
                  const n = applyTemplateMany([...picked], applyingTo.id)
                  setDoneMsg(`Applied “${applyingTo.name}” to ${n} position${n === 1 ? '' : 's'} — one Undo takes it back.`)
                  setApplyingTo(null); setPicked(new Set())
                }}>
                Apply to {picked.size}
              </Button>
              <Button size="sm" variant="link" className="text-muted" onClick={() => { setApplyingTo(null); setPicked(new Set()) }}>Cancel</Button>
            </div>
          </div>
        )
      })()}

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
        {/* The "Connector Sets" group lived here: a fixed grid of 2/3/4/5-Pin × Local /
            Remote-CC / Remote-CV built from abstract refs no project ever mapped. The
            Connectors screen and its wizard do that against real ElementTypes. */}
        {posRef && projectTemplates.length > 0 && (
          <TemplateGroup label="This project" templates={projectTemplates} onApply={handleApply} onApplyTo={t => { setApplyingTo(t); setPicked(new Set()) }} />
        )}

        {posRef && globalTemplates.length > 0 && (
          <TemplateGroup label="Every project" templates={globalTemplates} onApply={handleApply} onApplyTo={t => { setApplyingTo(t); setPicked(new Set()) }} />
        )}

        {enriched.length === 0 && (
          <div className="text-muted small text-center py-3">
            No templates yet. Build one position's recipe, then click
            <MaterialIcon name="bookmark_add" size={13} /> in its header to save it as a template.
          </div>
        )}
      </div>
    </div>
  )
}

function TemplateGroup({ label, templates, onApply, onApplyTo }) {
  return (
    <div className="mb-3">
      <div className="text-uppercase text-muted fw-bold mb-1" style={{ fontSize: 10, letterSpacing: 0.5 }}>
        {label}
      </div>
      {templates.map(tpl => (
        <TemplateCard key={tpl.id} tpl={tpl} onApply={onApply} onApplyTo={onApplyTo} />
      ))}
    </div>
  )
}

/** What the template adds, in one line: "4 rows · new LIN wrapper". */
function summary(tpl) {
  const ings = Array.isArray(tpl.ingredients) ? tpl.ingredients : (() => { try { return JSON.parse(tpl.ingredients || '[]') } catch { return [] } })()
  const w = ings.find(i => i.newWrapper)
  return `${ings.length} row${ings.length === 1 ? '' : 's'}${w ? ` · new ${w.newWrapper} wrapper` : ''}`
}

function TemplateCard({ tpl, onApply, onApplyTo }) {
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
      <div className="d-flex justify-content-end align-items-center gap-2">
        <span className="text-muted me-auto" style={{ fontSize: 10 }}>{summary(tpl)}</span>
        <Button variant="link" size="sm" className="p-0" style={{ fontSize: 11 }} onClick={() => onApplyTo(tpl)}>
          Apply to…
        </Button>
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
