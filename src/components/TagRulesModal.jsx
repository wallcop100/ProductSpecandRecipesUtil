import React, { useState, useEffect, useMemo } from 'react'
import { Modal, Button, Form, Alert } from 'react-bootstrap'
import { v4 as uuidv4 } from 'uuid'
import useStore from '../store/useStore'
import { TAG_COLUMNS, TAG_OPS, ruleMatches, ruleConditions } from '../utils/tagRules'
import TagInput from './TagInput'
import TagBadge from './TagBadge'
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
    <div className="tag-cond d-flex align-items-center gap-2 px-2 py-1 rounded"
      style={{ background: '#f8f9fb', border: '1px solid #edeff2' }}>
      <Form.Select size="sm" value={cond.column} style={{ flex: '1 1 150px', minWidth: 130, fontSize: 12 }}
        onChange={e => onChange({ column: e.target.value })}>
        {TAG_COLUMNS.map(c => <option key={c} value={c}>{c}</option>)}
      </Form.Select>
      <Form.Select size="sm" value={cond.op} style={{ flex: '0 0 140px', fontSize: 12 }}
        onChange={e => onChange({ op: e.target.value })}>
        {TAG_OPS.map(o => <option key={o.op} value={o.op}>{o.label}</option>)}
      </Form.Select>

      {meta.twoValues ? (
        <div className="d-flex align-items-center gap-1" style={{ flex: '1 1 auto' }}>
          <Form.Control size="sm" type="number" value={lo ?? ''} placeholder="min" style={{ width: 76, fontSize: 12 }}
            onChange={e => setBound(0, e.target.value)} />
          <span className="text-muted" style={{ fontSize: 11 }}>and</span>
          <Form.Control size="sm" type="number" value={hi ?? ''} placeholder="max" style={{ width: 76, fontSize: 12 }}
            onChange={e => setBound(1, e.target.value)} />
        </div>
      ) : meta.needsValue ? (
        <Form.Control size="sm" type={meta.numeric ? 'number' : 'text'} value={cond.value ?? ''}
          placeholder="value" style={{ flex: '1 1 120px', minWidth: 90, fontSize: 12 }}
          onChange={e => onChange({ value: e.target.value })} />
      ) : (
        <span className="text-muted fst-italic" style={{ flex: '1 1 auto', fontSize: 11 }}>(no value)</span>
      )}

      <button type="button" className="btn btn-sm text-danger p-0 border-0" title="Remove condition"
        style={{ opacity: canRemove ? 0.6 : 0.2, lineHeight: 1 }}
        disabled={!canRemove} onClick={onRemove}>
        <MaterialIcon name="close" size={15} />
      </button>
    </div>
  )
}

/**
 * The AND / OR between two conditions. The first one is interactive and flips the whole
 * rule's mode (a rule is all-or-any, not per-pair); the rest mirror it, so the column
 * reads as one boolean expression — the Notion-filter pattern.
 */
function Connector({ match, interactive, onToggle }) {
  const any = match === 'any'
  const word = any ? 'OR' : 'AND'
  const fg = any ? '#b45309' : '#0d6efd'
  const bg = any ? '#fff4e5' : '#e7f1ff'
  return (
    <div className="d-flex align-items-center" style={{ paddingLeft: 6, height: 22 }}>
      <div style={{ width: 2, background: '#e5e7eb', alignSelf: 'stretch', marginRight: 8 }} />
      {interactive ? (
        <button type="button" onClick={onToggle}
          title={any ? 'OR — any condition matches. Click for AND.' : 'AND — every condition matches. Click for OR.'}
          className="rounded-pill border-0 px-2"
          style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: fg, background: bg, lineHeight: '18px', cursor: 'pointer' }}>
          {word}
        </button>
      ) : (
        <span className="rounded-pill px-2" style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: fg, background: bg, lineHeight: '18px' }}>
          {word}
        </span>
      )}
    </div>
  )
}

