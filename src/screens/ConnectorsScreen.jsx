import React, { useState, useEffect } from 'react'
import { Button, Badge, Modal, Form } from 'react-bootstrap'
import useStore from '../store/useStore'
import CoverageMatrix from '../components/CoverageMatrix'
import CollectionEditor from '../components/CollectionEditor'
import CellDetailPanel from '../components/CellDetailPanel'
import { collectionStatusForPosition } from '../utils/collectionStatus'

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

  const [selectedCollectionId, setSelectedCollectionId] = useState(null)
  const [selectedCell, setSelectedCell] = useState(null) // { posRef, collectionId }
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingCollection, setEditingCollection] = useState(null)
  const [editorInitialTags, setEditorInitialTags] = useState([])

  // Deep-link: when arriving with a focused position, open the most relevant cell.
  useEffect(() => {
    if (!focusPosRef || etCollections.length === 0) return
    const tags = positionUI[focusPosRef]?.tags ?? []
    const posRecipe = recipes.filter(r => (r.PositionTypeRef || r.positionTypeRef) === focusPosRef)
    const statuses = collectionStatusForPosition(focusPosRef, tags, posRecipe, etCollections)
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
    if (!window.confirm('Delete this collection? This does not modify any recipes.')) return
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div className="d-flex align-items-center gap-2 px-3 py-2 border-bottom bg-white" style={{ flexShrink: 0 }}>
        <Button variant="outline-secondary" size="sm" onClick={onBack}>← Back</Button>
        <span className="fw-semibold ms-1">Connectors</span>
        <div className="flex-grow-1" />
        <Button variant="primary" size="sm" onClick={handleNew}>+ New Collection</Button>
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
          <div className="small text-muted mb-2 px-1">ElementType Collections</div>
          {etCollections.length === 0 && (
            <p className="text-muted small px-1">No collections yet.</p>
          )}
          {etCollections.map(c => {
            const isSelected = c.CollectionId === selectedCollectionId
            const tags = Array.isArray(c.ApplicableTags) ? c.ApplicableTags : []
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
                  {ings.length} ingredient{ings.length !== 1 ? 's' : ''}
                  {tags.length > 0 && (
                    <span className="ms-1">
                      {tags.map(t => (
                        <Badge key={t} bg="secondary" style={{ fontSize: 9, marginLeft: 2 }}>{t}</Badge>
                      ))}
                    </span>
                  )}
                </div>
                {isSelected && (
                  <div className="d-flex gap-1 mt-1">
                    <Button size="sm" variant="outline-primary" style={{ fontSize: 10, padding: '1px 6px' }}
                      onClick={e => { e.stopPropagation(); handleEdit(c) }}>
                      Edit
                    </Button>
                    <Button size="sm" variant="outline-danger" style={{ fontSize: 10, padding: '1px 6px' }}
                      onClick={e => { e.stopPropagation(); handleDelete(c.CollectionId) }}>
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
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
          <Modal.Title>Swap Collection</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="small text-muted mb-3">
            This will soft-delete all recipe rows belonging to the current collection on
            <strong> {swapModal?.posRef}</strong> and apply the new collection's ingredients additively.
          </p>
          <Form.Label className="fw-semibold">Replace with:</Form.Label>
          <Form.Select value={swapTargetId} onChange={e => setSwapTargetId(e.target.value)}>
            <option value="">— select collection —</option>
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
