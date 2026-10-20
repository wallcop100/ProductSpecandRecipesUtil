import React, { useState, useMemo } from 'react'
import { Button, Badge, Form, Alert, ListGroup } from 'react-bootstrap'
import { v4 as uuidv4 } from 'uuid'
import useStore from '../store/useStore'
import IconButton from '../components/IconButton'
import RuleBuilder from '../components/RuleBuilder'
import JobBoard from '../components/JobBoard'
import TutorialHint from '../tutorial/TutorialHint'
import MaterialIcon from '../components/MaterialIcon'
import { useCompanion } from '../platform/companion'
import { ACTION_ICONS } from '../utils/entityStyle'
import {
  TEMPLATE_RULE_COLUMNS, templateRule, ruleConditionsOf, ruleIsEmpty, ruleMatchesRecord, explainRule, describeRule, EMPTY_RULE,
} from '../utils/templateRules'
import { C } from '../styles/tokens'

// Tags are obsolete as a way to pick a template: the rule uses DesignDB and kind columns.
const RULE_COLUMNS = TEMPLATE_RULE_COLUMNS.filter(g => g.label !== 'Tags')
const cleanRule = r => ({ match: r.match === 'any' ? 'any' : 'all', conditions: ruleConditionsOf(r) })
const shown = v => (Array.isArray(v) ? (v.length ? v.join(', ') : '(none)') : (v == null || String(v).trim() === '' ? '(empty)' : String(v)))

function parseIngredients(raw) {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch { return [] }
  }
  return []
}

const withKeys = ings => parseIngredients(ings).map(ing => ({ ...ing, _key: ing._key || uuidv4() }))
const strip = ings => ings.map(({ _key, ...rest }) => rest)

/** "Why doesn't A05 match?": each condition against one position's actual values. */
function CheckPosition({ refs, value, onChange, rule, rec }) {
  const why = rec ? explainRule(rule, rec) : []
  return (
    <div className="mt-2" style={{ fontSize: 12 }} data-testid="check-position">
      <div className="d-flex align-items-center gap-2">
        <span className="text-muted">Check a position:</span>
        <Form.Control size="sm" list="rule-check-refs" value={value} placeholder="PositionTypeRef" aria-label="Check a position"
          style={{ width: 160, fontSize: 12 }} onChange={e => onChange(e.target.value.trim())} />
        <datalist id="rule-check-refs">{refs.map(r => <option key={r} value={r} />)}</datalist>
      </div>
      {value && rec && (
        <div className="mt-1 ps-2" style={{ borderLeft: `2px solid ${C.border}` }}>
          {why.map(({ cond, ok, has }, i) => (
            <div key={i} className={ok ? 'text-success' : 'text-danger'}>
              {ok ? '✓' : '✗'} {cond.column} {cond.op} {['isEmpty', 'isNotEmpty'].includes(cond.op) ? '' : `“${cond.value}”`}
              <span className="text-muted"> — it has {shown(has)}</span>
            </div>
          ))}
          {ruleMatchesRecord(rule, rec) && !ruleIsEmpty(rule)
            ? <div className="text-success fw-semibold">→ this template applies to it</div>
            : <div className="text-danger fw-semibold">→ this template does not apply to it</div>}
        </div>
      )}
      {value && !rec && <div className="text-muted mt-1">No position {value}.</div>}
    </div>
  )
}

/**
 * TemplateEditorScreen — Orion (read-only), this project's and personal templates. A template is a
 * recipe plus a rule (templateRules.js) saying which positions it is for, built as in CollectionEditor.
 */
