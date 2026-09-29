import React, { useEffect, useMemo, useState } from 'react'
import { Modal, Button, Form, Badge } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import InfoTip from './InfoTip'
import RuleBuilder from './RuleBuilder'
import {
  STYLE_RULE_COLUMNS, FIELD_LABEL, findStyleGroups, styleRecords, recipeShape, styleRuleOf, suggestStyleRule, matchStyle,
} from '../utils/recipeStyles'
import { ruleConditionsOf, ruleSpecificity, compareRule, ruleMatchesRecord } from '../utils/templateRules'
import { conditionMatches } from '../utils/tagRules'

const EMPTY = { match: 'all', conditions: [] }
const up = s => String(s ?? '').trim().toUpperCase()
const shown = v => (Array.isArray(v) ? (v.length ? v.join(', ') : '(none)') : (v == null || String(v).trim() === '' ? '(empty)' : String(v)))
const OP_WORD = { equals: 'is', notEquals: 'is not', contains: 'contains', notContains: "doesn't contain", startsWith: 'starts with', matches: 'matches', isEmpty: 'is empty', isNotEmpty: 'is not empty', gt: '>', lt: '<', between: 'between' }
/** A shape key, in words: "Wrapper on site · inside: the Form's main product, 2PIN-REMOTE-PLUG". */
export function describeShape(key) {
  const word = w => (w === 'FORM:lead' ? "the Form's main product" : w === 'FORM:extra' ? 'its accessories' : w === 'WRAPPER' ? 'wrapper' : w)
  const at = { position: [], internal: [] }
  for (const part of String(key || '').split(' + ').filter(Boolean)) {
    const [sec, ...rest] = part.split(':')
    ;(at[sec] || (at[sec] = [])).push(word(rest.join(':')))
  }
  return [at.position.length && `On site: ${at.position.join(', ')}`, at.internal.length && `inside: ${at.internal.join(', ')}`].filter(Boolean).join(' · ')
}
const Refs = ({ refs, max = 10 }) => <span style={{ fontFamily: 'monospace' }}>{refs.slice(0, max).join(', ')}{refs.length > max ? ` +${refs.length - max}` : ''}</span>

/**
 * RecipeStylesWindow — the project's recipe styles (recipeStyles.js): recipe templates with a
 * rule saying which positions they are for. Styles already in the project's recipes are found
 * (positions built alike) and made into a style with a suggested rule; a style's rule is edited
 * like a connector template's, against today's recipes, with "Check a position".
 */
