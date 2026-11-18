import InfoTip from './InfoTip'
import React, { useMemo, useState } from 'react'
import { Button, Dropdown } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import IconButton from './IconButton'
import DuplicateETModal from './DuplicateETModal'
import UsagePopover from './UsagePopover'
import { compareFormToRecipe, associations, formPending, pendingCandidates } from '../utils/formSpec'
import { divergingRefs } from '../utils/usage'
import NewETModal from './NewETModal'
import ETRefSelect from './ETRefSelect'
import ConceptCard, { CONCEPTS } from './ConceptCard'
import TutorialHint from '../tutorial/TutorialHint'
import { findProductET, stampPlan } from '../utils/productCodes'
import { ACTION_ICONS } from '../utils/entityStyle'
import { ago } from '../utils/ago'
import FormPaintBar from './FormPaintBar'
import { usePositionFormImpact } from './FormDiffBlock'
import { readOlderForm } from '../utils/olderForm'
import { readSheet, fileMeta } from '../utils/backend'
import { positionPaintStatus } from '../utils/formPositions'
import { buildRefMap, targetFor } from '../utils/ptResolve'
import { CopyText } from './CopyButton'
import { EtPill, PosPill, Gutter, Where, GRAPHITE, btn, card, mono } from './FormPaneParts'
import { registerTrace } from '../utils/trace'
import { C } from '../styles/tokens'
import { askConfirm } from './ConfirmHost'

/**
 * FormSpecPane — the Form's spec beside the recipe it produced (design A, D4Z9CX).
 *
 * The governing principle (see formSpec.js): the Form is the TRUTH about WHICH products a
 * position uses, and silent about everything else. So a Form ET absent from the recipe is a
 * defect; a recipe row absent from the Form is derived detail and is never flagged red.
 *
 * Top to bottom: this position's Form entries (FormPaintBar: each with a Form data ⇄ Paint
 * face), then one line per product. Compared with an older Form, a line carries a gutter
 * mark: + new, ~ changed (the old code and ElementType struck underneath), − gone. Visual,
 * not prose: the words are on hover.
 */

const LABEL = {
  fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em',
}

function SectionLabel({ children, className = '' }) {
  return <div className={`fw-semibold text-muted mb-1 ${className}`} style={LABEL}>{children}</div>
}

/** "12 Oct": when the older Form was saved (else compared). */
const dayLabel = at => (at ? new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'the older Form')

/** Which workbook is attached and when; compared with an older one, its date as a pill. */
function FormStrip({ formCaptures, base }) {
  const when = formCaptures && ago(formCaptures.importedAt)
  return (
    <div className="d-flex align-items-center gap-1 mb-2 text-muted" style={{ fontSize: 10 }}>
      {formCaptures && <>
        <MaterialIcon name="description" size={11} style={{ flexShrink: 0 }} />
        <span className="text-truncate" style={{ minWidth: 0 }}
          title={`${formCaptures.source?.name || 'Form template'}${formCaptures.source?.sheet ? ` · ${formCaptures.source.sheet}` : ''}`}>
          {formCaptures.source?.name || 'Form template'}
          {when && <> · {when}</>}
        </span>
      </>}
      {base && (
        <span className="d-inline-flex align-items-center gap-1 flex-shrink-0" title={base.name} data-testid="compare-pill"
          style={{ background: C.subtle, border: `1px solid ${C.border}`, borderRadius: 9, padding: '0 6px', color: C.ink }}>
          <MaterialIcon name="difference" size={11} /> {dayLabel(base.at)}
          <span role="button" aria-label="Stop comparing" title="Stop comparing with the older Form" data-testid="compare-clear"
            className="d-inline-flex" onClick={() => useStore.getState().setCompareBase(null)}>
            <MaterialIcon name="close" size={11} />
          </span>
        </span>
      )}
    </div>
  )
}

/** ✓ in the recipe, ⊕ an ElementType to add, ? no ElementType yet. */
const STATUS = {
  present: { icon: ACTION_ICONS.complete, color: C.success, title: 'In the recipe' },
  addable: { icon: 'add_circle', color: C.accent, title: 'An ElementType: add it' },
  question: { icon: 'help', color: C.attnInk, title: 'No ElementType yet' },
}
function Status({ status, note = null }) {
  const s = STATUS[status]
  return <MaterialIcon name={s.icon} size={14} title={note ? `${s.title}. ${note}` : s.title} style={{ color: s.color, flexShrink: 0, fontVariationSettings: '"FILL" 1' }} />
}

