import React, { useState } from 'react'
import { Card, Form, Button } from 'react-bootstrap'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import useStore from '../store/useStore'
import FlagPill from './FlagPill'
import ETRefSelect from './ETRefSelect'
import EntityPill from './EntityPill'
import ContentsBadge from './ContentsBadge'
import MaterialIcon from './MaterialIcon'
import IconButton from './IconButton'
import { getUsedIn, getInternalItems } from '../utils/containerUtils'
import { familyOf } from '../utils/etRef'
import { ACTION_ICONS } from '../utils/entityStyle'

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
  const containerReasons = useStore(s => s.containerReasons)
  const selectedRowIds = useStore(s => s.selectedRowIds)
  const toggleRowSelection = useStore(s => s.toggleRowSelection)
  const copyRows = useStore(s => s.copyRows)
  const suggestNextETRef = useStore(s => s.suggestNextETRef)
  const restoreRecipeRow = useStore(s => s.restoreRecipeRow)

  const rowId = row._id
  const isSelected = selectedRowIds.includes(rowId)
  // Unsynced = this row has a pending change not yet exported to the source file
  const isDirty = useStore(s => s.rsChanges.some(c => c._id === rowId))
  const isDeleted = (row.IsDeleted || row.isDeleted) === 'Y'

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
  // New = added in-app this session AND not yet synced to the source file.
  const isNewRow = !isUnresolved && row._row_num == null && isDirty

  // Look up PS row for product code, manufacturer, description
  const psRow = psRows.find(p => {
    const ref = p.ElementTypeRef || p.elementTypeRef || ''
    return ref.toLowerCase() === etRef.toLowerCase()
  })
  const productCode = psRow?.ProductCode || psRow?.productCode || null
  const manufacturer = psRow?.Manufacturer || psRow?.manufacturer || null

  // ET family for sublabel on the pill
  const etObj = etRef
    ? elementTypes.find(e => (e.ElementTypeRef || e.elementTypeRef || '').toLowerCase() === etRef.toLowerCase())
    : null
  const etFamily = etRef ? familyOf(etRef, etObj) : null

  // Container ET awareness
  const isContainer = etRef ? containerETRefs.has(etRef.toLowerCase()) : false
  const HINT_LABELS = { naming: 'DL/LIN name', ideaworksNA: 'Ideaworks/N-A spec', hasInternals: 'has internals', isCollection: 'IsCollection flag' }
  const reason = etRef ? containerReasons?.[etRef.toLowerCase()] : null
  const whyText = reason
    ? (reason.forced === 'included' ? 'Manually marked as container'
      : reason.forced === 'excluded' ? 'Manually excluded from containers'
      : reason.hints?.length ? `Detected via: ${reason.hints.map(h => HINT_LABELS[h] || h).join(', ')}`
      : 'No wrapper signals')
    : ''
  const usedIn = isContainer ? getUsedIn(etRef, recipes, posRef) : []
  const nextRef = isContainer ? suggestNextETRef(etRef) : null
  const internalItems = isContainer ? getInternalItems(etRef, recipes, elementTypes) : []

  const [showContents, setShowContents] = useState(false)

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
  const leftColor = isSelected ? '#0d6efd' : isDeleted ? '#adb5bd' : isDirty ? '#f0ad4e' : ((etRef && !isUnresolved) ? '#bf6018' : '#ffc107')
  const background = isSelected ? '#e7f1ff' : isDeleted ? '#f8f9fa' : isDirty ? '#fffdf5' : undefined

  return (
    <div ref={setNodeRef} style={style} data-debug-id="IngredientCard">
      <Card
        style={{
          borderLeft: `3px solid ${leftColor}`,
          borderRadius: 6,
          background,
          boxShadow: isSelected ? '0 0 0 1px #0d6efd' : undefined,
          opacity: isDeleted ? 0.65 : 1,
        }}
      >
        <Card.Body className="py-2 px-3">
          {isDeleted && (
            <div className="d-flex align-items-center gap-1 mb-1" style={{ fontSize: 10, color: '#6c757d' }}>
              <MaterialIcon name="delete" size={12} /> Deleted — will sync as IsDeleted=Y
            </div>
          )}
          <div className="d-flex align-items-start gap-2">
            {/* Select for copy */}
            <Form.Check
              type="checkbox"
              checked={isSelected}
              onChange={() => toggleRowSelection(rowId)}
              title="Select for copy"
              style={{ paddingTop: 2 }}
            />
            {/* Copy this row */}
            <button
              className="btn btn-link p-0"
              style={{ color: '#aaa', lineHeight: 1, paddingTop: 2 }}
              title="Copy this row"
              aria-label="Copy this row"
              onClick={() => copyRows([rowId])}
            >
              <MaterialIcon name={ACTION_ICONS.copy} size={15} />
            </button>
            {/* Drag handle */}
            <span
              {...attributes}
              {...listeners}
              style={{
                cursor: 'grab',
                color: '#aaa',
                lineHeight: 1,
                paddingTop: 2,
                userSelect: 'none',
              }}
              title="Drag to reorder"
            >
              <MaterialIcon name={ACTION_ICONS.drag} size={18} />
            </span>

            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Abstraction bridge: ET pill → arrow → product code */}
              <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
                {etRef ? (
                  <>
                    <EntityPill
                      type="ElementType"
                      label={etRef}
                      sublabel={etFamily}
                      stack
                      title={isContainer ? 'Container / wrapper element' : 'Element type'}
                    />
                    {isNewRow && (
                      <span
                        className="badge"
                        style={{ background: '#d1e7dd', color: '#0a3622', border: '1px solid #a3cfbb', fontSize: 9, flexShrink: 0 }}
                        title="New — added here and not yet in the source file (unsaved until you export)"
                      >
                        new
                      </span>
                    )}
                    <MaterialIcon name="arrow_forward" size={14} style={{ color: '#ccc', flexShrink: 0 }} />
                    {productCode ? (
                      <button
                        className="btn btn-link p-0 d-inline-flex align-items-center gap-1"
                        style={{ fontSize: 11, color: '#333', textDecoration: 'none', fontWeight: 500 }}
                        onClick={() => onOpenProductSpec && onOpenProductSpec(etRef)}
                        title="Open in Product Spec"
                      >
                        <span style={{ color: '#666' }}>{manufacturer ? `${manufacturer} – ` : ''}{productCode}</span>
                        <MaterialIcon name="edit" size={12} style={{ color: '#aaa' }} />
                      </button>
                    ) : etRef ? (
                      <IconButton
                        icon={ACTION_ICONS.addToSpec} size={16}
                        style={{ fontSize: 11, color: '#e67e22', padding: 0 }}
                        onClick={() => onOpenProductSpec && onOpenProductSpec(etRef)}
                        title="No product spec — click to add"
                      />
                    ) : null}
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
                {/* Container toggle: same icon, coloured when marked, grey when not */}
                {etRef && (
                  <IconButton
                    icon={ACTION_ICONS.container} size={15}
                    style={{ color: isContainer ? '#bf6018' : '#ccc', padding: 0 }}
                    onClick={() => toggleContainerET(etRef)}
                    title={isContainer
                      ? `Container element — click to remove designation${whyText ? ` — ${whyText}` : ''}`
                      : `Mark as virtual container element${whyText ? ` — ${whyText}` : ''}`}
                  />
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
                      <IconButton
                        icon={ACTION_ICONS.remove} size={15}
                        style={{ color: '#aaa', padding: 0 }}
                        onClick={() => setShowExtra(false)}
                        title="Collapse extra fields"
                      />
                    )}
                  </>
                ) : (
                  <IconButton
                    icon={ACTION_ICONS.more} size={16}
                    style={{ color: '#aaa', padding: 0 }}
                    onClick={() => setShowExtra(true)}
                    title="Show DimMult, PackQty, TRItem"
                  />
                )}
              </div>
            </div>

            {/* Delete / restore */}
            {isDeleted ? (
              <IconButton
                variant="link"
                className="text-success p-0"
                style={{ alignSelf: 'flex-start' }}
                icon="undo"
                size={16}
                onClick={() => restoreRecipeRow(posRef, rowId)}
                title="Restore row"
              />
            ) : (
              <IconButton
                variant="link"
                className="text-danger p-0"
                style={{ alignSelf: 'flex-start' }}
                icon={ACTION_ICONS.delete}
                size={16}
                onClick={() => removeRecipeRow(posRef, rowId)}
                title="Remove row"
              />
            )}
          </div>
        </Card.Body>
      </Card>
    </div>
  )
}