export default function RecipeStylesWindow({ show, onHide, focusId = null, records: given = null }) {
  const templates = useStore(s => s.templates)
  const recipes = useStore(s => s.recipes)
  const positionTypes = useStore(s => s.positionTypes)
  const formCaptures = useStore(s => s.formCaptures)
  const elementTypes = useStore(s => s.elementTypes)
  const saveAsTemplate = useStore(s => s.saveAsTemplate)
  const setStyleRule = useStore(s => s.setStyleRule)
  const deleteTemplate = useStore(s => s.deleteTemplate)
  const positionUI = useStore(s => s.positionUI)
  const records = useMemo(() => given || styleRecords({ positionTypes, elementTypes, formCaptures, positionUI }),
    [given, positionTypes, elementTypes, formCaptures, positionUI])
  const [sel, setSel] = useState(null)
  const [rule, setRule] = useState(EMPTY)
  const [checkRef, setCheckRef] = useState('')
  const [note, setNote] = useState(null)

  const styles = useMemo(() => templates.filter(t => styleRuleOf(t)), [templates])
  const scope = useMemo(() => positionTypes.filter(p => (p.IsCollection || p.isCollection) !== 'Y').map(p => p.PositionTypeRef), [positionTypes])
  const recOf = r => records.get(r) || {}
  const famOf = useMemo(() => new Map(elementTypes.map(e => [up(e.ElementTypeRef), e.Family || e.family || ''])), [elementTypes])
  const shapeOf = useMemo(() => {
    const m = new Map()
    for (const p of scope) {
      const caps = formCaptures?.byPosition?.[p] || []
      const lead = caps.find(c => c.role === 'lead') || caps[0]
      m.set(p, recipeShape(recipes, p, { formRefs: caps.map(c => c.elementTypeRef).filter(Boolean), leadRef: lead?.elementTypeRef, familyOf: r => famOf.get(up(r)) || '' }))
    }
    return m
  }, [scope, recipes, formCaptures, famOf])
  const found = useMemo(() => findStyleGroups(scope, { recipes, formCaptures, elementTypes })
    .map(g => ({ ...g, covered: g.positions.filter(p => matchStyle(recOf(p), styles)) })), [scope, recipes, formCaptures, elementTypes, styles])   // eslint-disable-line react-hooks/exhaustive-deps

  const current = styles.find(t => t.id === sel) || null
  useEffect(() => { if (show) { setSel(focusId || styles[0]?.id || null); setNote(null); setCheckRef('') } }, [show, focusId])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setRule(current ? styleRuleOf(current) || EMPTY : EMPTY) }, [sel, current?.id])   // eslint-disable-line react-hooks/exhaustive-deps

  // The shape this style stands for: the most common shape among the built positions it matches.
  const carrierShape = useMemo(() => {
    const n = new Map()
    for (const p of scope) {
      const s = shapeOf.get(p)
      if (s && ruleMatchesRecord(rule, recOf(p))) n.set(s, (n.get(s) || 0) + 1)
    }
    return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || ''
  }, [rule, scope, shapeOf])   // eslint-disable-line react-hooks/exhaustive-deps
  const cmp = useMemo(() => (ruleConditionsOf(rule).length && carrierShape
    ? compareRule(rule, scope, recOf, p => shapeOf.get(p) === carrierShape) : null), [rule, scope, carrierShape, shapeOf])   // eslint-disable-line react-hooks/exhaustive-deps

  async function makeStyle(g) {
    const name = window.prompt(`Name a recipe style for these ${g.positions.length} position${g.positions.length === 1 ? '' : 's'}`, `Style of ${g.positions[0]}`)?.trim()
    if (!name) return
    const against = scope.filter(p => shapeOf.get(p) && shapeOf.get(p) !== g.key)
    const found = suggestStyleRule(g.positions, scope, recOf, against)
    const t = await saveAsTemplate(g.positions[0], { name, scope: 'project', tags: [], rule: found?.rule || null })
    setSel(t?.id || null)
    setNote(found?.exact ? `Its rule picks out exactly the ${g.positions.length} built like this.`
      : found ? `Its rule also matches ${found.outsiders.join(', ')}, built differently: tighten it below.`
        : 'Nothing they share picks them out: write its rule below.')
  }
  function suggest() {
    const carriers = scope.filter(p => shapeOf.get(p) === carrierShape)
    if (!carriers.length) return
    const against = scope.filter(p => shapeOf.get(p) && shapeOf.get(p) !== carrierShape)
    const f = suggestStyleRule(carriers, scope, recOf, against)
    if (f) { setRule(f.rule); setNote(f.exact ? 'Suggested: picks out exactly the positions built like this.' : `Suggested, but it also matches ${f.outsiders.join(', ')}.`) }
  }

  const valueOptions = useMemo(() => {
    const vals = k => [...new Set([...records.values()].flatMap(r => (Array.isArray(r[k]) ? r[k] : [r[k]])).filter(Boolean).map(String))].sort()
    return Object.fromEntries(['Form.Main', 'Form.MainFamily', 'Form.Maker', 'Form.Extras', 'Kind.Product', 'Kind.Driver', 'Kind.Env', 'Tags'].map(k => [k, vals(k)]))
  }, [records])
  const checkRec = checkRef && records.has(checkRef) ? records.get(checkRef) : null

  return (
    <Modal show={show} onHide={onHide} size="xl" scrollable>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 15 }}>
          <MaterialIcon name="style" size={16} /> Recipe styles{' '}
          <InfoTip size={12}>
            A style is a recipe checked by a person plus a rule saying which positions are built that way:
            main product, its family, maker, accessories, driver location, interior / exterior, tags. When several
            match, the most specific rule wins. Build recipes groups positions by style first.
          </InfoTip>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ fontSize: 12 }}>
        <div className="d-flex gap-3">
          <div style={{ width: 300, flexShrink: 0 }}>
            <div className="fw-semibold mb-1">Styles ({styles.length})</div>
            {styles.length === 0 && <div className="text-muted fst-italic mb-2">None yet. Make one from the recipes below, or from Build recipes.</div>}
            {styles.map(t => (
              <div key={t.id} role="button" onClick={() => setSel(t.id)} data-testid="style-item"
                className="px-2 py-1 rounded mb-1" style={{ background: sel === t.id ? '#cfe2ff' : '#f8f9fa', cursor: 'pointer' }}>
                <div className="fw-semibold">{t.name}</div>
                <div className="text-muted text-truncate" style={{ fontSize: 10 }}>
                  {scope.filter(p => matchStyle(recOf(p), styles)?.id === t.id).length} positions · specificity {ruleSpecificity(styleRuleOf(t))}
                </div>
              </div>
            ))}
            <div className="fw-semibold mt-3 mb-1">Found in the recipes <InfoTip size={11}>Positions built alike: the same parts in the same places, whatever their own products.</InfoTip></div>
            {found.length === 0 && <div className="text-muted fst-italic">No recipes built yet.</div>}
            {found.map(g => (
              <div key={g.key} className="border rounded px-2 py-1 mb-1" data-testid="found-style">
                <div><strong>{g.positions.length}</strong> built alike{g.covered.length ? <span className="text-muted"> · {g.covered.length} already in a style</span> : null}</div>
                <div className="text-muted" style={{ fontSize: 10, wordBreak: 'break-word' }}>{describeShape(g.key)}</div>
                <div className="text-muted text-truncate" style={{ fontSize: 10 }}><Refs refs={g.positions} /></div>
                {g.covered.length < g.positions.length && (
                  <Button size="sm" variant="outline-primary" className="mt-1 py-0" style={{ fontSize: 11 }} onClick={() => makeStyle(g)}>Make style</Button>
                )}
              </div>
            ))}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            {!current && <div className="text-muted fst-italic">Pick a style to see and edit its rule.</div>}
            {current && (
              <div data-testid="style-editor">
                <div className="d-flex align-items-center gap-2 mb-2">
                  <strong style={{ fontSize: 14 }}>{current.name}</strong>
                  <Badge bg="light" text="dark" className="border">specificity {ruleSpecificity(rule)}</Badge>
                  <Button size="sm" variant="outline-primary" className="ms-auto" style={{ fontSize: 11 }} onClick={suggest} disabled={!carrierShape}>
                    <MaterialIcon name="auto_fix_high" size={13} /> Suggest from the positions built like it
                  </Button>
                </div>
                {note && <div className="mb-2 px-2 py-1 rounded" style={{ background: '#e7f1ff' }}>{note}</div>}
                <div className="text-muted mb-1" style={{ fontSize: 10, textTransform: 'uppercase' }}>Used for positions that match</div>
                <RuleBuilder rule={rule} columns={STYLE_RULE_COLUMNS} valueOptions={valueOptions} minConditions={0}
                  newCondition={{ column: 'Form.MainFamily', op: 'equals', value: '' }}
                  onChange={patch => { setRule(r => ({ ...r, ...patch })); setNote(null) }} />
                {cmp && (
                  <div className="mt-2 d-flex flex-wrap gap-3" data-testid="style-compare">
                    <span title={cmp.same.join(', ')}><MaterialIcon name="check_circle" size={13} className="text-success" /> {cmp.same.length} match and are built like it</span>
                    <span title={cmp.change.join(', ')}><MaterialIcon name="edit" size={13} className="text-primary" /> {cmp.change.length} match and would be built like it</span>
                    {cmp.missed.length > 0 && <span className="text-warning-emphasis" title={cmp.missed.join(', ')}><MaterialIcon name="report" size={13} /> {cmp.missed.length} built like it but not matched: <Refs refs={cmp.missed} max={5} /></span>}
                  </div>
                )}
                <div className="mt-2 d-flex align-items-center gap-2">
                  <span className="text-muted">Check a position:</span>
                  <Form.Control size="sm" list="style-check-refs" value={checkRef} onChange={e => setCheckRef(e.target.value.trim())}
                    aria-label="Check a position" style={{ width: 150, fontSize: 12 }} />
                  <datalist id="style-check-refs">{scope.map(r => <option key={r} value={r} />)}</datalist>
                </div>
                {checkRec && (
                  <div className="mt-1 ps-2" style={{ borderLeft: '2px solid #e5e7eb' }} data-testid="style-check">
                    {ruleConditionsOf(rule).map((c, i) => {
                      const ok = conditionMatches(c, checkRec)
                      return <div key={i} className={ok ? 'text-success' : 'text-danger'}>{ok ? '✓' : '✗'} {FIELD_LABEL[c.column] || c.column} {OP_WORD[c.op] || c.op} {c.op === 'isEmpty' || c.op === 'isNotEmpty' ? '' : `“${c.value}”`}<span className="text-muted"> — it has {shown(checkRec[c.column])}</span></div>
                    })}
                    {(() => {
                      const winner = matchStyle(checkRec, styles.map(t => (t.id === current.id ? { ...t, rule } : t)))
                      return winner?.id === current.id ? <div className="text-success fw-semibold">→ built with this style</div>
                        : winner ? <div className="text-danger fw-semibold">→ {winner.name} is more specific</div>
                          : <div className="text-muted">→ no style: grouped by the chosen dimensions</div>
                    })()}
                  </div>
                )}
                <div className="d-flex gap-2 mt-3">
                  <Button size="sm" onClick={async () => { await setStyleRule(current.id, rule); setNote('Saved.') }} data-testid="save-style-rule">Save rule</Button>
                  <Button size="sm" variant="outline-danger" onClick={async () => {
                    if (!window.confirm(`Delete the style “${current.name}”? Recipes already built stay as they are.`)) return
                    await deleteTemplate(current.id); setSel(null)
                  }}>Delete style</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer><Button size="sm" variant="secondary" onClick={onHide}>Close</Button></Modal.Footer>
    </Modal>
  )
}
