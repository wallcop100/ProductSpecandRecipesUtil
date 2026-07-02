import React, { useState, useEffect } from 'react'
import { Modal, Button, Form, Badge } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'

const SECTION_OPTIONS = ['position', 'dl_internal', 'lin_internal']
const COMMON_TAGS = ['Local', 'Remote-CC', 'Remote-CV', 'LIN', 'IP']

function parseIngredients(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw) } catch { return [] }
}

function parseTags(raw) {
  if (!raw) return []
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw) } catch { return [] }
}

function TagRow({ tags, onRemove, input, onInputChange, onAdd, label, hint, badgeVariant = 'secondary' }) {
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
          style={{ maxWidth: 220 }}
        />
        <div className="d-flex gap-1 flex-wrap">
          {COMMON_TAGS.map(t => (
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
export default function CollectionEditor({ show, onHide, collection, initialTags = [] }) {
  const createCollection = useStore(s => s.createCollection)
  const updateCollection = useStore(s => s.updateCollection)
  const elementTypes     = useStore(s => s.elementTypes)

  const [name,         setName]         = useState('')
  const [tags,         setTags]         = useState([])
  const [tagInput,     setTagInput]     = useState('')
  const [exclTags,     setExclTags]     = useState([])
  const [exclInput,    setExclInput]    = useState('')
  const [ingredients,  setIngredients]  = useState([])
  const [saving,       setSaving]       = useState(false)

  const knownRefs = elementTypes.map(et => et.ElementTypeRef).filter(Boolean)

  useEffect(() => {
    if (show) {
      if (collection) {
        setName(collection.Name || '')
        setTags(parseTags(collection.ApplicableTags))
        setExclTags(parseTags(collection.ExcludedTags))
        setIngredients(parseIngredients(collection.Ingredients).map(i => ({ ...i })))
      } else {
        setName('')
        setTags(initialTags ?? [])
        setExclTags([])
        setIngredients([{ ElementTypeRef: '', section: 'position', quantity: 1 }])
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

  function addIngredient() {
    setIngredients(prev => [...prev, { ElementTypeRef: '', section: 'position', quantity: 1 }])
  }
  function removeIngredient(idx) {
    setIngredients(prev => prev.filter((_, i) => i !== idx))
  }
  function updateIngredient(idx, field, value) {
    setIngredients(prev => prev.map((ing, i) => i === idx ? { ...ing, [field]: value } : ing))
  }
  function moveIngredient(idx, dir) {
    setIngredients(prev => {
      const next = [...prev]
      const swap = idx + dir
      if (swap < 0 || swap >= next.length) return next
      ;[next[idx], next[swap]] = [next[swap], next[idx]]
      return next
    })
  }

  async function handleSave() {
    if (!name.trim()) return
    const cleanIngredients = ingredients
      .filter(i => i.ElementTypeRef?.trim())
      .map(i => ({ ElementTypeRef: i.ElementTypeRef.trim(), section: i.section, quantity: Number(i.quantity) || 1 }))

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
      onHide()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal show={show} onHide={onHide} size="lg">
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
          badgeVariant="danger"
        />

        <Form.Group className="mb-2">
          <Form.Label className="fw-semibold">Ingredients</Form.Label>
          <table className="table table-sm mb-2" style={{ fontSize: 12 }}>
            <thead className="table-light">
              <tr>
                <th style={{ width: 36 }}></th>
                <th>ElementTypeRef</th>
                <th style={{ width: 140 }}>Section</th>
                <th style={{ width: 70 }}>Qty</th>
                <th style={{ width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {ingredients.map((ing, idx) => (
                <tr key={idx}>
                  <td>
                    <div className="d-flex flex-column gap-0" style={{ lineHeight: 1 }}>
                      <Button variant="link" size="sm" className="p-0 text-muted" title="Move up"
                        onClick={() => moveIngredient(idx, -1)} disabled={idx === 0}><MaterialIcon name="arrow_upward" size={14} /></Button>
                      <Button variant="link" size="sm" className="p-0 text-muted" title="Move down"
                        onClick={() => moveIngredient(idx, 1)} disabled={idx === ingredients.length - 1}><MaterialIcon name="arrow_downward" size={14} /></Button>
                    </div>
                  </td>
                  <td>
                    <Form.Control
                      size="sm"
                      list="known-et-refs"
                      value={ing.ElementTypeRef}
                      onChange={e => updateIngredient(idx, 'ElementTypeRef', e.target.value)}
                      placeholder="ET-5Pin-Socket"
                    />
                  </td>
                  <td>
                    <Form.Select size="sm" value={ing.section}
                      onChange={e => updateIngredient(idx, 'section', e.target.value)}>
                      {SECTION_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </Form.Select>
                  </td>
                  <td>
                    <Form.Control
                      size="sm"
                      type="number"
                      min={1}
                      value={ing.quantity}
                      onChange={e => updateIngredient(idx, 'quantity', e.target.value)}
                    />
                  </td>
                  <td>
                    <Button variant="link" size="sm" className="text-danger p-0" title="Remove ingredient"
                      onClick={() => removeIngredient(idx)}><MaterialIcon name="close" size={14} /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button variant="outline-secondary" size="sm" onClick={addIngredient}>+ Add ingredient</Button>
        </Form.Group>

        <datalist id="known-et-refs">
          {knownRefs.map(ref => <option key={ref} value={ref} />)}
        </datalist>
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
