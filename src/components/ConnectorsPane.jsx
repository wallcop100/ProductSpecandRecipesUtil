import React, { useMemo, useState } from 'react'
import { Button, Dropdown, Form, Modal } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import IconButton from './IconButton'
import CellDetailPanel from './CellDetailPanel'
import { WagoSuggestion } from './GlobalConnectors'
import useConnectorGroups from './useConnectorGroups'
import { templateParts, partsToIngredients, diffParts, diffSize, describeParts, findGroups, suggestName } from '../utils/connectorGroups'
import { templateRule, ruleIsEmpty, describeRule, ruleFor, ruleMatchesRecord, TEMPLATE_RULE_COLUMNS } from '../utils/templateRules'
import { TAG_OPS } from '../utils/tagRules'

const mono = { fontFamily: 'monospace' }
const lc = s => String(s || '').toLowerCase()
const diffText = d => [
  ...d.add.map(p => `+ ${p.ref}${p.quantity > 1 ? ` ×${p.quantity}` : ''}${p.section === 'internal' ? ' (wrapper)' : ''}`),
  ...d.remove.map(p => `− ${p.ref}${p.section === 'internal' ? ' (wrapper)' : ''}`),
  ...d.qty.map(p => `${p.ref} ×${p.from} → ×${p.quantity}`),
].join(', ')

/**
 * ConnectorsPane — the Connectors screen's work for ONE position, in the builder's right
 * drawer: which template applies (and switching it), its parts here with one-click fixes
 * (CellDetailPanel), connectors the template doesn't ask for, and, with no template, the
 * nearest ones or a new one made from this position. Changing the template itself asks
 * first and names every position it changes.
 */
