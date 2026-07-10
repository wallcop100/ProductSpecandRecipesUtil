import React, { useState, useRef, useEffect, useCallback } from 'react'
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
import { wrapperUsedBy } from '../utils/collectionStatus'
import DuplicateETModal from './DuplicateETModal'
import SharedEditGuard from './SharedEditGuard'
import SwapEverywhereModal from './SwapEverywhereModal'
import { ConceptHint, CONCEPTS } from './ConceptCard'
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
export default function IngredientCard({ row, posRef, sectionKey, onOpenProductSpec, onReplace }) {
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

  // Scroll a freshly-added row into view (T-E3).
  const lastAddedRowId = useStore(s => s.lastAddedRowId)
  const elRef = useRef(null)
  const composedRef = useCallback(node => { elRef.current = node; setNodeRef(node) }, [setNodeRef])
  useEffect(() => {
    if (lastAddedRowId && lastAddedRowId === rowId && elRef.current) {
      elRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [lastAddedRowId, rowId])

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
  // A wrapper is an assembly, and assemblies get reused. Editing its internals changes
  // every position in this list — so the list, and the escape hatch, belong right here
  // rather than one screen deeper.
  const sharedWith = isContainer ? wrapperUsedBy(recipes, etRef).filter(p => p !== posRef) : []

  // This row's own home. An internal row lives inside a wrapper, and that wrapper's
  // contents belong to every position using it — so deleting or replacing the row here
  // changes them too. The app knew this and said nothing at the point of danger.
  const ownContainer = (row.ContextType || row.contextType) === 'ElementType'
    ? (row.ContextRef || row.contextRef || '')
    : ''
  const containerSharedWith = ownContainer
    ? wrapperUsedBy(recipes, ownContainer).filter(p => p !== posRef)
    : []

  /** Run a destructive edit, but not before naming who else it changes. */
  const guarded = (verb, run) => () => {
    if (containerSharedWith.length > 0) setGuard({ verb, run })
    else run()
  }
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
  const [forking, setForking] = useState(false)
  const [guard, setGuard] = useState(null)   // { verb, run } — a destructive edit inside a shared wrapper
  const [forkContainer, setForkContainer] = useState(false)
  const [swapping, setSwapping] = useState(false)
  const [replacing, setReplacing] = useState(false)
  const [keepFields, setKeepFields] = useState(true)

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

  // Left border = element type colour; context colour lives on the section header line.
  // New rows read green; other unsynced edits read amber.
  const leftColor = isSelected ? '#0d6efd' : isDeleted ? '#adb5bd' : isNewRow ? '#198754' : isDirty ? '#f0ad4e' : ((etRef && !isUnresolved) ? '#bf6018' : '#ffc107')
  const background = isSelected ? '#e7f1ff' : isDeleted ? '#f8f9fa' : isNewRow ? '#f2fbf5' : isDirty ? '#fffdf5' : undefined

  return (
    <div ref={composedRef} style={style} data-debug-id="IngredientCard">
      <Card
        style={{
          borderLeft: `3px solid ${leftColor}`,
          borderRadius: 6,
          background,
          boxShadow: isSelected ? '0 0 0 1px #0d6efd' : undefined,
          opacity: isDeleted ? 0.65 : 1,
          position: 'relative',
        }}
      >
        {/* New badge, docked to the top-left corner */}
        {isNewRow && (
          <span
            className="badge"
            style={{
              position: 'absolute', top: -7, left: -6, zIndex: 1,
              background: '#198754', color: '#fff', border: '1px solid #146c43',
              fontSize: 9, flexShrink: 0,
            }}
            title="New — added here and not yet in the source file (unsaved until you export)"
          >
            New
          </span>
        )}
        {/* Provenance: pre-filled from the imported ProductCode form, not yet structured. */}
        {row._origin === 'form' && (
          <span
            className="badge d-inline-flex align-items-center"
            style={{
              position: 'absolute', top: -7, right: -6, zIndex: 1,
              background: '#e7f1ff', color: '#084298', border: '1px solid #b6d4fe',
              fontSize: 9, flexShrink: 0, padding: '2px 4px',
            }}
            title={`From the imported form${row._formCode ? ` — code "${row._formCode}"` : ''}. Move it into structure (a DL/wrapper) when ready.`}
          >
            {/* 'token', not 'contextual_token': the latter is a Material Symbols icon
                and the bundled font is classic Material Icons, where it has no
                ligature and would render as literal text. */}
            <MaterialIcon name="token" size={11} />
          </span>
        )}
        <Card.Body className="py-2 px-3">
          {isDeleted && (
            <div className="d-flex align-items-center gap-1 mb-1" style={{ fontSize: 10, color: '#6c757d' }}>
              <MaterialIcon name="delete" size={12} /> IsDeleted — will sync to the source file
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
                    title={sharedWith.length > 0
                      ? `Edit this assembly's contents — it is shared, so this also changes ${sharedWith.join(', ')}`
                      : "Edit this element's internal recipe"}
                  >
                    Edit internals →
                  </button>
                )}

                {/* Shared assembly: name the blast radius, and offer the way out. */}
                {isContainer && etRef && sharedWith.length > 0 && (
                  <>
                    <span className="rounded px-1 d-inline-flex align-items-center gap-1"
                      style={{ fontSize: 10, background: '#fff3cd', color: '#856404' }}
                      title={`Shared assembly — its contents are the same for ${[posRef, ...sharedWith].join(', ')}`}>
                      <MaterialIcon name="warning" size={11} />
                      shared with {sharedWith.join(', ')}
                      <ConceptHint concept={CONCEPTS.WRAPPER} size={11}
                        title="What is a wrapper, and why is it shared?" />
                    </span>
                    <button
                      className="btn btn-link btn-sm p-0"
                      style={{ fontSize: 11, color: '#b45309', textDecoration: 'none' }}
                      onClick={() => setForking(true)}
                      title={`Give ${posRef} its own copy of ${etRef}, so changing it stops affecting ${sharedWith.join(', ')}`}
                    >
                      Fork for {posRef}
                    </button>
                  </>
                )}
              </div>

              {/* Replace-entity fork (Existing / New) with a keep-fields toggle */}
              {replacing && onReplace && (
                <div className="d-flex align-items-center gap-2 mb-2 px-2 py-1 rounded flex-wrap"
                  style={{ background: '#f0f4ff', border: '1px solid #c7d7f5', fontSize: 11 }}>
                  <span className="text-muted">Replace with:</span>
                  <Button variant="outline-primary" size="sm" style={{ padding: '1px 8px', fontSize: 11 }}
                    onClick={guarded('replace', () => { setReplacing(false); onReplace(posRef, rowId, { mode: 'existing', keepFields }) })}>
                    Existing
                  </Button>
                  <Button variant="outline-success" size="sm" style={{ padding: '1px 8px', fontSize: 11 }}
                    onClick={guarded('replace', () => { setReplacing(false); onReplace(posRef, rowId, { mode: 'new', keepFields }) })}>
                    New ↗
                  </Button>
                  {/* "I am trying to swap ET-A for ET-B" — everywhere, not one row at a
                      time. Previewed; a shared assembly is named before it changes. */}
                  <Button size="sm" variant="outline-secondary" style={{ fontSize: 10, padding: '0 6px' }}
                    onClick={() => { setReplacing(false); setSwapping(true) }}
                    title={`Replace ${etRef} with another ElementType across this project`}>
                    Swap everywhere…
                  </Button>
                  <Form.Check
                    type="switch"
                    id={`replace-keep-${rowId}`}
                    checked={keepFields}
                    onChange={e => setKeepFields(e.target.checked)}
                    label={<span style={{ fontSize: 10 }}>keep qty &amp; flags</span>}
                    style={{ fontSize: 10 }}
                  />
                  <button className="btn btn-link btn-sm p-0 text-muted" style={{ fontSize: 10 }}
                    onClick={() => setReplacing(false)}>Cancel</button>
                </div>
              )}

              {/* Container ET info: Used in */}
              {isContainer && usedIn.length > 0 && (
                <div className="mb-1" style={{ fontSize: 11, color: '#555', lineHeight: 1.4 }}>
                  <span className="text-muted">Used in: </span>
                  {usedIn.join(', ')}
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
              <div className="d-flex flex-column align-items-center gap-1" style={{ alignSelf: 'flex-start' }}>
                {onReplace && etRef && !isUnresolved && (
                  <IconButton
                    variant="link"
                    className="text-secondary p-0"
                    icon="swap_horiz"
                    size={16}
                    onClick={() => setReplacing(v => !v)}
                    title="Replace this element type with another"
                  />
                )}
                <IconButton
                  variant="link"
                  className="text-danger p-0"
                  icon={ACTION_ICONS.delete}
                  size={16}
                  onClick={guarded('delete', () => removeRecipeRow(posRef, rowId))}
                  title={containerSharedWith.length > 0
                    ? `Mark IsDeleted — inside ${ownContainer}, shared with ${containerSharedWith.join(', ')}`
                    : 'Mark IsDeleted'}
                />
                {/* Container designation toggle — stacked under the delete action */}
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
            )}
          </div>
        </Card.Body>
      </Card>

      {/* Forking is the escape from a shared assembly. It belongs where the warning
          is, and it repoints THIS position — see wrapperEditContext. */}
      {forking && (
        <DuplicateETModal show etRef={etRef} posRef={posRef} onClose={() => setForking(false)} />
      )}

      {/* Destructive edit inside someone else's assembly, too. Name them first. */}
      {guard && (
        <SharedEditGuard
          show
          verb={guard.verb}
          etRef={etRef}
          container={ownContainer}
          posRef={posRef}
          sharedWith={containerSharedWith}
          onCancel={() => setGuard(null)}
          onProceed={() => { const run = guard.run; setGuard(null); run() }}
          onFork={() => { setGuard(null); setForkContainer(true) }}
        />
      )}

      {/* Fork the WRAPPER this row lives in, not the row's own ElementType. */}
      {forkContainer && (
        <DuplicateETModal show etRef={ownContainer} posRef={posRef} onClose={() => setForkContainer(false)} />
      )}

      {swapping && (
        <SwapEverywhereModal show fromRef={etRef} posRef={posRef} onHide={() => setSwapping(false)} />
      )}
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
