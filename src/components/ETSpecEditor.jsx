import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Form, Button } from 'react-bootstrap'
import useStore from '../store/useStore'
import { useScrollMemory } from './useScreenView'
import { getUsedIn } from '../utils/containerUtils'
import FlagPill from './FlagPill'
import { getCompanion } from '../platform/companion'
import { retiredFor, fitsRecipe, newerCodes } from '../platform/retired'
import { MaybeReplaced, NotRightModal, sendCorrection, sendNote } from './Corrections'
import { looksLikeProductCode } from '../utils/codeHeuristics'
import CopyButton from './CopyButton'
import EntityPill from './EntityPill'
import MaterialIcon from './MaterialIcon'
import IconButton from './IconButton'
import { familyOf } from '../utils/etRef'
import { ACTION_ICONS } from '../utils/entityStyle'
import { CANON_FAMILIES } from '../data/etCanon'
import { planFamilyMove } from '../utils/etSeed'
import { familyFix, codeElsewhere, refNumberFix } from '../utils/specSuggest'
import { C } from '../styles/tokens'

/**
 * ETSpecEditor — right-panel form for editing a single ET's product spec.
 *
 * Props:
 *   selectedRef: string|null
 *   etUsedIn: { [etRefLower]: { positions: Set, elements: Set } }
 *   missingETs: string[]
 *   onNavigate: ('prev'|'next') => void
 *   onSelectRef: (ref) => void   — "Used in" ElementTypes open here; PositionTypes via onOpenPosition
 *
 * Two inline hints (specSuggest.js): a family its job says it belongs in, and — when it has no
 * code yet — the code the same part has elsewhere (this browser's library, and beside a companion
 * the other projects').
 */
