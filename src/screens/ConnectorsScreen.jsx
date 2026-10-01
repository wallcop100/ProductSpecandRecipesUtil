import React, { useState, useEffect } from 'react'
import { Button, Badge, Modal, Form } from 'react-bootstrap'
import useStore from '../store/useStore'
import CoverageMatrix from '../components/CoverageMatrix'
import CollectionEditor from '../components/CollectionEditor'
import CellDetailPanel from '../components/CellDetailPanel'
import IconButton from '../components/IconButton'
import TutorialHint from '../tutorial/TutorialHint'
import { collectionStatusForPosition, positionRecipeWithWrapperInternals } from '../utils/collectionStatus'
import { ACTION_ICONS } from '../utils/entityStyle'
import { Dropdown } from 'react-bootstrap'
import TemplateGroupPanel from '../components/TemplateGroupPanel'
import useConnectorGroups from '../components/useConnectorGroups'
import MaterialIcon from '../components/MaterialIcon'
import { describeParts, suggestName, isConnectorPart } from '../utils/connectorGroups'
import { ruleFor, templateRule, describeRule, ruleIsEmpty } from '../utils/templateRules'

/**
 * ConnectorsScreen — dedicated screen for managing virtual ElementType Collections
 * and viewing the coverage matrix (positions × collections).
 *
 * focusPosRef — when set (e.g. opened via "Manage connectors →" from a position),
 * auto-selects that position's most relevant collection cell so its detail panel opens.
 */