export default function TemplateEditorScreen({ onBack }) {
  const templates = useStore(s => s.templates)
  const projectId = useStore(s => s.projectId)
  const projectNumber = useStore(s => s.projectNumber)
  const positionTypes = useStore(s => s.positionTypes)
  const updateTemplate = useStore(s => s.updateTemplate)
  const deleteTemplate = useStore(s => s.deleteTemplate)
  const toast = useStore(s => s.toast)
  const recOf = useStore(s => s._templateRecOf)()
  const companion = useCompanion()

  const [selectedId, setSelectedId] = useState(null)
  const [editState, setEditState] = useState(null)
  // editState: the template as stored, with `rule` an object and ingredients carrying a _key
  const [checkRef, setCheckRef] = useState('')
  const [saveError, setSaveError] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const orion = templates.filter(t => t._served)
  const mine = templates.filter(t => !t._served && t.scope !== 'project')
  const projectTemplates = templates.filter(t => !t._served && t.scope === 'project')

  function selectTemplate(tpl) {
    setSelectedId(tpl.id)
    setEditState({ ...tpl, name: tpl.name || '', rule: templateRule({ Rule: tpl.rule }), ingredients: withKeys(tpl.ingredients) })
    setSaveError(null)
    setSaveSuccess(false)
  }

  function handleNewTemplate() {
    const tpl = { id: uuidv4(), name: 'New Template', scope: 'project', applicable_tags: [], ingredients: [], rule: EMPTY_RULE, project_id: projectId, projectId }
    setSelectedId(tpl.id)
    setEditState(tpl)
    setSaveError(null)
  }

  async function copyToMine(tpl) {
    const { _served, ...rest } = tpl
    const copy = {
      ...rest, id: uuidv4(), name: `${tpl.name} (copy)`, scope: 'global', project_id: null, projectId: null, base_template_id: null,
      rule: cleanRule(templateRule({ Rule: tpl.rule })), ingredients: strip(withKeys(tpl.ingredients)),
    }
    const saved = await updateTemplate(copy)
    selectTemplate(saved)
  }

  const payload = () => ({
    ...editState, rule: cleanRule(editState.rule), ingredients: strip(editState.ingredients),
    project_id: editState.scope === 'project' ? projectId : null,
  })

  async function handleSave() {
    setSaveError(null)
    try {
      await updateTemplate(payload())
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)
    } catch (err) {
      setSaveError(err.message || 'Save failed')
    }
  }

  async function handleSaveAsNew() {
    const id = uuidv4()
    try {
      await updateTemplate({ ...payload(), id, name: editState.name + ' (copy)', base_template_id: null })
      setSelectedId(id)
      setEditState(s => ({ ...s, id, name: s.name + ' (copy)' }))
    } catch (err) {
      setSaveError(err.message || 'Save failed')
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete template "${editState.name}"?`)) return
    await deleteTemplate(editState.id)
    setSelectedId(null)
    setEditState(null)
  }

  async function suggest() {
    const p = payload()
    const ok = await companion.suggestTemplate({
      name: p.name, rule: p.rule, ingredients: p.ingredients, by: 'psr-app', project: String(projectNumber ?? ''),
    })
    toast(ok ? `Suggested “${p.name}” to Orion` : 'Orion did not take the suggestion', { ok })
  }



  const readOnly = !!editState?._served
  const refs = useMemo(() => positionTypes.map(p => p.PositionTypeRef), [positionTypes])
  const empty = editState ? ruleIsEmpty(editState.rule) : true
  const matched = useMemo(() => (editState && !empty ? refs.filter(r => ruleMatchesRecord(editState.rule, recOf(r))) : []),
    [editState?.rule, refs, recOf])   // eslint-disable-line react-hooks/exhaustive-deps

  const listItem = tpl => {
    const n = parseIngredients(tpl.ingredients).length
    return (
      <ListGroup.Item key={tpl.id} action active={selectedId === tpl.id} className="py-2 px-3" onClick={() => selectTemplate(tpl)}>
        <div className="d-flex justify-content-between align-items-start">
          <div>
            <div className="fw-semibold small">{tpl.name}</div>
            <div className="text-muted" style={{ fontSize: 11 }}>{n} row{n !== 1 ? 's' : ''} · {describeRule(templateRule({ Rule: tpl.rule }))}</div>
          </div>
          {tpl._served && (
            <Button variant="outline-secondary" size="sm" style={{ fontSize: 11, padding: '1px 6px', whiteSpace: 'nowrap' }}
              onClick={e => { e.stopPropagation(); copyToMine(tpl) }}>Copy to mine</Button>
          )}
        </div>
      </ListGroup.Item>
    )
  }
  const group = (title, list, none, extra) => (
    <div className="px-3 py-2">
      <div className="d-flex align-items-center justify-content-between mb-1">
        <div className="text-uppercase text-muted small fw-bold" style={{ fontSize: 10, letterSpacing: 1 }}>{title}</div>
        {extra}
      </div>
      <ListGroup variant="flush">
        {list.length === 0 && <div className="text-muted small py-2">{none}</div>}
        {list.map(listItem)}
      </ListGroup>
    </div>
  )

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }} data-debug-id="TemplateEditorScreen">
      <div style={{ width: 280, flexShrink: 0, borderRight: `1px solid ${C.border}`, overflowY: 'auto', background: C.subtle, display: 'flex', flexDirection: 'column' }}>
        <div className="p-3 border-bottom d-flex align-items-center justify-content-between">
          <IconButton variant="link" bsSize="sm" className="p-0" icon={ACTION_ICONS.back} title="Back to builder" onClick={onBack} />
          <span className="fw-semibold small d-inline-flex align-items-center gap-1">Manage templates <TutorialHint id="templates" /></span>
        </div>
        {group('Global ☁️', orion, 'None served.')}
        {group('This project', projectTemplates, 'No project templates.',
          <Button variant="outline-primary" size="sm" style={{ fontSize: 11, padding: '1px 8px' }} onClick={handleNewTemplate}>+ New</Button>)}
        {group('Mine', mine, 'No personal templates.')}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
        {!editState ? (
          <div className="text-center text-muted mt-5">
            Select a template to see which positions it is for. To make a new one, build a position's
            recipe and click <MaterialIcon name="bookmark_add" size={13} /> in its header: templates start from a real recipe.
          </div>
        ) : (
          <>
            <div className="d-flex align-items-center gap-3 mb-3">
              <Form.Control style={{ maxWidth: 300, fontWeight: 600, fontSize: '1.1rem' }} value={editState.name} aria-label="Template name"
                onChange={e => setEditState(s => ({ ...s, name: e.target.value }))} disabled={readOnly} placeholder="Template name" />
              <Badge bg={readOnly ? 'secondary' : 'primary'}>{readOnly ? 'Global ☁️' : editState.scope === 'project' ? 'Project' : 'Mine'}</Badge>
              {!readOnly && companion?.suggestTemplate && (
                <Button variant="link" size="sm" className="p-0 text-muted ms-auto" style={{ fontSize: 11 }} onClick={suggest}
                  title="Send this to Orion as a draft for review">Suggest to Orion</Button>
              )}
            </div>
            {readOnly && (
              <Alert variant="info" className="py-2 mb-3">
                Global templates are read-only. <Button variant="link" size="sm" className="p-0 align-baseline" onClick={() => copyToMine(editState)}>Copy to mine</Button> makes an editable copy.
              </Alert>
            )}

            <div className="mb-4" data-testid="template-rule">
              <div className="fw-semibold small mb-1">Applies to positions that match</div>
              {empty && <div className="text-muted fst-italic mb-1" style={{ fontSize: 11 }}>No conditions: it matches no position until it has a rule.</div>}
              <fieldset disabled={readOnly}>
                <RuleBuilder rule={editState.rule} columns={RULE_COLUMNS} minConditions={0}
                  newCondition={{ column: 'Design', op: 'equals', value: '' }}
                  onChange={patch => setEditState(s => ({ ...s, rule: { ...s.rule, ...patch } }))} />
              </fieldset>
              <div className="mt-2" style={{ fontSize: 12 }} data-testid="matched-positions">
                <MaterialIcon name="check_circle" size={13} className="text-success" /> {matched.length} position{matched.length === 1 ? '' : 's'} match
                {matched.length > 0 && <>: <span style={{ fontFamily: 'monospace' }}>{matched.slice(0, 12).join(', ')}{matched.length > 12 ? ` +${matched.length - 12} more` : ''}</span></>}
              </div>
              <CheckPosition refs={refs} value={checkRef} onChange={setCheckRef} rule={editState.rule} rec={checkRef && refs.includes(checkRef) ? recOf(checkRef) : null} />
            </div>

            <div className="fw-semibold small mb-1">What it adds</div>
            <div className="text-muted mb-2" style={{ fontSize: 11 }}>
              Jobs, not products: applying it fills each job from the position's Form, and flags any it can't.
            </div>
            <JobBoard ingredients={editState.ingredients} readOnly={readOnly}
              onChange={ingredients => setEditState(s => ({ ...s, ingredients }))} />

            {!readOnly && (
              <div className="d-flex gap-2 mt-3">
                <Button variant="primary" onClick={handleSave}>Save template</Button>
                <Button variant="outline-secondary" onClick={handleSaveAsNew}>Save as new</Button>
                <Button variant="outline-danger" onClick={handleDelete}>Delete</Button>
                {saveSuccess && <span className="text-success align-self-center small d-inline-flex align-items-center gap-1"><MaterialIcon name={ACTION_ICONS.complete} size={14} /> Saved</span>}
                {saveError && <span className="text-danger align-self-center small">{saveError}</span>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
