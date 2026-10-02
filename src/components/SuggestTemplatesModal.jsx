import React, { useMemo, useState } from 'react'
import { Button, Form, Modal } from 'react-bootstrap'
import useStore from '../store/useStore'
import { describeParts, suggestName } from '../utils/connectorGroups'
import { ruleFor, describeRule } from '../utils/templateRules'

/**
 * SuggestTemplatesModal — connector templates for an existing project in one pass, from
 * its own recipes (its precedent): every group of positions sharing a connector set-up
 * that isn't a template yet, each with a name and the rule that picks it out exactly (or
 * pinned to its positions when no rule does). Groups of two or more are ticked; you
 * untick, rename, then create them all.
 */
export default function SuggestTemplatesModal({ show, onHide, groups }) {
  const makeTemplateFromGroup = useStore(s => s.makeTemplateFromGroup)
  const suggestions = useMemo(() => {
    if (!show) return []
    const scope = groups.scoped.map(pt => pt.PositionTypeRef)
    return groups.groups.map(g => {
      const found = ruleFor(g.positions, scope, groups.recOf)
      const rule = found?.exact ? found.rule : null
      return { key: g.key, parts: g.parts, positions: g.positions, rule, name: suggestName(g.parts, rule) }
    })
  }, [show, groups])
  const [ticked, setTicked] = useState({})
  const [names, setNames] = useState({})
  const [busy, setBusy] = useState(false)
  const isTicked = s => ticked[s.key] ?? s.positions.length >= 2
  const nameOf = s => names[s.key] ?? s.name
  const chosen = suggestions.filter(isTicked)

  async function create() {
    setBusy(true)
    try {
      for (const s of chosen) await makeTemplateFromGroup(nameOf(s).trim() || s.name, s.parts, s.positions, { rule: s.rule })
      setTicked({}); setNames({})
      onHide()
    } finally { setBusy(false) }
  }

  return (
    <Modal show={show} onHide={onHide} size="lg" scrollable>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 15 }}>Templates from this project's recipes</Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ fontSize: 12 }} data-testid="suggest-templates">
        <p className="text-muted mb-2" style={{ fontSize: 11 }}>
          Positions already built the same way, grouped. Each ticked group becomes a template: by the rule that picks
          out exactly those positions, or pinned to them when no rule does. A group of one is left unticked.
        </p>
        {suggestions.length === 0 && <p className="text-muted">Every connector set-up here is already a template.</p>}
        {suggestions.map(s => (
          <div key={s.key} className="d-flex gap-2 py-2 border-bottom" data-testid="suggested-template">
            <Form.Check type="checkbox" checked={isTicked(s)} aria-label={`Make a template for ${s.positions.join(', ')}`}
              onChange={() => setTicked(t => ({ ...t, [s.key]: !isTicked(s) }))} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Form.Control size="sm" value={nameOf(s)} aria-label="Template name" disabled={!isTicked(s)}
                onChange={e => setNames(n => ({ ...n, [s.key]: e.target.value }))} style={{ fontSize: 12 }} />
              <div className="mt-1" style={{ fontFamily: 'monospace', fontSize: 11 }}>{describeParts(s.parts)}</div>
              <div className="text-muted" style={{ fontSize: 11 }}>
                {s.positions.length} position{s.positions.length === 1 ? '' : 's'}: {s.positions.join(', ')}
              </div>
              <div className="text-muted" style={{ fontSize: 11 }}>
                {s.rule ? <>Applies by rule: {describeRule(s.rule)}</> : <>Pinned to these positions (no rule picks out exactly them)</>}
              </div>
            </div>
          </div>
        ))}
      </Modal.Body>
      <Modal.Footer>
        <Button size="sm" variant="link" onClick={onHide}>Cancel</Button>
        <Button size="sm" variant="primary" disabled={!chosen.length || busy} onClick={create} data-testid="create-templates">
          Create {chosen.length} template{chosen.length === 1 ? '' : 's'}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
