import React, { useState, useMemo, useEffect } from 'react'
import { Modal, Button, Form } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import RuleBuilder from './RuleBuilder'
import { byRef } from './usePositionList'
import { ACTION_ICONS } from '../utils/entityStyle'
import { TAG_OPS, RECIPE_TAG_COLUMNS } from '../utils/tagRules'
import { TEMPLATE_RULE_COLUMNS, EMPTY_RULE, templateRecords, ruleMatchesRecord, ruleConditionsOf } from '../utils/templateRules'
import { C } from '../styles/tokens'

const api = () => (typeof window !== 'undefined' && window.electronAPI?.db) || null
async function readPref(projectId, key) {
  try { const v = await api()?.getPref?.(projectId, key); return v ? JSON.parse(v) : null } catch { return null }
}
function writePref(projectId, key, value) {
  try { api()?.setPref?.(projectId, key, JSON.stringify(value)) } catch { /* not persisted */ }
}

// What its recipe holds comes first: it is what people open Review for. Connectors count here.
const COLUMNS = [
  { label: 'What its recipe holds (Product Spec)', options: RECIPE_TAG_COLUMNS },
  ...TEMPLATE_RULE_COLUMNS.filter(g => g.options !== RECIPE_TAG_COLUMNS),
]
const NEW_CONDITION = { column: 'Recipe.ElementType', op: 'contains', value: '' }
const LIST_COLUMNS = ['Tags', 'Family', 'Recipe.ElementType', 'Recipe.Manufacturer', 'Recipe.ProductCode', 'Recipe.Family']

// Sets saved before 2026-10-25 used the old filter boxes ({ field, op }); read them across.
const OLD_FIELD = { Ref: 'PositionTypeRef', Name: 'Name', Family: 'Family', Tags: 'Tags', Contains: 'Recipe.ElementType',
  Manufacturer: 'Recipe.Manufacturer', ProductCode: 'Recipe.ProductCode' }
export function ruleOfSet(set) {
  const f = set?.rule || set?.filter
  if (!f) return EMPTY_RULE
  const conditions = (f.conditions || []).map(c => {
    if (c.column) return c
    const column = OLD_FIELD[c.field]
    if (!column) return null
    if (TAG_OPS.some(o => o.op === c.op)) return { column, op: c.op, value: c.value }
    const v = String(c.value ?? '')
    return { column, op: 'matches', value: /[*?,!]/.test(v) ? v : `*${v}*` }
  }).filter(Boolean)
  return { match: f.match === 'any' ? 'any' : 'all', conditions }
}

/**
 * ReviewModal — ask which positions hold something (an ElementType, a manufacturer, a code, a
 * tag…) with the template editor's rule builder, see the matches, and Show them in list: the rail
 * filters to them and the recipe highlights what matched (REVIEW_PLAN.md).
 */
