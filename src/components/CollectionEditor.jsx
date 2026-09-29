import React, { useState, useEffect } from 'react'
import { Modal, Button, Form, Badge } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import ConnectorBoard from './ConnectorBoard'
import { templateParts, partsToIngredients } from '../utils/connectorGroups'

const COMMON_TAGS = ['Local', 'Remote-CC', 'Remote-CV', 'LIN', 'IP']

function parseTags(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw) } catch { return [] }
}

function TagRow({ tags, onRemove, input, onInputChange, onAdd, label, hint, badgeVariant = 'secondary', options = COMMON_TAGS, listId }) {
  return (
    <Form.Group className="mb-3">
      <Form.Label className="fw-semibold">
        {label}
        {hint && <span className="text-muted fw-normal ms-1">{hint}</span>}
      </Form.Label>
      <div className="d-flex flex-wrap gap-1 mb-2">
        {tags.map(t => (
          <Badge key={t} bg={badgeVariant} className="d-inline-flex align-items-center gap-1"
            style={{ cursor: 'pointer' }} onClick={() => onRemove(t)} title={`Remove ${t}`}>
            {t} <MaterialIcon name="close" size={12} />
          </Badge>
        ))}
      </div>
      <div className="d-flex gap-2">
        <Form.Control
          size="sm"
          value={input}
          onChange={e => onInputChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAdd(input) } }}
          placeholder="Type tag and press Enter…"
          list={listId}
          style={{ maxWidth: 220 }}
        />
        <datalist id={listId}>{options.map(t => <option key={t} value={t} />)}</datalist>
        <div className="d-flex gap-1 flex-wrap">
          {options.slice(0, 14).map(t => (
            <Button key={t} size="sm" variant="outline-secondary" style={{ fontSize: 11 }}
              onClick={() => onAdd(t)} disabled={tags.includes(t)}>
              {t}
            </Button>
          ))}
        </div>
      </div>
    </Form.Group>
  )
}

/**
 * CollectionEditor — create or edit a Connector Template (virtual ElementTypeCollection).
 * Props: show, onHide, collection (null = create mode), initialTags (create-mode seed)
 */
