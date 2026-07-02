import React, { useState, useMemo, useEffect } from 'react'
import { Modal, Button, Form } from 'react-bootstrap'
import useStore, { collectAllETRefs } from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import LinWrapperDiagram from './LinWrapperDiagram'
import { LIN_ARCHETYPES } from '../data/linArchetypes'

const LENGTH_CHIPS = [0.5, 1, 1.5, 2, 3]
const COUNT_CHIPS  = [1, 2, 3, 4, 5]

function parseTags(raw) {
  if (Array.isArray(raw)) return raw
  try { return JSON.parse(raw || '[]') } catch { return [] }
}

function etKey(row) {
  return ((row.ElementTypeRef || row.elementTypeRef || '')).toUpperCase()
}

// Heuristic: pick archetype from existing non-deleted rows
function detectArchetype(rows) {
  const active = rows.filter(r => (r.IsDeleted || r.isDeleted) !== 'Y')
  const refs = active.map(r => etKey(r))
  if (refs.some(r => r.includes('PROF'))) return LIN_ARCHETYPES.find(a => a.key === 'tape_in_profile')
  if (refs.some(r => r.includes('TAPE'))) return LIN_ARCHETYPES.find(a => a.key === 'encapsulated')
  if (refs.some(r => r.includes('FIXTURE'))) return LIN_ARCHETYPES.find(a => a.key === 'fixed_length')
  return null
}

// Find the first active existing row matching a step's token
function findExistingRow(step, rows) {
  const token = step.token.toUpperCase()
  return rows.find(r => {
    if ((r.IsDeleted || r.isDeleted) === 'Y') return false
    return etKey(r).includes(token)
  })
}

function buildSlotValues(arch, rows) {
  const vals = {}
  for (const step of arch.steps) {
    const existing = findExistingRow(step, rows)
    vals[step.role] = {
      etRef: existing ? (existing.ElementTypeRef || existing.elementTypeRef || '') : '',
      dimQtyMultiplier: existing
        ? (existing.Dim_QuantityMultiplier ?? existing.dimQtyMultiplier ?? null)
        : (step.isClip ? null : (step.dimQtyMultiplier ?? null)),
      quantity: existing
        ? (existing.Quantity ?? existing.quantity ?? null)
        : (step.quantity ?? null),
      isInteger: step.isClip ? 'Y' : undefined,
      existingRowId: existing ? existing._id : undefined,
      originalRef: existing ? (existing.ElementTypeRef || existing.elementTypeRef || '') : '',
    }
  }
  return vals
}

