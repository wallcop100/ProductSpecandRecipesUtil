import React, { useState, useRef } from 'react'
import { Card, Form, Button, Overlay, Popover } from 'react-bootstrap'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import useStore from '../store/useStore'
import FlagPill from './FlagPill'
import ETRefSelect from './ETRefSelect'
import EntityPill from './EntityPill'
import ContentsBadge from './ContentsBadge'
import MaterialIcon from './MaterialIcon'
import { getUsedIn, getNextAvailableRef, getInternalItems } from '../utils/containerUtils'
import { familyOf } from '../utils/etRef'

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
  const updatePSRow = useStore(s => s.updatePSRow)
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

  // Look up PS row for product code, manufacturer, description
  const psRow = psRows.find(p => {
    const ref = p.ElementTypeRef || p.elementTypeRef || ''
    return ref.toLowerCase() === etRef.toLowerCase()
  })
  const productCode = psRow?.ProductCode || psRow?.productCode || null
  const manufacturer = psRow?.Manufacturer || psRow?.manufacturer || null
  const componentDesc = psRow?.ComponentDescription || psRow?.componentDescription || null

  // ET family for sublabel on the pill
  const etObj = etRef
    ? elementTypes.find(e => (e.ElementTypeRef || e.elementTypeRef || '').toLowerCase() === etRef.toLowerCase())
    : null
  const etFamily = etRef ? familyOf(etRef, etObj) : null

  // Container ET awareness
  const isContainer = etRef ? containerETRefs.has(etRef.toLowerCase()) : false
  const usedIn = isContainer ? getUsedIn(etRef, recipes, posRef) : []
  const nextRef = isContainer ? getNextAvailableRef(etRef, elementTypes) : null
  const internalItems = isContainer ? getInternalItems(etRef, recipes, elementTypes) : []

  const [showContents, setShowContents] = useState(false)
  const [showSpecPopover, setShowSpecPopover] = useState(false)
  const pillRef = useRef(null)

  // Extra fields: show if any are set, or if user manually expanded
  const extraInUse = (
    (row.packQuantity != null && row.packQuantity !== '') ||
    (row.dimQtyMultiplier != null && row.dimQtyMultiplier !== '') ||
    !!(row.isTRItem || row.IsTRItem)
  )
  const [showExtra, setShowExtra] = useState(false)
  const showExtraControls = showExtra || extraInUse

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

  // Left border = element type colour; context colour lives on the section header line
  const etAccent = (etRef && !isUnresolved) ? '#bf6018' : '#ffc107'

  return (
    <div ref={setNodeRef} style={style}>
      <Card
        style={{
          borderLeft: `3px solid ${etAccent}`,
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
              {/* Abstraction bridge: ET pill → arrow → product code */}
              <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
                {etRef ? (
                  <>
                    <span ref={pillRef} style={{ cursor: 'pointer' }} onClick={() => psRow && setShowSpecPopover(v => !v)}>
                      <EntityPill
                        type="ElementType"
                        label={etRef}
                        sublabel={etFamily}
                        title={psRow ? 'Click to edit spec' : (isContainer ? 'Collection (container element)' : 'Element')}
                      />
                    </span>
                    <MaterialIcon name="arrow_forward" size={14} style={{ color: '#ccc', flexShrink: 0 }} />
                    {productCode ? (
                      <span
                        className="badge bg-light text-dark border"
                        style={{ fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                        onClick={() => setShowSpecPopover(v => !v)}
                        title={manufacturer ? `${manufacturer}` : 'Product code'}
                      >
                        {productCode}
                      </span>
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

                    {/* Inline spec popover */}
                    {psRow && (
                      <Overlay
                        target={pillRef.current}
                        show={showSpecPopover}
                        placement="bottom-start"
                        rootClose
                        onHide={() => setShowSpecPopover(false)}
                      >
                        <Popover style={{ minWidth: 240, maxWidth: 320 }}>
                          <Popover.Header style={{ fontSize: 12 }}>Spec — {etRef}</Popover.Header>
                          <Popover.Body className="p-2">
                            <SpecField
                              label="Product Code"
                              value={productCode || ''}
                              onChange={val => updatePSRow(etRef, { ProductCode: val })}
                            />
                            <SpecField
                              label="Manufacturer"
                              value={manufacturer || ''}
                              onChange={val => updatePSRow(etRef, { Manufacturer: val })}
                            />
                            <SpecField
                              label="Description"
                              value={componentDesc || ''}
                              onChange={val => updatePSRow(etRef, { ComponentDescription: val })}
                            />
                          </Popover.Body>
                        </Popover>
                      </Overlay>
                    )}
                  </>
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

                {/* Container controls */}
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
                  <ContentsBadge
                    count={internalItems.length}
                    onClick={() => setShowContents(v => !v)}
                    title={showContents ? 'Hide contents' : 'Show contents'}
                  />
                  {showContents && (
                    internalItems.length > 0 ? (
                      <div
                        className="mt-1 ps-3"
                        style={{ borderLeft: '2px solid #e9ecef', color: '#555' }}
                      >
                        {internalItems.map(item => (
                          <div key={item.ref} className="d-flex align-items-center gap-1 mb-1">
                            <EntityPill type="ElementType" label={item.ref} />
                            {item.name && <span className="text-muted">— {item.name}</span>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-1 ps-3 text-muted fst-italic">No internal items yet.</div>
                    )
                  )}
                </div>
              )}

              {/* Flag pills (Design, Contract, Integer) + qty */}
              <div className="d-flex gap-2 align-items-center mb-1 flex-wrap">
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
                  label="TBC"
                  value={row.isTBC || row.IsTBC || null}
                  onChange={val => handleFlagChange('isTBC', val)}
                  activeVariant="danger"
                />

                {/* Qty field with category icon */}
                <QtyField
                  value={row.quantity ?? row.Quantity ?? ''}
                  onChange={val => handleFieldChange('quantity', val === '' ? null : Number(val))}
                />

                {/* Rarely-used extras */}
                {showExtraControls ? (
                  <>
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
                    <FlagPill
                      label="TRItem"
                      value={row.isTRItem || row.IsTRItem || null}
                      onChange={val => handleFlagChange('isTRItem', val)}
                      activeVariant="warning"
                    />
                    {!extraInUse && (
                      <button
                        className="btn btn-link btn-sm p-0"
                        style={{ fontSize: 11, color: '#aaa', textDecoration: 'none' }}
                        onClick={() => setShowExtra(false)}
                        title="Collapse extra fields"
                      >
                        ×
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    className="btn btn-link btn-sm p-0"
                    style={{ fontSize: 12, color: '#aaa', textDecoration: 'none', letterSpacing: 2 }}
                    onClick={() => setShowExtra(true)}
                    title="Show DimMult, PackQty, TRItem"
                  >
                    •••
                  </button>
                )}
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

// Qty field: category icon + borderless number input inside a pill-shaped box
function QtyField({ value, onChange }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        border: '1px solid #dee2e6',
        borderRadius: 6,
        padding: '2px 6px',
        background: '#fff',
      }}
    >
      <MaterialIcon name="category" size={16} className="text-secondary" />
      <Form.Control
        type="number"
        size="sm"
        value={value}
        placeholder="1"
        onChange={e => onChange(e.target.value)}
        style={{ border: 'none', padding: 0, width: 50, fontSize: 12, boxShadow: 'none' }}
        min={0}
      />
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

// Compact editable field row for the spec popover
function SpecField({ label, value, onChange }) {
  const [local, setLocal] = useState(value)
  return (
    <div className="mb-2">
      <div className="text-muted" style={{ fontSize: 10, marginBottom: 2 }}>{label}</div>
      <Form.Control
        size="sm"
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => { if (local !== value) onChange(local) }}
        onKeyDown={e => { if (e.key === 'Enter') { e.target.blur() } }}
        style={{ fontSize: 12 }}
      />
    </div>
  )
}
