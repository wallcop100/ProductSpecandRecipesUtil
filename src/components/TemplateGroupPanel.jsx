import React, { useMemo, useState } from 'react'
import { Button, Form, Modal } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { templateParts, diffParts, diffSize, describeParts, nearMisses, suggestName } from '../utils/connectorGroups'

const diffText = d => [
  ...d.add.map(p => `+ ${p.ref}${p.quantity > 1 ? ` ×${p.quantity}` : ''}${p.section === 'internal' ? ' (wrapper)' : ''}`),
  ...d.remove.map(p => `− ${p.ref}${p.section === 'internal' ? ' (wrapper)' : ''}`),
  ...d.qty.map(p => `${p.ref} ×${p.from} → ×${p.quantity}`),
].join(', ')

/**
 * TemplateGroupPanel — one connector template as a GROUP: its positions, whether each
 * matches, and the moves on the whole group — make them all match, fork, split some off,
 * pull in near misses, settle clashes.
 */
export default function TemplateGroupPanel({ collectionId, groups, onEdit, onSelect, onOpenPosition }) {
  const collection = useStore(s => s.etCollections.find(c => c.CollectionId === collectionId))
  const pins = useStore(s => s.connectorPins)
  const pinPositions = useStore(s => s.pinPositions)
  const unpinPositions = useStore(s => s.unpinPositions)
  const removeFromTemplate = useStore(s => s.removeFromTemplate)
  const restoreToTemplate = useStore(s => s.restoreToTemplate)
  const excludes = useStore(s => s.connectorExcludes)
  const forkTemplate = useStore(s => s.forkTemplate)
  const makeTemplateFromGroup = useStore(s => s.makeTemplateFromGroup)
  const planTemplateApply = useStore(s => s.planTemplateApply)
  const applyTemplateToPositions = useStore(s => s.applyTemplateToPositions)
  const [picked, setPicked] = useState(() => new Set())
  const [preview, setPreview] = useState(null)   // { posRefs, plan }
  const [done, setDone] = useState(null)

  const parts = useMemo(() => templateParts(collection), [collection])
  const members = groups.membersOf(collectionId)
  const memberSet = new Set(members)
  const pinned = new Set(pins[collectionId] || [])
  const misses = useMemo(() => nearMisses(parts, groups.sigs, { members: memberSet }).filter(m => !m.member), [parts, groups])   // eslint-disable-line react-hooks/exhaustive-deps
  const clashes = groups.clashes.filter(r => groups.members.get(r)?.templates.includes(collectionId))
  if (!collection) return null

  const diffOf = r => diffParts(groups.sigs.get(r) || [], parts)
  const off = members.filter(r => diffSize(diffOf(r)) > 0)
  const toggle = r => setPicked(p => { const n = new Set(p); if (n.has(r)) n.delete(r); else n.add(r); return n })

  function openApply(posRefs) {
    setPreview({ posRefs, plan: planTemplateApply(collectionId, posRefs) })
  }
  function confirmApply() {
    const plan = applyTemplateToPositions(collectionId, preview.posRefs)
    setDone(`${plan.length} position${plan.length === 1 ? '' : 's'} now match ${collection.Name}.`)
    setPreview(null)
  }
  async function fork() {
    const name = window.prompt('Name the copy', `${collection.Name} (copy)`)?.trim()
    if (!name) return
    const saved = await forkTemplate(collectionId, { name })
    if (saved) { onSelect?.(saved.CollectionId); onEdit?.(saved) }
  }
  async function split(posRefs) {
    const name = window.prompt(`Name the new template for ${posRefs.length} position${posRefs.length === 1 ? '' : 's'}`, `${collection.Name} (split)`)?.trim()
    if (!name) return
    const saved = await forkTemplate(collectionId, { name, positions: posRefs })
    setPicked(new Set())
    if (saved) onSelect?.(saved.CollectionId)
  }
  async function splitOut(posRef) {
    const own = groups.sigs.get(posRef) || []
    const name = window.prompt(`Name a template for ${posRef}'s own connectors`, suggestName(own))?.trim()
    if (!name) return
    const saved = await makeTemplateFromGroup(name, own, [posRef])
    if (saved) onSelect?.(saved.CollectionId)
  }

  return (
    <div className="p-3" style={{ fontSize: 12, overflowY: 'auto', height: '100%' }} data-testid="template-group-panel">
      <div className="d-flex align-items-center gap-2 mb-1">
        <strong style={{ fontSize: 14 }}>{collection.Name}</strong>
        <Button size="sm" variant="outline-primary" className="ms-auto" style={{ fontSize: 11 }} onClick={() => onEdit?.(collection)}>Edit parts</Button>
        <Button size="sm" variant="outline-secondary" style={{ fontSize: 11 }} onClick={fork} title="Copy this template to give it its own filter and parts">Fork</Button>
      </div>
      <div className="text-muted mb-2">{describeParts(parts)}</div>

      {done && <div className="alert alert-success py-1 px-2" data-testid="apply-done">{done}</div>}

      <div className="d-flex align-items-center gap-2 mb-1">
        <strong>Positions ({members.length})</strong>
        {off.length > 0 && <span className="text-warning">{off.length} differ</span>}
        {members.length > 0 && (
          <Button size="sm" variant={off.length ? 'primary' : 'outline-secondary'} className="ms-auto" style={{ fontSize: 11 }}
            disabled={off.length === 0} onClick={() => openApply(members)} data-testid="apply-group">
            Make all {members.length} match
          </Button>
        )}
      </div>
      {members.length === 0 && <div className="text-muted fst-italic mb-2">No positions yet: pin some, or give it a tag filter.</div>}
      <div className="mb-2">
        {members.map(r => {
          const d = diffOf(r)
          return (
            <div key={r} className="d-flex align-items-center gap-2 py-1 border-bottom" data-testid={`member-${r}`}>
              <Form.Check type="checkbox" checked={picked.has(r)} onChange={() => toggle(r)} aria-label={`Select ${r}`} />
              <button type="button" className="btn btn-link p-0" style={{ fontSize: 12, fontFamily: 'monospace' }} onClick={() => onOpenPosition?.(r)}>{r}</button>
              {pinned.has(r) && <MaterialIcon name="push_pin" size={12} style={{ color: '#6c757d' }} title="Pinned to this template" />}
              {diffSize(d) === 0
                ? <span className="text-success ms-auto"><MaterialIcon name="check" size={12} /> matches</span>
                : <span className="text-warning ms-auto text-truncate" style={{ maxWidth: 220 }} title={diffText(d)}>{diffText(d)}</span>}
              <button type="button" className="btn btn-link p-0 text-muted" title={`Take ${r} out of this template`}
                aria-label={`Remove ${r} from this template`} onClick={() => removeFromTemplate(collectionId, [r])}>
                <MaterialIcon name="close" size={13} />
              </button>
            </div>
          )
        })}
      </div>
      {picked.size > 0 && (
        <div className="d-flex gap-2 mb-3 flex-wrap">
          <Button size="sm" variant="primary" style={{ fontSize: 11 }} onClick={() => split([...picked])} data-testid="split-picked">
            Split {picked.size} into a new template
          </Button>
          <Button size="sm" variant="outline-secondary" style={{ fontSize: 11 }} onClick={() => openApply([...picked])}>Make these match</Button>
          {[...picked].some(r => pinned.has(r)) && (
            <Button size="sm" variant="link" style={{ fontSize: 11 }} onClick={() => { unpinPositions(collectionId, [...picked]); setPicked(new Set()) }}>Unpin</Button>
          )}
        </div>
      )}

      {(() => {
        // Pinned here but outside this template's tags: say so, or the tags look like they do nothing.
        const outOfTags = [...pinned].filter(r => !memberSet.has(r) && !(excludes[collectionId] || []).includes(r))
        return outOfTags.length > 0 && (
          <div className="mb-2 text-muted" style={{ fontSize: 11 }} data-testid="pinned-out-of-tags">
            <MaterialIcon name="filter_alt" size={12} /> {outOfTags.length} pinned position{outOfTags.length === 1 ? '' : 's'} left out by this template’s tags: {outOfTags.join(', ')}
          </div>
        )
      })()}
      {(excludes[collectionId] || []).length > 0 && (
        <div className="mb-3" data-testid="removed-positions">
          <strong>Removed ({excludes[collectionId].length})</strong>
          <div className="d-flex flex-wrap gap-1 mt-1">
            {excludes[collectionId].map(r => (
              <span key={r} className="badge bg-light text-dark border d-inline-flex align-items-center gap-1" style={{ fontSize: 11, fontWeight: 400 }}>
                <span style={{ fontFamily: 'monospace' }}>{r}</span>
                <button type="button" className="btn btn-link p-0" style={{ fontSize: 11 }} title={`Put ${r} back (its tags decide again)`}
                  onClick={() => restoreToTemplate(collectionId, [r])}>restore</button>
              </span>
            ))}
          </div>
        </div>
      )}

      {clashes.length > 0 && (
        <div className="mb-3 p-2 rounded" style={{ background: '#fff3cd' }} data-testid="clashes">
          <strong><MaterialIcon name="warning" size={12} /> Also matched by another template</strong>
          {clashes.map(r => (
            <div key={r} className="d-flex align-items-center gap-2 mt-1">
              <span style={{ fontFamily: 'monospace' }}>{r}</span>
              <Button size="sm" variant="link" className="p-0 ms-auto" style={{ fontSize: 11 }} onClick={() => pinPositions(collectionId, [r])}>Keep it here</Button>
            </div>
          ))}
        </div>
      )}

      {misses.length > 0 && (
        <div data-testid="near-misses">
          <strong>Near misses ({misses.length})</strong>
          <div className="text-muted mb-1" style={{ fontSize: 11 }}>Positions not in this template whose connectors are one or two changes away.</div>
          {misses.map(m => (
            <div key={m.posRef} className="d-flex align-items-center gap-2 py-1 border-bottom">
              <span style={{ fontFamily: 'monospace' }}>{m.posRef}</span>
              <span className="text-muted text-truncate" style={{ maxWidth: 180 }} title={diffText(m.diff)}>{diffText(m.diff)}</span>
              <Button size="sm" variant="link" className="p-0 ms-auto" style={{ fontSize: 11 }}
                onClick={async () => { await pinPositions(collectionId, [m.posRef]); openApply([m.posRef]) }}>Bring into line</Button>
              <Button size="sm" variant="link" className="p-0" style={{ fontSize: 11 }} onClick={() => splitOut(m.posRef)}>Split out</Button>
            </div>
          ))}
        </div>
      )}

      <Modal show={!!preview} onHide={() => setPreview(null)} size="lg" scrollable>
        <Modal.Header closeButton><Modal.Title style={{ fontSize: 15 }}>Make {preview?.plan.length} match “{collection.Name}”</Modal.Title></Modal.Header>
        <Modal.Body style={{ fontSize: 12 }} data-testid="apply-preview">
          {preview?.plan.length === 0 && <div className="text-muted">They already match.</div>}
          {preview?.plan.map(x => (
            <div key={x.posRef} className="py-1 border-bottom">
              <strong style={{ fontFamily: 'monospace' }}>{x.posRef}</strong>: {diffText(x.diff)}
              {x.shared.length > 0 && (
                <div className="text-muted" style={{ fontSize: 11 }}>
                  {x.shared.map(p => p.ref).join(', ')} {x.shared.length === 1 ? 'lives' : 'live'} in a wrapper shared with another position: change {x.shared.length === 1 ? 'it' : 'them'} there.
                </div>
              )}
            </div>
          ))}
        </Modal.Body>
        <Modal.Footer>
          <span className="text-muted me-auto" style={{ fontSize: 11 }}>One Undo reverses all of it.</span>
          <Button size="sm" variant="secondary" onClick={() => setPreview(null)}>Cancel</Button>
          <Button size="sm" variant="primary" disabled={!preview?.plan.length} onClick={confirmApply}>Apply</Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}
