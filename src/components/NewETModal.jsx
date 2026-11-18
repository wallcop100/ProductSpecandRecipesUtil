import React, { useRef, useState, useMemo, useEffect, useId } from 'react'
import { Modal, Button, Form } from 'react-bootstrap'
import useStore, { withFinish } from '../store/useStore'
import { familyRowExists } from '../utils/collectionGuess'
import MaterialIcon from './MaterialIcon'
import FlagPill from './FlagPill'
import { getNextAvailableRef } from '../utils/containerUtils'
import { hasProductIdentity } from '../utils/productCodes'
import { CANON_FAMILIES } from '../data/etCanon'
import { C } from '../styles/tokens'
import { copyText } from './CopyButton'
import { formColumnsFor } from '../utils/formPositions'
import { buildRefMap, targetFor } from '../utils/ptResolve'
import { containerForPosition } from '../utils/recipePresence'
import { proposeElementTypes, refFromText, whyText, seedName, refamily, isWrapperRef, cleanRef, refIssues } from '../utils/etSeed'
import { houseMaker } from '../utils/codeShapes'
import { useCompanion } from '../platform/companion'
import { noteProposal, settleCreated, shareOutcomes } from '../platform/outcomes'
const norm = s => String(s ?? '').trim().toLowerCase()

/**
 * NewETModal — the one place a brand-new element type is created.
 *
 * Context-free: registers the ET in the catalogue (createElementType) and, when
 * procurement data is present, creates/updates its Product Spec row. Callers
 * supply their own framing.
 *
 * Props:
 *   show, onHide
 *   onCreated(etRef)  — called with the ref once created (or with an existing ref
 *                       if the user resolves a duplicate Manufacturer+Code onto it)
 *   contextLabel      — optional muted suffix in the title (e.g. "into PT-001")
 *   confirmLabel      — footer button text
 *   prefill           — { ref, name, description, family, manufacturer, productCode,
 *                         componentDescription }
 *                       `description` is the ElementType's catalogue Description.
 *                       Any spec prefill opens the Product Spec section expanded.
 */
/** Every family there is: in use, the project's family rows, and the company's canon ones. */
export function familyOptionsOf(elementTypes) {
  const s = new Set()
  for (const e of elementTypes) {
    const f = (e.Family || e.family || '').trim(); if (f) s.add(f)
    if ((e.IsCollection || e.isCollection) === 'Y') s.add(e.ElementTypeRef || e.elementTypeRef)
  }
  for (const f of CANON_FAMILIES) s.add(f.ref)
  // An assembly wrapper (ET-LIN-07, IsCollection) holds one product's parts; it is not a family to file under.
  return [...s].filter(f => f && !isWrapperRef(f)).sort((a, b) => a.localeCompare(b))
}