export default function ReviewModal({ show, onHide }) {
  const positionTypes = useStore(s => s.positionTypes)
  const recipes = useStore(s => s.recipes)
  const psRows = useStore(s => s.psRows)
  const elementTypes = useStore(s => s.elementTypes)
  const positionUI = useStore(s => s.positionUI)
  const formCaptures = useStore(s => s.formCaptures)
  const query = useStore(s => s.positionList.query)
  const projectId = useStore(s => s.projectId)

  const [rule, setRule] = useState({ match: 'all', conditions: [NEW_CONDITION] })
  const [sets, setSets] = useState([])
  const [setName, setSetName] = useState('')

  useEffect(() => {
    if (!show) return
    if (query?.rule) setRule(query.rule)
    if (projectId == null) return
    let live = true
    readPref(projectId, 'review_filter_sets').then(saved => { if (live) setSets(Array.isArray(saved) ? saved.filter(x => x.unit !== 'element') : []) })
    return () => { live = false }
  }, [show, projectId])   // eslint-disable-line react-hooks/exhaustive-deps

  const records = useMemo(
    () => (show ? templateRecords({ positionTypes, recipes, psRows, elementTypes, positionUI, formCaptures }) : new Map()),
    [show, positionTypes, recipes, psRows, elementTypes, positionUI, formCaptures])
  const valueOptions = useMemo(() => {
    const vals = k => [...new Set([...records.values()].flatMap(r => (Array.isArray(r[k]) ? r[k] : [r[k]])).filter(Boolean).map(String))].sort(byRef)
    return Object.fromEntries(LIST_COLUMNS.map(k => [k, vals(k)]))
  }, [records])
  const asked = ruleConditionsOf(rule).length > 0
  const matches = useMemo(
    () => (asked ? [...records].filter(([, rec]) => ruleMatchesRecord(rule, rec)).map(([ref]) => ref).sort(byRef) : []),
    [asked, records, rule])

  const showInList = () => { useStore.getState().showPositionQuery({ rule }); onHide() }
  const open = ref => { useStore.getState().showPositionQuery({ rule }); useStore.getState().setActivePosition(ref); onHide() }

  function saveSet() {
    const name = setName.trim()
    if (!name) return
    const next = [...sets.filter(x => x.name !== name), { name, rule }]
    setSets(next)
    if (projectId != null) writePref(projectId, 'review_filter_sets', next)
  }
  function deleteSet() {
    const next = sets.filter(x => x.name !== setName.trim())
    setSets(next); setSetName('')
    if (projectId != null) writePref(projectId, 'review_filter_sets', next)
  }
  const loadSet = name => { const x = sets.find(y => y.name === name); if (x) { setRule(ruleOfSet(x)); setSetName(name) } }

  return (
    <Modal show={show} onHide={onHide} size="lg" centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 14 }} className="d-flex align-items-center gap-2">
          <MaterialIcon name={ACTION_ICONS.review} size={18} /> Review recipes
        </Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ fontSize: 12 }}>
        <div className="text-muted mb-2">Which positions hold… <b>Show in list</b> filters the positions on the left, and each recipe highlights what matched.</div>
        <RuleBuilder rule={rule} columns={COLUMNS} valueOptions={valueOptions} minConditions={0}
          newCondition={NEW_CONDITION} onChange={patch => setRule(r => ({ ...r, ...patch }))} />

        <div className="d-flex align-items-center gap-2 mt-3">
          <Form.Select size="sm" style={{ width: 'auto', fontSize: 12 }} value="" aria-label="Saved filters"
            onChange={e => loadSet(e.target.value)} disabled={!sets.length}>
            <option value="">{sets.length ? 'Saved filters…' : 'No saved filters'}</option>
            {sets.map(x => <option key={x.name} value={x.name}>{x.name}</option>)}
          </Form.Select>
          <Form.Control size="sm" style={{ width: 160, fontSize: 12 }} placeholder="Name to save as" value={setName}
            onChange={e => setSetName(e.target.value)} aria-label="Filter name" />
          <Button size="sm" variant="outline-secondary" disabled={!setName.trim() || !asked} onClick={saveSet}>Save</Button>
          {sets.some(x => x.name === setName.trim()) && <Button size="sm" variant="link" className="text-danger p-0" onClick={deleteSet}>Delete</Button>}
        </div>

        {asked && (
          <div className="mt-3" data-testid="review-matches">
            <div className="fw-semibold mb-1" style={{ color: C.muted }}>{matches.length} position{matches.length === 1 ? '' : 's'} match</div>
            <div className="d-flex flex-wrap gap-1">
              {matches.map(ref => (
                <span key={ref} role="button" onClick={() => open(ref)} className="badge bg-light text-dark border"
                  style={{ fontFamily: 'monospace', fontSize: 11, cursor: 'pointer' }} title={`Show in list and open ${ref}`}>{ref}</span>
              ))}
            </div>
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        {query && <Button variant="link" size="sm" className="me-auto" onClick={() => { useStore.getState().showPositionQuery(null); onHide() }}>Clear the filter</Button>}
        <Button variant="outline-secondary" size="sm" onClick={onHide}>Close</Button>
        <Button variant="primary" size="sm" disabled={!matches.length} onClick={showInList}>
          Show {matches.length || ''} in list
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
