import React, { useState } from 'react'
import { Card, Form, Button } from 'react-bootstrap'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import useStore from '../store/useStore'
import FlagPill from './FlagPill'
import ETRefSelect from './ETRefSelect'
import { getUsedIn, getNextAvailableRef, getInternalItems } from '../utils/containerUtils'

/**
 * IngredientCard — a resolved recipe row with drag-to-reorder support.
 *
 * Props:
 *   row: recipe row object
 *   posRef: string
 *   sectionKey: 'position' | 'dl_internal' | 'lin_internal'
 */
export default function IngredientCard({ row, posRef, sectionKey, onOpenProductSpec }) {
  const updateRecipeRow = useStore(s => s.updateRecipeRow)
  const removeRecipeRow = useStore(s => s.removeRecipeRow)
  const toggleContainerET = useStore(s => s.toggleContainerET)
  const openETRecipe = useStore(s => s.openETRecipe)
  const ensurePSRow = useStore(s => s.ensurePSRow)
  const psRows = useStore(s => s.psRows)
  const recipes = useStore(s => s.recipes)
  const elementTypes = useStore(s => s.elementTypes)
  const containerETRefs = useStore(s => s.containerETRefs)

  const rowId = row._id

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: rowId,
    data: { type: 'recipe-row', posRef, section: sectionKey, rowId },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    marginBottom: 6,
  }

  const etRef = row.elementTypeRef || row.ElementTypeRef || ''
  const isUnresolved = row.resolved === false

  // Look up PS row for product code
  const psRow = psRows.find(p => {
    const ref = p.ElementTypeRef || p.elementTypeRef || ''
    return ref.toLowerCase() === etRef.toLowerCase()
  })
  const productCode = psRow?.ProductCode || psRow?.productCode || null

  // Container ET awareness
  const isContainer = etRef ? containerETRefs.has(etRef.toLowerCase()) : false
  const usedIn = isContainer ? getUsedIn(etRef, recipes, posRef) : []
  const nextRef = isContainer ? getNextAvailableRef(etRef, elementTypes) : null
  const internalItems = isContainer ? getInternalItems(etRef, recipes, elementTypes) : []

  const [showContents, setShowContents] = useState(false)

  function handleFieldChange(field, value) {
    updateRecipeRow(posRef, rowId, { [field]: value })
  }

  function handleFlagChange(flag, value) {
    const update = { [flag]: value, [flag.charAt(0).toUpperCase() + flag.slice(1)]: value }
    if (flag === 'isDesign' && value === 'Y') {
      update.isContractItem = null
      update.IsContractItem = null
    } else if (flag === 'isContractItem' && value === 'Y') {
      update.isDesign = null
      update.IsDesign = null
    }
    updateRecipeRow(posRef, rowId, update)
  }

  return (
    <div ref={setNodeRef} style={style}>
      <Card
        style={{
          borderLeft: `4px solid ${sectionKey === 'position' && !isUnresolved ? '#0d6efd' : '#fd7e14'}`,
          borderRadius: 6,
        }}
      >
        <Card.Body className="py-2 px-3">
          <div className="d-flex align-items-start gap-2">
            {/* Drag handle */}
            <span
              {...attributes}
              {...listeners}
              style={{
                cursor: 'grab',
                color: '#aaa',
                fontSize: 18,
                lineHeight: 1,
                paddingTop: 2,
                userSelect: 'none',
              }}
              title="Drag to reorder"
            >
              ⠿
            </span>

            <div style={{ flex: 1, minWidth: 0 }}>
              {/* ET ref + product code */}
              <div className="d-flex align-items-center gap-2 mb-1 flex-wrap">
                {etRef ? (
                  <span className="fw-semibold small" style={{ wordBreak: 'break-all' }}>
                    {etRef}
                  </span>
                ) : (
                  <div style={{ width: 220 }}>
                    <ETRefSelect
                      placeholder="Pick or type an element type…"
                      onCommit={ref => {
                        updateRecipeRow(posRef, rowId, { elementTypeRef: ref, ElementTypeRef: ref })
                        ensurePSRow(ref)
                      }}
                    />
                  </div>
                )}
                {isContainer && (
                  <span
                    style={{
                      fontSize: 10,
                      background: '#e8f4e8',
                      color: '#2d7a2d',
                      borderRadius: 3,
                      padding: '1px 5px',
                      fontWeight: 600,
                    }}
                  >
                    container
                  </span>
                )}
                {isContainer && etRef && (
                  <button
                    className="btn btn-link btn-sm p-0"
                    style={{ fontSize: 11, color: '#0d6efd', textDecoration: 'none' }}
                    onClick={() => openETRecipe(etRef)}
                    title="Edit this element's internal recipe"
                  >
                    Edit internals →
                  </button>
                )}
                {productCode ? (
                  <span className="text-muted small">{productCode}</span>
                ) : etRef ? (
                  <button
                    className="btn btn-link btn-sm p-0"
                    style={{ fontSize: 11, color: '#e67e22', textDecoration: 'none' }}
                    onClick={() => onOpenProductSpec && onOpenProductSpec(etRef)}
                    title="No product spec entry — click to add"
                  >
                    + Add to spec
                  </button>
                ) : null}
                {etRef && !isContainer && (
                  <button
                    className="btn btn-link btn-sm p-0"
                    style={{ fontSize: 10, color: '#aaa', textDecoration: 'none' }}
                    onClick={() => toggleContainerET(etRef)}
                    title="Mark as virtual container element"
                  >
                    Mark as container
                  </button>
                )}
                {etRef && isContainer && (
                  <button
                    className="btn btn-link btn-sm p-0"
                    style={{ fontSize: 10, color: '#aaa', textDecoration: 'none' }}
                    onClick={() => toggleContainerET(etRef)}
                    title="Remove container designation"
                  >
                    ✕ container
                  </button>
                )}
              </div>

              {/* Container ET info: Used in + Next ref */}
              {isContainer && (usedIn.length > 0 || nextRef) && (
                <div
                  className="mb-1"
                  style={{ fontSize: 11, color: '#555', lineHeight: 1.4 }}
                >
                  {usedIn.length > 0 && (
                    <span className="me-3">
                      <span className="text-muted">Used in: </span>
                      {usedIn.join(', ')}
                    </span>
                  )}
                  {nextRef && (
                    <span>
                      <span className="text-muted">Next ref: </span>
                      <span className="fw-semibold">{nextRef}</span>
                    </span>
                  )}
                </div>
              )}

              {/* Container contents (read-only) */}
              {isContainer && (
                <div className="mb-2" style={{ fontSize: 11 }}>
                  <button
                    className="btn btn-link btn-sm p-0"
                    style={{ fontSize: 11, textDecoration: 'none', color: '#555' }}
                    onClick={() => setShowContents(v => !v)}
                  >
                    {showContents ? '▾' : '▸'} Contents ({internalItems.length})
                  </button>
                  {showContents && (
                    internalItems.length > 0 ? (
                      <div
                        className="mt-1 ps-3"
                        style={{ borderLeft: '2px solid #e9ecef', color: '#555' }}
                      >
                        {internalItems.map(item => (
                          <div key={item.ref}>
                            <span style={{ fontFamily: 'monospace' }}>{item.ref}</span>
                            {item.name && <span className="text-muted ms-1">— {item.name}</span>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-1 ps-3 text-muted fst-italic">No internal items yet.</div>
                    )
                  )}
                </div>
              )}

              {/* Flag pills */}
              <div className="d-flex gap-1 mb-2 flex-wrap">
                <FlagPill
                  label="Design"
                  value={row.isDesign || row.IsDesign || null}
                  onChange={val => handleFlagChange('isDesign', val)}
                  activeVariant="primary"
                />
                <FlagPill
                  label="Contract"
                  value={row.isContractItem || row.IsContractItem || null}
                  onChange={val => handleFlagChange('isContractItem', val)}
                  activeVariant="success"
                />
                <FlagPill
                  label="Integer"
                  value={row.isInteger || row.IsInteger || null}
                  onChange={val => handleFlagChange('isInteger', val)}
                  activeVariant="secondary"
                />
                <FlagPill
                  label="TRItem"
                  value={row.isTRItem || row.IsTRItem || null}
                  onChange={val => handleFlagChange('isTRItem', val)}
                  activeVariant="warning"
                />
                <FlagPill
                  label="TBC"
                  value={row.isTBC || row.IsTBC || null}
                  onChange={val => handleFlagChange('isTBC', val)}
                  activeVariant="danger"
                />
              </div>

              {/* Editable numeric fields */}
              <div className="d-flex gap-2 align-items-center flex-wrap">
                <FieldInput
                  label="Qty"
                  value={row.quantity ?? row.Quantity ?? ''}
                  onChange={val => handleFieldChange('quantity', val === '' ? null : Number(val))}
                  width={60}
                  type="number"
                  min={0}
                  placeholder="1"
                />
                <FieldInput
                  label="DimMult"
                  value={row.dimQtyMultiplier ?? row.Dim_QuantityMultiplier ?? ''}
                  onChange={val => handleFieldChange('dimQtyMultiplier', val === '' ? null : Number(val))}
                  width={70}
                  type="number"
                  step="any"
                />
                <FieldInput
                  label="PackQty"
                  value={row.packQuantity ?? row.PackQuantity ?? ''}
                  onChange={val => handleFieldChange('packQuantity', val === '' ? null : Number(val))}
                  width={65}
                  type="number"
                  min={1}
                />
              </div>
            </div>

            {/* Delete */}
            <Button
              variant="link"
              size="sm"
              className="text-danger p-0"
              style={{ lineHeight: 1, alignSelf: 'flex-start' }}
              onClick={() => removeRecipeRow(posRef, rowId)}
              title="Remove row"
            >
              ×
            </Button>
          </div>
        </Card.Body>
      </Card>
    </div>
  )
}

function FieldInput({ label, value, onChange, width = 80, type = 'text', min, step, placeholder }) {
  return (
    <div className="d-flex align-items-center gap-1">
      <label className="text-muted" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{label}</label>
      <Form.Control
        type={type}
        size="sm"
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        style={{ width, padding: '2px 6px', fontSize: 12 }}
        min={min}
        step={step}
      />
    </div>
  )
}
