import React, { useState, useEffect, useMemo } from 'react'
import { Modal, Button, Form, Badge } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import InfoTip from './InfoTip'
import ConnectorBoard from './ConnectorBoard'
import RuleBuilder from './RuleBuilder'
import useConnectorGroups from './useConnectorGroups'
import { templateParts, partsToIngredients, signatureKey } from '../utils/connectorGroups'
import {
  TEMPLATE_RULE_COLUMNS, templateRule, ruleFromTags, ruleIsEmpty, ruleConditionsOf, ruleMatchesRecord,
  ruleSpecificity, ruleFor, compareRule, EMPTY_RULE,
} from '../utils/templateRules'

const COMMON_TAGS = ['Local', 'Remote-CC', 'Remote-CV', 'LIN', 'IP']
const cleanRule = r => ({ match: r.match === 'any' ? 'any' : 'all', conditions: ruleConditionsOf(r) })

/** A short list of refs, the rest counted. */
function RefList({ refs, max = 12 }) {
  if (!refs.length) return null
  return <span style={{ fontFamily: 'monospace' }}>{refs.slice(0, max).join(', ')}{refs.length > max ? ` +${refs.length - max} more` : ''}</span>
}

/**
 * CollectionEditor — create or edit a Connector Template (virtual ElementTypeCollection).
 * Which positions it applies to is a RULE (templateRules.js) built like a tag rule: any
 * field — tags, DesignDB columns, what the recipe holds — joined by AND / OR.
 * Props: show, onHide, collection (null = create mode), initialTags (create-mode seed)
 */