export default function ConnectorsScreen({ onBack, focusPosRef, onOpenPosition }) {
  const etCollections   = useStore(s => s.etCollections)
  const positionUI      = useStore(s => s.positionUI)
  const recipes         = useStore(s => s.recipes)
  const deleteCollection = useStore(s => s.deleteCollection)
  const swapCollection  = useStore(s => s.swapCollection)
  const makeTemplateFromGroup = useStore(s => s.makeTemplateFromGroup)
  const forkTemplate = useStore(s => s.forkTemplate)
  const connectorFamilies = useStore(s => s.connectorFamilies)
  const setConnectorFamilies = useStore(s => s.setConnectorFamilies)
  const elementTypes = useStore(s => s.elementTypes)
  const groups = useConnectorGroups()
  const allFamilies = [...new Set(elementTypes.map(e => e.Family || e.family).filter(Boolean))].sort()

  async function makeTemplate(g) {
    // A rule from the data that picks out EXACTLY this group — every other position left
    // out, those without connectors yet too (YKZMVF: an automatic template must not claim
    // positions that don't have its parts). Otherwise pin the positions. The name says what
    // the rule filters on.
    const scope = groups.scoped.map(pt => pt.PositionTypeRef)
    const found = ruleFor(g.positions, scope, groups.recOf)
    const name = window.prompt(`Name a template for these ${g.positions.length} position${g.positions.length === 1 ? '' : 's'}`, suggestName(g.parts, found?.exact ? found.rule : null))?.trim()
    if (!name) return
    const saved = await makeTemplateFromGroup(name, g.parts, g.positions, { rule: found?.exact ? found.rule : null })
    if (saved) { setSelectedCell(null); setSelectedCollectionId(saved.CollectionId) }
  }

  const [selectedCollectionId, setSelectedCollectionId] = useState(null)
  const [selectedCell, setSelectedCell] = useState(null) // { posRef, collectionId }
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingCollection, setEditingCollection] = useState(null)
  const [editorInitialTags, setEditorInitialTags] = useState([])

  // Deep-link: when arriving with a focused position, open the most relevant cell.
  useEffect(() => {
    if (!focusPosRef || etCollections.length === 0) return
    const tags = positionUI[focusPosRef]?.tags ?? []
    const { combined: posRecipe, wrapperRefs } = positionRecipeWithWrapperInternals(recipes, focusPosRef)
    const opts = useStore.getState()._connectorOpts()
    const statuses = collectionStatusForPosition(focusPosRef, tags, posRecipe, etCollections, wrapperRefs, groups.members.get(focusPosRef), { isConnector: ref => isConnectorPart(ref, opts) })
    // Prefer an applicable collection (tags match): complete/partial/missing over na.
    const applicable = statuses.find(s => s.status !== 'na')
    const chosen = applicable?.collection ?? etCollections[0]
    setSelectedCell({ posRef: focusPosRef, collectionId: chosen.CollectionId })
    setSelectedCollectionId(chosen.CollectionId)
    // run once per focusPosRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPosRef])

  // Swap modal state
  const [swapModal, setSwapModal] = useState(null) // { posRef, fromCollectionId }
  const [swapTargetId, setSwapTargetId] = useState('')

  function handleCellClick(posRef, collectionId) {
    setSelectedCell(prev =>
      prev && prev.posRef === posRef && prev.collectionId === collectionId
        ? null
        : { posRef, collectionId }
    )
    setSelectedCollectionId(collectionId)
  }

  function openNewEditor(initialTags = []) {
    setEditingCollection(null)
    setEditorInitialTags(initialTags)
    setEditorOpen(true)
  }

  function handleNew() {
    openNewEditor([])
  }

  // From the matrix: if a position cell is selected, seed the new set's applicable
  // tags with that position's tags so it auto-applies to similar positions.
  function handleNewFromMatrix() {
    const tags = selectedCell ? (positionUI[selectedCell.posRef]?.tags ?? []) : []
    openNewEditor(tags)
  }

  function handleEdit(collection) {
    setEditingCollection(collection)
    setEditorInitialTags([])
    setEditorOpen(true)
  }

  async function handleDelete(collectionId) {
    if (!window.confirm('Delete this connector template? This does not modify any recipes.')) return
    await deleteCollection(collectionId)
    if (selectedCollectionId === collectionId) setSelectedCollectionId(null)
    if (selectedCell?.collectionId === collectionId) setSelectedCell(null)
  }

  function handleSwapRequest(posRef, fromCollectionId) {
    setSwapTargetId('')
    setSwapModal({ posRef, fromCollectionId })
  }

  function handleSwapConfirm() {
    if (!swapTargetId || !swapModal) return
    swapCollection(swapModal.posRef, swapModal.fromCollectionId, swapTargetId)
    setSwapModal(null)
  }

  const swapCandidates = swapModal
    ? etCollections.filter(c => c.CollectionId !== swapModal.fromCollectionId)
    : []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }} data-debug-id="ConnectorsScreen">
      {/* Toolbar */}
      <div className="d-flex align-items-center gap-2 px-3 py-2 border-bottom bg-white" style={{ flexShrink: 0 }}>
        <IconButton variant="outline-secondary" bsSize="sm" icon={ACTION_ICONS.back} title="Back to builder" onClick={onBack} />
        <span className="fw-semibold ms-1">Connectors</span>
        <TutorialHint id="connectors" />
        <div className="flex-grow-1" />
        <Dropdown align="end" autoClose="outside">
          <Dropdown.Toggle size="sm" variant="outline-secondary" style={{ fontSize: 12 }}
            title="Which families hold connector parts (sockets, plugs, strain reliefs and levers are recognised by name anyway)">
            Connector families{connectorFamilies.length ? ` (${connectorFamilies.length})` : ''}
          </Dropdown.Toggle>
          <Dropdown.Menu style={{ fontSize: 12, maxHeight: 320, overflowY: 'auto' }}>
            {allFamilies.map(f => (
              <Dropdown.Item key={f} onClick={() => setConnectorFamilies(connectorFamilies.includes(f) ? connectorFamilies.filter(x => x !== f) : [...connectorFamilies, f])}>
                <MaterialIcon name={connectorFamilies.includes(f) ? 'check_box' : 'check_box_outline_blank'} size={14} /> {f}
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown>
        <Button variant="primary" size="sm" onClick={handleNew}>+ New Template</Button>
      </div>

      {/* Body: left panel + matrix */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Collection list (left) */}
        <div
          style={{
            width: 240,
            flexShrink: 0,
            borderRight: '1px solid #dee2e6',
            overflowY: 'auto',
            background: '#f8f9fa',
          }}
          className="p-2"
        >
          <div className="small text-muted mb-2 px-1">Connector Templates</div>
          {etCollections.length === 0 && (
            <p className="text-muted small px-1">No templates yet.</p>
          )}
          {etCollections.map(c => {
            const isSelected = c.CollectionId === selectedCollectionId
            const rule = templateRule(c)
            const ings = Array.isArray(c.Ingredients) ? c.Ingredients : []
            return (
              <div
                key={c.CollectionId}
                onClick={() => setSelectedCollectionId(isSelected ? null : c.CollectionId)}
                style={{
                  padding: '6px 8px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: isSelected ? '#e0f0ff' : 'transparent',
                  marginBottom: 2,
                }}
              >
                <div className="fw-semibold" style={{ fontSize: 13 }}>{c.Name}</div>
                <div style={{ fontSize: 11, color: '#6c757d' }}>
                  {groups.membersOf(c.CollectionId).length} position{groups.membersOf(c.CollectionId).length !== 1 ? 's' : ''} · {ings.length} part{ings.length !== 1 ? 's' : ''}
                  {!ruleIsEmpty(rule) && (
                    <div className="text-truncate" title={describeRule(rule)} data-testid="template-rule-summary">
                      <MaterialIcon name="filter_alt" size={11} /> {describeRule(rule)}
                    </div>
                  )}
                </div>
                {isSelected && (
                  <div className="d-flex gap-1 mt-1">
                    <Button size="sm" variant="outline-primary" style={{ fontSize: 10, padding: '1px 6px' }}
                      onClick={e => { e.stopPropagation(); handleEdit(c) }}>
                      Edit
                    </Button>
                    <IconButton bsSize="sm" variant="outline-secondary" icon={ACTION_ICONS.fork} size={14} label="Fork"
                      title="Fork: copy this template (same parts and rule) to change on its own"
                      style={{ padding: '0 5px' }}
                      onClick={async e => {
                        e.stopPropagation()
                        const name = window.prompt('Name the copy', `${c.Name} (copy)`)?.trim()
                        if (!name) return
                        const saved = await forkTemplate(c.CollectionId, { name })
                        if (saved) { setSelectedCell(null); setSelectedCollectionId(saved.CollectionId); handleEdit(saved) }
                      }} />
                    <Button size="sm" variant="outline-danger" style={{ fontSize: 10, padding: '1px 6px' }}
                      onClick={e => { e.stopPropagation(); handleDelete(c.CollectionId) }}>
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            )
          })}

          <div className="small text-muted mt-3 mb-1 px-1" data-testid="groups-found">
            Groups found in the recipes {groups.groups.length ? `(${groups.groups.length})` : ''}
          </div>
          {groups.groups.length === 0 && <p className="text-muted px-1" style={{ fontSize: 11 }}>Every connector set-up here is already a template.</p>}
          {groups.groups.map(g => (
            <div key={g.key} className="px-2 py-1 mb-1 rounded bg-white border" style={{ fontSize: 11 }} data-testid="found-group">
              <div className="fw-semibold">{g.positions.length} position{g.positions.length === 1 ? '' : 's'}</div>
              <div className="text-muted" style={{ wordBreak: 'break-word' }}>{describeParts(g.parts)}</div>
              <div className="text-muted text-truncate" title={g.positions.join(', ')}>{g.positions.join(', ')}</div>
              <Button size="sm" variant="outline-primary" className="mt-1" style={{ fontSize: 10, padding: '1px 6px' }}
                onClick={() => makeTemplate(g)}>Make template</Button>
            </div>
          ))}
        </div>

        {/* Matrix panel (centre) */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          <CoverageMatrix
            selectedCell={selectedCell}
            onCellClick={handleCellClick}
            onNewCollection={handleNewFromMatrix}
            onOpenPosition={onOpenPosition}
          />
        </div>

        {/* Template as a group (right) — when a template is selected and no cell */}
        {!selectedCell && selectedCollectionId && (
          <div style={{ width: 380, flexShrink: 0, borderLeft: '1px solid #dee2e6', background: '#fff', overflow: 'hidden' }}>
            <TemplateGroupPanel key={selectedCollectionId} collectionId={selectedCollectionId} groups={groups}
              onEdit={handleEdit} onSelect={id => setSelectedCollectionId(id)} onOpenPosition={onOpenPosition} />
          </div>
        )}

        {/* Cell detail panel (right) — appears when a cell is selected */}
        {selectedCell && (
          <div
            style={{
              width: 320,
              flexShrink: 0,
              borderLeft: '1px solid #dee2e6',
              background: '#fff',
              overflow: 'hidden',
            }}
          >
            <CellDetailPanel
              key={`${selectedCell.posRef}|${selectedCell.collectionId}`}
              posRef={selectedCell.posRef}
              collectionId={selectedCell.collectionId}
              onClose={() => setSelectedCell(null)}
              onSwap={handleSwapRequest}
              onOpenPosition={onOpenPosition}
            />
          </div>
        )}
      </div>

      {/* Collection editor modal */}
      <CollectionEditor
        show={editorOpen}
        onHide={() => setEditorOpen(false)}
        collection={editingCollection}
        initialTags={editorInitialTags}
      />

      {/* Swap modal */}
      <Modal show={!!swapModal} onHide={() => setSwapModal(null)}>
        <Modal.Header closeButton>
          <Modal.Title>Swap Template</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="small text-muted mb-3">
            This will soft-delete all recipe rows belonging to the current template on
            <strong> {swapModal?.posRef}</strong> and apply the new template's ingredients additively.
          </p>
          <Form.Label className="fw-semibold">Replace with:</Form.Label>
          <Form.Select value={swapTargetId} onChange={e => setSwapTargetId(e.target.value)}>
            <option value="">— select template —</option>
            {swapCandidates.map(c => (
              <option key={c.CollectionId} value={c.CollectionId}>{c.Name}</option>
            ))}
          </Form.Select>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setSwapModal(null)}>Cancel</Button>
          <Button variant="danger" onClick={handleSwapConfirm} disabled={!swapTargetId}>
            Swap
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}
