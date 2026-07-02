import React, { useState, useEffect } from 'react'
import {
  Button, Badge, Form, Table, Alert, Modal, Row, Col, ListGroup,
} from 'react-bootstrap'
import { v4 as uuidv4 } from 'uuid'
import useStore from '../store/useStore'
import { GLOBAL_TEMPLATE_IDS } from '../utils/constants'
import TagInput from '../components/TagInput'
import IconButton from '../components/IconButton'
import MaterialIcon from '../components/MaterialIcon'
import { ACTION_ICONS } from '../utils/entityStyle'

const SECTION_OPTIONS = ['position', 'dl_internal', 'lin_internal']

function parseIngredients(raw) {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch { return [] }
  }
  return []
}

function parseApplicableTags(raw) {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) } catch { return [] }
  }
  return []
}

/**
 * TemplateEditorScreen — manage global + project templates.
 */
export default function TemplateEditorScreen({ onBack }) {
  const templates = useStore(s => s.templates)
  const projectId = useStore(s => s.projectId)
  const tagPalette = useStore(s => s.tagPalette)
  const updateTemplate = useStore(s => s.updateTemplate)
  const deleteTemplate = useStore(s => s.deleteTemplate)

  const [selectedId, setSelectedId] = useState(null)
  const [editState, setEditState] = useState(null)
  // editState: { id, name, scope, applicable_tags: [], ingredients: [] }

  const [saveError, setSaveError] = useState(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const globalTemplates = templates.filter(t => t.scope !== 'project')
  const projectTemplates = templates.filter(t => t.scope === 'project')

  function selectTemplate(tpl) {
    setSelectedId(tpl.id)
    setEditState({
      id: tpl.id,
      name: tpl.name || '',
      scope: tpl.scope || 'global',
      applicable_tags: parseApplicableTags(tpl.applicable_tags),
      ingredients: parseIngredients(tpl.ingredients).map((ing, i) => ({
        ...ing,
        _key: ing._key || uuidv4(),
      })),
    })
    setSaveError(null)
    setSaveSuccess(false)
  }

  function handleNewTemplate() {
    const newTpl = {
      id: uuidv4(),
      name: 'New Template',
      scope: 'project',
      applicable_tags: [],
      ingredients: [],
      projectId,
    }
    setSelectedId(newTpl.id)
    setEditState(newTpl)
    setSaveError(null)
    setSaveSuccess(false)
  }

  function handleOverrideGlobal(tpl) {
    const overrideTpl = {
      id: uuidv4(),
      name: tpl.name + ' (Project Override)',
      scope: 'project',
      base_template_id: tpl.id,
      applicable_tags: parseApplicableTags(tpl.applicable_tags),
      ingredients: parseIngredients(tpl.ingredients).map(ing => ({ ...ing, _key: uuidv4() })),
      projectId,
    }
    setSelectedId(overrideTpl.id)
    setEditState(overrideTpl)
  }

  async function handleSave() {
    if (!editState) return
    setSaveError(null)
    try {
      const toSave = {
        ...editState,
        applicable_tags: JSON.stringify(editState.applicable_tags),
        ingredients: JSON.stringify(editState.ingredients.map(({ _key, ...rest }) => rest)),
        projectId: editState.scope === 'project' ? projectId : null,
      }
      await updateTemplate(toSave)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2500)
    } catch (err) {
      setSaveError(err.message || 'Save failed')
    }
  }

  async function handleSaveAsNew() {
    if (!editState) return
    const newId = uuidv4()
    const toSave = {
      ...editState,
      id: newId,
      name: editState.name + ' (copy)',
      scope: 'project',
      applicable_tags: JSON.stringify(editState.applicable_tags),
      ingredients: JSON.stringify(editState.ingredients.map(({ _key, ...rest }) => rest)),
      projectId,
    }
    try {
      await updateTemplate(toSave)
      setSelectedId(newId)
    } catch (err) {
      setSaveError(err.message || 'Save failed')
    }
  }

  async function handleDelete() {
    if (!editState || !window.confirm(`Delete template "${editState.name}"?`)) return
    await deleteTemplate(editState.id)
    setSelectedId(null)
    setEditState(null)
  }

  function updateIngredient(key, field, value) {
    setEditState(s => ({
      ...s,
      ingredients: s.ingredients.map(ing =>
        ing._key === key ? { ...ing, [field]: value } : ing
      ),
    }))
  }

  function addIngredient() {
    setEditState(s => ({
      ...s,
      ingredients: [
        ...s.ingredients,
        {
          _key: uuidv4(),
          slotKey: '',
          slotLabel: '',
          section: 'position',
          isDesign: null,
          isContractItem: null,
          quantity: null,
          dimQtyMultiplier: null,
          isInteger: null,
        },
      ],
    }))
  }

  function removeIngredient(key) {
    setEditState(s => ({
      ...s,
      ingredients: s.ingredients.filter(ing => ing._key !== key),
    }))
  }

  const isGlobalSelected = editState && editState.scope !== 'project'
  const totalSlots = editState ? editState.ingredients.length : 0

  function TemplateListItem({ tpl, isGlobal }) {
    const tags = parseApplicableTags(tpl.applicable_tags)
    const ings = parseIngredients(tpl.ingredients)
    const isActive = selectedId === tpl.id

    return (
      <ListGroup.Item
        action
        active={isActive}
        className="py-2 px-3"
        onClick={() => selectTemplate(tpl)}
        style={{ cursor: 'pointer' }}
      >
        <div className="d-flex justify-content-between align-items-start">
          <div>
            <div className="fw-semibold small">{tpl.name}</div>
            <div className="mt-1" style={{ lineHeight: 1.2 }}>
              {tags.map(tag => (
                <Badge key={tag} bg="secondary" className="me-1" style={{ fontSize: 10 }}>{tag}</Badge>
              ))}
            </div>
            <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>
              {ings.length} slot{ings.length !== 1 ? 's' : ''}
            </div>
          </div>
          {isGlobal && (
            <Button
              variant="outline-secondary"
              size="sm"
              style={{ fontSize: 11, padding: '1px 6px', whiteSpace: 'nowrap' }}
              onClick={e => { e.stopPropagation(); handleOverrideGlobal(tpl) }}
            >
              Override
            </Button>
          )}
        </div>
      </ListGroup.Item>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }} data-debug-id="TemplateEditorScreen">

      {/* Left panel */}
      <div
        style={{
          width: 260,
          flexShrink: 0,
          borderRight: '1px solid #dee2e6',
          overflowY: 'auto',
          background: '#f8f9fa',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div className="p-3 border-bottom d-flex align-items-center justify-content-between">
          <IconButton variant="link" bsSize="sm" className="p-0" icon={ACTION_ICONS.back} title="Back to builder" onClick={onBack} />
          <span className="fw-semibold small">Templates</span>
        </div>

        {/* Global templates */}
        <div className="px-3 py-2">
          <div className="text-uppercase text-muted small fw-bold mb-1" style={{ fontSize: 10, letterSpacing: 1 }}>
            Global Templates
          </div>
          <ListGroup variant="flush">
            {globalTemplates.length === 0 && (
              <div className="text-muted small py-2">No global templates.</div>
            )}
            {globalTemplates.map(tpl => (
              <TemplateListItem key={tpl.id} tpl={tpl} isGlobal />
            ))}
          </ListGroup>
        </div>

        <div className="px-3 py-2">
          <div className="d-flex align-items-center justify-content-between mb-1">
            <div className="text-uppercase text-muted small fw-bold" style={{ fontSize: 10, letterSpacing: 1 }}>
              This Project
            </div>
            <Button
              variant="outline-primary"
              size="sm"
              style={{ fontSize: 11, padding: '1px 8px' }}
              onClick={handleNewTemplate}
            >
              + New
            </Button>
          </div>
          <ListGroup variant="flush">
            {projectTemplates.length === 0 && (
              <div className="text-muted small py-2">No project templates.</div>
            )}
            {projectTemplates.map(tpl => (
              <TemplateListItem key={tpl.id} tpl={tpl} isGlobal={false} />
            ))}
          </ListGroup>
        </div>
      </div>

      {/* Right panel: editor */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
        {!editState ? (
          <div className="text-center text-muted mt-5">
            Select a template to edit, or create a new one.
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="d-flex align-items-center gap-3 mb-3">
              <Form.Control
                style={{ maxWidth: 300, fontWeight: 600, fontSize: '1.1rem' }}
                value={editState.name}
                onChange={e => setEditState(s => ({ ...s, name: e.target.value }))}
                disabled={isGlobalSelected}
                placeholder="Template name"
              />
              <Badge bg={isGlobalSelected ? 'secondary' : 'primary'}>
                {isGlobalSelected ? 'Global' : 'Project'}
              </Badge>
              {isGlobalSelected && (
                <Badge bg="warning" text="dark">Read-only — Override to edit</Badge>
              )}
            </div>

            {isGlobalSelected && (
              <Alert variant="info" className="py-2 mb-3">
                Global templates are read-only. Click <strong>Override for this project</strong> in the list to create an editable copy.
              </Alert>
            )}

            {/* Applicable tags */}
            <div className="mb-4">
              <div className="fw-semibold small mb-2">Applicable Tags</div>
              <TagInput
                value={editState.applicable_tags}
                onChange={next => setEditState(s => ({ ...s, applicable_tags: next }))}
                palette={tagPalette}
                disabled={isGlobalSelected}
                placeholder="Add a tag this template applies to…"
              />
            </div>

            {/* Ingredients table */}
            <div className="mb-3 d-flex align-items-center gap-2">
              <span className="fw-semibold small">Ingredient Slots ({totalSlots})</span>
              {!isGlobalSelected && (
                <Button variant="outline-secondary" size="sm" style={{ fontSize: 11, padding: '1px 8px' }} onClick={addIngredient}>
                  + Add slot
                </Button>
              )}
            </div>

            <div style={{ overflowX: 'auto' }}>
              <Table bordered hover size="sm" className="small">
                <thead className="table-light">
                  <tr>
                    <th>Slot Key</th>
                    <th>Slot Label</th>
                    <th>Section</th>
                    <th>Design</th>
                    <th>Contract</th>
                    <th>Qty</th>
                    <th>DimMult</th>
                    <th>Integer</th>
                    {!isGlobalSelected && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {editState.ingredients.length === 0 && (
                    <tr>
                      <td colSpan={isGlobalSelected ? 8 : 9} className="text-center text-muted py-2">
                        No slots defined
                      </td>
                    </tr>
                  )}
                  {editState.ingredients.map(ing => (
                    <IngredientRow
                      key={ing._key}
                      ing={ing}
                      readOnly={isGlobalSelected}
                      onChange={(field, val) => updateIngredient(ing._key, field, val)}
                      onRemove={() => removeIngredient(ing._key)}
                    />
                  ))}
                </tbody>
              </Table>
            </div>

            {/* Action buttons */}
            {!isGlobalSelected && (
              <div className="d-flex gap-2 mt-3">
                <Button variant="primary" onClick={handleSave}>Save template</Button>
                <Button variant="outline-secondary" onClick={handleSaveAsNew}>Save as new</Button>
                <Button
                  variant="outline-danger"
                  onClick={handleDelete}
                  disabled={editState.scope !== 'project'}
                >
                  Delete
                </Button>
                {saveSuccess && <span className="text-success align-self-center small d-inline-flex align-items-center gap-1"><MaterialIcon name={ACTION_ICONS.complete} size={14} /> Saved</span>}
                {saveError && <span className="text-danger align-self-center small">{saveError}</span>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// Editable row for a single ingredient slot
function IngredientRow({ ing, readOnly, onChange, onRemove }) {
  function cell(field, type = 'text', options) {
    if (readOnly) {
      return <td>{ing[field] ?? ''}</td>
    }
    if (type === 'select') {
      return (
        <td>
          <Form.Select size="sm" value={ing[field] || ''} onChange={e => onChange(field, e.target.value || null)}>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </Form.Select>
        </td>
      )
    }
    if (type === 'flag') {
      return (
        <td className="text-center">
          <Form.Check
            type="checkbox"
            checked={ing[field] === 'Y'}
            onChange={e => onChange(field, e.target.checked ? 'Y' : null)}
          />
        </td>
      )
    }
    return (
      <td>
        <Form.Control
          size="sm"
          type={type}
          value={ing[field] ?? ''}
          onChange={e => onChange(field, e.target.value || null)}
        />
      </td>
    )
  }

  return (
    <tr>
      {cell('slotKey')}
      {cell('slotLabel')}
      {cell('section', 'select', SECTION_OPTIONS)}
      {cell('isDesign', 'flag')}
      {cell('isContractItem', 'flag')}
      {cell('quantity', 'number')}
      {cell('dimQtyMultiplier', 'number')}
      {cell('isInteger', 'flag')}
      {!readOnly && (
        <td className="text-center">
          <Button variant="link" size="sm" className="text-danger p-0" onClick={onRemove} title="Remove ingredient" aria-label="Remove ingredient"><MaterialIcon name="close" size={15} /></Button>
        </td>
      )}
    </tr>
  )
}