// Qty field: category icon (with the count when >1); clicking it expands a
// stepper that slides open to the right (no floating popover).
function QtyField({ value, onChange }) {
  const num = value === '' || value == null ? 1 : Number(value)
  const [open, setOpen] = useState(false)

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        border: '1px solid #dee2e6',
        borderRadius: 6,
        padding: '2px 6px',
        background: '#fff',
      }}
    >
      <button
        className="btn btn-link p-0 d-inline-flex align-items-center gap-1"
        style={{ lineHeight: 1, color: '#6c757d', textDecoration: 'none' }}
        onClick={() => setOpen(v => !v)}
        title={`Quantity: ${num} — click to change`}
        aria-label="Quantity"
        aria-expanded={open}
      >
        <MaterialIcon name="category" size={16} />
        {!open && num > 1 && (
          <span style={{ fontSize: 12, fontWeight: 600, color: '#212529' }}>{num}</span>
        )}
      </button>
      {/* Slides open to the right */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          overflow: 'hidden',
          width: open ? 122 : 0,
          marginLeft: open ? 4 : 0,
          opacity: open ? 1 : 0,
          transition: 'width 0.2s ease, opacity 0.2s ease, margin-left 0.2s ease',
        }}
      >
        <Button
          variant="outline-secondary" size="sm" tabIndex={open ? 0 : -1}
          style={{ width: 26, padding: '0 4px', flexShrink: 0 }}
          onClick={() => onChange(String(Math.max(0, num - 1)))}
        >−</Button>
        <Form.Control
          type="number" size="sm" tabIndex={open ? 0 : -1}
          value={num}
          onChange={e => onChange(e.target.value)}
          style={{ width: 50, textAlign: 'center', fontSize: 12, padding: '2px', flexShrink: 0 }}
          min={0}
        />
        <Button
          variant="outline-secondary" size="sm" tabIndex={open ? 0 : -1}
          style={{ width: 26, padding: '0 4px', flexShrink: 0 }}
          onClick={() => onChange(String(num + 1))}
        >+</Button>
      </div>
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
