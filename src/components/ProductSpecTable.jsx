import React, { useMemo, useState, useEffect, useRef } from 'react'
import { Table, Form, Button } from 'react-bootstrap'
import useStore from '../store/useStore'
import FlagPill from './FlagPill'

/**
 * ProductSpecTable — table of PS rows with inline editing.
 *
 * Props:
 *   showDeleted: boolean — when true, show IsDeleted='Y' rows
 *   etUsedIn: { [etRefLower]: { positions: Set, elements: Set } } — usage map from parent
 *   scrollToRef: string|null — ET ref to scroll to on mount
 *   missingETs: string[] — ET refs in recipes with no PS row (shown highlighted at top)
 */
export default function ProductSpecTable({ showDeleted = false, etUsedIn = {}, scrollToRef = null, missingETs = [] }) {
  const psRows = useStore(s => s.psRows)
  const updatePSRow = useStore(s => s.updatePSRow)
  const addPSRow = useStore(s => s.addPSRow)
  const [search, setSearch] = useState('')

  const rowRefs = useRef({})

  const duplicateCodes = useMemo(() => {
    const counts = {}
    for (const row of psRows) {
      const code = (row.ProductCode || row.productCode || '').trim().toUpperCase()
      if (!code || code === 'N/A') continue
      counts[code] = (counts[code] || 0) + 1
    }
    return new Set(Object.keys(counts).filter(k => counts[k] > 1))
  }, [psRows])

  const filtered = useMemo(() => {
    const visible = showDeleted
      ? psRows
      : psRows.filter(row => (row.IsDeleted || row.isDeleted) !== 'Y')

    const q = search.toLowerCase().trim()
    if (!q) return visible
    return visible.filter(row =>
      (row.ElementTypeRef || row.elementTypeRef || '').toLowerCase().includes(q) ||
      (row.ProductCode || row.productCode || '').toLowerCase().includes(q) ||
      (row.Manufacturer || row.manufacturer || '').toLowerCase().includes(q) ||
      (row.ComponentDescription || row.componentDescription || '').toLowerCase().includes(q)
    )
  }, [psRows, search, showDeleted])

  // Scroll to target row when scrollToRef changes
  useEffect(() => {
    if (!scrollToRef || typeof scrollToRef !== 'string') return
    const key = scrollToRef.toLowerCase()
    const el = rowRefs.current[key]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.style.outline = '2px solid #0d6efd'
      setTimeout(() => { if (el) el.style.outline = '' }, 2000)
    }
  }, [scrollToRef])

  function getRef(row) {
    return row.ElementTypeRef || row.elementTypeRef || ''
  }

  function isDuplicate(row) {
    const code = (row.ProductCode || row.productCode || '').trim().toUpperCase()
    return code && code !== 'N/A' && duplicateCodes.has(code)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="p-2 border-bottom">
        <Form.Control
          type="text"
          size="sm"
          placeholder="Search product spec…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <Table bordered hover size="sm" className="small mb-0" style={{ tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 150 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 120 }} />
            <col />
            <col style={{ width: 50 }} />
            <col style={{ width: 30 }} />
          </colgroup>
          <thead className="table-light" style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th>ElementTypeRef</th>
              <th>ProductCode</th>
              <th>Manufacturer</th>
              <th>Description</th>
              <th className="text-center">TBC</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {/* Ghost rows: ETs in recipes with no PS entry */}
            {missingETs.map(ref => (
              <tr key={`missing-${ref}`} style={{ background: '#fff8e1' }}>
                <td style={{ fontWeight: 500, fontSize: 11 }}>
                  <span style={{ color: '#b45309' }}>{ref}</span>
                  <span
                    className="ms-2"
                    style={{
                      fontSize: 10,
                      background: '#fde68a',
                      color: '#92400e',
                      borderRadius: 3,
                      padding: '1px 5px',
                      fontWeight: 600,
                    }}
                  >
                    not in spec
                  </span>
                </td>
                <td className="text-muted fst-italic small" style={{ fontSize: 11 }}>—</td>
                <td className="text-muted fst-italic small" style={{ fontSize: 11 }}>—</td>
                <td className="text-muted fst-italic small" style={{ fontSize: 11 }}>—</td>
                <td />
                <td className="text-center">
                  <Button
                    variant="link"
                    size="sm"
                    className="p-0"
                    style={{ fontSize: 11, color: '#b45309' }}
                    onClick={() => addPSRow(ref)}
                    title="Add to product spec"
                  >
                    + Add
                  </Button>
                </td>
              </tr>
            ))}

            {filtered.length === 0 && missingETs.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted py-3">No rows.</td>
              </tr>
            )}
            {filtered.map(row => {
              const ref = getRef(row)
              const dup = isDuplicate(row)
              const isDeleted = (row.IsDeleted || row.isDeleted) === 'Y'
              const usageKey = ref.toLowerCase()
              const usage = etUsedIn[usageKey]

              return (
                <React.Fragment key={row._id || ref}>
                  <tr
                    ref={el => { rowRefs.current[usageKey] = el }}
                    style={{
                      background: isDeleted ? '#fdf0f0' : dup ? '#fff5f5' : undefined,
                      opacity: isDeleted ? 0.6 : 1,
                    }}
                  >
                    <td style={{ fontWeight: 500, fontSize: 11 }}>{ref}</td>
                    <EditableCell
                      value={row.ProductCode || row.productCode || ''}
                      onChange={val => updatePSRow(ref, { ProductCode: val })}
                      style={{ color: dup ? '#dc3545' : undefined, fontWeight: dup ? 600 : undefined }}
                    />
                    <EditableCell
                      value={row.Manufacturer || row.manufacturer || ''}
                      onChange={val => updatePSRow(ref, { Manufacturer: val })}
                    />
                    <EditableCell
                      value={row.ComponentDescription || row.componentDescription || ''}
                      onChange={val => updatePSRow(ref, { ComponentDescription: val })}
                    />
                    <td className="text-center">
                      <FlagPill
                        label="TBC"
                        value={row.IsTBC || row.isTBC || null}
                        onChange={val => updatePSRow(ref, { IsTBC: val })}
                        activeVariant="danger"
                      />
                    </td>
                    <td className="text-center">
                      {isDeleted ? (
                        <Button
                          variant="link"
                          size="sm"
                          className="text-secondary p-0"
                          style={{ fontSize: 11 }}
                          onClick={() => updatePSRow(ref, { IsDeleted: null })}
                          title="Restore row"
                        >
                          ↩
                        </Button>
                      ) : (
                        <Button
                          variant="link"
                          size="sm"
                          className="text-danger p-0"
                          style={{ lineHeight: 1 }}
                          onClick={() => updatePSRow(ref, { IsDeleted: 'Y' })}
                          title="Soft-delete row"
                        >
                          ×
                        </Button>
                      )}
                    </td>
                  </tr>
                  {/* Used In row — only shown when used in more than one context */}
                  {usage && (usage.positions?.size > 1 || usage.elements?.size > 1 ||
                    (usage.positions?.size >= 1 && usage.elements?.size >= 1)) && (
                    <tr style={{ background: '#fafafa' }}>
                      <td colSpan={6} style={{ paddingTop: 2, paddingBottom: 4, paddingLeft: 12, fontSize: 11 }}>
                        {usage.positions?.size > 0 && (
                          <span className="text-muted me-3">
                            <span className="fw-semibold">Used in PositionTypes:</span>{' '}
                            {[...usage.positions].join(', ')}
                          </span>
                        )}
                        {usage.elements?.size > 0 && (
                          <span className="text-muted">
                            <span className="fw-semibold">Used in ElementTypes:</span>{' '}
                            {[...usage.elements].join(', ')}
                          </span>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </Table>
      </div>

      <div className="px-3 py-1 border-top text-muted small">
        {filtered.length} of {psRows.filter(r => showDeleted || (r.IsDeleted || r.isDeleted) !== 'Y').length} rows
        {duplicateCodes.size > 0 && (
          <span className="text-danger ms-2">
            ⚠ {duplicateCodes.size} duplicate product code{duplicateCodes.size !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  )
}

function EditableCell({ value, onChange, style }) {
  const [editing, setEditing] = useState(false)
  const [local, setLocal] = useState(value)

  useEffect(() => { setLocal(value) }, [value])

  function handleBlur() {
    setEditing(false)
    if (local !== value) onChange(local)
  }

  if (editing) {
    return (
      <td>
        <Form.Control
          size="sm"
          value={local}
          onChange={e => setLocal(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={e => {
            if (e.key === 'Enter') handleBlur()
            if (e.key === 'Escape') { setLocal(value); setEditing(false) }
          }}
          autoFocus
          style={{ padding: '1px 4px', fontSize: 12 }}
        />
      </td>
    )
  }

  return (
    <td
      onClick={() => { setLocal(value); setEditing(true) }}
      style={{ cursor: 'text', ...style }}
      title="Click to edit"
    >
      {value || <span className="text-muted fst-italic" style={{ fontSize: 11 }}>—</span>}
    </td>
  )
}
