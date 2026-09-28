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
        <Button variant="primary" onClick={handleSave} disabled={saving || !name.trim()}>
          {saving ? 'Saving…' : collection ? 'Save changes' : 'Create template'}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
