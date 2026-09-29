import InfoTip from './InfoTip'
import React, { useState, useEffect, useMemo } from 'react'
import { Modal, Button, Form, Alert } from 'react-bootstrap'
import { v4 as uuidv4 } from 'uuid'
import useStore from '../store/useStore'
import { TAG_COLUMNS, RECIPE_TAG_COLUMNS, ruleMatches, ruleConditions, recipeTagIndex, withRecipeFields } from '../utils/tagRules'
import TagInput from './TagInput'
import TagBadge from './TagBadge'
import TagColorControl from './TagColorControl'
import TagDriftWizard from './TagDriftWizard'
import MaterialIcon from './MaterialIcon'
import RuleBuilder from './RuleBuilder'

const TAG_RULE_COLUMNS = [
  { label: 'PositionType (DesignDB)', options: TAG_COLUMNS.map(c => ({ key: c, label: c })) },
  { label: 'What its recipe holds (Product Spec)', options: RECIPE_TAG_COLUMNS },
]

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
function RuleCard({ rule, matchCount, onChange, onRemove, isNew = false }) {
  const tagRef = React.useRef(null)
  useEffect(() => { if (isNew) { tagRef.current?.scrollIntoView?.({ block: 'nearest' }); tagRef.current?.focus() } }, [isNew])
  const conds = ruleConditions(rule)
  const accent = useStore(s => (rule.tag ? s.tagColors?.[rule.tag] : null)) || '#cbd5e1'
  const disabled = rule.enabled === false


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
        <Form.Control size="sm" ref={tagRef} list="tagrules-palette" value={rule.tag ?? ''} placeholder="tag name…"
          aria-label="Tag name"
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
        <RuleBuilder rule={rule} columns={TAG_RULE_COLUMNS} onChange={onChange}
          newCondition={{ column: 'PositionTypeRef', op: 'contains', value: '' }} />
      </div>
    </div>
  )
}