function RuleCard({ rule, matchCount, onChange, onRemove }) {
  const conds = ruleConditions(rule)
  const accent = useStore(s => (rule.tag ? s.tagColors?.[rule.tag] : null)) || '#cbd5e1'
  const disabled = rule.enabled === false

  const patchCond = (i, patch) =>
    onChange({ conditions: conds.map((c, j) => (j === i ? { ...c, ...patch } : c)) })
  const addCond = () =>
    onChange({ conditions: [...conds, { column: 'PositionTypeRef', op: 'contains', value: '' }] })
  const removeCond = i =>
    onChange({ conditions: conds.filter((_, j) => j !== i) })
  const toggleMatch = () => onChange({ match: rule.match === 'any' ? 'all' : 'any' })

  return (
    <div className="mb-3" style={{
      border: '1px solid #e5e7eb', borderLeft: `4px solid ${accent}`, borderRadius: 10,
      background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', opacity: disabled ? 0.6 : 1,
    }}>
      {/* Header: the tag this rule produces, its live colour, and how many positions it hits. */}
      <div className="d-flex align-items-center gap-2 px-3 py-2" style={{ borderBottom: '1px solid #f1f3f5' }}>
        {rule.tag
          ? <TagBadge tag={rule.tag} />
          : <span className="rounded px-2" style={{ fontSize: 10, background: '#f1f3f5', color: '#9aa0a6', fontStyle: 'italic' }}>unnamed</span>}
        <Form.Control size="sm" list="tagrules-palette" value={rule.tag ?? ''} placeholder="tag name…"
          style={{ maxWidth: 180, fontSize: 12, fontWeight: 600 }}
          onChange={e => onChange({ tag: e.target.value })} />

        <span className="rounded-pill px-2 ms-auto" title="Positions this rule currently matches"
          style={{ fontSize: 10, fontWeight: 600, background: matchCount > 0 ? '#d1e7dd' : '#f1f3f5', color: matchCount > 0 ? '#0f5132' : '#6c757d' }}>
          {matchCount} match{matchCount === 1 ? '' : 'es'}
        </span>
        <Form.Check type="switch" checked={rule.enabled !== false} title="Enable / disable this rule"
          onChange={e => onChange({ enabled: e.target.checked })} />
        <button type="button" className="btn btn-sm text-danger p-0 border-0" title="Delete rule"
          style={{ lineHeight: 1 }} onClick={onRemove}>
          <MaterialIcon name="delete" size={16} />
        </button>
      </div>

      {/* Body: the boolean expression that produces the tag. */}
      <div className="px-3 py-2">
        <div className="text-muted mb-2" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
          Tag a position when it matches
        </div>

        {conds.length === 0 && (
          <div className="text-muted fst-italic mb-2" style={{ fontSize: 11 }}>No conditions — this rule tags nothing.</div>
        )}
        {conds.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <Connector match={rule.match} interactive={i === 1} onToggle={toggleMatch} />}
            <ConditionRow cond={c} canRemove={conds.length > 1}
              onChange={patch => patchCond(i, patch)} onRemove={() => removeCond(i)} />
          </React.Fragment>
        ))}

        <button type="button" onClick={addCond}
          className="btn btn-sm w-100 mt-2 d-inline-flex align-items-center justify-content-center gap-1"
          style={{ fontSize: 11, color: '#6c757d', border: '1px dashed #cbd5e1', borderRadius: 8, background: 'transparent' }}>
          <MaterialIcon name="add" size={13} /> Add condition
        </button>
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
      <div className="d-flex align-items-center mb-3">
        <div className="text-muted" style={{ fontSize: 11, maxWidth: 380 }}>
          Each rule tags every position matching its conditions. Two rules can add the same tag.
        </div>
        <div className="ms-auto d-flex gap-2">
          <Button size="sm" variant="outline-secondary" className="d-inline-flex align-items-center gap-1" onClick={addRule}>
            <MaterialIcon name="add" size={14} /> Add rule
          </Button>
          <Button size="sm" variant={dirty ? 'primary' : 'outline-secondary'} onClick={apply} disabled={!dirty}
            className="d-inline-flex align-items-center gap-1">
            {dirty ? <><MaterialIcon name="check" size={14} /> Apply rules</> : 'Applied'}
          </Button>
        </div>
      </div>

      {draft.length === 0 && (
        <div className="text-center py-5" style={{ color: '#9aa0a6' }}>
          <MaterialIcon name="sell" size={28} />
          <div className="mt-2" style={{ fontSize: 12 }}>No rules yet.</div>
          <Button size="sm" variant="outline-primary" className="mt-2" onClick={addRule}>Add your first rule</Button>
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