let elsewhereAsked = null      // makers → exemplars from other projects, asked once per session
export default function ETSpecEditor({ selectedRef, etUsedIn = {}, missingETs = [], onNavigate, focusToken = 0, onRenamed, onOpenPosition, onSelectRef }) {
  const scrollRef = useScrollMemory('product-spec', 'editorScroll')
  const psRows      = useStore(s => s.psRows)
  const recipes     = useStore(s => s.recipes)
  const updatePSRow = useStore(s => s.updatePSRow)
  const addPSRow    = useStore(s => s.addPSRow)
  const elementTypes = useStore(s => s.elementTypes)
  const mfrInputRef = useRef(null)
  const retiredCodes = useStore(s => s.retiredCodes)

  // "Fill next" bumps focusToken: jump the caret into the manufacturer field so the user
  // can just type. Guard on the row existing so we don't focus an empty/missing panel.
  useEffect(() => {
    if (focusToken > 0) mfrInputRef.current?.focus()
  }, [focusToken])

  const mfrOptions = useMemo(() => {
    const set = new Set()
    for (const r of psRows) {
      const m = r.Manufacturer || r.manufacturer
      if (m && m.trim()) set.add(m.trim())
    }
    return [...set].sort()
  }, [psRows])

  const psRow = useMemo(() =>
    psRows.find(r =>
      (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() === (selectedRef || '').toLowerCase()
    )
  , [psRows, selectedRef])

  const isMissing = !psRow &&
    missingETs.some(r => r.toLowerCase() === (selectedRef || '').toLowerCase())

  const etObj = useMemo(() =>
    elementTypes.find(e =>
      (e.ElementTypeRef || e.elementTypeRef || '').toLowerCase() === (selectedRef || '').toLowerCase()
    )
  , [elementTypes, selectedRef])
  const etFamily = selectedRef ? familyOf(selectedRef, etObj) : null

  const similar = useMemo(() => {
    if (!selectedRef || !etFamily || !psRow) return null
    const code = psRow.ProductCode || psRow.productCode
    const mfr  = psRow.Manufacturer || psRow.manufacturer
    if (code && mfr) return null
    return psRows.find(r => {
      const rRef = r.ElementTypeRef || r.elementTypeRef || ''
      if (rRef.toLowerCase() === selectedRef.toLowerCase()) return false
      const rEt = elementTypes.find(e => (e.ElementTypeRef || e.elementTypeRef || '').toLowerCase() === rRef.toLowerCase())
      const rFamily = familyOf(rRef, rEt)
      return rFamily === etFamily && (r.ProductCode || r.productCode) && (r.Manufacturer || r.manufacturer)
    }) || null
  }, [psRow, selectedRef, etFamily, psRows, elementTypes])

  const moveElementTypesToFamily = useStore(s => s.moveElementTypesToFamily)
  const localExemplars = useStore(s => s.library?.exemplars)
  const projectNumber = useStore(s => s.projectNumber)
  const [others, setOthers] = useState([])
  const needsCode = !!psRow && /^(tbc|n\/?a|-)?$/i.test(String(psRow.ProductCode || psRow.productCode || '').trim())
  useEffect(() => {
    if (!needsCode || elsewhereAsked) { if (elsewhereAsked) elsewhereAsked.then(setOthers); return }
    const makers = [...new Set(psRows.map(r => String(r.Manufacturer || r.manufacturer || '').trim()).filter(Boolean))]
    elsewhereAsked = getCompanion().then(api => (api?.library ? api.library(makers, { exclude: projectNumber || '' }) : [])).catch(() => [])
    elsewhereAsked.then(setOthers)
  }, [needsCode])   // eslint-disable-line react-hooks/exhaustive-deps
  const fix = useMemo(() => (etObj ? familyFix(etObj, psRow, elementTypes, { recipes, psRows }) : null), [etObj, psRow, elementTypes, recipes, psRows])
  const numberFix = useMemo(() => (etObj ? refNumberFix(etObj, elementTypes) : null), [etObj, elementTypes])
  const elsewhere = useMemo(() => (etObj && needsCode
    ? codeElsewhere(etObj, psRow, { elementTypes, psRows, exemplars: [...(localExemplars || []), ...others] }) : null),
  [etObj, psRow, needsCode, elementTypes, psRows, localExemplars, others])
  const [dismissedElsewhere, setDismissedElsewhere] = useState(false)
  useEffect(() => setDismissedElsewhere(false), [selectedRef])

  const [dismissedSimilar, setDismissedSimilar] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [notRight, setNotRight] = useState(false)

  useEffect(() => { setDismissedSimilar(false); setShowNotes(false) }, [selectedRef])

  const usage = selectedRef ? etUsedIn[selectedRef.toLowerCase()] : null

  if (!selectedRef) {
    return (
      <div className="d-flex align-items-center justify-content-center h-100 text-muted">
        <div className="text-center">
          <MaterialIcon name="inventory_2" size={48} style={{ opacity: 0.2 }} />
          <div className="mt-2" style={{ fontSize: 13 }}>
            Select an element type from the list to edit its spec.
          </div>
        </div>
      </div>
    )
  }

  if (isMissing) {
    return (
      <div className="p-4" style={{ maxWidth: 600 }}>
        <div className="fw-semibold mb-1" style={{ fontSize: 14 }}>{selectedRef}</div>
        <div className="alert alert-warning py-2 px-3 mb-3" style={{ fontSize: 12 }} data-testid="missing-spec">
          Referenced in recipes but has no product spec entry.
          {/* Where (E2H3QX): each position using it, and the wrapper it sits in, if any. */}
          {(() => {
            const live = recipes.filter(r => (r.IsDeleted || r.isDeleted) !== 'Y'
              && String(r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() === String(selectedRef).toLowerCase())
            const uses = getUsedIn(selectedRef, recipes).map(p => {
              const inside = [...new Set(live.filter(r => (r.PositionTypeRef || r.positionTypeRef) === p && (r.ContextType || r.contextType) === 'ElementType')
                .map(r => r.ContextRef || r.contextRef))]
              return { p, inside }
            })
            if (!uses.length) return null
            return (
              <div className="mt-1" data-testid="missing-spec-uses">
                Used by{' '}
                {uses.map(({ p, inside }, i) => (
                  <span key={p}>
                    {i > 0 && ', '}
                    {onOpenPosition
                      ? <Button variant="link" size="sm" className="p-0 align-baseline" style={{ fontSize: 12 }} onClick={() => onOpenPosition(p)}>{p}</Button>
                      : p}
                    {inside.length > 0 && <span className="text-muted"> (inside {inside.join(', ')})</span>}
                  </span>
                ))}
              </div>
            )
          })()}
        </div>
        <Button variant="primary" size="sm" onClick={() => addPSRow(selectedRef)}>
          + Create spec entry
        </Button>
      </div>
    )
  }

  if (!psRow) {
    return (
      <div className="p-4" style={{ maxWidth: 600 }}>
        <div className="fw-semibold mb-1" style={{ fontSize: 14 }}>{selectedRef}</div>
        <div className="text-muted small mb-3">Not in the product spec yet.</div>
        <Button variant="outline-primary" size="sm" onClick={() => addPSRow(selectedRef)}>
          + Add to product spec
        </Button>
      </div>
    )
  }

  const productCode   = psRow.ProductCode || psRow.productCode || ''
  const manufacturer  = psRow.Manufacturer || psRow.manufacturer || ''
  const description   = psRow.ComponentDescription || psRow.componentDescription || ''
  const notes         = psRow.InternalNotesText || psRow.internalNotesText || ''
  const isTBC         = psRow.IsTBC || psRow.isTBC || null
  const isPropTBC     = psRow.IsPropertiesTBC || psRow.isPropertiesTBC || null
  const isDeleted     = (psRow.IsDeleted || psRow.isDeleted) === 'Y'
  const retired       = retiredFor(retiredCodes, productCode)

  return (
    <div ref={scrollRef} style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto' }}>
      <div className="p-4" style={{ maxWidth: 600 }}>
        {/* Header row */}
        <div className="d-flex align-items-start gap-2 mb-3">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="fw-semibold" style={{ fontSize: 14, wordBreak: 'break-all' }}>{selectedRef}</div>
            {etFamily && <div className="text-muted" style={{ fontSize: 11 }}>{etFamily}
              {fix && (
                <Button variant="link" size="sm" className="p-0 ms-2 align-baseline" style={{ fontSize: 11 }} data-testid="family-fix"
                  title={`What it does is filed in ${fix.family}`}
                  onClick={() => moveElementTypesToFamily([selectedRef], fix.family, { renumber: false })}>
                  → move to {fix.family}
                </Button>
              )}</div>}
          </div>
          {onNavigate && (
            <div className="d-flex gap-1">
              <IconButton variant="outline-secondary" bsSize="sm" style={{ fontSize: 11, padding: '2px 8px' }}
                icon="chevron_left" title="Previous element type" onClick={() => onNavigate('prev')} />
              <IconButton variant="outline-secondary" bsSize="sm" style={{ fontSize: 11, padding: '2px 8px' }}
                icon="chevron_right" title="Next element type" onClick={() => onNavigate('next')} />
            </div>
          )}
          {(!productCode || !manufacturer) && !isDeleted && (
            <Button
              variant="outline-secondary" size="sm"
              style={{ fontSize: 11, padding: '2px 10px', whiteSpace: 'nowrap' }}
              title="Set Manufacturer=Ideaworks, ProductCode=N/A"
              onClick={() => updatePSRow(selectedRef, { Manufacturer: 'Ideaworks', ProductCode: 'N/A' })}
            >
              N/A
            </Button>
          )}
        </div>

        {/* Any ElementType but a family row (one others name as their ParentRef) can be renamed or
            refiled — wrappers too. */}
        {etObj && !elementTypes.some(e => String(e.Family || e.family || '').toLowerCase() === String(selectedRef).toLowerCase()) && (
          <FamilyAndRef key={selectedRef} et={etObj} onRenamed={onRenamed} />
        )}
        {numberFix && (
          <div className="alert alert-info py-1 px-2 mb-3 d-flex align-items-center gap-2" style={{ fontSize: 12 }} data-testid="number-fix">
            <span className="flex-grow-1">{selectedRef} has no number, unlike the other {numberFix.head} ElementTypes here.</span>
            <Button size="sm" variant="info" style={{ fontSize: 11, padding: '1px 8px' }}
              onClick={() => useStore.getState().openSpec(selectedRef, 'rename', numberFix.ref)}>Rename to {numberFix.ref}</Button>
          </div>
        )}

        {isDeleted && (
          <div className="alert alert-secondary py-1 px-2 mb-3 d-flex align-items-center gap-2" style={{ fontSize: 11 }}>
            <span className="flex-grow-1">
              Marked IsDeleted.
              {!(usage?.positions?.size || usage?.elements?.size) && <strong className="ms-1" data-testid="unused-badge">Unused: no live position uses it.</strong>}
            </span>
            <button className="btn btn-link btn-sm p-0" style={{ fontSize: 11 }} onClick={() => updatePSRow(selectedRef, { IsDeleted: null })}>Restore</button>
          </div>
        )}

        {/* The code the same part has elsewhere */}
        {elsewhere && !dismissedElsewhere && (
          <div className={`alert alert-primary py-2 px-3 mb-3 d-flex align-items-center gap-2${(localExemplars || []).some(x => x.code === elsewhere.code) ? '' : ' companion-card'}`} style={{ fontSize: 12 }} data-testid="code-elsewhere" data-source="companion">
            <div className="flex-grow-1">
              Elsewhere <span className="font-monospace">{elsewhere.ref}</span> is <strong>{elsewhere.maker} {elsewhere.code}</strong>{' '}
              <CopyButton text={`${elsewhere.maker} ${elsewhere.code}`} what="maker and code" />
              {elsewhere.description && <span className="text-muted"> — {elsewhere.description}</span>}
            </div>
            <Button variant="outline-primary" size="sm" style={{ fontSize: 11, padding: '1px 8px' }}
              onClick={() => { updatePSRow(selectedRef, { Manufacturer: elsewhere.maker, ProductCode: elsewhere.code, IsTBC: null }); setDismissedElsewhere(true) }}>Use</Button>
            <button className="btn-close" style={{ fontSize: 10 }} aria-label="Not this" onClick={() => setDismissedElsewhere(true)} />
          </div>
        )}

        {/* Copy-from-similar */}
        {similar && !dismissedSimilar && !(elsewhere && !dismissedElsewhere) && (
          <div className="alert alert-warning py-2 px-3 mb-3 d-flex align-items-center gap-2" style={{ fontSize: 12 }}>
            <div className="flex-grow-1">
              <strong>{similar.ElementTypeRef || similar.elementTypeRef}</strong>{' '}
              has: {similar.Manufacturer || similar.manufacturer} / {similar.ProductCode || similar.productCode}
            </div>
            <Button
              variant="warning" size="sm" style={{ fontSize: 11, padding: '1px 8px' }}
              onClick={() => {
                updatePSRow(selectedRef, {
                  Manufacturer: similar.Manufacturer || similar.manufacturer,
                  ProductCode:  similar.ProductCode  || similar.productCode,
                })
                setDismissedSimilar(true)
              }}
            >Copy</Button>
            <button className="btn-close" style={{ fontSize: 10 }} onClick={() => setDismissedSimilar(true)} />
          </div>
        )}

        {/* Manufacturer */}
        <Form.Group className="mb-3">
          <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>
            Manufacturer{!manufacturer && !isDeleted && <span className="text-danger ms-1" style={{ fontSize: 10 }}>needed</span>}
          </Form.Label>
          <Form.Control
            ref={mfrInputRef}
            size="sm"
            list="etspec-mfr-list"
            key={`mfr-${selectedRef}-${manufacturer}`}
            defaultValue={manufacturer}
            onBlur={e => { const v = e.target.value.trim(); if (v !== manufacturer) updatePSRow(selectedRef, { Manufacturer: v }) }}
            onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
            style={{ fontSize: 12, ...(!manufacturer && !isDeleted ? { borderColor: C.dangerTint, background: C.dangerTint } : null) }}
            disabled={isDeleted}
          />
          <datalist id="etspec-mfr-list">
            {mfrOptions.map(m => <option key={m} value={m} />)}
          </datalist>
        </Form.Group>

        {/* Product code */}
        <Form.Group className="mb-3">
          <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>
            Product Code{!productCode && !isDeleted && <span className="text-danger ms-1" style={{ fontSize: 10 }}>needed</span>}
          </Form.Label>
          <Form.Control
            size="sm"
            key={`code-${selectedRef}-${productCode}`}
            defaultValue={productCode}
            onBlur={e => {
              const v = e.target.value.trim()
              if (v === productCode) return
              updatePSRow(selectedRef, { ProductCode: v })
              // A code swapped for another under the same maker is evidence of a renumbering. Noted
              // in the background (reviewed before it is ever relied on); nothing is shown here.
              if (productCode && v && manufacturer && !/^tbc$/i.test(productCode) && !/^tbc$/i.test(v)) {
                getCompanion().then(api => api?.contribute?.({ kind: 'supersession', code: productCode, replacement: v, manufacturer }))
              }
            }}
            onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
            style={{ fontSize: 12, ...(!productCode && !isDeleted ? { borderColor: C.dangerTint, background: C.dangerTint } : null) }}
            disabled={isDeleted}
          />
        </Form.Group>

        {retired?.options && !isDeleted && (
          <MaybeReplaced key={productCode} code={productCode} options={retired.options} generic={!looksLikeProductCode(productCode)}
            fit={fitsRecipe(retired.options, selectedRef, recipes, psRows)}
            onUse={code => {
              updatePSRow(selectedRef, { ProductCode: code })
              // the pick is one more answer for this code, never a rule for every project
              getCompanion().then(api => api?.contribute?.({ kind: 'supersession', code: productCode, replacement: code,
                manufacturer, project: projectNumber || '', scope: 'sometimes' }))
            }}
            onNotRight={() => setNotRight(true)} />
        )}
        {retired?.replacement && !isDeleted && (
          <div className="px-2 py-1 mb-3 rounded companion-card d-flex align-items-center gap-2" style={{ fontSize: 11, marginTop: -8 }} data-testid="retired">
            <span className="companion-dot" />
            <span style={{ flex: 1 }}>Replaced by <span className="font-monospace">{retired.replacement}</span>{' '}
              <span className="text-muted">· {manufacturer || 'Manufacturer'}{retired.tier === 'confirmed' ? ' · confirmed' : retired.tier === 'vendor' ? "'s list" : ''}</span></span>
            <Button size="sm" variant="outline-primary" style={{ fontSize: 11, padding: '0 8px' }}
              onClick={() => updatePSRow(selectedRef, { ProductCode: retired.replacement })}>Use</Button>
            <Button size="sm" variant="link" className="p-0 text-muted" style={{ fontSize: 11 }} onClick={() => setNotRight(true)}>Not right…</Button>
          </div>
        )}
        {retired && (
          <NotRightModal key={`nr-${productCode}`} show={notRight} onHide={() => setNotRight(false)}
            title={`What's not right about the newer code for ${productCode}?`} placeholder="e.g. the code to order now"
            facts={[['Code', <span className="font-monospace">{productCode}</span>], ['Suggested', <span className="font-monospace">{newerCodes(retired)}</span>]]}
            onSend={a => {
              if (a.right) updatePSRow(selectedRef, { ProductCode: a.right })
              if (a.right) sendCorrection(a, { kind: 'supersession', code: productCode, replacement: a.right, manufacturer })
              else sendNote(`Not right: ${productCode} → ${newerCodes(retired)}${a.note ? `\n${a.note}` : ''}`, `supersession ${productCode}`)
            }} />
        )}

        {/* Description */}
        <Form.Group className="mb-3">
          <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>Description</Form.Label>
          <Form.Control
            as="textarea" rows={2} size="sm"
            key={`desc-${selectedRef}-${description}`}
            defaultValue={description}
            onBlur={e => { const v = e.target.value.trim(); if (v !== description) updatePSRow(selectedRef, { ComponentDescription: v }) }}
            style={{ fontSize: 12, resize: 'vertical' }}
            disabled={isDeleted}
          />
        </Form.Group>

        {/* Flags + delete */}
        <div className="d-flex align-items-center gap-3 mb-3 flex-wrap">
          <FlagPill label="TBC" value={isTBC} onChange={val => updatePSRow(selectedRef, { IsTBC: val })} activeVariant="danger" />
          <FlagPill label="Properties TBC" value={isPropTBC} onChange={val => updatePSRow(selectedRef, { IsPropertiesTBC: val })} activeVariant="warning" />
          <div className="ms-auto">
            {!isDeleted ? (
              <button className="btn btn-link btn-sm p-0 text-danger" style={{ fontSize: 11 }} onClick={() => updatePSRow(selectedRef, { IsDeleted: 'Y' })}>Mark IsDeleted</button>
            ) : (
              <button className="btn btn-link btn-sm p-0 text-secondary" style={{ fontSize: 11 }} onClick={() => updatePSRow(selectedRef, { IsDeleted: null })}>Restore</button>
            )}
          </div>
        </div>

        {/* Internal notes (collapsed) */}
        <div className="mb-3">
          <button
            className="btn btn-link btn-sm p-0 d-inline-flex align-items-center gap-1"
            style={{ fontSize: 11, textDecoration: 'none', color: C.muted }}
            onClick={() => setShowNotes(v => !v)}
          >
            <MaterialIcon name={showNotes ? ACTION_ICONS.expand : ACTION_ICONS.collapse} size={14} /> Internal notes
          </button>
          {showNotes && (
            <Form.Control
              as="textarea" rows={3} size="sm"
              key={`notes-${selectedRef}-${showNotes}`}
              defaultValue={notes}
              onBlur={e => { const v = e.target.value.trim(); if (v !== notes) updatePSRow(selectedRef, { InternalNotesText: v }) }}
              style={{ fontSize: 12, resize: 'vertical', marginTop: 6 }}
            />
          )}
        </div>

        {/* Used-in */}
        {usage && (usage.positions?.size > 0 || usage.elements?.size > 0) && (
          <div className="mt-3 pt-3 border-top">
            <div className="text-muted mb-2" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Used in
            </div>
            {usage.positions?.size > 0 && (
              <div className="mb-2">
                <div className="text-muted" style={{ fontSize: 11 }}>In PositionTypes</div>
                <div className="d-flex flex-wrap gap-1 mt-1">
                  {[...usage.positions].map(r => (
                    <button key={r} type="button" className="btn p-0 border-0" title={`Open ${r}`} disabled={!onOpenPosition}
                      onClick={() => onOpenPosition?.(r)}><EntityPill type="PositionType" label={r} style={{ fontSize: 10, cursor: onOpenPosition ? 'pointer' : undefined }} /></button>
                  ))}
                </div>
              </div>
            )}
            {usage.elements?.size > 0 && (
              <div>
                <div className="text-muted" style={{ fontSize: 11 }}>Nested inside ElementTypes (a helper in each, not placed directly)</div>
                <div className="d-flex flex-wrap gap-1 mt-1 align-items-center">
                  {[...usage.elements].map(r => {
                    const pts = [...(etUsedIn[r.toLowerCase()]?.positions || [])]
                    return (
                      <span key={r} className="d-inline-flex align-items-center gap-1 me-2">
                        <button type="button" className="btn p-0 border-0" title={`Open ${r}`} disabled={!onSelectRef}
                          onClick={() => onSelectRef?.(r)}><EntityPill type="ElementType" label={r} style={{ fontSize: 10, cursor: onSelectRef ? 'pointer' : undefined }} /></button>
                        {pts.length > 0 && <span className="text-muted" style={{ fontSize: 10 }}>in {pts.join(', ')}</span>}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Family & ref: move this ElementType to another family (renumbered into it, as in the
 * ElementTypes window) or type a new ref. Either cascades through the Product Spec and
 * Recipes; nothing happens until Apply.
 */
function FamilyAndRef({ et, onRenamed }) {
  const elementTypes = useStore(s => s.elementTypes)
  const moveElementTypesToFamily = useStore(s => s.moveElementTypesToFamily)
  const renameElementType = useStore(s => s.renameElementType)
  const forkElementType = useStore(s => s.forkElementType)
  const ref = et.ElementTypeRef || et.elementTypeRef
  const family = et.Family || et.family || ''
  // Opened from Find or a hint: already open, with the suggested ref typed in.
  const intent = useStore(s => s.specIntent)
  const asked = intent && String(intent.ref).toLowerCase() === String(ref).toLowerCase() && intent.open ? intent : null
  const [open, setOpen] = useState(!!asked)
  const [fam, setFam] = useState(family)
  const [newRef, setNewRef] = useState(asked?.suggest || ref)
  useEffect(() => {
    if (!asked) return
    setOpen(true)
    if (asked.suggest) setNewRef(asked.suggest)
    useStore.getState().consumeSpecIntent()
  }, [asked?.at])   // eslint-disable-line react-hooks/exhaustive-deps
  const families = useMemo(() => [...new Set([
    ...elementTypes.map(e => e.Family || e.family).filter(Boolean),
    ...elementTypes.filter(e => (e.IsCollection || e.isCollection) === 'Y').map(e => e.ElementTypeRef),
    ...CANON_FAMILIES.map(f => f.ref),
  ])].sort(), [elementTypes])
  const taken = r => r.toLowerCase() !== ref.toLowerCase()
    && elementTypes.some(e => (e.ElementTypeRef || '').toLowerCase() === r.toLowerCase())

  // Picking a family changes only the family; its next ref is offered, never forced (5WZXN9).
  function pickFamily(f) { setFam(f) }
  const suggested = fam && fam !== family ? planFamilyMove([ref], fam, elementTypes).moves[0]?.to : null
  function apply() {
    const target = newRef.trim()
    if (fam !== family) moveElementTypesToFamily([ref], fam, { renumber: false })
    if (target && target !== ref) renameElementType(ref, target)
    setOpen(false)
    if (target && target !== ref) onRenamed?.(target)
  }

  if (!open) {
    return (
      <div className="mb-3">
        <Button variant="link" size="sm" className="p-0" style={{ fontSize: 11 }} onClick={() => setOpen(true)}
          data-testid="family-ref-open">
          <MaterialIcon name="drive_file_move" size={13} /> Change family or ref
        </Button>
        <Button variant="link" size="sm" className="p-0 ms-3" style={{ fontSize: 11 }} data-testid="fork-et"
          title="Fork: a new ElementType in the same family with a copy of this one's Product Spec, to change on its own"
          onClick={() => { const r = forkElementType(ref); if (r) onRenamed?.(r) }}>
          <MaterialIcon name="call_split" size={13} /> Fork
        </Button>
      </div>
    )
  }
  const bad = !newRef.trim() ? 'needs a ref' : taken(newRef.trim()) ? 'already used' : null
  return (
    <div className="mb-3 p-2 rounded" style={{ background: C.subtle, border: `1px solid ${C.border}`, fontSize: 12 }} data-testid="family-ref">
      <div className="d-flex gap-2 align-items-end flex-wrap">
        <Form.Group>
          <Form.Label className="mb-0" style={{ fontSize: 11 }}>Family</Form.Label>
          <Form.Select size="sm" aria-label="Family" value={fam} onChange={e => pickFamily(e.target.value)} style={{ fontSize: 12, width: 230 }}>
            <option value="">(no family)</option>
            {families.map(f => <option key={f} value={f}>{f}</option>)}
          </Form.Select>
        </Form.Group>
        <Form.Group>
          <Form.Label className="mb-0" style={{ fontSize: 11 }}>Ref</Form.Label>
          <Form.Control size="sm" aria-label="Ref" value={newRef} isInvalid={!!bad} onChange={e => setNewRef(e.target.value)}
            style={{ fontSize: 12, fontFamily: 'monospace', width: 230 }} />
        </Form.Group>
        <Button size="sm" variant="primary" disabled={!!bad || (fam === family && newRef.trim() === ref)} onClick={apply}>Apply</Button>
        <Button size="sm" variant="link" className="text-muted p-0" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
      <div className="text-muted mt-1" style={{ fontSize: 10 }}>
        {bad ? <span className="text-danger">{bad}</span>
          : newRef.trim() !== ref ? <>Renames {ref} → {newRef.trim()} in the Product Spec and Recipes. Not on Undo: change it back to reverse.</>
            : fam !== family ? <>Moves {ref} into {fam || 'no family'}; the ref stays as it is.</>
              : 'Change the family, the ref, or both.'}
        {suggested && suggested !== newRef.trim() && (
          <Button size="sm" variant="link" className="p-0 ms-2 align-baseline" style={{ fontSize: 10 }} data-testid="use-family-ref"
            onClick={() => setNewRef(suggested)}>Renumber into it: {suggested}</Button>
        )}
      </div>
    </div>
  )
}
