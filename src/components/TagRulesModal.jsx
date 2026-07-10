import React, { useState, useEffect, useMemo } from 'react'
import { Modal, Button, Form, Alert } from 'react-bootstrap'
import { v4 as uuidv4 } from 'uuid'
import useStore from '../store/useStore'
import { TAG_COLUMNS, TAG_OPS, ruleMatches, ruleConditions } from '../utils/tagRules'
import TagInput from './TagInput'
import TagColorControl from './TagColorControl'
import TagDriftWizard from './TagDriftWizard'
import MaterialIcon from './MaterialIcon'

/**
 * TagRulesModal — the whole tag system in one modal, opened from the builder.
 *
 * Two jobs, deliberately not three: the RULES that derive tags from PositionType
 * columns, and the TAGS themselves (palette + colour). Per-position exceptions live in
 * the builder, next to the positions — not here.
 *
 * A rule is conditional (see tagRules): a list of conditions combined with AND or OR,
 * so "X AND Y AND Z → tag" is one rule.
 */
const OP = new Map(TAG_OPS.map(o => [o.op, o]))

function ConditionRow({ cond, onChange, onRemove, canRemove }) {
  const meta = OP.get(cond.op) || TAG_OPS[0]
  const setBound = (i, v) => {
    const parts = String(cond.value ?? '').split(',')
    parts[i] = v
    onChange({ value: parts.join(',') })
  }
  const [lo, hi] = String(cond.value ?? '').split(',')

  return (
    <div className="d-flex align-items-center gap-1 mb-1">
      <Form.Select size="sm" value={cond.column} style={{ maxWidth: 210, fontSize: 12 }}
        onChange={e => onChange({ column: e.target.value })}>
        {TAG_COLUMNS.map(c => <option key={c} value={c}>{c}</option>)}
      </Form.Select>
      <Form.Select size="sm" value={cond.op} style={{ maxWidth: 140, fontSize: 12 }}
        onChange={e => onChange({ op: e.target.value })}>
        {TAG_OPS.map(o => <option key={o.op} value={o.op}>{o.label}</option>)}
      </Form.Select>

      {meta.twoValues ? (
        <div className="d-flex align-items-center gap-1">
          <Form.Control size="sm" type="number" value={lo ?? ''} placeholder="min" style={{ width: 76, fontSize: 12 }}
            onChange={e => setBound(0, e.target.value)} />
          <span className="text-muted" style={{ fontSize: 11 }}>and</span>
          <Form.Control size="sm" type="number" value={hi ?? ''} placeholder="max" style={{ width: 76, fontSize: 12 }}
            onChange={e => setBound(1, e.target.value)} />
        </div>
      ) : meta.needsValue ? (
        <Form.Control size="sm" type={meta.numeric ? 'number' : 'text'} value={cond.value ?? ''}
          placeholder="value" style={{ maxWidth: 160, fontSize: 12 }}
          onChange={e => onChange({ value: e.target.value })} />
      ) : (
        <span className="text-muted fst-italic" style={{ fontSize: 11 }}>(no value)</span>
      )}

      <Button variant="link" size="sm" className="text-danger p-0 ms-auto" title="Remove condition"
        disabled={!canRemove} onClick={onRemove}>
        <MaterialIcon name="close" size={14} />
      </Button>
    </div>
  )
}