/** The rules being edited. State lives in the modal: Apply is in its footer, and closing asks. */
function RulesSection({ positionTypes, draft, setDraft, dirty }) {
  const recipes = useStore(s => s.recipes)
  const psRows = useStore(s => s.psRows)
  const elementTypes = useStore(s => s.elementTypes)
  const [newId, setNewId] = useState(null)

  const update = (id, patch) => setDraft(d => d.map(r => (r.id === id ? { ...r, ...patch } : r)))
  // New rules go on top, where you are, with the cursor in their tag name.
  const addRule = () => {
    const id = uuidv4()
    setDraft(d => [{ id, tag: '', enabled: true, match: 'all',
      conditions: [{ column: 'PositionTypeRef', op: 'contains', value: '' }] }, ...d])
    setNewId(id)
  }
  const removeRule = id => setDraft(d => d.filter(r => r.id !== id))

  const subjects = useMemo(() => {
    const index = recipeTagIndex({ recipes, psRows, elementTypes })
    return positionTypes.map(pt => withRecipeFields(pt, index))
  }, [positionTypes, recipes, psRows, elementTypes])
  const countFor = rule => subjects.reduce((n, pt) => n + (ruleMatches(rule, pt) ? 1 : 0), 0)

  return (
    <>
      <div className="d-flex align-items-center mb-3">
        <InfoTip>Each rule tags every position matching its conditions. Two rules can add the same tag. Rules can also read what a position&apos;s recipe holds (maker, code, ElementType, family).</InfoTip>
        <Button size="sm" variant="outline-secondary" className="ms-auto d-inline-flex align-items-center gap-1" onClick={addRule}>
          <MaterialIcon name="add" size={14} /> Add rule
        </Button>
      </div>

      {draft.length === 0 && (
        <div className="text-center py-5" style={{ color: '#9aa0a6' }}>
          <MaterialIcon name="sell" size={28} />
          <div className="mt-2" style={{ fontSize: 12 }}>No rules yet.</div>
          <Button size="sm" variant="outline-primary" className="mt-2" onClick={addRule}>Add your first rule</Button>
        </div>
      )}
      {draft.map(rule => (
        <RuleCard key={rule.id} rule={rule} matchCount={countFor(rule)} isNew={rule.id === newId}
          onChange={patch => update(rule.id, patch)} onRemove={() => removeRule(rule.id)} />
      ))}
      {dirty && (
        <div className="text-muted" style={{ fontSize: 11 }}>
          Unapplied edits{' '}
          <InfoTip>Match counts reflect your edits. <strong>Apply rules</strong> (bottom right) to re-tag every position.</InfoTip>
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
      <div className="fw-semibold mb-2" style={{ fontSize: 12 }}>
        Palette <InfoTip size={12}>Suggestions offered when adding tags. Tags are free-form: any string works.</InfoTip>
      </div>
      <TagInput value={tagPalette} onChange={setTagPalette} palette={[]} placeholder="Add a palette tag…" />

      <div className="fw-semibold mt-3 mb-2" style={{ fontSize: 12 }}>
        Colours <InfoTip size={12}>Click a tag to colour it. The colour shows everywhere the tag appears.</InfoTip>
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

  const tagRules = useStore(s => s.tagRules)
  const setTagRules = useStore(s => s.setTagRules)
  const [tab, setTab] = useState('rules')
  const [showDrift, setShowDrift] = useState(false)
  const [draft, setDraftRaw] = useState(tagRules)
  const [dirty, setDirty] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  useEffect(() => { if (show) { setDraftRaw(tagRules); setDirty(false); setConfirmClose(false) } }, [show])   // eslint-disable-line react-hooks/exhaustive-deps
  const setDraft = fn => { setDraftRaw(fn); setDirty(true); setConfirmClose(false) }
  const apply = async () => { await setTagRules(draft); setDirty(false) }
  // Closing with unapplied rule edits asks first: they are easy to lose by mistake.
  const requestClose = () => { if (dirty) { setTab('rules'); setConfirmClose(true) } else onHide() }
  const driftCount = Object.keys(tagDrift || {}).length

  return (
    <>
      <Modal show={show} onHide={requestClose} centered scrollable size="lg">
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
            ? <RulesSection positionTypes={positionTypes} draft={draft} setDraft={setDraft} dirty={dirty} />
            : <TagsSection positionUI={positionUI} />}
        </Modal.Body>

        <Modal.Footer className="d-flex align-items-center">
          {confirmClose ? (
            <div className="d-flex align-items-center gap-2 w-100" data-testid="unapplied-warning">
              <MaterialIcon name="warning" size={16} style={{ color: '#b45309' }} />
              <span style={{ fontSize: 12 }}>Your rule changes are not applied yet.</span>
              <Button size="sm" variant="link" className="ms-auto text-muted" onClick={() => setConfirmClose(false)}>Keep editing</Button>
              <Button size="sm" variant="outline-danger" onClick={() => { setDirty(false); setConfirmClose(false); onHide() }}>Discard</Button>
              <Button size="sm" variant="primary" onClick={async () => { await apply(); onHide() }}>Apply and close</Button>
            </div>
          ) : (
            <>
              {dirty && <span className="text-muted me-auto" style={{ fontSize: 11 }}>Unapplied rule changes</span>}
              <Button variant="secondary" size="sm" onClick={requestClose}>Close</Button>
              <Button size="sm" variant={dirty ? 'primary' : 'outline-secondary'} onClick={apply} disabled={!dirty}
                className="d-inline-flex align-items-center gap-1">
                {dirty ? <><MaterialIcon name="check" size={14} /> Apply rules</> : 'Applied'}
              </Button>
            </>
          )}
        </Modal.Footer>
      </Modal>

      <datalist id="tagrules-palette">
        {tagPalette.map(p => <option key={p} value={p} />)}
      </datalist>

      <TagDriftWizard show={showDrift} onHide={() => setShowDrift(false)} />
    </>
  )
}