export default function NewETModal({
  show, onHide, onCreated,
  contextLabel = null,
  confirmLabel = 'Create Element Type',
  prefill = {},
  /**
   * What the import knows about this product, shown read-only at the top: the
   * captured code, the maker, the note, and which PositionTypes asked for it. The
   * note in particular is the whole reason you can tell two similar codes apart.
   */
  importContext = null,
  /**
   * Identity of the thing being created. Closing and reopening the SAME draftKey
   * keeps everything you typed — you can go back to the panel, look at a sibling
   * code, and come back. A different draftKey seeds fresh.
   */
  draftKey = null,
  /** Positions whose Form row shows beside the fields (default: importContext.positionTypes). */
  formRefs = null,
  /** "Do all N at once": closes this and opens Bulk on every code (ZAJ889). */
  onBulk = null, bulkCount = 0,
  /**
   * The position to put it in. Given, the footer offers only the places that exist: Product
   * Spec only, into the position's wrapper, into the position. The modal places it, then
   * calls onCreated(ref, where) with where = 'ps' | 'wrapper' | 'position'.
   */
  placeIn = null,
}) {
  const elementTypes      = useStore(s => s.elementTypes)
  const dbCollectionRefs  = useStore(s => s.dbCollectionRefs)
  const psRows            = useStore(s => s.psRows)
  const recipes           = useStore(s => s.recipes)
  const createElementType = useStore(s => s.createElementType)
  const addPSRow          = useStore(s => s.addPSRow)
  const updatePSRow       = useStore(s => s.updatePSRow)
  const importDraft       = useStore(s => s.importDraft)
  const containerETRefs   = useStore(s => s.containerETRefs)
  const wrapperRef = useMemo(() => (placeIn ? containerForPosition(recipes, placeIn, containerETRefs) : null), [placeIn, recipes, containerETRefs])

  const uid = useId()
  const familyListId = `newet-family-${uid}`
  const mfrListId = `newet-mfr-${uid}`

  const [ref, setRef]               = useState('')
  const refTyped = useRef(false)   // AEST77: a family you pick renumbers the ref until you type one
  const [name, setName]             = useState('')
  const [description, setDescription] = useState('')
  const [family, setFamily]         = useState('')
  const [manufacturer, setMfr]      = useState('')
  const [productCode, setCode]      = useState('')
  const [isTBC, setTBC]             = useState(null)
  const [isPropTBC, setPropTBC]     = useState(null)
  const [notes, setNotes]           = useState('')
  const [finish, setFinish]         = useState('')
  const [extNotes, setExtNotes]     = useState('')
  const [saving, setSaving]         = useState(false)
  // The Form's row, beside the fields; a click on a value puts it into the last field you were in.
  const formRow = useMemo(() => show ? formColumnsFor(importDraft, formRefs || importContext?.positionTypes, importContext?.code || prefill?.productCode, { buildRefMap, targetFor }) : null,
    [show, importDraft, formRefs, importContext, prefill?.productCode])
  const lastField = useRef('name')
  const [copied, setCopied] = useState(null)
  const setters = { ref: setRef, name: setName, description: setDescription, family: setFamily, manufacturer: setMfr, productCode: setCode, notes: setNotes, extNotes: setExtNotes, finish: setFinish }
  const putValue = v => { const set = setters[lastField.current]; set?.(cur => cur.trim() ? `${cur.trimEnd()} ${v}` : v) }

  // Seed on open, but ONLY for a draft we have not started. The modal stays mounted,
  // so re-opening the same draftKey returns you to exactly what you had typed.
  const seededFor = useRef(Symbol('none'))
  const seeded = useRef({})
  // Ref, name and family are learned suggestions: companion purple. The rest are copied from the Form.
  const LEARNED = ['ref', 'name', 'family']
  // A plain default (next free number, maker + code) learned nothing: it stays blue.
  const Wand = ({ field, value, why = prefill.why }) => {
    if (!value || value !== seeded.current[field]) return null
    const learned = LEARNED.includes(field) && !/no pattern|maker and code/.test(why || '')
    return <span title={`${learned ? 'Suggested' : 'Filled in'}: ${why}`} data-testid={`wand-${field}`} data-learned={learned || undefined} style={{ marginLeft: 4 }}>
      <MaterialIcon name="auto_fix_high" size={12} style={{ color: learned ? C.companion : C.accent, verticalAlign: 'middle' }} /></span>
  }
  // The Form's Finish is offered, muted, and only taken when you click the field.
  const finishHint = String(formRow?.cols.find(([c]) => /finish/i.test(c))?.[1] ?? '').trim()
  // Opened without a proposal (a Form card's Create): make one, from the project and from what
  // you kept earlier this sitting. Same code as the Bulk review, so the two never disagree.
  const companion = useCompanion()
  const own = useRef(null)
  // Where the proposed ref's shape came from, shown under it while it is untouched.
  const refWhy = own.current ? refFromText(own.current) : prefill.refWhy || ''
  const proposeOne = () => {
    const code = String(prefill.productCode || '').trim()
    if (prefill.why || prefill.ref || !hasProductIdentity(code)) return null
    const st = useStore.getState()
    const pts = (formRefs || importContext?.positionTypes || []).filter(Boolean)
    // A position that already has its design element wants an extra, not another lead.
    const hasLead = pts.some(pt => st.recipes.some(r => (r.IsDeleted || r.isDeleted) !== 'Y' && (r.IsDesign || r.isDesign) === 'Y'
      && norm(r.PositionTypeRef || r.positionTypeRef) === norm(pt)))
    const p = proposeElementTypes([{ text: code, manufacturers: [prefill.manufacturer || ''],
      variants: [{ note: importContext?.note || '' }], positionTypes: pts, reuse: [] }], {
      elementTypes: st.elementTypes, psRows: st.psRows, recipes: st.recipes, positionTypes: st.positionTypes,
      collectionRefs: st.dbCollectionRefs, roleOf: () => (hasLead ? 'extra' : 'lead'),
      library: st.library?.exemplars || [], session: st.sitting,
    }).proposals[0]
    return p?.action === 'create' && p.family ? p : null
  }
  useEffect(() => {
    if (!show) return
    // The same draft reopens as you left it, unless its opener now hands it another ref or family (the drawer card).
    const key = `${draftKey ?? prefill.ref ?? prefill.productCode ?? ''}|${prefill.ref || ''}|${prefill.family || ''}`
    if (seededFor.current === key) return
    seededFor.current = key
    const p = own.current = proposeOne()
    noteProposal(p)

    setRef(prefill.ref || p?.ref || '')
    refTyped.current = false
    setName(prefill.name || p?.name || '')
    setDescription(prefill.description || prefill.componentDescription || '')   // one description, shared with the Product Spec
    setFamily(prefill.family || p?.family || '')
    setMfr(prefill.manufacturer || '')
    setCode(prefill.productCode || '')
    setTBC(null); setPropTBC(null); setNotes(''); setExtNotes('')
    setFinish('')
    setSaving(false)
    // Filled from the Bulk proposal: each field keeps its wand until you change it (ZAJ889).
    seeded.current = prefill.why ? { ref: prefill.ref, name: prefill.name, family: prefill.family, manufacturer: prefill.manufacturer,
      productCode: prefill.productCode, description: norm(prefill.description) === norm(prefill.productCode) ? null : prefill.description }
      : p ? { ref: p.ref, name: p.name, family: p.family } : {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, draftKey, prefill.ref, prefill.family])

  /** After a successful create, the next open of this key must seed afresh. */
  const clearSeed = () => { seededFor.current = Symbol('done') }

  const familyOptions = useMemo(() => familyOptionsOf(elementTypes), [elementTypes])
  // A family the project has no row for yet is created with the ElementType (GX9RLV).
  // The DesignDB parse files family rows under collection_refs, not elementTypes (#59).
  const familyIsNew = family.trim() !== '' && !familyRowExists(family, elementTypes, dbCollectionRefs)
  // Other ElementTypes already name it as their Family, so it is not new, only missing its row.
  const familyInUse = elementTypes.some(e => (e.Family || e.family || '').trim().toLowerCase() === family.trim().toLowerCase())
  const [familyParent, setFamilyParent] = useState('')

  // All known ET refs for the next-available suggestion
  const allETObjects = useMemo(() => {
    const seen = new Map()
    for (const et of elementTypes) {
      const r = et.ElementTypeRef || et.elementTypeRef
      if (r) seen.set(r.toLowerCase(), et)
    }
    for (const r of psRows) {
      const k = (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase()
      if (k && !seen.has(k)) seen.set(k, { ElementTypeRef: r.ElementTypeRef || r.elementTypeRef })
    }
    for (const r of recipes) {
      const k = (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase()
      if (k && !seen.has(k)) seen.set(k, { ElementTypeRef: r.ElementTypeRef || r.elementTypeRef })
    }
    return [...seen.values()]
  }, [elementTypes, psRows, recipes])

  const mfrOptions = useMemo(() => {
    const s = new Set()
    for (const r of psRows) { const m = (r.Manufacturer || r.manufacturer || '').trim(); if (m) s.add(m) }
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [psRows])

  // Live suggestion: next available ref for the typed prefix. Uppercased so it
  // also nudges the user toward capitalised refs.
  const suggested = useMemo(() => {
    // A trailing or doubled `-` is closed up first, so `ET-XX-` probes ET-XX-01, never ET-XX--01.
    const trimmed = refIssues(ref).fixed.toUpperCase()
    if (!trimmed) return ''
    // Synthesise a probe with a trailing number so getNextAvailableRef can strip it
    const probe = /-\d+$/.test(trimmed) ? trimmed : `${trimmed}-01`
    return getNextAvailableRef(probe, allETObjects) || ''
  }, [ref, allETObjects])

  // Nudge: the typed ref has lowercase letters (refs are conventionally caps).
  const notCapitalised = ref.trim() && ref.trim() !== ref.trim().toUpperCase()

  // Flag when the entered Manufacturer + Product Code already belongs to another ET.
  const dupSpec = useMemo(() => {
    const m = manufacturer.trim().toLowerCase()
    const c = productCode.trim().toLowerCase()
    // "N/A" names no product: every wrapper and LIN/DL type carries it (HYQ246).
    if (!m || !hasProductIdentity(c)) return null
    const hit = psRows.find(r =>
      (r.Manufacturer || r.manufacturer || '').trim().toLowerCase() === m &&
      (r.ProductCode || r.productCode || '').trim().toLowerCase() === c &&
      (r.IsDeleted || r.isDeleted) !== 'Y' &&
      (r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() !== ref.trim().toLowerCase()
    )
    return hit ? { ref: hit.ElementTypeRef || hit.elementTypeRef } : null
  }, [manufacturer, productCode, psRows, ref])

  const alreadyExists = useMemo(() => {
    const k = cleanRef(ref).toLowerCase()
    if (!k) return false
    return allETObjects.some(e => (e.ElementTypeRef || e.elementTypeRef || '').toLowerCase() === k)
  }, [ref, allETObjects])

  const emptySegment = refIssues(ref).empty
  const canSave = ref.trim() && !alreadyExists && !emptySegment && !saving

  const saveTitle = alreadyExists ? 'Ref already exists' : emptySegment ? 'The ref has an empty part (--, or a - at the end)' : !ref.trim() ? 'Enter a ref first' : ''
  async function handleSave(where = null) {
    const trimRef = cleanRef(ref)
    if (!trimRef || alreadyExists || emptySegment) return
    const fam = refIssues(family).fixed
    setSaving(true)
    try {
      // Register the ET in the catalogue (staging-backed; queues a DB row when
      // DB writes are on).
      if (familyIsNew) {
        const canon = CANON_FAMILIES.find(f => f.ref.toLowerCase() === fam.toLowerCase())
        createElementType({ ref: fam, description: canon?.description || null, family: familyParent.trim() || canon?.parent || null, isCollection: true })
      }
      const fullDesc = finish.trim() ? withFinish(description, finish.trim()) : description.trim()
      createElementType({
        ref: trimRef,
        name: name.trim() || null,
        // Finish goes in brackets after both descriptions (NQLUFQ).
        description: fullDesc || null,
        family: fam || null,
      })

      // Only create a PS row when procurement data was actually entered.
      const psDefaults = {}
      if (manufacturer.trim()) psDefaults.Manufacturer = manufacturer.trim()
      if (productCode.trim())  psDefaults.ProductCode  = productCode.trim()
      const existing = psRows.find(p => (p.ElementTypeRef || p.elementTypeRef || '').toLowerCase() === trimRef.toLowerCase())
      // Product Spec and ElementType both get these (92YN3U); addPSRow carries them across.
      if (isTBC)               psDefaults.IsTBC = 'Y'
      if (isPropTBC)           psDefaults.IsPropertiesTBC = 'Y'
      if (notes.trim())        psDefaults.InternalNotesText = notes.trim()
      if (extNotes.trim())     psDefaults.ExternalNotesText = extNotes.trim()
      // The description is shared, but alone it does not make a Product Spec row.
      if (fullDesc && (existing || Object.keys(psDefaults).length)) psDefaults.ComponentDescription = fullDesc
      if (Object.keys(psDefaults).length) {
        if (existing) updatePSRow(trimRef, psDefaults)
        else addPSRow(trimRef, psDefaults)
      }

      if (productCode.trim()) {
        const made = { code: productCode.trim(), manufacturer: manufacturer.trim(), family: fam, ref: trimRef, name: name.trim() }
        useStore.getState().noteKept({ ...made, maker: made.manufacturer })
        // Audit trail: each suggested field, kept or changed.
        const project = useStore.getState().projectNumber
        shareOutcomes(companion, project, settleCreated(project, [made]))
      }
      clearSeed()
      if (where) {
        const st = useStore.getState()
        const row = { elementTypeRef: trimRef, ElementTypeRef: trimRef }
        if (where === 'position') st.addRecipeRow(placeIn, 'position', row, { asPosition: true })
        if (where === 'wrapper') st.addRecipeRow(placeIn, /LIN/i.test(wrapperRef) ? 'lin_internal' : 'dl_internal', row, { asPosition: true })
        st.ensurePSRow(trimRef)
      }
      onCreated(trimRef, where)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal show={show} onHide={onHide} size={formRow ? 'xl' : 'lg'} centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 14 }}>
          <MaterialIcon name="add_circle" size={16} style={{ verticalAlign: 'middle', marginRight: 6, color: C.success }} />
          New Element Type
          {contextLabel && <span className="text-muted fw-normal ms-2" style={{ fontSize: 12 }}>{contextLabel}</span>}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className={formRow ? 'd-flex gap-3' : undefined}>
       <div style={{ flex: 1, minWidth: 0 }} onFocusCapture={e => { if (setters[e.target.dataset?.field]) lastField.current = e.target.dataset.field }}>
        {/* What the Form actually said. Read-only: it is evidence, not a field. The Form row
            panel on the right says it in full, so this shows only without it; a merge still warns. */}
        {importContext && formRow && importContext.mergedCodes?.length > 1 && (
          <div className="mb-3" style={{ color: C.attnInk, fontSize: 11 }}>
            <MaterialIcon name="merge" size={11} /> merging {importContext.mergedCodes.length} codes onto one
            ElementType: <span style={{ fontFamily: 'monospace' }}>{importContext.mergedCodes.join(', ')}</span>
          </div>
        )}
        {importContext && !formRow && (
          <div className="mb-3 px-2 py-2 rounded" style={{ background: C.subtle, border: `1px solid ${C.border}`, fontSize: 11 }}>
            <div className="fw-semibold text-muted mb-1" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em' }}>
              Form Template Data
            </div>
            <div className="d-flex align-items-baseline gap-2">
              <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{importContext.code}</span>
              <span className={importContext.manufacturer ? 'text-muted' : 'text-muted fst-italic'}>
                {importContext.manufacturer || 'no manufacturer'}
              </span>
              {importContext.rowCount > 0 && (
                <span className="text-muted ms-auto" style={{ fontSize: 10 }}>
                  {importContext.rowCount} row{importContext.rowCount === 1 ? '' : 's'}
                </span>
              )}
            </div>
            {importContext.note && (
              <div className="mt-1"><span className="text-muted">note:</span> {importContext.note}</div>
            )}
            {importContext.positionTypes?.length > 0 && (
              <div className="text-muted mt-1" style={{ fontSize: 10 }}>
                used by <span style={{ fontFamily: 'monospace' }}>{importContext.positionTypes.join(', ')}</span>
              </div>
            )}
            {importContext.mergedCodes?.length > 1 && (
              <div className="mt-1" style={{ color: C.attnInk }}>
                <MaterialIcon name="merge" size={11} /> merging {importContext.mergedCodes.length} codes onto one
                ElementType: <span style={{ fontFamily: 'monospace' }}>{importContext.mergedCodes.join(', ')}</span>
              </div>
            )}
          </div>
        )}

        {onBulk && bulkCount > 1 && (
          <div className="text-end mb-2" style={{ fontSize: 11 }}>
            <button type="button" className="btn btn-link p-0" style={{ fontSize: 11 }} onClick={onBulk} data-testid="newet-do-all">
              Do all {bulkCount} at once →
            </button>
          </div>
        )}

        <div className="row g-3 mb-3">
        {/* Ref field */}
        <Form.Group className="col-6">
          <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>
            Element Type Ref <span className="text-danger">*</span><Wand field="ref" value={ref} why={refWhy || prefill.why} />
          </Form.Label>
          <Form.Control
            size="sm"
            value={ref}
            data-field="ref" onChange={e => { refTyped.current = true; setRef(e.target.value) }}
            onBlur={() => { if (cleanRef(ref) !== ref) setRef(cleanRef(ref)) /* refs never hold whitespace */ }}
            onKeyDown={e => { if (e.key === 'Enter' && canSave) handleSave(placeIn ? 'position' : null) }}
            placeholder="e.g. ET-TAPE-004"
            isInvalid={alreadyExists || emptySegment}
            style={{ fontSize: 12, fontFamily: 'monospace' }}
            autoFocus
          />
          {refWhy && ref === seeded.current.ref && (
            <div className="text-muted d-flex align-items-center gap-1" style={{ fontSize: 10, marginTop: 2, fontStyle: /no pattern/.test(refWhy) ? 'italic' : 'normal' }} data-testid="ref-from">
              {!/no pattern/.test(refWhy) && <span className="companion-dot" />}{refWhy}
            </div>
          )}
          {alreadyExists && (
            <Form.Text className="text-danger" style={{ fontSize: 11 }}>
              This ref already exists — use "Pick existing" to add it.
            </Form.Text>
          )}
          {/* A trailing `-` is mid-typing: the Next available nudge below covers it. */}
          {!alreadyExists && /^-|--/.test(cleanRef(ref)) && suggested && (
            <Form.Text className="text-danger" style={{ fontSize: 11 }} data-testid="ref-empty-segment">
              A ref can't have an empty part. Use{' '}
              <button type="button" className="btn btn-link p-0" style={{ fontSize: 11, fontFamily: 'monospace', verticalAlign: 'baseline' }}
                onClick={() => { refTyped.current = true; setRef(suggested) }}>{suggested}</button>
            </Form.Text>
          )}
          {/* A full free ref is the user's (or a proposal's, numbered past refs other new codes hold): no nudge. */}
          {!alreadyExists && !/^-|--/.test(cleanRef(ref)) && suggested && suggested !== ref.trim() && (notCapitalised || !/-\d+$/.test(ref.trim())) && (
            <div style={{ fontSize: 11, marginTop: 4, color: C.accent }}>
              <MaterialIcon name="lightbulb" size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />
              {notCapitalised ? 'Suggested (capitalised):' : 'Next available:'}{' '}
              <button
                className="btn btn-link p-0"
                style={{ fontSize: 11, verticalAlign: 'baseline' }}
                onClick={() => setRef(suggested)}
              >
                {suggested}
              </button>
            </div>
          )}
        </Form.Group>

        {/* Name */}
        <Form.Group className="col-6">
          <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>
            Name <span className="text-muted fw-normal">(optional)</span><Wand field="name" value={name} why={!own.current ? prefill.why : name === seedName(manufacturer, productCode) ? 'maker and code' : 'in the style of this family here'} />
          </Form.Label>
          <Form.Control
            size="sm"
            value={name}
            data-field="name" onChange={e => setName(e.target.value)}
            placeholder="Short display name…"
            style={{ fontSize: 12 }}
          />
        </Form.Group>

        {/* Description */}
        <Form.Group className="col-6">
          <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>
            Description <span className="text-muted fw-normal">(optional)</span><Wand field="description" value={description} />
          </Form.Label>
          <Form.Control
            as="textarea"
            rows={2}
            size="sm"
            value={description}
            data-field="description" onChange={e => setDescription(e.target.value)}
            placeholder="What is this element type?…"
            style={{ fontSize: 12, resize: 'none' }}
          />
        </Form.Group>

        {/* Family / ParentRef */}
        <Form.Group className="col-6">
          <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>
            Family <span className="text-muted fw-normal">(optional)</span><Wand field="family" value={family} why={own.current ? whyText(own.current) : prefill.why} />
          </Form.Label>
          <Form.Control
            size="sm"
            list={familyListId}
            value={family}
            onBlur={() => { if (cleanRef(family) !== family) setFamily(cleanRef(family)) }}
            data-field="family" onChange={e => { const f = e.target.value; setFamily(f)
              if (!refTyped.current && familyOptions.includes(f)) setRef(refamily([{ code: productCode, manufacturer, name, description }], [0], f, elementTypes, useStore.getState().psRows)[0].ref) }}
            placeholder="e.g. TAPE, PROFILE, CLIP…"
            style={{ fontSize: 12 }}
          />
          <datalist id={familyListId}>
            {familyOptions.map(f => <option key={f} value={f} />)}
          </datalist>
          {own.current && family === seeded.current.family && (
            <div className="text-muted d-flex align-items-center gap-1" style={{ fontSize: 10, marginTop: 2 }} data-testid="family-from">
              <span className="companion-dot" />{own.current.checkRef ? 'a guess: ' : ''}{whyText(own.current)}
            </div>
          )}
          {familyIsNew && (
            <div className="d-flex align-items-center gap-2 mt-1" style={{ fontSize: 11 }} data-testid="new-family">
              <MaterialIcon name="create_new_folder" size={13} style={{ color: C.accent }} />
              <span>{familyInUse ? 'No family row yet for' : 'New family'} <strong style={{ fontFamily: 'monospace' }}>{family.trim()}</strong>: its row is created too, under</span>
              <Form.Control size="sm" list={`${familyListId}-parent`} value={familyParent} onChange={e => setFamilyParent(e.target.value)}
                placeholder="(top level)" aria-label="Parent family" style={{ fontSize: 11, width: 170 }} />
              <datalist id={`${familyListId}-parent`}>{familyOptions.map(f => <option key={f} value={f} />)}</datalist>
            </div>
          )}
          <div className="d-flex align-items-center gap-2 mt-2">
            <FlagPill label="TBC" value={isTBC} onChange={setTBC} activeVariant="danger" />
            <FlagPill label="Properties TBC" value={isPropTBC} onChange={setPropTBC} activeVariant="warning" />
          </div>
        </Form.Group>
        </div>

        {/* Shared by the ElementType and its Product Spec row (kept in step, 92YN3U). */}
        <div className="row g-3 mb-3">
          <div className="col-6">
            <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>Internal Notes <span className="text-muted fw-normal">(optional)</span></Form.Label>
            <Form.Control as="textarea" rows={2} size="sm" value={notes} data-field="notes" onChange={e => setNotes(e.target.value)}
              placeholder="Anything to query…" style={{ fontSize: 12, resize: 'vertical' }} />
          </div>
          <div className="col-6">
            <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>External Notes <span className="text-muted fw-normal">(optional)</span></Form.Label>
            <Form.Control as="textarea" rows={2} size="sm" value={extNotes} data-field="extNotes" onChange={e => setExtNotes(e.target.value)}
              placeholder="Shown on the Product Spec…" style={{ fontSize: 12, resize: 'vertical' }} />
          </div>
        </div>

        {/* Product Spec: always open; only what is the Product Spec's own. */}
        <div className="border rounded p-2" style={{ background: C.subtle }}>
          <div className="d-flex align-items-center gap-1" style={{ fontSize: 12, color: C.muted }}>
            <span className="fw-semibold">Product Spec</span>
            <span className="text-muted fw-normal ms-1">— Manufacturer, Code, Finish (added in brackets to both descriptions)</span>
          </div>
            <div className="mt-2">
              <div className="row g-2">
                <div className="col-4">
                  <Form.Label style={{ fontSize: 11, color: C.muted }}>Manufacturer<Wand field="manufacturer" value={manufacturer} /></Form.Label>
                  <Form.Control size="sm" value={manufacturer} data-field="manufacturer" onChange={e => setMfr(e.target.value)}
                    placeholder="e.g. Osram" list={mfrListId} style={{ fontSize: 11 }} />
                  <datalist id={mfrListId}>
                    {mfrOptions.map(m => <option key={m} value={m} />)}
                  </datalist>
                  {houseMaker(manufacturer) && (
                    <div style={{ fontSize: 11, marginTop: 4, color: C.accent }} data-testid="house-maker">
                      <MaterialIcon name="lightbulb" size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                      House spelling:{' '}
                      <button className="btn btn-link p-0" style={{ fontSize: 11, verticalAlign: 'baseline' }}
                        onClick={() => setMfr(houseMaker(manufacturer))}>{houseMaker(manufacturer)}</button>
                    </div>
                  )}
                </div>
                <div className="col-4">
                  <Form.Label style={{ fontSize: 11, color: C.muted }}>Product Code<Wand field="productCode" value={productCode} /></Form.Label>
                  <Form.Control size="sm" value={productCode} data-field="productCode" onChange={e => setCode(e.target.value)}
                    placeholder="e.g. LEDTAPE-3000K" style={{ fontSize: 11 }} />
                </div>
                <div className="col-4">
                  <Form.Label style={{ fontSize: 11, color: C.muted }}>Finish
                    {finishHint && finish === finishHint && <Wand field="finish" value={finish} why="the Form's Finish" />}</Form.Label>
                  <Form.Control size="sm" value={finish} data-field="finish" onChange={e => setFinish(e.target.value)}
                    onClick={() => { if (!finish && finishHint) { seeded.current.finish = finishHint; setFinish(finishHint) } }}
                    title={finishHint && !finish ? `Click to use the Form's finish: ${finishHint}` : undefined}
                    placeholder={finishHint || 'e.g. RAL 9010'} style={{ fontSize: 11 }} />
                </div>
              </div>

              {/* Duplicate Manufacturer + Product Code guard */}
              {dupSpec && (
                <div className="mt-2 p-2 rounded" style={{ background: C.attnTint, border: `1px solid ${C.attn}`, fontSize: 11 }}>
                  <div className="d-flex align-items-start gap-1" style={{ color: C.attnInk }}>
                    <MaterialIcon name="warning" size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>
                      <strong style={{ fontFamily: 'monospace' }}>{dupSpec.ref}</strong> already uses this
                      Manufacturer + Product Code. Creating another means two ElementTypes for one product.
                    </span>
                  </div>
                  <div className="mt-2 d-flex gap-2 flex-wrap">
                    <Button size="sm" variant="warning" style={{ fontSize: 11 }}
                      onClick={() => onCreated(dupSpec.ref)}>
                      Use existing {dupSpec.ref}
                    </Button>
                    <Button size="sm" variant="outline-secondary" style={{ fontSize: 11 }}
                      onClick={() => setCode('')}>
                      Adjust product code
                    </Button>
                  </div>
                </div>
              )}
            </div>
        </div>
       </div>
        {formRow && (
          <aside data-testid="newet-form-row" aria-label="Form Template Data"
            style={{ width: 340, flexShrink: 0, borderLeft: `1px solid ${C.border}`, paddingLeft: 12, fontSize: 11,
              alignSelf: 'flex-start', position: 'sticky', top: 0, maxHeight: '65vh', overflowY: 'auto' }}>
            <div className="text-muted fw-semibold mb-1" style={{ fontSize: 10, letterSpacing: '0.04em' }}>FORM TEMPLATE DATA · {formRow.ref}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, max-content) 1fr', columnGap: 8, rowGap: 2 }}>
              {formRow.cols.map(([col, value], i) => (
                <React.Fragment key={`${col}-${i}`}>
                  <span className="text-muted text-truncate" style={{ fontSize: 10, maxWidth: 120 }} title={col}>{col}</span>
                  <button type="button" className="btn btn-link p-0 text-start text-reset text-decoration-none"
                    // Long LINK/ProductCode cells run to 8 lines: show two, the whole value on hover.
                    style={{ fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                    onMouseDown={e => e.preventDefault()} onClick={() => { putValue(value); copyText(value).then(ok => ok && setCopied(value)) }}
                    title={value}>{value}</button>
                </React.Fragment>
              ))}
            </div>
            <div className="text-muted mt-2" style={{ fontSize: 10 }} data-testid="newet-form-hint">
              {copied != null ? <>Copied “{copied}”, and put into the field you were in.</> : 'Click a value to copy it and put it into the field you were in.'}
            </div>
          </aside>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="link" size="sm" onClick={onHide} style={{ fontSize: 12 }}>Cancel</Button>
        {placeIn ? <>
          <Button variant="outline-secondary" size="sm" style={{ fontSize: 12 }} className="me-auto order-first" data-testid="newet-ps-only"
            onClick={() => handleSave('ps')} disabled={!canSave} title={saveTitle}>Product Spec only</Button>
          {wrapperRef && <Button variant="outline-primary" size="sm" style={{ fontSize: 12 }} data-testid="newet-into-wrapper"
            onClick={() => handleSave('wrapper')} disabled={!canSave} title={saveTitle}>Add into {wrapperRef}</Button>}
          <Button variant="primary" size="sm" style={{ fontSize: 12 }} data-testid="newet-into-position"
            onClick={() => handleSave('position')} disabled={!canSave} title={saveTitle}>{saving ? 'Creating…' : `Add into ${placeIn}`}</Button>
        </> : (
          <Button variant="primary" size="sm" style={{ fontSize: 12 }} onClick={() => handleSave()} disabled={!canSave} title={saveTitle}>
            {saving ? 'Creating…' : confirmLabel}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  )
}