// ---------------------------------------------------------------------------
// LinWrapperWizardModal — single-panel diagram + slot table editor
// Props: show, onHide, etRef (wrapper ET), posRef, etModeRows (existing rows)
// ---------------------------------------------------------------------------
export default function LinWrapperWizardModal({ show, onHide, etRef, posRef, etModeRows = [] }) {
  const templates             = useStore(s => s.templates)
  const addConnection         = useStore(s => s.addConnection)
  const saveWrapperAsTemplate = useStore(s => s.saveWrapperAsTemplate)
  const updateRecipeRow       = useStore(s => s.updateRecipeRow)
  const elementTypes          = useStore(s => s.elementTypes)
  const psRows                = useStore(s => s.psRows)
  const recipes               = useStore(s => s.recipes)

  const [archetype, setArchetype]     = useState(null)
  const [slotValues, setSlotValues]   = useState({})
  const [previewLength, setPreviewLen] = useState(1)
  const [customLen, setCustomLen]     = useState('')
  const [useCustomLen, setUseCustomLen] = useState(false)
  const [previewCount, setPreviewCount] = useState(1)
  const [saveAsTpl, setSaveAsTpl]     = useState(false)
  const [tplName, setTplName]         = useState('')
  const [tplScope, setTplScope]       = useState('global')
  const [saving, setSaving]           = useState(false)

  // Pre-compute full ET ref list once; filter per-step inline (no hook in loop needed)
  const allETRefs = useMemo(
    () => collectAllETRefs(elementTypes, psRows, recipes).sort(),
    [elementTypes, psRows, recipes]
  )

  // Auto-detect archetype + prefill on open
  useEffect(() => {
    if (!show) return
    const detected = detectArchetype(etModeRows)
    setArchetype(detected)
    setSlotValues(detected ? buildSlotValues(detected, etModeRows) : {})
    setPreviewLen(1)
    setCustomLen('')
    setUseCustomLen(false)
    setPreviewCount(1)
    setTplName(etRef ? `${etRef} template` : '')
    setSaveAsTpl(false)
    setSaving(false)
  }, [show]) // eslint-disable-line react-hooks/exhaustive-deps

  function pickArchetype(arch) {
    setArchetype(arch)
    setSlotValues(buildSlotValues(arch, etModeRows))
  }

  function updateSlot(role, patch) {
    setSlotValues(prev => ({ ...prev, [role]: { ...prev[role], ...patch } }))
  }

  // Apply a saved template as seeds (existing rows take priority over template values)
  function applySeed(tpl) {
    const ings = Array.isArray(tpl.ingredients) ? tpl.ingredients : JSON.parse(tpl.ingredients || '[]')
    const seeded = {}
    for (const step of archetype.steps) {
      const ing  = ings.find(i => i.slotKey === step.role)
      const existing = findExistingRow(step, etModeRows)
      seeded[step.role] = {
        etRef: existing
          ? (existing.ElementTypeRef || existing.elementTypeRef || '')
          : (ing?.slotLabel || ''),
        dimQtyMultiplier: existing
          ? (existing.Dim_QuantityMultiplier ?? existing.dimQtyMultiplier ?? null)
          : (ing?.dimQtyMultiplier ?? null),
        quantity: existing
          ? (existing.Quantity ?? existing.quantity ?? null)
          : (ing?.quantity ?? step.quantity ?? null),
        isInteger: step.isClip ? 'Y' : undefined,
        existingRowId: existing?._id,
        originalRef: existing ? (existing.ElementTypeRef || existing.elementTypeRef || '') : '',
      }
    }
    setSlotValues(seeded)
  }

  const effectiveLength = useCustomLen ? (parseFloat(customLen) || 0) : previewLength

  const archetypeTpls = useMemo(() => {
    if (!archetype) return []
    return templates.filter(t => {
      const tags = parseTags(t.applicable_tags)
      return tags.includes('Linear') && tags.includes(archetype.key)
    })
  }, [templates, archetype])

  // Categorise dirty slots
  const { newSlots, updatedSlots } = useMemo(() => {
    if (!archetype) return { newSlots: [], updatedSlots: [] }
    const newS = [], updS = []
    for (const step of archetype.steps) {
      const v = slotValues[step.role]
      if (!v?.etRef?.trim()) continue
      if (!v.existingRowId) newS.push(step)
      else if (v.etRef !== v.originalRef) updS.push(step)
    }
    return { newSlots: newS, updatedSlots: updS }
  }, [archetype, slotValues])

  const dirtyCount = newSlots.length + updatedSlots.length

  async function handleSave() {
    if (!posRef || !archetype) return
    setSaving(true)
    try {
      // Insert new slots via addConnection (one undo step)
      const toInsert = newSlots.map(step => {
        const v = slotValues[step.role]
        const part = { section: 'lin_internal', elementTypeRef: v.etRef }
        if (step.isClip) {
          part.dimQtyMultiplier = v.dimQtyMultiplier ?? 0
          part.isInteger = 'Y'
        } else if (step.quantity != null) {
          part.quantity = step.quantity
        }
        return part
      })
      if (toInsert.length > 0) addConnection(posRef, toInsert)

      // Update changed existing rows individually
      for (const step of updatedSlots) {
        const v = slotValues[step.role]
        updateRecipeRow(posRef, v.existingRowId, {
          elementTypeRef: v.etRef,
          ElementTypeRef: v.etRef,
        })
      }

      if (saveAsTpl && tplName.trim()) {
        const components = archetype.steps
          .map(step => {
            const v = slotValues[step.role]
            if (!v?.etRef?.trim()) return null
            const c = { role: step.role, etRef: v.etRef, section: 'lin_internal' }
            if (step.isClip) { c.dimQtyMultiplier = v.dimQtyMultiplier ?? 0; c.isInteger = 'Y' }
            else if (step.quantity != null) c.quantity = step.quantity
            return c
          })
          .filter(Boolean)
        await saveWrapperAsTemplate(components, tplName.trim(), { scope: tplScope, archetype: archetype.key })
      }
      onHide()
    } finally {
      setSaving(false)
    }
  }

  // Lookup helper
  function psRowFor(etref) {
    if (!etref) return null
    return psRows.find(p => (p.ElementTypeRef || p.elementTypeRef || '').toLowerCase() === etref.toLowerCase())
  }

  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 14 }}>
          LIN Wrapper — {etRef}
          {archetype && (
            <span className="text-muted ms-2 fw-normal" style={{ fontSize: 12 }}>
              · {archetype.label}
            </span>
          )}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body style={{ minHeight: 280 }}>

        {/* ── Archetype picker (when not yet determined) ── */}
        {!archetype && (
          <div className="mb-3">
            <div className="mb-2 small text-muted">
              No existing rows detected — choose the wrapper type to begin:
            </div>
            <div className="d-flex gap-2 flex-wrap">
              {LIN_ARCHETYPES.map(arch => (
                <button key={arch.key} onClick={() => pickArchetype(arch)}
                  className="text-start"
                  style={{
                    flex: '1 1 140px', border: '1.5px solid #c7d7f5', borderRadius: 7,
                    padding: '10px 12px', background: '#f0f4ff', cursor: 'pointer',
                  }}
                >
                  <div className="fw-semibold" style={{ fontSize: 12 }}>{arch.label}</div>
                  <div className="text-muted" style={{ fontSize: 11 }}>{arch.description}</div>
                  <div className="text-muted mt-1" style={{ fontSize: 10 }}>
                    {arch.steps.map(s => s.label).join(' → ')}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {archetype && (
          <>
            {/* Compact archetype + template seed row */}
            <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
              <span className="badge bg-secondary" style={{ fontSize: 11 }}>{archetype.label}</span>
              <button className="btn btn-link btn-sm p-0" style={{ fontSize: 11 }}
                onClick={() => { setArchetype(null); setSlotValues({}) }}>
                Change
              </button>
              {archetypeTpls.length > 0 && (
                <div className="ms-auto d-flex align-items-center gap-1 flex-wrap" style={{ fontSize: 11 }}>
                  <span className="text-muted">Seed from template:</span>
                  {archetypeTpls.map(t => (
                    <button key={t.id} className="btn btn-outline-secondary btn-sm"
                      style={{ fontSize: 11, padding: '1px 8px' }}
                      onClick={() => applySeed(t)}>
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Diagram */}
            <div className="mb-3 p-2 rounded" style={{ background: '#f8f9fa', border: '1px solid #e9ecef' }}>
              <LinWrapperDiagram
                archetype={archetype}
                slotValues={slotValues}
                length={effectiveLength}
                fixtureCount={previewCount}
              />
            </div>

            {/* Length / count chips (preview only) */}
            {!archetype.isFixedLength ? (
              <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
                <span style={{ fontSize: 11, color: '#666' }}>Preview at:</span>
                {LENGTH_CHIPS.map(l => (
                  <button key={l}
                    onClick={() => { setPreviewLen(l); setUseCustomLen(false) }}
                    style={{
                      border: `1.5px solid ${!useCustomLen && previewLength === l ? '#0d6efd' : '#dee2e6'}`,
                      borderRadius: 20, padding: '2px 10px', fontSize: 11, cursor: 'pointer',
                      background: !useCustomLen && previewLength === l ? '#e8f0fe' : '#fff',
                      color: !useCustomLen && previewLength === l ? '#0d6efd' : '#333',
                    }}
                  >{l}m</button>
                ))}
                <button
                  onClick={() => setUseCustomLen(true)}
                  style={{
                    border: `1.5px solid ${useCustomLen ? '#0d6efd' : '#dee2e6'}`,
                    borderRadius: 20, padding: '2px 10px', fontSize: 11, cursor: 'pointer',
                    background: useCustomLen ? '#e8f0fe' : '#fff',
                  }}
                >Custom</button>
                {useCustomLen && (
                  <input type="number" min={0.1} step={0.1}
                    value={customLen} onChange={e => setCustomLen(e.target.value)}
                    autoFocus placeholder="m"
                    style={{ width: 60, fontSize: 11, border: '1px solid #dee2e6', borderRadius: 4, padding: '2px 6px' }}
                  />
                )}
              </div>
            ) : (
              <div className="d-flex align-items-center gap-2 mb-3 flex-wrap">
                <span style={{ fontSize: 11, color: '#666' }}>Fixture count:</span>
                {COUNT_CHIPS.map(n => (
                  <button key={n} onClick={() => setPreviewCount(n)}
                    style={{
                      border: `1.5px solid ${previewCount === n ? '#0d6efd' : '#dee2e6'}`,
                      borderRadius: 20, padding: '2px 10px', fontSize: 11, cursor: 'pointer',
                      background: previewCount === n ? '#e8f0fe' : '#fff',
                      color: previewCount === n ? '#0d6efd' : '#333',
                    }}
                  >{n}×</button>
                ))}
              </div>
            )}

            {/* Slot table */}
            <table className="table table-sm mb-3" style={{ fontSize: 12 }}>
              <thead className="table-light">
                <tr>
                  <th style={{ width: 140 }}>Slot</th>
                  <th>Element Type</th>
                  <th>Manufacturer – Code</th>
                  <th style={{ width: 120 }}>Rate / Qty</th>
                </tr>
              </thead>
              <tbody>
                {archetype.steps.map(step => {
                  const v = slotValues[step.role] || { etRef: '' }
                  const suggestions = allETRefs.filter(r => r.toUpperCase().includes(step.token.toUpperCase()))
                  const ps = psRowFor(v.etRef)
                  const mfr  = ps?.Manufacturer || ps?.manufacturer || ''
                  const code = ps?.ProductCode  || ps?.productCode  || ''
                  const specLabel = [mfr, code].filter(Boolean).join(' – ')
                  const listId = `linslot-${step.role}`
                  const isPresent = !!v.existingRowId
                  const isChanged = isPresent && v.etRef !== v.originalRef

                  return (
                    <tr key={step.role} style={{ background: isChanged ? '#fff9e6' : undefined }}>
                      <td style={{ verticalAlign: 'middle' }}>
                        <span style={{ fontWeight: 600, fontSize: 11 }}>{step.label}</span>
                        {step.optional && (
                          <span className="text-muted fw-normal" style={{ fontSize: 10 }}> (opt)</span>
                        )}
                        {isPresent && !isChanged && (
                          <MaterialIcon name="check_circle" size={12}
                            style={{ color: '#198754', marginLeft: 4, verticalAlign: 'middle' }}
                            title="Already in recipe" />
                        )}
                        {isChanged && (
                          <MaterialIcon name="edit" size={12}
                            style={{ color: '#e67e22', marginLeft: 4, verticalAlign: 'middle' }}
                            title="Will update existing row" />
                        )}
                      </td>
                      <td style={{ verticalAlign: 'middle' }}>
                        <input
                          list={listId}
                          value={v.etRef}
                          onChange={e => updateSlot(step.role, { etRef: e.target.value })}
                          placeholder="ET ref…"
                          className="form-control form-control-sm"
                          style={{ fontSize: 11 }}
                        />
                        <datalist id={listId}>
                          {suggestions.map(r => <option key={r} value={r} />)}
                        </datalist>
                      </td>
                      <td style={{ verticalAlign: 'middle', fontSize: 11, color: '#555' }}>
                        {specLabel
                          ? <span title={specLabel}>{specLabel}</span>
                          : v.etRef
                            ? <span className="text-muted fst-italic">no spec</span>
                            : <span className="text-muted">—</span>}
                      </td>
                      <td style={{ verticalAlign: 'middle' }}>
                        {step.isClip ? (
                          <div className="d-flex align-items-center gap-1">
                            <input
                              type="number" min={0} step={0.5}
                              value={v.dimQtyMultiplier ?? ''}
                              onChange={e => updateSlot(step.role, {
                                dimQtyMultiplier: e.target.value === '' ? null : parseFloat(e.target.value),
                              })}
                              className="form-control form-control-sm"
                              style={{ width: 65, fontSize: 11 }}
                              placeholder="rate"
                            />
                            <span className="text-muted" style={{ fontSize: 11 }}>/m</span>
                          </div>
                        ) : step.quantity != null ? (
                          <span className="text-muted" style={{ fontSize: 11 }}>qty {step.quantity}</span>
                        ) : step.dimQtyMultiplier != null ? (
                          <span className="text-muted" style={{ fontSize: 11 }}>× length</span>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* Save as template */}
            <div className="pt-2 border-top">
              <Form.Check
                type="checkbox"
                id="lin-save-as-tpl"
                label="Save as reusable template"
                checked={saveAsTpl}
                onChange={e => setSaveAsTpl(e.target.checked)}
                style={{ fontSize: 12 }}
              />
              {saveAsTpl && (
                <div className="d-flex gap-2 align-items-center mt-2">
                  <Form.Control size="sm" value={tplName}
                    onChange={e => setTplName(e.target.value)}
                    placeholder="Template name…"
                    style={{ fontSize: 12, maxWidth: 220 }}
                  />
                  <Form.Select size="sm" value={tplScope}
                    onChange={e => setTplScope(e.target.value)}
                    style={{ fontSize: 12, width: 'auto' }}>
                    <option value="global">My library (all projects)</option>
                    <option value="project">This project only</option>
                  </Form.Select>
                </div>
              )}
            </div>
          </>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="secondary" size="sm" onClick={onHide} style={{ fontSize: 12 }}>Close</Button>
        {archetype && (
          <Button
            variant="success" size="sm" style={{ fontSize: 12 }}
            onClick={handleSave}
            disabled={saving || dirtyCount === 0}
            title={
              dirtyCount === 0
                ? 'No new or changed slots'
                : [
                    newSlots.length > 0 && `${newSlots.length} new`,
                    updatedSlots.length > 0 && `${updatedSlots.length} updated`,
                  ].filter(Boolean).join(', ')
            }
          >
            {saving
              ? 'Saving…'
              : dirtyCount === 0
                ? 'No changes'
                : `Save (${[
                    newSlots.length    > 0 && `+${newSlots.length}`,
                    updatedSlots.length > 0 && `~${updatedSlots.length}`,
                  ].filter(Boolean).join(' ')})`}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  )
}
