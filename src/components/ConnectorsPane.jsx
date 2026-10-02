import React, { useMemo, useState } from 'react'
import { Button, Dropdown, Modal } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import IconButton from './IconButton'
import CellDetailPanel from './CellDetailPanel'
import useConnectorGroups from './useConnectorGroups'
import { templateParts, partsToIngredients, diffParts, diffSize, describeParts, findGroups, suggestName } from '../utils/connectorGroups'
import { templateRule, ruleIsEmpty, describeRule } from '../utils/templateRules'

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
  const sameAs = useMemo(() => (have.length
    ? (findGroups(groups.sigs).find(g => g.positions.includes(posRef))?.positions || []).filter(p => p !== posRef)
    : []), [groups.sigs, have, posRef])

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

  async function makeTemplate() {
    const name = window.prompt(`Name a template from ${posRef}'s connectors`, suggestName(have))?.trim()
    if (name) await makeTemplateFromGroup(name, have, [posRef])
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
            {have.length ? <>No template for {posRef}. Its connectors: <span style={mono}>{describeParts(have)}</span></> : <>No connectors here, and no template asks for any.</>}
          </div>
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
          {sameAs.length > 0 && (
            <div className="mb-2">
              <span className="text-muted">Same connectors as </span>
              {sameAs.map((p, i) => (
                <span key={p}>{i > 0 && ', '}
                  <Button variant="link" size="sm" className="p-0 align-baseline" style={{ fontSize: 11 }} onClick={() => setActivePosition(p)}>{p}</Button>
                </span>
              ))}
            </div>
          )}
          {have.length > 0 && (
            <Button size="sm" variant="outline-secondary" className="py-0" style={{ fontSize: 10 }} onClick={makeTemplate} data-testid="make-template">
              Make a template from {posRef}
            </Button>
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