function RuleCard({ rule, matchCount, palette, onChange, onRemove }) {
  const conds = ruleConditions(rule)
  const patchCond = (i, patch) =>
    onChange({ conditions: conds.map((c, j) => (j === i ? { ...c, ...patch } : c)) })
  const addCond = () =>
    onChange({ conditions: [...conds, { column: 'PositionTypeRef', op: 'contains', value: '' }] })
  const removeCond = i =>
    onChange({ conditions: conds.filter((_, j) => j !== i) })

  return (
    <div className="mb-3 rounded" style={{ border: '1px solid #dee2e6', opacity: rule.enabled === false ? 0.55 : 1 }}>
      <div className="d-flex align-items-center gap-2 px-2 py-2" style={{ background: '#f8f9fa', borderBottom: '1px solid #e9ecef' }}>
        <Form.Check type="checkbox" checked={rule.enabled !== false} title="Enable / disable this rule"
          onChange={e => onChange({ enabled: e.target.checked })} />
        <span className="text-muted" style={{ fontSize: 11 }}>tag</span>
        <Form.Control size="sm" list="tagrules-palette" value={rule.tag ?? ''} placeholder="tag name"
          style={{ maxWidth: 200, fontSize: 12, fontWeight: 600 }}
          onChange={e => onChange({ tag: e.target.value })} />
        <span className="rounded px-1 ms-auto" style={{ fontSize: 10, background: matchCount > 0 ? '#e7f1ff' : '#f1f3f5', color: matchCount > 0 ? '#084298' : '#6c757d' }}
          title="Positions this rule currently matches">
          {matchCount} match{matchCount === 1 ? '' : 'es'}
        </span>
        <Button variant="link" size="sm" className="text-danger p-0" title="Remove rule" onClick={onRemove}>
          <MaterialIcon name="delete" size={15} />
        </Button>
      </div>

      <div className="px-2 py-2">
        <div className="d-flex align-items-center gap-2 mb-2" style={{ fontSize: 11 }}>
          <span className="text-muted">Match</span>
          <Form.Select size="sm" value={rule.match === 'any' ? 'any' : 'all'} style={{ width: 90, fontSize: 11 }}
            onChange={e => onChange({ match: e.target.value })}>
            <option value="all">ALL</option>
            <option value="any">ANY</option>
          </Form.Select>
          <span className="text-muted">of these conditions{rule.match === 'any' ? ' (OR)' : ' (AND)'}:</span>
        </div>

        {conds.map((c, i) => (
          <ConditionRow key={i} cond={c} canRemove={conds.length > 1}
            onChange={patch => patchCond(i, patch)} onRemove={() => removeCond(i)} />
        ))}
        {conds.length === 0 && (
          <div className="text-muted fst-italic mb-1" style={{ fontSize: 11 }}>No conditions — this rule tags nothing.</div>
        )}

        <Button variant="link" size="sm" className="p-0" style={{ fontSize: 11 }} onClick={addCond}>
          <MaterialIcon name="add" size={13} /> Add condition
        </Button>
      </div>
    </div>
  )
}

function RulesSection({ positionTypes }) {
  const tagRules = useStore(s => s.tagRules)
  const setTagRules = useStore(s => s.setTagRules)

  const [draft, setDraft] = useState(tagRules)
  const [dirty, setDirty] = useState(false)
  useEffect(() => { setDraft(tagRules); setDirty(false) }, [tagRules])

  const update = (id, patch) => { setDraft(d => d.map(r => (r.id === id ? { ...r, ...patch } : r))); setDirty(true) }
  const addRule = () => {
    setDraft(d => [...d, { id: uuidv4(), tag: '', enabled: true, match: 'all',
      conditions: [{ column: 'PositionTypeRef', op: 'contains', value: '' }] }])
    setDirty(true)
  }
  const removeRule = id => { setDraft(d => d.filter(r => r.id !== id)); setDirty(true) }
  const apply = () => { setTagRules(draft); setDirty(false) }

  const countFor = rule => positionTypes.reduce((n, pt) => n + (ruleMatches(rule, pt) ? 1 : 0), 0)

  return (
    <>
      <div className="d-flex align-items-center mb-2">
        <div className="text-muted" style={{ fontSize: 11 }}>
          A rule tags every position that matches its conditions. Several rules can add the same tag.
        </div>
        <div className="ms-auto d-flex gap-2">
          <Button size="sm" variant="outline-secondary" onClick={addRule}>+ Add rule</Button>
          <Button size="sm" variant={dirty ? 'primary' : 'outline-primary'} onClick={apply} disabled={!dirty}>
            {dirty ? 'Apply rules' : 'Applied'}
          </Button>
        </div>
      </div>

      {draft.length === 0 && (
        <div className="text-muted text-center py-4 fst-italic" style={{ fontSize: 12 }}>
          No rules yet — add one to auto-tag positions.
        </div>
      )}
      {draft.map(rule => (
        <RuleCard key={rule.id} rule={rule} matchCount={countFor(rule)}
          onChange={patch => update(rule.id, patch)} onRemove={() => removeRule(rule.id)} />
      ))}
      {dirty && (
        <div className="text-muted" style={{ fontSize: 11 }}>
          Match counts reflect your edits. <strong>Apply rules</strong> to re-tag every position.
        </div>
      )}
    </>
  )
}