export default function ConnectorsPane({ posRef, onOpenConnectors }) {
  const groups = useConnectorGroups()
  const etCollections = useStore(s => s.etCollections)
  const pinPositions = useStore(s => s.pinPositions)
  const removeFromTemplate = useStore(s => s.removeFromTemplate)
  const restoreToTemplate = useStore(s => s.restoreToTemplate)
  const excludes = useStore(s => s.connectorExcludes)
  const updateCollection = useStore(s => s.updateCollection)
  const makeTemplateFromGroup = useStore(s => s.makeTemplateFromGroup)
  const setActivePosition = useStore(s => s.setActivePosition)
  const [confirm, setConfirm] = useState(null)   // { title, parts, collection }

  const m = groups.members.get(posRef) || { templates: [], pinnedTo: null, clash: false }
  const have = groups.sigs.get(posRef) || []
  const tplOf = id => etCollections.find(c => c.CollectionId === id)
  const current = !m.clash && m.templates.length === 1 ? tplOf(m.templates[0]) : null
  const excludedFrom = etCollections.filter(c => (excludes?.[c.CollectionId] || []).includes(posRef))

  // Nearest templates for a position without one: fewest changes first.
  const nearest = useMemo(() => etCollections
    .map(c => ({ c, d: diffParts(have, templateParts(c)) }))
    .map(x => ({ ...x, n: diffSize(x.d) }))
    .filter(x => x.n <= Math.max(2, Math.ceil(templateParts(x.c).length / 2)))
    .sort((a, b) => a.n - b.n || String(a.c.Name).localeCompare(String(b.c.Name)))
    .slice(0, 3), [etCollections, have])
  // Precedent from this project (type by type): the positions built like this one that
  // have no template yet, and the rule that picks them out exactly, if there is one.
  const sameAs = useMemo(() => (have.length
    ? (findGroups(groups.sigs).find(g => g.positions.includes(posRef))?.positions || [])
      .filter(p => p !== posRef && !(groups.members.get(p)?.templates || []).length)
    : []), [groups, have, posRef])
  const suggestion = useMemo(() => {
    if (!have.length) return null
    const positions = [posRef, ...sameAs]
    const found = ruleFor(positions, groups.scoped.map(pt => pt.PositionTypeRef), groups.recOf)
    const rule = found?.exact && positions.length > 1 ? found.rule : null
    return { positions, rule, name: suggestName(have, rule) }
  }, [have, sameAs, posRef, groups])
  const [tplName, setTplName] = useState(null)
  // "Make with conditions…": the template's rule set at the point of creation.
  const [withRule, setWithRule] = useState(null)   // { name, rule } while the window is open
  const positionUI = useStore(s => s.positionUI)
  const tagOptions = useMemo(() => [...new Set(Object.values(positionUI || {}).flatMap(u => u?.tags || []))].sort(), [positionUI])
  const scopeRefs = groups.scoped.map(pt => pt.PositionTypeRef)
  const ruleMatches = withRule && !ruleIsEmpty(withRule.rule)
    ? scopeRefs.filter(r => ruleMatchesRecord(withRule.rule, groups.recOf(r))) : []
  const ruleHasThis = !withRule || ruleIsEmpty(withRule.rule) || ruleMatches.includes(posRef)

  // Changing the template changes every position on it: ask, naming them.
  function askTemplateChange(collection, parts, title) {
    setConfirm({ collection, parts, title, affected: groups.membersOf(collection.CollectionId) })
  }
  const addPart = x => current && askTemplateChange(current,
    [...templateParts(current), { ref: x.ref, section: x.section === 'position' ? 'position' : 'internal', quantity: Number(x.row.Quantity ?? x.row.quantity ?? 1) || 1 }],
    `Add ${x.ref} to ${current.Name}`)
  const removePart = ing => {
    if (!current) return
    const ref = lc(ing.ElementTypeRef || ing.slotLabel)
    askTemplateChange(current, templateParts(current).filter(p => lc(p.ref) !== ref), `Take ${ing.ElementTypeRef || ing.slotLabel} out of ${current.Name}`)
  }

  // From the card: as assumed, or with the conditions set under Make with conditions.
  async function makeFromCard() {
    if (!withRule || (ruleIsEmpty(withRule.rule) && !suggestion.rule)) return makeTemplate(suggestion.positions)
    const name = (tplName ?? suggestion.name).trim() || suggestion.name
    const empty = ruleIsEmpty(withRule.rule)
    await makeTemplateFromGroup(name, have, empty ? suggestion.positions : [posRef], { rule: empty ? null : withRule.rule })
    setWithRule(null); setTplName(null)
  }
  async function makeTemplate(positions) {
    const name = (tplName ?? suggestion.name).trim() || suggestion.name
    await makeTemplateFromGroup(name, have, positions, { rule: positions.length > 1 ? suggestion.rule : null })
    setTplName(null)
  }

  const how = current
    ? (m.pinnedTo ? 'pinned here' : ruleIsEmpty(templateRule(current)) ? 'applies everywhere' : `by rule: ${describeRule(templateRule(current))}`)
    : null
  const isComplete = current ? diffSize(diffParts(have, templateParts(current))) === 0 : false

  return (
    <div className="px-2 pt-2" style={{ fontSize: 11 }} data-testid="connectors-pane">
      <div className="d-flex align-items-center gap-1 mb-1">
        <div className="fw-semibold text-muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>Connectors</div>
        <Dropdown align="end" className="ms-auto">
          <Dropdown.Toggle as={IconButton} bsSize="sm" variant="link" icon="more_horiz" size={14} aria-label="Connector template options" />
          <Dropdown.Menu style={{ fontSize: 11 }}>
            <Dropdown.Header style={{ fontSize: 10 }}>Use for {posRef}</Dropdown.Header>
            {etCollections.filter(c => c.CollectionId !== current?.CollectionId).map(c => (
              <Dropdown.Item key={c.CollectionId} onClick={() => pinPositions(c.CollectionId, [posRef])}>{c.Name}</Dropdown.Item>
            ))}
            {current && <Dropdown.Divider />}
            {current && (
              <Dropdown.Item onClick={() => removeFromTemplate(current.CollectionId, [posRef])} data-testid="not-this-template">
                Not this template
              </Dropdown.Item>
            )}
            {onOpenConnectors && <Dropdown.Item onClick={() => onOpenConnectors(posRef)}>Open in Connectors →</Dropdown.Item>}
          </Dropdown.Menu>
        </Dropdown>
      </div>

      {/* 1. Which template */}
      {m.clash ? (
        <div className="mb-2 p-2 rounded" style={{ background: '#fff3cd', color: '#664d03' }} data-testid="connector-clash">
          <MaterialIcon name="call_split" size={13} /> Two templates fit {posRef} equally: pick one
          <div className="d-flex gap-1 flex-wrap mt-1">
            {m.templates.map(id => (
              <Button key={id} size="sm" variant="outline-primary" className="py-0" style={{ fontSize: 10 }}
                onClick={() => pinPositions(id, [posRef])}>{tplOf(id)?.Name || id}</Button>
            ))}
          </div>
        </div>
      ) : current ? (
        <div className="mb-1" data-testid="connector-template">
          <MaterialIcon name={isComplete ? 'check_circle' : 'error'} size={13} style={{ color: isComplete ? '#198754' : '#dc3545' }} />{' '}
          <strong>{current.Name}</strong> <span className="text-muted">· {how}</span>
        </div>
      ) : null}

      {/* 2 + 3. Its parts here, fixes, and connectors it doesn't ask for */}
      {current && (
        <CellDetailPanel posRef={posRef} collectionId={current.CollectionId} compact
          onAddToTemplate={addPart} onRemoveFromTemplate={removePart} />
      )}

      {/* 5. No template */}
      {!current && !m.clash && (
        <div data-testid="connector-none">
          <div className="text-muted mb-1">
            {have.length ? <>No template for {posRef} yet.</> : <>No connectors here, and no template asks for any.</>}
          </div>
          <WagoSuggestion posRef={posRef} />
          {nearest.length > 0 && (
            <div className="mb-2">
              <div className="fw-semibold" style={{ fontSize: 10 }}>Nearest templates</div>
              {nearest.map(({ c, d, n }) => (
                <div key={c.CollectionId} className="d-flex align-items-center gap-1 py-1 border-bottom" data-testid="nearest-template">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div>{c.Name} <span className="text-muted">· {n === 0 ? 'matches' : `${n} part${n === 1 ? '' : 's'} off`}</span></div>
                    {n > 0 && <div className="text-muted text-truncate" style={{ ...mono, fontSize: 10 }} title={diffText(d)}>{diffText(d)}</div>}
                  </div>
                  <Button size="sm" variant="outline-primary" className="py-0" style={{ fontSize: 10 }}
                    onClick={() => pinPositions(c.CollectionId, [posRef])}>Use</Button>
                </div>
              ))}
            </div>
          )}
          {suggestion && (
            <div className="p-2 rounded mb-2" style={{ background: '#f8f9fa', border: '1px solid #dee2e6' }} data-testid="suggested-template">
              <div className="fw-semibold mb-1" style={{ fontSize: 10 }}>New template from {posRef}</div>
              <Form.Control size="sm" value={tplName ?? suggestion.name} onChange={e => setTplName(e.target.value)}
                aria-label="Template name" style={{ fontSize: 11 }} />
              <Section title="Parts"><PartPills have={have} /></Section>
              {/* Make with conditions opens WHERE here, on the card: the conditions as pills,
                  each edited in place, and the positions they match, live. */}
              {withRule && (
                <Section title="Where">
                  <InlineRule rule={withRule.rule} onChange={rule => setWithRule(w => ({ ...w, rule }))} tagOptions={tagOptions} />
                  <div className="mt-1" data-testid="rule-preview">
                    <span className="d-flex flex-wrap align-items-center gap-1">
                      <MaterialIcon name="arrow_forward" size={12} style={{ color: '#6c757d' }} />
                      {(ruleIsEmpty(withRule.rule) ? suggestion.positions : ruleMatches).slice(0, 16).map(r => (
                        <span key={r} className="rounded-pill px-2" style={{ ...pill, fontFamily: 'monospace', fontWeight: r === posRef ? 700 : 400 }}>
                          {ruleIsEmpty(withRule.rule) && <MaterialIcon name="push_pin" size={10} style={{ marginRight: 2, verticalAlign: '-1px', color: '#6c757d' }} />}{r}
                        </span>
                      ))}
                      {!ruleIsEmpty(withRule.rule) && ruleMatches.length === 0 && <span className="text-muted">no position</span>}
                      {!ruleIsEmpty(withRule.rule) && ruleMatches.length > 16 && <span className="text-muted">+{ruleMatches.length - 16}</span>}
                    </span>
                    {!ruleHasThis && <div className="text-danger" data-testid="rule-misses-this">These conditions leave out {posRef} itself.</div>}
                  </div>
                </Section>
              )}
              <div className="d-flex gap-1 mt-2">
                <Button size="sm" variant="primary" className="py-0" style={{ fontSize: 10 }} data-testid="make-template"
                  disabled={!ruleHasThis} onClick={makeFromCard}>Make template</Button>
                <Button size="sm" variant={withRule ? 'secondary' : 'outline-primary'} className="py-0" style={{ fontSize: 10 }} data-testid="make-template-rule"
                  aria-expanded={!!withRule}
                  onClick={() => setWithRule(w => (w ? null : { rule: suggestion.rule || { match: 'all', conditions: [] } }))}>
                  Make with conditions {withRule ? '▴' : '▾'}
                </Button>
              </div>
            </div>
          )}
          {excludedFrom.length > 0 && (
            <div className="text-muted mt-2" style={{ fontSize: 10 }}>
              Taken out of {excludedFrom.map(c => (
                <span key={c.CollectionId}>{c.Name} <Button variant="link" size="sm" className="p-0 align-baseline" style={{ fontSize: 10 }}
                  onClick={() => restoreToTemplate(c.CollectionId, [posRef])}>put back</Button> </span>
              ))}
            </div>
          )}
        </div>
      )}


      {/* 4. A change to the template, which reaches every position on it */}
      <Modal show={!!confirm} onHide={() => setConfirm(null)} size="sm">
        <Modal.Header closeButton><Modal.Title style={{ fontSize: 14 }}>{confirm?.title}</Modal.Title></Modal.Header>
        <Modal.Body style={{ fontSize: 12 }} data-testid="template-change-confirm">
          This changes the template <strong>{confirm?.collection?.Name}</strong> for {confirm?.affected?.length || 0} position{confirm?.affected?.length === 1 ? '' : 's'}:
          <div className="mt-1" style={mono}>{(confirm?.affected || []).join(', ') || '(none yet)'}</div>
          <div className="text-muted mt-2" style={{ fontSize: 11 }}>Their recipes are not changed: those that no longer match show it in their Connectors tab and the matrix.</div>
        </Modal.Body>
        <Modal.Footer>
          <Button size="sm" variant="link" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button size="sm" variant="primary" data-testid="template-change-ok" onClick={async () => {
            await updateCollection(confirm.collection.CollectionId, { Ingredients: partsToIngredients(confirm.parts) })
            setConfirm(null)
          }}>Change template</Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}

/** A boxed section of the new-template card, headed like the recipe's sections. */
function Section({ title, children }) {
  return (
    <div className="mt-2" data-testid={`section-${title.toLowerCase()}`}>
      <div className="d-flex align-items-center gap-2 mb-1">
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.06em', color: '#6c757d' }}>{title.toUpperCase()}</span>
        <span style={{ flex: 1, borderTop: '1px solid #dee2e6' }} />
      </div>
      <div className="ps-1">{children}</div>
    </div>
  )
}

const short = ref => String(ref).replace(/^ET-/i, '')
const pill = { fontSize: 10, lineHeight: '18px', background: '#fff', border: '1px solid #dee2e6' }

/** This position's connectors: on site, then (dashed) inside the wrapper. */
function PartPills({ have }) {
  const row = (parts, inside) => parts.length > 0 && (
    <div className="d-flex flex-wrap align-items-center gap-1 mb-1">
      {parts.map(p => (
        <span key={`${p.section}|${p.ref}`} className="rounded-pill px-2" title={p.ref}
          style={{ ...pill, fontFamily: 'monospace', ...(inside ? { borderStyle: 'dashed' } : {}) }}>
          {inside && <MaterialIcon name="inventory_2" size={10} style={{ marginRight: 2, verticalAlign: '-1px' }} />}
          {short(p.ref)}{p.quantity > 1 ? ` ×${p.quantity}` : ''}
        </span>
      ))}
      {inside && <span className="text-muted" style={{ fontSize: 10 }}>in wrapper</span>}
    </div>
  )
  return (
    <div data-testid="assumed-parts">
      {row(have.filter(p => p.section !== 'internal'), false)}
      {row(have.filter(p => p.section === 'internal'), true)}
    </div>
  )
}

/**
 * InlineRule — a rule edited on the card: each condition a pill; tapping one opens it in
 * place (column / operator / value); the AND / OR pill between them flips on a tap; "+"
 * adds one, opened for typing.
 */
function InlineRule({ rule, onChange, tagOptions = [] }) {
  const [editing, setEditing] = useState(null)
  const conds = rule?.conditions || []
  const any = rule?.match === 'any'
  const set = (i, patch) => onChange({ ...rule, conditions: conds.map((c, k) => (k === i ? { ...c, ...patch } : c)) })
  const remove = i => { onChange({ ...rule, conditions: conds.filter((_, k) => k !== i) }); setEditing(null) }
  const add = () => { onChange({ ...rule, match: rule?.match || 'all', conditions: [...conds, { column: 'Tags', op: 'equals', value: '' }] }); setEditing(conds.length) }
  const join = { color: any ? '#b45309' : '#0d6efd', background: any ? '#fff4e5' : '#e7f1ff' }
  const opOf = op => TAG_OPS.find(o => o.op === op) || TAG_OPS[0]
  const sel = { fontSize: 10, padding: '0 18px 0 4px', height: 22, width: 'auto', minWidth: 0, backgroundPosition: 'right 3px center', backgroundSize: '9px 7px' }
  return (
    <div className="d-flex flex-wrap align-items-center gap-1" data-testid="inline-rule">
      {conds.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <button type="button" className="rounded-pill border-0 px-2" data-testid="rule-join"
              title={any ? 'OR: any condition. Tap for AND.' : 'AND: every condition. Tap for OR.'}
              onClick={() => onChange({ ...rule, match: any ? 'all' : 'any' })}
              style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, lineHeight: '16px', cursor: 'pointer', ...join }}>{any ? 'OR' : 'AND'}</button>
          )}
          {editing === i ? (
            <span className="d-inline-flex flex-wrap align-items-center gap-1 rounded px-1 py-1" style={{ background: '#fff', border: '1px solid #86b7fe' }} data-testid="cond-editing">
              <Form.Select size="sm" value={c.column} aria-label="Column" style={sel} onChange={e => set(i, { column: e.target.value })}>
                {TEMPLATE_RULE_COLUMNS.map(g => (
                  <optgroup key={g.label} label={g.label}>{g.options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}</optgroup>
                ))}
              </Form.Select>
              <Form.Select size="sm" value={c.op} aria-label="Operator" style={sel} onChange={e => set(i, { op: e.target.value })}>
                {TAG_OPS.map(o => <option key={o.op} value={o.op}>{o.label}</option>)}
              </Form.Select>
              {opOf(c.op).needsValue && (
                <Form.Control size="sm" value={c.value ?? ''} aria-label="Value" autoFocus list={c.column === 'Tags' ? 'inline-rule-tags' : undefined}
                  style={{ fontSize: 10, height: 22, width: 90, padding: '0 4px' }}
                  onChange={e => set(i, { value: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') setEditing(null) }} />
              )}
              <button type="button" className="btn btn-link p-0" title="Done" aria-label="Done" onClick={() => setEditing(null)}>
                <MaterialIcon name="check" size={14} />
              </button>
              <button type="button" className="btn btn-link p-0 text-danger" title="Remove condition" aria-label="Remove condition" onClick={() => remove(i)}>
                <MaterialIcon name="close" size={14} />
              </button>
            </span>
          ) : (
            <button type="button" className="rounded-pill px-2" data-testid="cond-pill" title="Tap to change"
              onClick={() => setEditing(i)} style={{ ...pill, background: '#f1f3f5', cursor: 'pointer' }}>
              <span className="text-muted">{String(c.column).replace(/^Recipe\./, '')}</span> {opOf(c.op).label}
              {opOf(c.op).needsValue && <> <strong>{String(c.value ?? '') || '…'}</strong></>}
            </button>
          )}
        </React.Fragment>
      ))}
      <button type="button" className="rounded-pill px-2" data-testid="add-cond" onClick={add}
        style={{ ...pill, borderStyle: 'dashed', color: '#6c757d', cursor: 'pointer' }}>+ condition</button>
      <datalist id="inline-rule-tags">{tagOptions.map(t => <option key={t} value={t} />)}</datalist>
    </div>
  )
}