export default function CollectionEditor({ show, onHide, collection, initialTags = [], initialParts = null, onSaved }) {
  const createCollection = useStore(s => s.createCollection)
  const updateCollection = useStore(s => s.updateCollection)
  const elementTypes     = useStore(s => s.elementTypes)
  const pins             = useStore(s => s.connectorPins)
  const excludes         = useStore(s => s.connectorExcludes)
  const unpinPositions   = useStore(s => s.unpinPositions)
  const restoreToTemplate = useStore(s => s.restoreToTemplate)
  const tagPalette       = useStore(s => s.tagPalette)
  const positionUI       = useStore(s => s.positionUI)
  // The project's own tags (the palette and every tag a position carries, rule-made or not),
  // then the common ones: a template can only match tags that exist.
  const tagOptions = React.useMemo(() => {
    const inUse = new Set(tagPalette || [])
    for (const ui of Object.values(positionUI || {})) for (const t of (ui?.tags || [])) inUse.add(t)
    return [...new Set([...[...inUse].sort((a, b) => a.localeCompare(b)), ...COMMON_TAGS])]
  }, [tagPalette, positionUI])

  const [name,         setName]         = useState('')
  const [tags,         setTags]         = useState([])
  const [tagInput,     setTagInput]     = useState('')
  const [exclTags,     setExclTags]     = useState([])
  const [exclInput,    setExclInput]    = useState('')
  const [ingredients,  setIngredients]  = useState([])
  const [saving,       setSaving]       = useState(false)


  useEffect(() => {
    if (show) {
      if (collection) {
        setName(collection.Name || '')
        setTags(parseTags(collection.ApplicableTags))
        setExclTags(parseTags(collection.ExcludedTags))
        setIngredients(templateParts(collection))
      } else {
        setName('')
        setTags(initialTags ?? [])
        setExclTags([])
        setIngredients(initialParts ?? [])
      }
      setTagInput('')
      setExclInput('')
      setSaving(false)
    }
  }, [show, collection])

  function addTag(tag, setter, current) {
    const t = tag.trim()
    if (t && !current.includes(t)) setter(prev => [...prev, t])
  }
  function removeTag(tag, setter) {
    setter(prev => prev.filter(t => t !== tag))
  }

  async function saveAsCopy() {
    const copyName = name.trim() === (collection?.Name || '').trim() ? `${name.trim()} (copy)` : name.trim()
    setSaving(true)
    try {
      await createCollection(copyName, partsToIngredients(ingredients.filter(p => p.ref?.trim())), tags, exclTags)
      onHide()
    } finally { setSaving(false) }
  }

  // A pinned position is held only while it passes this editor's tags.
  function heldByTags(r) {
    const t = positionUI[r]?.tags || []
    if (exclTags.some(x => t.includes(x))) return false
    return tags.length === 0 || tags.some(x => t.includes(x))
  }

  async function handleSave() {
    if (!name.trim()) return
    const cleanIngredients = partsToIngredients(ingredients.filter(p => p.ref?.trim()))

    setSaving(true)
    try {
      if (collection) {
        await updateCollection(collection.CollectionId, {
          Name: name.trim(),
          ApplicableTags: tags,
          ExcludedTags: exclTags,
          Ingredients: cleanIngredients,
        })
      } else {
        await createCollection(name.trim(), cleanIngredients, tags, exclTags)
      }
      // Pinned positions the tags now leave out are let go, not kept as dead pins.
      if (collection) {
        const drop = (pins[collection.CollectionId] || []).filter(r => !heldByTags(r))
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

        <TagRow
          label="Included Tags"
          hint="(empty = applies to all positions)"
          tags={tags}
          onRemove={t => removeTag(t, setTags)}
          input={tagInput}
          onInputChange={setTagInput}
          onAdd={t => { addTag(t, setTags, tags); setTagInput('') }}
          options={tagOptions} listId="conn-incl-tags"
          badgeVariant="secondary"
        />

        <TagRow
          label="Excluded Tags"
          hint="(excluded takes priority — positions with these tags are skipped)"
          tags={exclTags}
          onRemove={t => removeTag(t, setExclTags)}
          input={exclInput}
          onInputChange={setExclInput}
          onAdd={t => { addTag(t, setExclTags, exclTags); setExclInput('') }}
          options={tagOptions} listId="conn-excl-tags"
          badgeVariant="danger"
        />

        {collection && ((pins[collection.CollectionId] || []).length > 0 || (excludes[collection.CollectionId] || []).length > 0) && (() => {
          // Held = pinned AND passing the tags as they stand in this editor (saved or not).
          const allPinned = pins[collection.CollectionId] || []
          const held = allPinned.filter(r => heldByTags(r))
          const leftOut = allPinned.filter(r => !heldByTags(r))
          return (
            <Form.Group className="mb-3" data-testid="editor-positions">
              <Form.Label className="fw-semibold">Positions held by this template</Form.Label>
              <div className="text-muted mb-1" style={{ fontSize: 12 }}>
                Pinned positions stay in this template (and out of every other), as long as they pass the tags above.
                Removed positions stay out whatever their tags.
              </div>
              <div className="d-flex flex-wrap gap-1">
                {held.map(r => (
                  <Badge key={r} bg="light" text="dark" className="border d-inline-flex align-items-center gap-1" style={{ fontWeight: 400 }}>
                    <MaterialIcon name="push_pin" size={11} /> <span style={{ fontFamily: 'monospace' }}>{r}</span>
                    <button type="button" className="btn btn-link p-0" style={{ fontSize: 10 }} aria-label={`Unpin ${r}`} title="Unpin: its tags decide"
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
                <div className="mt-1 text-muted" style={{ fontSize: 11 }} data-testid="left-out-by-tags">
                  <MaterialIcon name="filter_alt" size={12} /> Left out by the tags above (unpinned when you save): {leftOut.join(', ')}
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