export default function CollectionEditor({ show, onHide, collection, initialTags = [], initialParts = null, onSaved }) {
  const createCollection = useStore(s => s.createCollection)
  const updateCollection = useStore(s => s.updateCollection)
  const pins             = useStore(s => s.connectorPins)
  const excludes         = useStore(s => s.connectorExcludes)
  const unpinPositions   = useStore(s => s.unpinPositions)
  const restoreToTemplate = useStore(s => s.restoreToTemplate)
  const tagPalette       = useStore(s => s.tagPalette)
  const positionUI       = useStore(s => s.positionUI)
  const groups           = useConnectorGroups()
  // The project's own tags (the palette and every tag a position carries, rule-made or not),
  // then the common ones: a rule can only match tags that exist.
  const tagOptions = useMemo(() => {
    const inUse = new Set(tagPalette || [])
    for (const ui of Object.values(positionUI || {})) for (const t of (ui?.tags || [])) inUse.add(t)
    return [...new Set([...[...inUse].sort((a, b) => a.localeCompare(b)), ...COMMON_TAGS])]
  }, [tagPalette, positionUI])

  const [name,         setName]         = useState('')
  const [rule,         setRule]         = useState(EMPTY_RULE)
  const [ingredients,  setIngredients]  = useState([])
  const [saving,       setSaving]       = useState(false)
  const [suggested,    setSuggested]    = useState(null)   // { exact, outsiders, from }

  useEffect(() => {
    if (show) {
      if (collection) {
        setName(collection.Name || '')
        setRule(templateRule(collection))
        setIngredients(templateParts(collection))
      } else {
        setName('')
        setRule(ruleFromTags(initialTags ?? [], []))
        setIngredients(initialParts ?? [])
      }
      setSuggested(null)
      setSaving(false)
    }
  }, [show, collection])

  const scope = useMemo(() => groups.scoped.map(pt => pt.PositionTypeRef), [groups])
  const partsKey = signatureKey(ingredients.filter(p => p.ref?.trim()))
  const hasParts = r => partsKey !== '' && signatureKey(groups.sigs.get(r) || []) === partsKey
  // Positions that already carry exactly these connectors, plus any pinned here: what a
  // suggested rule should pick out.
  const carriers = useMemo(() => [...new Set([
    ...scope.filter(hasParts),
    ...(collection ? pins[collection.CollectionId] || [] : []),
  ])], [scope, partsKey, groups, pins, collection])   // eslint-disable-line react-hooks/exhaustive-deps
  const empty = ruleIsEmpty(rule)
  const cmp = useMemo(() => (empty ? null : compareRule(rule, scope, groups.recOf, hasParts)),
    [rule, scope, groups, partsKey])   // eslint-disable-line react-hooks/exhaustive-deps

  function suggest() {
    const found = ruleFor(carriers, scope, groups.recOf)
    if (!found) { setSuggested({ none: true }); return }
    setRule(found.rule)
    setSuggested({ exact: found.exact, outsiders: found.outsiders, from: carriers.length })
  }

  async function saveAsCopy() {
    const copyName = name.trim() === (collection?.Name || '').trim() ? `${name.trim()} (copy)` : name.trim()
    setSaving(true)
    try {
      await createCollection(copyName, partsToIngredients(ingredients.filter(p => p.ref?.trim())), [], [], cleanRule(rule))
      onHide()
    } finally { setSaving(false) }
  }

  // A pinned position is held only while it passes this editor's rule.
  const heldByRule = r => empty || ruleMatchesRecord(rule, groups.recOf(r))

  async function handleSave() {
    if (!name.trim()) return
    const cleanIngredients = partsToIngredients(ingredients.filter(p => p.ref?.trim()))

    setSaving(true)
    try {
      if (collection) {
        await updateCollection(collection.CollectionId, {
          Name: name.trim(), Rule: cleanRule(rule), ApplicableTags: [], ExcludedTags: [], Ingredients: cleanIngredients,
        })
      } else {
        await createCollection(name.trim(), cleanIngredients, [], [], cleanRule(rule))
      }
      // Pinned positions the rule now leaves out are let go, not kept as dead pins.
      if (collection) {
        const drop = (pins[collection.CollectionId] || []).filter(r => !heldByRule(r))
        if (drop.length) await unpinPositions(collection.CollectionId, drop)
      }
      onSaved?.(collection?.CollectionId)
      onHide()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal show={show} onHide={onHide} size="xl">
      <Modal.Header closeButton>
        <Modal.Title>{collection ? 'Edit Connector Template' : 'New Connector Template'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form.Group className="mb-3">
          <Form.Label className="fw-semibold">Name</Form.Label>
          <Form.Control
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. 5-pin WAGO Local"
          />
        </Form.Group>

        <Form.Group className="mb-3" data-testid="template-rule">
          <div className="d-flex align-items-center gap-2 mb-1">
            <Form.Label className="fw-semibold mb-0">Applies to positions that match</Form.Label>
            <InfoTip>
              Any field: tags, DesignDB columns, or what the recipe holds besides connectors. When several
              templates match a position, the most specific rule wins (more conditions joined by AND); a
              pinned position always stays with its template. With no rule, a template applies everywhere
              until it holds pinned positions.
            </InfoTip>
            {!empty && <span className="text-muted" style={{ fontSize: 11 }}>specificity {ruleSpecificity(rule)}</span>}
            <Button size="sm" variant="outline-primary" className="ms-auto" style={{ fontSize: 12 }} onClick={suggest}
              disabled={carriers.length === 0} data-testid="suggest-rule"
              title={carriers.length ? `Find a rule that picks out the ${carriers.length} position(s) that already have these connectors` : 'No position has exactly these connectors yet'}>
              <MaterialIcon name="auto_fix_high" size={14} /> Suggest from {carriers.length} position{carriers.length === 1 ? '' : 's'} with these connectors
            </Button>
          </div>
          {empty && (
            <div className="text-muted fst-italic mb-1" style={{ fontSize: 11 }}>
              No conditions: applies to every position{collection && (pins[collection.CollectionId] || []).length ? ' (here, only its pinned ones)' : ''}.
            </div>
          )}
          <RuleBuilder rule={rule} columns={TEMPLATE_RULE_COLUMNS} valueOptions={{ Tags: tagOptions }} minConditions={0}
            newCondition={{ column: 'Tags', op: 'equals', value: '' }}
            onChange={patch => { setRule(r => ({ ...r, ...patch })); setSuggested(null) }} />

          {suggested && (
            <div className={`mt-2 p-2 rounded ${suggested.exact ? 'bg-success-subtle' : 'bg-warning-subtle'}`} style={{ fontSize: 12 }} data-testid="suggest-result">
              {suggested.none
                ? 'Nothing these positions share picks them out; pin them instead.'
                : suggested.exact
                  ? <>Picks out exactly the {suggested.from} position{suggested.from === 1 ? '' : 's'} with these connectors.</>
                  : <>Keeps all {suggested.from}, but also matches <RefList refs={suggested.outsiders} />: they would get these connectors. Add a condition, or remove them from the template.</>}
            </div>
          )}

          {cmp && (
            <div className="mt-2 d-flex flex-wrap gap-3" style={{ fontSize: 12 }} data-testid="rule-compare">
              <span title={cmp.same.join(', ')}><MaterialIcon name="check_circle" size={13} className="text-success" /> {cmp.same.length} match and already have these connectors</span>
              <span title={cmp.change.join(', ')}><MaterialIcon name="edit" size={13} className="text-primary" /> {cmp.change.length} match and would change</span>
              {cmp.missed.length > 0 && (
                <span title={cmp.missed.join(', ')} className="text-warning-emphasis">
                  <MaterialIcon name="report" size={13} /> {cmp.missed.length} have these connectors but the rule leaves them out: <RefList refs={cmp.missed} max={6} />
                </span>
              )}
            </div>
          )}
        </Form.Group>

        {collection && ((pins[collection.CollectionId] || []).length > 0 || (excludes[collection.CollectionId] || []).length > 0) && (() => {
          // Held = pinned AND passing the rule as it stands in this editor (saved or not).
          const allPinned = pins[collection.CollectionId] || []
          const held = allPinned.filter(r => heldByRule(r))
          const leftOut = allPinned.filter(r => !heldByRule(r))
          return (
            <Form.Group className="mb-3" data-testid="editor-positions">
              <Form.Label className="fw-semibold">Positions held by this template</Form.Label>
              <div className="text-muted mb-1" style={{ fontSize: 12 }}>
                Pinned positions stay in this template (and out of every other), as long as they pass the rule above.
                Removed positions stay out whatever the rule says.
              </div>
              <div className="d-flex flex-wrap gap-1">
                {held.map(r => (
                  <Badge key={r} bg="light" text="dark" className="border d-inline-flex align-items-center gap-1" style={{ fontWeight: 400 }}>
                    <MaterialIcon name="push_pin" size={11} /> <span style={{ fontFamily: 'monospace' }}>{r}</span>
                    <button type="button" className="btn btn-link p-0" style={{ fontSize: 10 }} aria-label={`Unpin ${r}`} title="Unpin: the rules decide"
                      onClick={() => unpinPositions(collection.CollectionId, [r])}><MaterialIcon name="close" size={11} /></button>
                  </Badge>
                ))}
                {(excludes[collection.CollectionId] || []).map(r => (
                  <Badge key={`x-${r}`} bg="light" text="muted" className="border d-inline-flex align-items-center gap-1" style={{ fontWeight: 400, textDecoration: 'line-through' }}>
                    <span style={{ fontFamily: 'monospace' }}>{r}</span>
                    <button type="button" className="btn btn-link p-0" style={{ fontSize: 10, textDecoration: 'none' }} title="Put it back"
                      onClick={() => restoreToTemplate(collection.CollectionId, [r])}>restore</button>
                  </Badge>
                ))}
              </div>
              {leftOut.length > 0 && (
                <div className="mt-1 text-muted" style={{ fontSize: 11 }} data-testid="left-out-by-rule">
                  <MaterialIcon name="filter_alt" size={12} /> Left out by the rule above (unpinned when you save): {leftOut.join(', ')}
                </div>
              )}
            </Form.Group>
          )
        })()}

        <Form.Group className="mb-2">
          <Form.Label className="fw-semibold">Parts</Form.Label>
          <div className="text-muted mb-2" style={{ fontSize: 12 }}>
            Drag parts from the left into <strong>Site</strong> (first-fix, goes to site on its own) or{' '}
            <strong>Inside wrapper</strong> (ships inside the DL or LIN assembly each position has).
          </div>
          <ConnectorBoard parts={ingredients} onChange={setIngredients} />
        </Form.Group>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>Cancel</Button>
        {collection && (
          <Button variant="outline-primary" onClick={saveAsCopy} disabled={saving || !name.trim()} title="Save these settings as a new template; this one is left as it was">
            Save as a copy
          </Button>
        )}
        <Button variant="primary" onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? 'Saving…' : collection ? 'Save changes' : 'Create template'}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