const row = { display: 'flex', alignItems: 'center', gap: 6, minHeight: 22, minWidth: 0, fontSize: 11 }
const codeStyle = { ...mono, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

/**
 * The ⋯ menu. Re-import and Detach are rare, deliberate acts; they must be reachable from
 * EVERY state the pane can be in, hence one component, rendered in each branch.
 */
function PaneMenu({ onReimport, onDetach, onCompare, onClearCompare }) {
  const [about, setAbout] = useState(false)
  return (
    <>
    <ConceptCard concept={CONCEPTS.INTENT} show={about} onHide={() => setAbout(false)} />
    <Dropdown align="end">
      <Dropdown.Toggle as={IconButton} icon={ACTION_ICONS.more} size={14}
        title="Form template options" className="p-0 text-muted" />
      <Dropdown.Menu style={{ fontSize: 11 }}>
        <Dropdown.Item onClick={onReimport}>
          <MaterialIcon name="sync" size={12} /> Re-import
        </Dropdown.Item>
        {onCompare && (
          <Dropdown.Item onClick={onCompare} title="Pick an older revision of the Form: each position shows what changed since then">
            <MaterialIcon name="difference" size={12} /> Compare with an older Form…
          </Dropdown.Item>
        )}
        {onClearCompare && (
          <Dropdown.Item onClick={onClearCompare}>
            <MaterialIcon name="close" size={12} /> Clear comparison
          </Dropdown.Item>
        )}
        <Dropdown.Item onClick={onDetach} className="text-danger">
          <MaterialIcon name={ACTION_ICONS.delete} size={12} /> Detach
        </Dropdown.Item>
        <Dropdown.Divider />
        <Dropdown.Item onClick={() => setAbout(true)}>
          <MaterialIcon name="help" size={12} /> What is this?
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
    </>
  )
}

/** Why a reuse candidate is offered, in a few words. */
const WHY = {
  spec:   'the Product Spec names it',
  recipe: 'in the recipe, no Form code',
  reuse:  'same product elsewhere',
}

export default function FormSpecPane({ posRef, embedded = false, inDrawer = false }) {
  const recipes = useStore(s => s.recipes)
  const psRows = useStore(s => s.psRows)
  const elementTypes = useStore(s => s.elementTypes)
  const updatePSRow = useStore(s => s.updatePSRow)
  const containerETRefs = useStore(s => s.containerETRefs)
  const formCaptures = useStore(s => s.formCaptures)
  const addRecipeRow = useStore(s => s.addRecipeRow)
  const removeRecipeRow = useStore(s => s.removeRecipeRow)
  const dismissDivergence = useStore(s => s.dismissDivergence)
  const requestScreen = useStore(s => s.requestScreen)
  const requestPaletteTab = useStore(s => s.requestPaletteTab)
  const promotePendingCapture = useStore(s => s.promotePendingCapture)
  const undo = useStore(s => s.undo)
  const addWrapper = useStore(s => s.addWrapper)
  const applyFormChange = useStore(s => s.applyFormChange)
  const forkRefFor = useStore(s => s.forkRefFor)
  const importDraft = useStore(s => s.importDraft)

  // The last one-click add, for its "Added … · Undo" line. Cleared when the position changes.
  const [lastAdded, setLastAdded] = useState(null)   // { posRef, refs: [ref], where }
  const [forking, setForking] = useState(false)
  const [creating, setCreating] = useState(null)   // a pending Form product with no ElementType
  const [picking, setPicking] = useState(null)     // ...whose ElementType you are choosing by hand
  const [creatingFor, setCreatingFor] = useState(null)   // a ~ change a New ElementType is for
  const [showExtra, setShowExtra] = useState(false)

  const base = importDraft?.compareBase
  const since = base ? dayLabel(base.at) : null
  // The same change from identical Form rows once (2EF42C).
  const formChanges = usePositionFormImpact(posRef).filter((c, i, all) => all.findIndex(x =>
    ['kind', 'fromEt', 'toEt', 'toCode', 'fromCode'].every(k => x[k] === c[k])) === i)
  const paintSt = positionPaintStatus(importDraft, posRef, { buildRefMap, targetFor, knows: (m, c) => !!findProductET(psRows, m, c) || !!importDraft?.assignments?.[String(c || '').trim().toUpperCase()] })
  // In the builder's right drawer (K3LGUL) the drawer gives the width and the edge.
  const paneStyle = inDrawer ? { flex: 1, minWidth: 0, overflowY: 'auto' } : { width: 340, flexShrink: 0, overflowY: 'auto' }
  const paneClass = inDrawer ? 'px-2 pt-2' : 'border-start ps-3'

  // Not saved here yet (a code still needs an ElementType): the codes the Product Spec
  // already knows are compared with the recipe all the same (44VCYZ).
  const draftKnown = useMemo(() => (formCaptures?.byPosition?.[posRef] ? [] : (paintSt.formRows || []).flatMap(r =>
    String(r.rawText || '').split(/\s+/).filter(Boolean).map(code => ({ code, manufacturer: r.manufacturer || '', elementTypeRef: findProductET(psRows, r.manufacturer, code), formRef: r.positionType }))
      .filter(e => e.elementTypeRef))
    .filter((e, i, a) => a.findIndex(x => x.elementTypeRef === e.elementTypeRef) === i)), [formCaptures, posRef, paintSt.formRows, psRows])
  const captured = formCaptures?.byPosition?.[posRef] ?? draftKnown
  const orphanRefs = formCaptures?.orphansByPosition?.[posRef] ?? []
  // Products the Form asks for here that nobody has named yet.
  const pending = formPending(formCaptures, posRef)

  /**
   * The shopping list. A product is (manufacturer, code); if the Product Spec already names an
   * ElementType for that pair, THAT is what to add. The captured ET is only the fallback.
   */
  const formEts = useMemo(() => captured.map(e => {
    const inSpec = findProductET(psRows, e.manufacturer, e.code)
    return { ...e, elementTypeRef: inSpec || e.elementTypeRef, inSpec: !!inSpec }
  }), [captured, psRows])

  const result = useMemo(
    () => compareFormToRecipe(recipes, posRef, formEts, containerETRefs, { orphanRefs }),
    [recipes, posRef, formEts, containerETRefs, orphanRefs]
  )

  // Only a disagreement that involves this position earns a warning here (WGNPNM).
  const diverging = useMemo(() => divergingRefs({ recipes, formCaptures, posRef }), [recipes, formCaptures, posRef])
  const diverges = ref => diverging.has(String(ref).toLowerCase())

  // "X consistently has Y" — learned, advisory, only consulted for what is gone.
  const assoc = useMemo(
    () => (result.orphaned.length || formChanges.some(c => c.kind === 'remove') ? associations(recipes, formCaptures) : new Map()),
    [recipes, formCaptures, result.orphaned.length, formChanges]
  )

  /**
   * The ElementType a product with none probably already IS. `result.extra` is the good bit:
   * an ET the recipe holds and the Form cannot account for is very likely the answer.
   */
  const candidate = p => pendingCandidates(p, { extra: result.extra, psRows, elementTypes })[0] || null
  const candsByCode = useMemo(() => new Map(pending.map(p => [p.code, candidate(p)])),
    [pending, result.extra, psRows, elementTypes])

  // This position's recipe rows (at the position or inside its wrapper), by ElementType.
  const here = recipes.filter(r => (r.IsDeleted || r.isDeleted) !== 'Y' && (r.PositionTypeRef || r.positionTypeRef) === posRef)
  const rowsOf = ref => here.filter(r => String(r.ElementTypeRef || r.elementTypeRef || '').toUpperCase() === String(ref).toUpperCase())
  const holds = ref => rowsOf(ref).length > 0
  const whereOf = ref => {
    const rs = rowsOf(ref)
    const inside = rs.some(r => (r.ContextType || r.contextType) === 'ElementType')
    const at = rs.some(r => (r.ContextType || r.contextType) !== 'ElementType')
    return inside && at ? 'both' : inside ? 'internal' : at ? 'position' : null
  }

  // ~ groups: a Form change the recipe holds. Their ETs and codes are not repeated below.
  const swaps = formChanges.filter(c => c.kind === 'swap' && (holds(c.fromEt) || holds(c.toEt)))
  const respecs = formChanges.filter(c => c.kind === 'respec' && c.inRecipe)
  const grouped = new Set([...swaps.flatMap(c => [c.fromEt, c.toEt]), ...respecs.map(c => c.fromEt)].map(r => String(r).toUpperCase()))
  const isGrouped = ref => grouped.has(String(ref).toUpperCase())
  const addedEts = new Set(formChanges.filter(c => c.kind === 'add').map(c => String(c.toEt).toUpperCase()))
  // XVZAV8: an old code no ~ group shows goes under the Form line its row became (A02hw: the
  // recipe holds the kit ET-PS-17, not the ET-PS-07 the diff swapped to), struck, as one ~.
  const drops = formChanges.filter(c => c.kind === 'dropNew')
  const olds = formChanges.filter(c => c.fromCode && (c.kind === 'dropNew' || (c.kind === 'swap' && !swaps.includes(c)) || (c.kind === 'respec' && !respecs.includes(c))))
  const up = x => String(x || '').toUpperCase()
  const oldOf = new Map()
  for (const e of formEts) {
    const add = formChanges.find(c => c.kind === 'add' && up(c.toEt) === up(e.elementTypeRef))
    const d = olds.find(o => ![...oldOf.values()].includes(o)
      && (add ? o.oldText === add.oldText && o.newText === add.newText : e.code && up(o.newText).includes(up(e.code))))
    if (d) oldOf.set(up(e.elementTypeRef), d)
  }
  const lonelyDrops = drops.filter(d => ![...oldOf.values()].includes(d))
  const plus = ref => (oldOf.has(String(ref).toUpperCase()) ? '~' : addedEts.has(String(ref).toUpperCase()) ? '+' : '')

  /** "This Form product IS that ElementType." Links it; see stampPlan for each branch. */
  async function mergePending(p, etRef) {
    let ref = etRef
    const plan = stampPlan(psRows, ref, p.manufacturer, p.code, {
      isContainer: containerETRefs.has(String(ref).toLowerCase()),
    })
    if (plan.action === 'taken') {
      if (!(await askConfirm(
        `The Product Spec says "${p.code}" is ${plan.otherRef}, not ${ref}.\n\n` +
        `Use ${plan.otherRef} instead? (Linking it to ${ref} would not stick — the spec wins.)`
      ))) return
      ref = plan.otherRef
    } else if (plan.action === 'conflict') {
      if (!(await askConfirm(
        `${ref} is already ${plan.current.manufacturer || 'no maker'} / ${plan.current.code} in the Product Spec.\n\n` +
        `Link "${p.code}" to it anyway? The Product Spec is left as it is.`
      ))) return
    } else if (plan.action === 'stamp') {
      updatePSRow(ref, plan.updates)
    }
    await promotePendingCapture(posRef, p.code, ref)
    setPicking(null)
  }

  const handleReimport = () => requestScreen('product-code-import')
  // An older revision to compare with (LH5EC2): read here, kept in the import session.
  const compareProps = importDraft?.rows?.length ? {
    onCompare: async () => {
      const path = await window.electronAPI?.openXlsxDialog?.()
      if (!path) return
      try { await useStore.getState().setCompareBase(await readOlderForm(path, importDraft.map || {}, { readSheet, fileMeta })) }
      catch (err) { window.alert(err.message) }
    },
    onClearCompare: importDraft.compareBase ? () => useStore.getState().setCompareBase(null) : null,
  } : {}
  const handleDetach = async () => {
    if (await askConfirm('Detach the Form template from the whole project? Every position loses its Form comparison and the loaded Form is closed. Recipes and the Product Spec stay.', { ok: 'Detach', danger: true })) {
      useStore.getState().detachForm()
    }
  }

  // This position's Form entries. A respec's new code is the ~ group's; addNew codes get +.
  const paintBar = embedded ? null : (
    <FormPaintBar posRef={posRef} painter={{
      since,
      hideCodes: respecs.map(c => c.toCode).filter(Boolean),
      newCodes: formChanges.filter(c => c.kind === 'addNew').map(c => c.toCode),
      reuseFor: (code, r) => { const t = candidate({ code, manufacturer: r?.manufacturer || '', note: '' })
        return t && t.why !== 'spec' ? { ref: t.ref, why: WHY[t.why] } : null },
    }} />
  )
  const header = (
    <div className="d-flex align-items-center gap-1 mb-1">
      <SectionLabel className="mb-0">Form spec</SectionLabel>
      <TutorialHint id="form-pane" size={12} concept={CONCEPTS.INTENT} />
      {(formCaptures || importDraft) && <span className="ms-auto"><PaneMenu onReimport={handleReimport} onDetach={handleDetach} {...compareProps} /></span>}
    </div>
  )

  // Stage ① has not happened. Say so once, clearly, and offer the one thing to do.
  if (!formCaptures) {
    if (embedded) return null   // the Review modal is not the place to start a workflow
    // With a Product Spec in place, start here (9GLX5N): load the Form and paint this position.
    if (psRows.some(r => String(r.ProductCode || r.productCode || '').trim())) {
      return (
        <div className={paneClass} style={paneStyle}>
          {header}
          <FormStrip base={base} />
          {paintBar}
          {!importDraft && (
            <Button size="sm" variant="link" className="p-0 text-muted" style={{ fontSize: 10 }} onClick={handleReimport}>
              or go through the whole Form in Import →
            </Button>
          )}
        </div>
      )
    }
    return (
      <div className={paneClass} style={paneStyle}>
        <SectionLabel>Form spec</SectionLabel>
        {paintBar}
        <div className="px-3 py-4 rounded text-center"
          style={{ background: C.subtle, border: `1px dashed ${C.faint}` }}>
          <MaterialIcon name="auto_fix_high" size={28} style={{ color: C.faint }} />
          <div className="fw-semibold mt-2 mb-3" style={{ fontSize: 12 }}>
            No Form template yet{' '}
            <InfoTip>Import the Form and this panel shows, for every position, which products it asks for and which are already in the recipe.</InfoTip>
          </div>
          <Button size="sm" variant="outline-primary" style={{ fontSize: 11 }} onClick={handleReimport}>
            Import the whole Form template →
          </Button>
        </div>
      </div>
    )
  }
  // A position with ONLY pending products is not a position the Form is silent about.
  if (formEts.length === 0 && result.orphaned.length === 0 && pending.length === 0 && !formChanges.length) {
    return (
      <div className={paneClass} style={paneStyle}>
        {header}
        <FormStrip formCaptures={formCaptures} base={base} />
        {paintBar}
        {paintSt.state === 'noForm' && (
          <div className="text-muted fst-italic" style={{ fontSize: 11 }}>
            The Form says nothing about {posRef}.
          </div>
        )}
        {/* Silence is not an answer: what do comparable positions actually do? */}
        <Button size="sm" variant="outline-secondary" className="mt-2" style={{ fontSize: 10 }}
          onClick={() => requestPaletteTab('similar')}
          title={`It may be a technical-only position. Show positions like ${posRef}: same family, tags and recipe`}>
          <MaterialIcon name="group" size={12} /> See positions like this →
        </Button>
      </div>
    )
  }

  const { matched, missing, orphaned, extra, container } = result
  const lines = matched.filter(e => !isGrouped(e.elementTypeRef))
  const toAdd = missing.filter(e => !isGrouped(e.elementTypeRef))

  // The fork question, if it is about the wrapper this position actually uses.
  const divergence = (formCaptures.divergence || []).find(
    d => !d.consistent && container && d.wrapper === container
  ) || null
  /**
   * Where a product usually goes: inside the wrapper when that is where this ElementType sits
   * in most other recipes (drivers, connectors), else position level. Both are offered.
   */
  const placeCounts = ref => {
    let inside = 0, outside = 0
    for (const r of recipes) {
      if ((r.IsDeleted || r.isDeleted) === 'Y') continue
      if (String(r.ElementTypeRef || r.elementTypeRef || '').toLowerCase() !== ref.toLowerCase()) continue
      if ((r.ContextType || r.contextType) === 'ElementType') inside++
      else outside++
    }
    return { inside, outside }
  }
  const usualPlace = ref => {
    if (!container) return 'position'
    const { inside, outside } = placeCounts(ref)
    return inside > outside ? 'internal' : 'position'
  }

  /** One click, no preview: add Form products to THIS position. One undo step per click. */
  function addNow(refs, where) {
    refs.forEach((ref, i) => {
      const w = where === 'usual' ? usualPlace(ref) : where
      const entry = formEts.find(e => e.elementTypeRef === ref)
      addRecipeRow(posRef, w === 'internal' && container ? 'dl_internal' : 'position', {
        elementTypeRef: ref,
        // Stage ③: you added this, deliberately, from the Form. The badge says so.
        _origin: 'form', _formCode: entry?.code ?? null, _formNote: entry?.note ?? null,
      }, { recordHistory: i === 0, asPosition: true })
    })
    setLastAdded({ posRef, refs, where })
  }
  const removeEt = ref => rowsOf(ref).forEach(r => removeRecipeRow(posRef, r._id))

  const added = lastAdded && lastAdded.posRef === posRef ? lastAdded : null
  // A position whose design element is not a wrapper (a lamp, say) is not offered one.
  const hasDesign = here.some(r => (r.ContextType || r.contextType) === 'PositionType' && (r.IsDesign || r.isDesign) === 'Y')
  // Tape, profile, neon… is a linear assembly; anything else a downlight-style one.
  const wrapperKind = formEts.some(e => /\b(TAPE|PROF\w*|FLEX|NEON|DIFF\w*|LIN\w*|STRIP)\b|-(TAPE|PROF|FLEX|LIN)-/i
    .test(`${e.elementTypeRef} ${e.note || ''}`)) ? 'LIN' : 'DL'

  // − rows: gone from the Form (orphans, and remove changes), still in the recipe.
  const gone = [
    ...orphaned.map(o => ({ ref: o.elementTypeRef, code: null })),
    ...formChanges.filter(c => c.kind === 'remove' && c.inRecipe).map(c => ({ ref: c.fromEt, code: c.fromCode, trace: c.trace })),
  ].filter((g, i, a) => !isGrouped(g.ref) && holds(g.ref) && a.findIndex(x => x.ref.toUpperCase() === g.ref.toUpperCase()) === i)
  const old = { opacity: 0.55, textDecoration: 'line-through' }
  const changedTip = since ? `Changed since ${since}` : 'Changed in the Form'
  const markTip = ref => (plus(ref) === '~' ? changedTip : plus(ref) && (since ? `New since ${since}` : 'New in the Form'))
  // The struck old code (and its ElementType) under a ~ line; Remove while the recipe still holds it.
  const OldCode = ({ etRef: ref }) => {
    const d = oldOf.get(String(ref).toUpperCase())
    if (!d) return null
    return (
      <div style={row} data-testid="old-code">
        <Gutter /><span style={{ width: 14 }} />
        <span style={{ ...codeStyle, ...old, fontWeight: 400, color: C.muted }}>{d.fromCode}</span>
        {d.fromEt && <span className="ms-auto" style={old}><EtPill etRef={d.fromEt} style={{ textDecoration: 'line-through' }} /></span>}
        {d.fromEt && holds(d.fromEt) && <RemoveBtn etRef={d.fromEt} />}
      </div>
    )
  }
  // QFRHFW: the recipe holds one of the same family the Form no longer names (ET-LIN-DIFF-05 for -07).
  const familyOf = ref => String(elementTypes.find(t => (t.ElementTypeRef || '').toUpperCase() === String(ref).toUpperCase())?.Family || '').toUpperCase()
  const stem = ref => String(ref).toUpperCase().replace(/-\d+$/, '')
  const sameFamily = (a, b) => (familyOf(a) && familyOf(a) === familyOf(b)) || stem(a) === stem(b)
  const replaceable = ref => extra.find(x => x.elementTypeRef.toUpperCase() !== ref.toUpperCase()
    && x.elementTypeRef.toUpperCase() !== String(container || '').toUpperCase() && sameFamily(x.elementTypeRef, ref))?.elementTypeRef || null
  const where = ref => <Where foundIn={whereOf(ref)} container={container} />
  const RemoveBtn = ({ etRef: ref }) => (
    <Button size="sm" variant="outline-danger" className="ms-auto flex-shrink-0" style={btn} data-testid="diff-remove"
      onClick={() => removeEt(ref)} title={`Remove ${ref} from ${posRef}`}>Remove</Button>
  )

  return (
    <div className={paneClass} style={paneStyle}>
      {header}
      <FormStrip formCaptures={formCaptures} base={base} />
      {paintBar}

      {/* A changed product inside a SHARED wrapper: one wrapper cannot hold both states. */}
      {divergence && (
        <div className="mb-2 px-2 py-1 rounded" data-testid="divergence" style={{ background: C.attnTint, fontSize: 10, color: C.attnInk }}>
          <div className="d-flex align-items-center gap-1 flex-wrap">
            <MaterialIcon name="warning" size={11} /> <EtPill etRef={divergence.wrapper} />
            {divergence.changedPositions.map(p => <PosPill key={p} posRef={p} />)}
            <MaterialIcon name="call_split" size={11} title="changed by the Form; these keep it:" />
            {divergence.unchangedPositions.map(p => <PosPill key={p} posRef={p} />)}
          </div>
          <div className="d-flex gap-1 mt-1">
            <Button size="sm" variant="outline-warning" style={btn} onClick={() => setForking(true)}
              title={`${divergence.wrapper} is shared: the Form changed it for ${divergence.changedPositions.join(', ')} but not ${divergence.unchangedPositions.join(', ')}`}>
              <MaterialIcon name="call_split" size={10} /> Fork it for {posRef}
            </Button>
            <Button size="sm" variant="outline-secondary" style={btn} onClick={() => dismissDivergence(divergence.wrapper)}>Keep shared</Button>
          </div>
        </div>
      )}

      {/* ~ a swapped code: the new line, the old one struck underneath. */}
      {swaps.map(c => {
        const hasNew = holds(c.toEt), hasOld = holds(c.fromEt)
        const who = [posRef, ...(c.changing || [])].join(', ')
        return (
          <div key={`s${c.fromEt}${c.toEt}`} className="py-1 border-bottom" data-testid="diff-group" data-kind="swap" data-trace={registerTrace(c.trace)}>
            <div style={row} title={changedTip}>
              <Gutter mark="~" tip={changedTip} /><Status status={hasNew ? 'present' : 'addable'} />
              <span style={codeStyle}><CopyText text={c.toCode || c.toEt} /></span>
              <span className="ms-auto" /><EtPill etRef={c.toEt} />{hasNew && where(c.toEt)}
            </div>
            <div style={row}>
              <Gutter /><span style={{ width: 14 }} />
              <span style={{ ...codeStyle, ...old, fontWeight: 400, color: C.muted }}>{c.fromCode || c.fromEt}</span>
              <span className="ms-auto" /><EtPill etRef={c.fromEt} style={old} />
              {hasOld && hasNew && <RemoveBtn etRef={c.fromEt} />}
            </div>
            {hasOld && !hasNew && (
              <div className="d-flex gap-1 mt-1">
                <Button size="sm" variant="primary" style={btn} data-testid="diff-swap" onClick={() => applyFormChange(c, posRef, 'swap')}
                  title={`Replace ${c.fromEt} with ${c.toEt} in ${who}`}>
                  <MaterialIcon name="swap_horiz" size={12} /> Replace {c.fromEt}
                </Button>
                <Button size="sm" variant="outline-primary" style={btn} data-testid="diff-add" onClick={() => addNow([c.toEt], 'usual')}
                  title={`Add ${c.toEt} and keep ${c.fromEt}`}>
                  <MaterialIcon name="add" size={12} /> Add {c.toEt}
                </Button>
              </div>
            )}
          </div>
        )
      })}

      {/* ~ a new code for an ElementType the recipe holds: update it, or add a copy. */}
      {respecs.map(c => {
        const next = forkRefFor(c.fromEt) || `${c.fromEt}-2`
        const also = c.outsideForm?.length ? ` Also changes ${c.outsideForm.join(', ')} (not in the Form).` : ''
        return (
          <div key={`r${c.fromEt}${c.toCode}`} className="py-1 border-bottom" data-testid="diff-group" data-kind="respec" data-trace={registerTrace(c.trace)}>
            <div style={row} title={changedTip}>
              <Gutter mark="~" tip={changedTip} /><Status status="addable" />
              <span style={codeStyle}><CopyText text={c.toCode} /></span>
              <span className="ms-auto" /><EtPill etRef={next} preview />{where(c.fromEt)}
            </div>
            <div style={row}>
              <Gutter /><span style={{ width: 14, opacity: 0.55 }}><Status status="present" /></span>
              <span style={{ ...codeStyle, ...old, fontWeight: 400, color: C.muted }}>{c.fromCode || ''}</span>
              <span className="ms-auto" /><EtPill etRef={c.fromEt} style={{ opacity: 0.55 }} />{where(c.fromEt)}
            </div>
            <div className="d-flex gap-1 mt-1">
              {c.canUpdate && (
                <Button size="sm" variant="primary" style={btn} data-testid="diff-update" onClick={() => applyFormChange(c, posRef, 'update')}
                  title={`Give ${c.fromEt} the code ${c.toCode}: every recipe using it gets the new product.${also}`}>
                  <MaterialIcon name="edit" size={12} /> Update {c.fromEt}
                </Button>
              )}
              <Button size="sm" variant={c.canUpdate ? 'outline-primary' : 'primary'} style={btn} data-testid="diff-fork"
                onClick={() => applyFormChange(c, posRef, 'fork')}
                title={`A copy of ${c.fromEt} carrying ${c.toCode}, for ${[posRef, ...(c.changing || [])].join(', ')}${c.notChanging?.length ? `; ${c.notChanging.join(', ')} keep ${c.fromEt}` : ''}`}>
                <MaterialIcon name="add" size={12} /> Add {next}
              </Button>
              {!c.canUpdate && (
                <Button size="sm" variant="outline-secondary" style={btn} data-testid="diff-new" onClick={() => setCreatingFor(c)}>New ElementType…</Button>
              )}
            </div>
          </div>
        )
      })}

      {/* − a code gone from the Form that never had an ElementType: nothing to remove. */}
      {lonelyDrops.map(d => (
        <div key={`d${d.fromCode}`} className="py-1 border-bottom" data-testid="gone-code" style={row} data-trace={registerTrace(d.trace)}>
          <Gutter mark="−" tip={since ? `Gone since ${since}` : 'No longer in the Form'} /><span style={{ width: 14 }} />
          <span style={{ ...codeStyle, ...old, fontWeight: 400, color: C.muted }}>{d.fromCode}</span>
        </div>
      ))}

      {/* − gone from the Form, still in the recipe. */}
      {gone.map(g => {
        const withIt = assoc.get(g.ref.toLowerCase()) || []
        return (
          <div key={`g${g.ref}`} className="py-1 border-bottom" data-testid="gone-row" data-trace={registerTrace(g.trace)}>
            <div style={row}>
              <Gutter mark="−" tip={since ? `Gone since ${since}` : 'No longer in the Form'} />
              <span style={{ width: 14 }} />
              <span style={{ ...codeStyle, ...old, fontWeight: 400, color: C.muted }}>{g.code || ''}</span>
              <span className="ms-auto" /><EtPill etRef={g.ref} style={old} />
              <RemoveBtn etRef={g.ref} />
            </div>
            {withIt.length > 0 && (
              <div className="d-flex align-items-center gap-1 text-muted ps-3" style={{ fontSize: 10 }}
                title={`With it in all ${withIt[0].support} positions that use it: check whether it goes too`}>
                <MaterialIcon name="link" size={11} />{withIt.map(y => <EtPill key={y.ref} etRef={y.ref} style={{ opacity: 0.7 }} />)}
              </div>
            )}
          </div>
        )
      })}

      {/* The Form asks for these and nobody has said what they are: a question, not a tick. */}
      {pending.map(p => {
        const top = candsByCode.get(p.code)
        return (
          <div key={p.code} data-testid="pending-card" style={card(GRAPHITE)}>
            <div style={row}>
              <Gutter /><span style={codeStyle} title={`${p.manufacturer || 'no manufacturer'}${p.note ? ` · ${p.note}` : ''}`}><CopyText text={p.code} /></span>
            </div>
            {top && picking !== p.code && (
              <>
                <div className="d-flex align-items-center gap-1 mt-1" data-testid="reuse-row" style={{ fontSize: 10 }}>
                  <EtPill etRef={top.ref} />
                  <span className="text-muted text-truncate" title={top.description || WHY[top.why]}>{WHY[top.why]}</span>
                  <Button size="sm" variant="primary" className="ms-auto" style={btn} data-testid="reuse-use"
                    onClick={() => mergePending(p, top.ref)} title={`"${p.code}" IS ${top.ref}: link them`}>Use</Button>
                </div>
                <div className="d-flex align-items-center gap-1 my-1 text-muted" style={{ fontSize: 10 }}>
                  <span className="flex-grow-1 border-top" /> or create <span className="flex-grow-1 border-top" />
                </div>
              </>
            )}
            {picking === p.code ? (
              <ETRefSelect placeholder="Which ElementType is it?" onCommit={ref => ref && mergePending(p, ref)} onCancel={() => setPicking(null)} />
            ) : (
              <div className="d-flex gap-1 mt-1">
                <Button size="sm" variant={top ? 'outline-primary' : 'primary'} style={btn} data-testid="pending-create" onClick={() => setCreating(p)}>
                  <MaterialIcon name="add" size={12} /> Create
                </Button>
                <Button size="sm" variant="outline-secondary" style={btn} data-testid="pending-existing" onClick={() => setPicking(p.code)}>
                  <MaterialIcon name="search" size={12} /> Existing
                </Button>
              </div>
            )}
          </div>
        )
      })}

      {/* No wrapper yet (a blank position, usually): offer one, the fitting kind filled. */}
      {toAdd.length > 0 && !container && !hasDesign && (
        <div className="my-1 d-flex align-items-center gap-1" data-testid="no-wrapper" style={{ fontSize: 10 }}>
          <MaterialIcon name="inventory_2" size={13} className="text-muted" title={`${posRef} has no wrapper`} />
          {['DL', 'LIN'].sort((a, b) => (a === wrapperKind ? -1 : b === wrapperKind ? 1 : 0)).map(k => (
            <Button key={k} size="sm" variant={k === wrapperKind ? 'primary' : 'outline-secondary'} style={btn}
              title={k === wrapperKind ? `A ${k} wrapper fits these products` : `A ${k} wrapper`}
              onClick={() => addWrapper(posRef, k, { name: formCaptures.contextByPosition?.[posRef]?.ProductName || null })}>+ {k}</Button>
          ))}
        </div>
      )}

      {/* The last one-click add, with its way back. */}
      {added && (
        <div className="my-1 px-2 py-1 rounded d-flex align-items-center gap-2" data-testid="form-added"
          style={{ background: C.accentTint, fontSize: 10, color: C.accentInk }}>
          <MaterialIcon name="done" size={12} />
          <span className="text-truncate">Added {added.refs.length === 1 ? added.refs[0] : `${added.refs.length} products`}</span>
          <Button variant="link" size="sm" className="p-0 ms-auto" style={{ fontSize: 10 }}
            onClick={() => { undo(); setLastAdded(null) }}>Undo</Button>
        </div>
      )}

      {toAdd.length > 1 && (
        <div className="d-flex align-items-center gap-1 my-1">
          <Button size="sm" variant="primary" style={btn} data-testid="add-all"
            onClick={() => addNow(toAdd.map(m => m.elementTypeRef), 'usual')}
            title="Each where it usually goes: inside the wrapper if that is where it sits in other recipes, else position level">
            <MaterialIcon name="playlist_add" size={12} /> Add all {toAdd.length}
          </Button>
        </div>
      )}

      {/* Missing: one click adds it, its usual place the filled button. */}
      {toAdd.map(e => {
        const ref = e.elementTypeRef
        const usual = usualPlace(ref)
        const { inside, outside } = placeCounts(ref)
        const opts = [...(container ? [['internal', 'inventory_2', container]] : []), ['position', 'tab_unselected', 'Position']]
          .sort((a, b) => (a[0] === usual ? -1 : b[0] === usual ? 1 : 0))
        return (
          <div key={ref} data-testid="missing-card" style={card(C.accent)}>
            <div style={row}>
              <Gutter mark={plus(ref)} tip={markTip(ref)} />
              <span style={codeStyle} title={e.manufacturer || undefined}><CopyText text={e.code || ref} /></span>
              <EtPill etRef={ref} />
              <span className="ms-auto"><Status status="addable" note={diverges(ref) ? 'The Form and the recipe disagree about where this is used' : null} /></span>
            </div>
            <OldCode etRef={ref} />
            <div className="d-flex align-items-center gap-1 mt-1">
              {replaceable(ref) && (
                <Button size="sm" variant="primary" style={btn} data-testid="missing-replace"
                  onClick={() => applyFormChange({ kind: 'swap', fromEt: replaceable(ref), toEt: ref, toCode: e.code, changing: [] }, posRef, 'swap')}
                  title={`Put ${ref} where ${replaceable(ref)} is in ${posRef}`}>
                  <MaterialIcon name="swap_horiz" size={12} /> Replace {replaceable(ref)}
                </Button>
              )}
              {opts.map(([w, icon, label]) => (
                <Button key={w} size="sm" variant={w === usual ? 'primary' : 'outline-primary'} style={btn}
                  aria-label={w === 'internal' ? `Add ${ref} inside ${container}` : `Add ${ref} at position level`}
                  title={w === 'internal' ? `Add ${ref} inside ${container}` : `Add ${ref} at position level`}
                  onClick={() => addNow([ref], w)}>
                  <MaterialIcon name={icon} size={12} /> {label}
                </Button>
              ))}
              {(inside + outside) > 0 && (
                <span className="ms-auto text-muted d-inline-flex align-items-center gap-1" style={{ fontSize: 10 }}>
                  {container && <span title={`In wrapper: ${inside}`}><MaterialIcon name="inventory_2" size={11} />{inside}</span>}
                  {container && '·'}
                  <span title={`At position: ${outside}`}><MaterialIcon name="tab_unselected" size={11} />{outside}</span>
                </span>
              )}
            </div>
          </div>
        )
      })}

      {/* Present. */}
      {lines.map(e => (
        <div key={e.elementTypeRef} className="py-1 border-bottom">
        <div data-testid="form-line" style={row}>
          <Gutter mark={plus(e.elementTypeRef)} tip={markTip(e.elementTypeRef)} />
          <Status status="present" note={diverges(e.elementTypeRef) ? 'The Form and the recipe disagree about where this is used: hover the ElementType' : null} />
          <span style={codeStyle} title={e.manufacturer || undefined}><CopyText text={e.code || e.elementTypeRef} /></span>
          <span className="ms-auto" />
          <UsagePopover etRef={e.elementTypeRef} placement="left" diverges={diverges(e.elementTypeRef)}>
            <span><EtPill etRef={e.elementTypeRef} /></span>
          </UsagePopover>
          <Where foundIn={e.foundIn} container={container} />
        </div>
        <OldCode etRef={e.elementTypeRef} />
        </div>
      ))}

      {/* Derived detail. The Form never mentions it, and that is correct. */}
      {extra.length > 0 && (
        <div className="mt-2" data-testid="not-from-form">
          <div className="d-flex align-items-center gap-1">
            <SectionLabel className="mb-0">Not from the Form</SectionLabel>
            <Button size="sm" variant="link" className="p-0 ms-auto" style={{ fontSize: 10 }} onClick={() => setShowExtra(v => !v)}
              data-testid="extra-toggle">{showExtra ? 'hide' : `show ${extra.length}`}</Button>
          </div>
          {showExtra && extra.map(x => (
            <div key={x.elementTypeRef} style={row} className="py-1">
              <EtPill etRef={x.elementTypeRef} />
              {diverges(x.elementTypeRef) && <MaterialIcon name="warning" size={11} style={{ color: C.attnInk }} title="The Form and the recipe disagree about where this is used" />}
              <span className="ms-auto" /><Where foundIn={whereOf(x.elementTypeRef)} container={container} />
            </div>
          ))}
        </div>
      )}

      {/* Reuses the import's own modal, with the import's own evidence. */}
      {creating && (
        <NewETModal
          show
          onHide={() => setCreating(null)}
          contextLabel={`for ${creating.code}`}
          draftKey={`pending::${posRef}::${creating.code}`}
          importContext={{ code: creating.code, manufacturer: creating.manufacturer, note: creating.note, positionTypes: [creating.formRef || posRef], rowCount: 1 }}
          prefill={{ manufacturer: creating.manufacturer, productCode: creating.code, description: creating.note }}
          onCreated={etRef => { promotePendingCapture(posRef, creating.code, etRef); setCreating(null) }}
        />
      )}
      {creatingFor && (
        <NewETModal
          show
          onHide={() => setCreatingFor(null)}
          contextLabel={`for ${creatingFor.toCode}`}
          draftKey={`diff::${posRef}::${creatingFor.toCode}`}
          importContext={{ code: creatingFor.toCode, manufacturer: creatingFor.maker, positionTypes: [posRef, ...(creatingFor.changing || [])], rowCount: 1 }}
          prefill={{ manufacturer: creatingFor.maker, productCode: creatingFor.toCode }}
          onCreated={etRef => { applyFormChange(creatingFor, posRef, 'swap', { toEt: etRef }); setCreatingFor(null) }}
        />
      )}

      {/* duplicateET repoints this position onto the fork; onDuplicated fires only on a real fork. */}
      <DuplicateETModal
        show={forking}
        etRef={divergence?.wrapper}
        posRef={posRef}
        onClose={() => setForking(false)}
        onDuplicated={() => dismissDivergence(divergence.wrapper)}
      />
    </div>
  )
}