function TagsSection({ positionUI }) {
  const tagPalette = useStore(s => s.tagPalette)
  const setTagPalette = useStore(s => s.setTagPalette)
  const tagRules = useStore(s => s.tagRules)

  // Every tag the project knows about: the palette, whatever the rules emit, and
  // whatever is actually on a position. All are colourable.
  const allTags = useMemo(() => {
    const s = new Set(tagPalette)
    for (const r of tagRules) if (r.tag) s.add(r.tag)
    for (const ui of Object.values(positionUI || {})) for (const t of (ui.tags || [])) s.add(t)
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [tagPalette, tagRules, positionUI])

  return (
    <>
      <div className="fw-semibold mb-1" style={{ fontSize: 12 }}>Palette</div>
      <div className="text-muted mb-2" style={{ fontSize: 11 }}>
        Suggestions offered when adding tags. Tags are free-form — any string works.
      </div>
      <TagInput value={tagPalette} onChange={setTagPalette} palette={[]} placeholder="Add a palette tag…" />

      <div className="fw-semibold mt-3 mb-1" style={{ fontSize: 12 }}>Colours</div>
      <div className="text-muted mb-2" style={{ fontSize: 11 }}>
        Click a tag to colour it. The colour shows everywhere the tag appears.
      </div>
      {allTags.length === 0
        ? <div className="text-muted fst-italic" style={{ fontSize: 11 }}>No tags yet.</div>
        : <div className="d-flex flex-wrap gap-2">{allTags.map(t => <TagColorControl key={t} tag={t} />)}</div>}
    </>
  )
}

export default function TagRulesModal({ show, onHide }) {
  const positionTypes = useStore(s => s.positionTypes)
  const positionUI = useStore(s => s.positionUI)
  const tagPalette = useStore(s => s.tagPalette)
  const tagDrift = useStore(s => s.tagDrift)

  const [tab, setTab] = useState('rules')
  const [showDrift, setShowDrift] = useState(false)
  const driftCount = Object.keys(tagDrift || {}).length

  return (
    <>
      <Modal show={show} onHide={onHide} centered scrollable size="lg">
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: 15 }} className="d-flex align-items-center gap-2">
            <MaterialIcon name="sell" size={18} /> Tags
          </Modal.Title>
        </Modal.Header>

        <div className="d-flex gap-1 px-3 pt-2" style={{ borderBottom: '1px solid #dee2e6' }}>
          {['rules', 'tags'].map(t => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className="btn btn-sm border-0 rounded-0 px-2"
              style={{
                fontSize: 12, fontWeight: tab === t ? 600 : 400,
                color: tab === t ? '#0d6efd' : '#6c757d',
                borderBottom: tab === t ? '2px solid #0d6efd' : '2px solid transparent',
              }}>
              {t === 'rules' ? 'Rules' : 'Tags & colours'}
            </button>
          ))}
        </div>

        <Modal.Body style={{ minHeight: 320, maxHeight: '62vh' }}>
          {driftCount > 0 && (
            <Alert variant="warning" className="d-flex align-items-center py-2 px-3">
              <span style={{ fontSize: 12 }}>
                <strong>{driftCount}</strong> position{driftCount === 1 ? '' : 's'} changed rule-derived tags since the last baseline.
              </span>
              <Button size="sm" variant="warning" className="ms-auto" onClick={() => setShowDrift(true)}>Review</Button>
            </Alert>
          )}
          {tab === 'rules'
            ? <RulesSection positionTypes={positionTypes} />
            : <TagsSection positionUI={positionUI} />}
        </Modal.Body>

        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={onHide}>Close</Button>
        </Modal.Footer>
      </Modal>

      <datalist id="tagrules-palette">
        {tagPalette.map(p => <option key={p} value={p} />)}
      </datalist>

      <TagDriftWizard show={showDrift} onHide={() => setShowDrift(false)} />
    </>
  )
}
