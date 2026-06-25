import React, { useState, useMemo } from 'react'
import { Button, Form } from 'react-bootstrap'
import useStore from '../store/useStore'
import ProductSpecTable from '../components/ProductSpecTable'

/**
 * ProductSpecScreen — full-width product spec catalogue editor.
 *
 * Props:
 *   onBack: () => void
 *   scrollToRef: string|null — ET ref to scroll to on open (from "Add to spec" link)
 */
export default function ProductSpecScreen({ onBack, scrollToRef }) {
  const psRows = useStore(s => s.psRows)
  const recipes = useStore(s => s.recipes)
  const addPSRow = useStore(s => s.addPSRow)

  const [showDeleted, setShowDeleted] = useState(false)
  const [addRefInput, setAddRefInput] = useState('')
  const [addError, setAddError] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)

  // Build usage map: ET ref (lower) → { positions: Set<posRef>, elements: Set<etContextRef> }
  // - ContextType='PositionType': this ET is used directly in a position's recipe
  // - ContextType='ElementType': this ET is used inside another ElementType's context
  const etUsedIn = useMemo(() => {
    const map = {}
    for (const row of recipes) {
      const etRef = row.ElementTypeRef || row.elementTypeRef
      const contextType = row.ContextType || row.contextType
      const contextRef = row.ContextRef || row.contextRef
      if (!etRef || !contextRef) continue
      const key = etRef.toLowerCase()
      if (!map[key]) map[key] = { positions: new Set(), elements: new Set() }
      if (contextType === 'PositionType') {
        map[key].positions.add(contextRef)
      } else if (contextType === 'ElementType') {
        map[key].elements.add(contextRef)
      }
    }
    return map
  }, [recipes])

  // ETs referenced in recipes with no matching PS row
  const missingPsETs = useMemo(() => {
    const psRefSet = new Set(
      psRows.map(r => (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase())
    )
    const missing = new Set()
    for (const row of recipes) {
      const etRef = row.ElementTypeRef || row.elementTypeRef
      if (etRef && !psRefSet.has(etRef.toLowerCase())) {
        missing.add(etRef)
      }
    }
    return [...missing].sort()
  }, [psRows, recipes])

  function handleAdd() {
    const trimmed = addRefInput.trim()
    if (!trimmed) {
      setAddError('ElementTypeRef is required.')
      return
    }
    const result = addPSRow(trimmed)
    if (result === null) {
      setAddError(`"${trimmed}" already exists in the product spec.`)
      return
    }
    setAddRefInput('')
    setAddError(null)
    setShowAddForm(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Header */}
      <div
        className="d-flex align-items-center gap-2 px-3 py-2 border-bottom bg-white"
        style={{ flexShrink: 0 }}
      >
        <Button variant="outline-secondary" size="sm" onClick={onBack}>
          ← Back to Builder
        </Button>
        <span className="fw-semibold ms-1">Product Spec</span>
        <div className="flex-grow-1" />
        <Button
          variant={showDeleted ? 'secondary' : 'outline-secondary'}
          size="sm"
          onClick={() => setShowDeleted(v => !v)}
        >
          {showDeleted ? 'Hide deleted' : 'Show deleted'}
        </Button>
        {showAddForm ? (
          <div className="d-flex gap-1 align-items-center">
            <Form.Control
              size="sm"
              style={{ width: 240 }}
              placeholder="ElementTypeRef (e.g. ET-DL-SPOT-01)"
              value={addRefInput}
              onChange={e => { setAddRefInput(e.target.value); setAddError(null) }}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAdd()
                if (e.key === 'Escape') { setShowAddForm(false); setAddError(null) }
              }}
              autoFocus
              isInvalid={!!addError}
            />
            {addError && (
              <span className="text-danger small">{addError}</span>
            )}
            <Button variant="success" size="sm" onClick={handleAdd}>Add</Button>
            <Button variant="link" size="sm" onClick={() => { setShowAddForm(false); setAddError(null) }}>Cancel</Button>
          </div>
        ) : (
          <Button variant="outline-primary" size="sm" onClick={() => setShowAddForm(true)}>
            + Add row
          </Button>
        )}
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <ProductSpecTable
          showDeleted={showDeleted}
          etUsedIn={etUsedIn}
          scrollToRef={scrollToRef}
          missingETs={missingPsETs}
        />
      </div>
    </div>
  )
}
