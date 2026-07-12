import React, { useMemo, useState } from 'react'
import { Button, Dropdown, Form, Modal } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import IconButton from './IconButton'
import FormContext from './FormContext'
import { loadVisible, saveVisible, clearVisible, visibleColumns } from '../utils/formColumns'
import BulkApplyModal from './BulkApplyModal'
import DuplicateETModal from './DuplicateETModal'
import UsagePopover from './UsagePopover'
import { compareFormToRecipe, associations, formWorklist, formPending, pendingCandidates } from '../utils/formSpec'
import { divergingRefs } from '../utils/usage'
import NewETModal from './NewETModal'
import ETRefSelect from './ETRefSelect'
import { ConceptHint, CONCEPTS } from './ConceptCard'
import TutorialHint from '../tutorial/TutorialHint'
import { findProductET, stampPlan } from '../utils/productCodes'
import { ACTION_ICONS } from '../utils/entityStyle'
import { ago } from '../utils/ago'

/**
 * FormSpecPane — the Form's spec beside the recipe it produced.
 *
 * Lives INLINE in the recipe surface, never in a modal: you compare while you work.
 * Reads left-to-right as pick-and-place — the Form on the left of the rule is the
 * source, the recipe on the right is where things land.
 *
 * The governing principle (see formSpec.js): the Form is the TRUTH about WHICH
 * products a position uses, and silent about everything else. So a Form ET absent
 * from the recipe is a defect; a recipe row absent from the Form is derived detail
 * — connectors, kits, strain reliefs — and is never flagged red.
 *
 * The context columns at the top are the same ones the import wizard shows above
 * the paint surface (ProductName / Finish / FurtherInfo / …). They keep you grounded
 * in what the sheet actually said about this position.
 */

const LABEL = {
  fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em',
}
const KIND_LABEL = { wrapper: 'the wrapper', connector: 'connector', contract: 'contract item', internal: 'inside the wrapper', other: '' }

function SectionLabel({ children, className = '' }) {
  return <div className={`fw-semibold text-muted mb-1 ${className}`} style={LABEL}>{children}</div>
}

const Ref = ({ children }) => (
  <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{children}</span>
)

/** Where a matched ET was found. The Form never said, so this is information, not judgement. */
function FoundIn({ foundIn, container }) {
  const where = foundIn === 'position' ? 'at PositionType Level'
    : foundIn === 'internal' ? `inside ${container || 'the wrapper'}`
    : 'at PositionType Level and inside the wrapper'
  return <span className="text-muted" style={{ fontSize: 10 }}>{where}</span>
}

/**
 * Which workbook is attached, and when. Re-import and Detach used to shout from here as two
 * link buttons; they are rare, deliberate acts and now live in the ⋮ menu, which leaves this
 * a single quiet line of provenance.
 */
function FormStrip({ formCaptures }) {
  const when = ago(formCaptures.importedAt)
  return (
    <div className="d-flex align-items-center gap-1 mb-2 text-muted" style={{ fontSize: 10 }}>
      <MaterialIcon name="description" size={11} style={{ flexShrink: 0 }} />
      <span className="text-truncate" style={{ minWidth: 0 }}
        title={`${formCaptures.source?.name || 'Form template'}${formCaptures.source?.sheet ? ` · ${formCaptures.source.sheet}` : ''}`}>
        {formCaptures.source?.name || 'Form template'}
        {when && <> · {when}</>}
      </span>
    </div>
  )
}

/**
 * A Form row's state, as an icon that is always there.
 *
 * It used to be carried by a `title` and a line of small red text, so you could not scan
 * the column — you had to read it. The split that matters is ERROR vs QUESTION: a product
 * the recipe lacks is a defect; a product with no ElementType is not wrong, it is unanswered,
 * and the tool cannot even offer to add it. Different icons, different colours, on purpose.
 */
const ROW_STATUS = {
  present:  { icon: ACTION_ICONS.complete, color: '#198754', title: 'in the recipe' },
  addable:  { icon: 'add_circle', color: '#0d6efd', title: 'already an ElementType — tick to add it' },
  missing:  { icon: 'error', color: '#dc3545', title: 'missing from the recipe' },
  question: { icon: 'help', color: '#997404', title: 'no ElementType yet — nothing can be added until it has one' },
}
function RowStatus({ status }) {
  const s = ROW_STATUS[status]
  if (!s) return null
  return (
    <MaterialIcon name={s.icon} size={13} title={s.title}
      style={{ color: s.color, flexShrink: 0, marginTop: 1 }} />
  )
}

/**
 * One face of the reference rail: an icon, its count, and whether it is open.
 *
 * A zero-count section still shows, greyed and inert — "there are no orphans" is worth
 * knowing, and a rail that changes shape as you move between positions is a rail you cannot
 * learn.
 */
function RailToggle({ id, icon, count, open, onToggle, title, tone }) {
  const empty = count === 0
  const on = open.has(id)
  return (
    <button type="button" title={`${title}${empty ? ' — none' : ` (${count})`}`}
      aria-label={title} aria-pressed={on} disabled={empty}
      onClick={() => onToggle(id)}
      className="btn btn-sm d-inline-flex align-items-center gap-1"
      style={{
        fontSize: 10, padding: '1px 6px', borderRadius: 10, lineHeight: 1.4,
        background: on ? '#e7f1ff' : 'transparent',
        border: `1px solid ${on ? '#b6d4fe' : '#e9ecef'}`,
        color: empty ? '#ced4da' : tone || '#6c757d',
        opacity: empty ? 0.7 : 1,
      }}>
      <MaterialIcon name={icon} size={12} />
      {count}
    </button>
  )
}

/**
 * The ⋮ menu. Re-import and Detach are rare, deliberate acts — they do not deserve two link
 * buttons shouting from the strip — but they must be reachable from EVERY state the pane can
 * be in, including the one where the Form is silent about this position. Hence one component,
 * rendered in both branches.
 */
function PaneMenu({ onColumns, onReimport, onDetach, columnsDisabled }) {
  return (
    <Dropdown align="end">
      <Dropdown.Toggle as={IconButton} icon={ACTION_ICONS.more} size={14}
        title="Form template options" className="p-0 text-muted" />
      <Dropdown.Menu style={{ fontSize: 11 }}>
        {onColumns && (
          <>
            <Dropdown.Item onClick={onColumns} disabled={columnsDisabled}>
              <MaterialIcon name="notes" size={12} /> Show columns…
            </Dropdown.Item>
            <Dropdown.Divider />
          </>
        )}
        <Dropdown.Item onClick={onReimport}>
          <MaterialIcon name="sync" size={12} /> Re-import
        </Dropdown.Item>
        <Dropdown.Item onClick={onDetach} className="text-danger">
          <MaterialIcon name={ACTION_ICONS.delete} size={12} /> Detach
        </Dropdown.Item>
      </Dropdown.Menu>
    </Dropdown>
  )
}

/**
 * Which of the Form's columns to show. Every column the sheet carries is captured, so this
 * never needs a re-import — it is a display preference, and it persists per project.
 */
function ColumnPicker({ show, onHide, available, shown, onChange, onReset }) {
  const toggle = c => onChange(shown.includes(c) ? shown.filter(x => x !== c) : [...shown, c])
  return (
    <Modal show={show} onHide={onHide} size="sm" centered>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 14 }}>
          <MaterialIcon name="notes" size={16} /> Show columns
        </Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ maxHeight: 380, overflowY: 'auto' }}>
        <div className="text-muted mb-2" style={{ fontSize: 11 }}>
          Everything the Form carries for this position. Ticking one shows it here — no
          re-import needed.
        </div>
        {available.map(c => (
          <Form.Check key={c} type="checkbox" id={`col-${c}`}
            checked={shown.includes(c)} onChange={() => toggle(c)}
            label={<span style={{ fontSize: 11 }}>{c}</span>} />
        ))}
      </Modal.Body>
      <Modal.Footer>
        <Button size="sm" variant="link" className="text-muted me-auto" style={{ fontSize: 11 }}
          onClick={onReset} title="Back to the columns chosen at import">
          Reset to import defaults
        </Button>
        <Button size="sm" variant="primary" onClick={onHide}>Done</Button>
      </Modal.Footer>
    </Modal>
  )
}

const WHY = {
  spec:   'the Product Spec already names it for this code',
  recipe: 'already in this recipe, not accounted for by the Form',
  reuse:  'the same product elsewhere in the spec',
}

export default function FormSpecPane({ posRef, embedded = false }) {
  const recipes = useStore(s => s.recipes)
  const psRows = useStore(s => s.psRows)
  const elementTypes = useStore(s => s.elementTypes)
  const updatePSRow = useStore(s => s.updatePSRow)
  const containerETRefs = useStore(s => s.containerETRefs)
  const formCaptures = useStore(s => s.formCaptures)
  const addRecipeRow = useStore(s => s.addRecipeRow)
  const removeRecipeRow = useStore(s => s.removeRecipeRow)
  const clearFormCaptures = useStore(s => s.clearFormCaptures)
  const dismissDivergence = useStore(s => s.dismissDivergence)
  const requestScreen = useStore(s => s.requestScreen)
  const setActivePosition = useStore(s => s.setActivePosition)
  const requestPaletteTab = useStore(s => s.requestPaletteTab)
  const promotePendingCapture = useStore(s => s.promotePendingCapture)
  const projectId = useStore(s => s.projectId)

  const [ticked, setTicked] = useState(() => new Set())
  const [dest, setDest] = useState('auto')      // 'position' | 'internal'
  const [preview, setPreview] = useState(null)
  const [forking, setForking] = useState(false)
  const [creating, setCreating] = useState(null)   // a pending Form product with no ElementType
  const [picking, setPicking] = useState(null)     // ...whose ElementType you are choosing by hand

  /**
   * The pane does ONE job — what the Form asks for vs what the recipe has — and everything
   * else in it is reference: the sheet's own columns, rows the Form never mentioned, codes
   * that have left it. Reference starts CLOSED, behind a rail of counted icons, so the
   * default view is the comparison and nothing else.
   */
  const [open, setOpen] = useState(() => new Set())
  const [choosingCols, setChoosingCols] = useState(false)
  const toggleSection = id => setOpen(o => {
    const next = new Set(o)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const captured = formCaptures?.byPosition?.[posRef] ?? []
  const context = formCaptures?.contextByPosition?.[posRef] ?? {}

  /**
   * Which of the Form's columns to show. The import captures every column the sheet has;
   * which of them appear here is a display preference you can change without re-importing.
   *
   * A capture made before this existed has neither list — for those, everything captured is
   * both available and default, which is exactly what it used to show. `colPref` is null
   * when this project has never been asked, and an empty array is a real answer ("show me
   * none"), so the two must not be conflated.
   */
  const [colPref, setColPref] = useState(() => loadVisible(projectId))
  const allCols = formCaptures?.contextColumns ?? Object.keys(context)
  const defaultCols = formCaptures?.contextDefaults ?? allCols
  const shownCols = useMemo(
    () => visibleColumns({ available: allCols, defaults: defaultCols, chosen: colPref })
      .filter(c => context[c] != null && String(context[c]).trim() !== ''),
    [allCols, defaultCols, colPref, context]
  )
  /** Only columns this position actually carries are worth offering. */
  const offerCols = useMemo(
    () => allCols.filter(c => context[c] != null && String(context[c]).trim() !== ''),
    [allCols, context]
  )
  function chooseCols(next) {
    setColPref(next)
    saveVisible(projectId, next)
  }
  const orphanRefs = formCaptures?.orphansByPosition?.[posRef] ?? []
  // Products the Form asks for here that nobody has named yet. Staging is incremental,
  // so these are what you left for later. Without them the pane's promise — "what the
  // Form asks for vs what the recipe has" — is false for exactly the unfinished part.
  const pending = formPending(formCaptures, posRef)

  /**
   * The shopping list. A product is (manufacturer, code); if the Product Spec
   * already names an ElementType for that pair, THAT is what to add — the spec is
   * authoritative and may have moved on since the import. The captured ET is only
   * the fallback.
   */
  const formEts = useMemo(() => captured.map(e => {
    const inSpec = findProductET(psRows, e.manufacturer, e.code)
    return { ...e, elementTypeRef: inSpec || e.elementTypeRef, inSpec: !!inSpec }
  }), [captured, psRows])

  const result = useMemo(
    () => compareFormToRecipe(recipes, posRef, formEts, containerETRefs, { orphanRefs }),
    [recipes, posRef, formEts, containerETRefs, orphanRefs]
  )

  /**
   * Every ET whose Form and recipe disagree about WHERE it is used. One pass for the whole
   * set, so the panel can mark them; the popover still explains any one you ask about.
   */
  const diverging = useMemo(() => divergingRefs({ recipes, formCaptures }), [recipes, formCaptures])
  const diverges = ref => diverging.has(String(ref).toLowerCase())

  // "X consistently has Y" — learned, advisory, only consulted for orphans.
  const assoc = useMemo(
    () => (result.orphaned.length ? associations(recipes, formCaptures) : new Map()),
    [recipes, formCaptures, result.orphaned.length]
  )

  /**
   * The ElementType each pending product probably already IS. `result.extra` is the good
   * bit: an ET the recipe holds and the Form cannot account for is very likely the answer
   * to a Form product that has no ET — and no amount of text matching would ever find it.
   */
  const candsByCode = useMemo(
    () => new Map(pending.map(p => [
      p.code, pendingCandidates(p, { extra: result.extra, psRows, elementTypes }),
    ])),
    [pending, result.extra, psRows, elementTypes]
  )

  /**
   * "This Form product IS that ElementType." Links it, and — where the spec row is empty —
   * stamps the identity on so the link survives a re-import. See stampPlan for why each
   * branch is what it is; `taken` STEERS rather than warns, because the pane re-resolves
   * captured entries through findProductET on every render and a contradicting link would
   * simply not stick.
   */
  async function mergePending(p, etRef) {
    let ref = etRef
    const plan = stampPlan(psRows, ref, p.manufacturer, p.code, {
      isContainer: containerETRefs.has(String(ref).toLowerCase()),
    })

    if (plan.action === 'taken') {
      if (!window.confirm(
        `The Product Spec says "${p.code}" is ${plan.otherRef}, not ${ref}.\n\n` +
        `Use ${plan.otherRef} instead? (Linking it to ${ref} would not stick — the spec wins.)`
      )) return
      ref = plan.otherRef
    } else if (plan.action === 'conflict') {
      if (!window.confirm(
        `${ref} is already ${plan.current.manufacturer || 'no maker'} / ${plan.current.code} in the Product Spec.\n\n` +
        `Link "${p.code}" to it anyway? The spec row is left exactly as it is.`
      )) return
    } else if (plan.action === 'stamp') {
      updatePSRow(ref, plan.updates)
    }

    await promotePendingCapture(posRef, p.code, ref)
    setPicking(null)
  }

  /** The next position the Form is not yet satisfied on. */
  const nextUnreconciled = useMemo(() => {
    if (embedded) return null   // ReviewModal owns its own prev/next
    const work = formWorklist(recipes, formCaptures, containerETRefs).map(w => w.posRef)
    if (work.length === 0) return null
    const at = work.indexOf(posRef)
    return work[(at + 1) % work.length] === posRef ? null : work[(at + 1) % work.length]
  }, [embedded, recipes, formCaptures, containerETRefs, posRef])

  const handleReimport = () => requestScreen('product-code-import')
  const handleDetach = () => {
    if (window.confirm('Detach the Form template? The recipes stay; only the Form comparison goes.')) {
      clearFormCaptures()
    }
  }

  // Stage ① has not happened. Say so once, clearly, and offer the one thing to do.
  if (!formCaptures) {
    if (embedded) return null   // the Review modal is not the place to start a workflow
    return (
      <div className="border-start ps-3" style={{ width: 340, flexShrink: 0, overflowY: 'auto' }}>
        <SectionLabel>Form spec</SectionLabel>
        <div className="px-3 py-4 rounded text-center"
          style={{ background: '#f8f9fa', border: '1px dashed #ced4da' }}>
          <MaterialIcon name="auto_fix_high" size={28} style={{ color: '#adb5bd' }} />
          <div className="fw-semibold mt-2" style={{ fontSize: 12 }}>No Form template yet</div>
          <div className="text-muted mt-1 mb-3" style={{ fontSize: 11, lineHeight: 1.5 }}>
            Import the Form and this panel shows, for every position, exactly which products it
            asks for and which are already in the recipe.
          </div>
          <Button size="sm" variant="primary" style={{ fontSize: 11 }} onClick={handleReimport}>
            Import the Form template →
          </Button>
          <div className="text-muted mt-3" style={{ fontSize: 10, lineHeight: 1.6 }}>
            <div><strong>①</strong> Identify codes &nbsp;<strong>②</strong> Assign ElementTypes</div>
            <div><strong>③</strong> Add them here, where they belong</div>
          </div>
        </div>
      </div>
    )
  }
  // A position with ONLY pending products is not a position the Form is silent about.
  if (formEts.length === 0 && result.orphaned.length === 0 && pending.length === 0) {
    return (
      <div className="border-start ps-3" style={{ width: 340, flexShrink: 0, overflowY: 'auto' }}>
        <div className="d-flex align-items-center gap-1">
          <SectionLabel className="mb-0">Form spec</SectionLabel>
          <span className="ms-auto">
            <PaneMenu onReimport={handleReimport} onDetach={handleDetach} />
          </span>
        </div>
        <FormStrip formCaptures={formCaptures} />
        <div className="text-muted fst-italic" style={{ fontSize: 11 }}>
          The Form says nothing about {posRef}.
        </div>
        {/* Silence is not an answer. It may well be a technical-only position — so offer
            the thing that settles it: what do comparable positions actually do? */}
        <div className="text-muted mt-1" style={{ fontSize: 10, lineHeight: 1.5 }}>
          It may be a technical-only position. Compare it with the ones the Form does describe.
        </div>
        <Button size="sm" variant="outline-secondary" className="mt-2" style={{ fontSize: 10 }}
          onClick={() => requestPaletteTab('similar')}
          title={`Show positions like ${posRef} — same family, tags and recipe`}>
          <MaterialIcon name="group" size={12} /> See positions like this →
        </Button>
        {nextUnreconciled && (
          <Button size="sm" variant="outline-primary" className="mt-2 ms-2" style={{ fontSize: 10 }}
            onClick={() => setActivePosition(nextUnreconciled)}>
            Next unreconciled: {nextUnreconciled} →
          </Button>
        )}
      </div>
    )
  }

  const { matched, missing, orphaned, extra, container, coverage } = result

  // The fork question, if it is about the wrapper this position actually uses.
  const divergence = (formCaptures.divergence || []).find(
    d => !d.consistent && container && d.wrapper === container
  ) || null
  // The Form carries no slot, so the destination is genuinely unknown. Default to
  // position level; the wrapper is offered whenever one resolves.
  const effectiveDest = dest === 'auto' ? 'position' : dest
  const section = effectiveDest === 'internal' ? 'dl_internal' : 'position'
  // Say where a row will land in the same words everywhere: the row, its tooltip, and
  // the destination chooser. `container` is null when this position has no wrapper —
  // honestly, and the store refuses an internal row without one.
  const destLabel = effectiveDest === 'internal' && container
    ? `inside ${container}`
    : 'at PositionType Level'

  function toggle(ref) {
    setTicked(t => {
      const next = new Set(t)
      next.has(ref) ? next.delete(ref) : next.add(ref)
      return next
    })
  }

  /** Build a plan in the shape BulkApplyModal already renders. */
  function buildPlan() {
    const actions = [...ticked].map(ref => ({
      posRef, ref, action: 'add',
      section: effectiveDest, rawSection: section,
      container, need: 1, have: 0, rows: [], foundAt: null,
    }))
    const counts = { add: actions.length }
    return { actions, counts, byPosition: new Map([[posRef, actions]]) }
  }

  function applyPlan() {
    // One undo step for the whole batch: only the first add records history.
    preview.actions.forEach((a, i) => {
      const entry = formEts.find(e => e.elementTypeRef === a.ref)
      addRecipeRow(posRef, a.rawSection, {
        elementTypeRef: a.ref,
        // Stage ③: you added this, deliberately, from the Form. The badge says so.
        _origin: 'form', _formCode: entry?.code ?? null, _formNote: entry?.note ?? null,
      }, { recordHistory: i === 0 })
    })
    setPreview(null)
    setTicked(new Set())
  }

  const allTicked = missing.length > 0 && ticked.size === missing.length

  return (
    <div className="border-start ps-3" style={{ width: 340, flexShrink: 0, overflowY: 'auto' }}>
      {/* Where this came from */}
      <div className="d-flex align-items-center gap-1 mb-1">
        <SectionLabel className="mb-0">Form spec</SectionLabel>
        <ConceptHint concept={CONCEPTS.INTENT} size={11}
          title="What the Form asks for vs what the recipe has" />
        <TutorialHint id="form-pane" size={12} />
        <span className="ms-auto text-muted" style={{ fontSize: 10 }}
          title={pending.length > 0 ? `${pending.length} product${pending.length === 1 ? '' : 's'} still need an ElementType before they can be added` : ''}>
          {coverage.present}/{coverage.total + pending.length} present
        </span>
        <PaneMenu onColumns={() => setChoosingCols(true)} columnsDisabled={offerCols.length === 0}
          onReimport={handleReimport} onDetach={handleDetach} />
      </div>
      <FormStrip formCaptures={formCaptures} />

      {/* The reference rail. Everything that is NOT the comparison lives behind one of
          these, closed, with its count on the face — so you can see there is something
          there without it taking up the panel. */}
      <div className="d-flex align-items-center gap-1 mb-2">
        <RailToggle id="context" icon="notes" count={shownCols.length} open={open} onToggle={toggleSection}
          title="What the Form itself says about this position" />
        <RailToggle id="extra" icon={ACTION_ICONS.suggest} count={extra.length} open={open} onToggle={toggleSection}
          title="In the recipe, not specified by the Form — derived detail, not a problem" />
        <RailToggle id="orphaned" icon="history" count={orphaned.length} open={open} onToggle={toggleSection}
          title="No longer in the Form" tone={orphaned.length ? '#856404' : null} />
      </div>

      {/* A changed product inside a SHARED wrapper: one wrapper cannot hold both
          states. Computed at import, persisted, and actionable here. */}
      {divergence && (
        <div className="mb-2 px-2 py-1 rounded" style={{ background: '#fff3cd', border: '1px solid #f0e0a8', fontSize: 10, color: '#856404' }}>
          <div className="fw-semibold">
            <MaterialIcon name="warning" size={11} /> <span style={{ fontFamily: 'monospace' }}>{divergence.wrapper}</span> is
            shared by {divergence.sharers.join(', ')}
          </div>
          <div className="my-1">
            The Form changed it for {divergence.changedPositions.join(', ')} but not{' '}
            {divergence.unchangedPositions.join(', ')}. One wrapper cannot hold both.
          </div>
          <div className="d-flex gap-1">
            <Button size="sm" variant="outline-warning" style={{ fontSize: 9, padding: '0 5px' }}
              onClick={() => setForking(true)}>
              <MaterialIcon name="call_split" size={10} /> Fork it for {posRef}
            </Button>
            <Button size="sm" variant="outline-secondary" style={{ fontSize: 9, padding: '0 5px' }}
              onClick={() => dismissDivergence(divergence.wrapper)}>
              Keep shared
            </Button>
          </div>
        </div>
      )}

      {/* The same context columns the import wizard shows above the paint surface — same
          component, because it is the same sheet saying the same thing. */}
      {open.has('context') && (
        <FormContext context={context} columns={shownCols} style={{ marginBottom: 8 }} />
      )}

      {/* The Form asked for these and nobody has said what they are. They cannot be
          added to a recipe until they have an ElementType, so they are not a tick —
          they are a question, asked where it matters. */}
      {pending.length > 0 && (
        <div className="mb-2 px-2 py-2 rounded" style={{ background: '#fdecec', border: '1px solid #f5c2c7' }}>
          <div className="fw-semibold" style={{ fontSize: 10, color: '#842029' }}>
            <MaterialIcon name="help" size={11} /> {pending.length} product
            {pending.length === 1 ? '' : 's'} with no ElementType
          </div>
          <div className="text-muted mt-1 mb-2" style={{ fontSize: 10, lineHeight: 1.5 }}>
            The Form asks for {pending.length === 1 ? 'it' : 'them'} here. Nothing can be added to the
            recipe until {pending.length === 1 ? 'it has' : 'they have'} one.
          </div>
          {pending.map(p => {
            const cands = candsByCode.get(p.code) ?? []
            const top = cands[0]
            return (
              <div key={p.code} className="py-1 border-top" style={{ fontSize: 10 }}>
                <div className="d-flex align-items-baseline gap-1">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="d-flex align-items-baseline gap-1 text-truncate" title={p.code}>
                      <RowStatus status="question" />
                      <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{p.code}</span>
                    </div>
                    <div className="text-muted text-truncate" title={`${p.manufacturer || 'no manufacturer'}${p.note ? ` · ${p.note}` : ''}`}>
                      {p.manufacturer || <em>no manufacturer</em>}{p.note ? ` · ${p.note}` : ''}
                    </div>
                  </div>
                  <Button size="sm" variant="outline-danger" style={{ fontSize: 9, padding: '0 5px', flexShrink: 0 }}
                    onClick={() => setCreating(p)}
                    title={`Create a NEW ElementType for ${p.manufacturer ? `${p.manufacturer} ` : ''}${p.code}`}>
                    Create
                  </Button>
                  <Button size="sm" variant="outline-secondary" style={{ fontSize: 9, padding: '0 5px', flexShrink: 0 }}
                    onClick={() => setPicking(picking === p.code ? null : p.code)}
                    title={`Point ${p.code} at an ElementType you already have`}>
                    Pick existing…
                  </Button>
                </div>

                {/* It is probably something you already have. Creating a second one would
                    be a duplicate of a product already sitting in this very recipe. */}
                {top && picking !== p.code && (
                  <div className="d-flex align-items-center gap-1 mt-1 px-1 py-1 rounded"
                    style={{ background: '#fff', border: '1px solid #f5c2c7' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{top.ref}</span>
                    <span className="text-muted text-truncate" style={{ flex: 1, minWidth: 0 }}
                      title={top.description || WHY[top.why]}>
                      {WHY[top.why]}
                    </span>
                    <Button size="sm" variant="success" style={{ fontSize: 9, padding: '0 5px', flexShrink: 0 }}
                      onClick={() => mergePending(p, top.ref)}
                      title={`"${p.code}" IS ${top.ref} — link them`}>
                      That&apos;s it
                    </Button>
                  </div>
                )}

                {picking === p.code && (
                  <div className="mt-1">
                    <ETRefSelect
                      placeholder="Which ElementType is it?"
                      onCommit={ref => ref && mergePending(p, ref)}
                    />
                    {cands.length > 1 && (
                      <div className="text-muted mt-1" style={{ fontSize: 9 }}>
                        Also plausible: {cands.slice(1).map(c => c.ref).join(', ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* The Form is silent about slots, and this position has no assembly to put
          anything inside. Nothing is broken; say so before the chooser greys out. */}
      {missing.length > 0 && !container && (
        <div className="text-muted mb-1" style={{ fontSize: 10 }}>
          <MaterialIcon name="info" size={10} /> {posRef} has no wrapper, so everything lands at
          PositionType Level.
        </div>
      )}

      {/* What the Form asks for */}
      {missing.length > 0 && (
        <div className="d-flex align-items-center gap-1 mb-1">
          <Form.Check type="checkbox" id={`fs-all-${posRef}`} checked={allTicked}
            onChange={() => setTicked(allTicked ? new Set() : new Set(missing.map(m => m.elementTypeRef)))}
            label={<span style={{ fontSize: 10 }} className="text-muted">select all missing</span>} />
        </div>
      )}

      {[...missing, ...matched].map(e => {
        const isMissing = e.have === 0
        const status = !isMissing ? 'present' : e.inSpec ? 'addable' : 'missing'
        return (
          <div key={e.elementTypeRef} className="d-flex align-items-start gap-2 py-1 border-bottom" style={{ fontSize: 11 }}>
            {isMissing
              ? <input type="checkbox" className="form-check-input mt-1" style={{ flexShrink: 0 }}
                  checked={ticked.has(e.elementTypeRef)}
                  onChange={() => toggle(e.elementTypeRef)}
                  title={`Tick to add — lands ${destLabel}`} aria-label={`Add ${e.elementTypeRef}`} />
              : <span style={{ width: 13, flexShrink: 0 }} />}
            <div style={{ minWidth: 0, flex: 1 }}>
              {/* Manufacturer and product code are one thing, and always shown together. */}
              <div className="d-flex align-items-baseline gap-1">
                <RowStatus status={status} />
                <Ref>{e.code || e.elementTypeRef}</Ref>
                {e.formRef && <span className="text-muted" style={{ fontSize: 9 }}>{e.formRef}</span>}
              </div>
              <div className="text-truncate" style={{ fontSize: 10, color: e.manufacturer ? '#495057' : '#adb5bd' }}>
                {e.manufacturer || 'no manufacturer'}
              </div>
              <div className="d-flex align-items-baseline gap-1 text-truncate">
                <UsagePopover etRef={e.elementTypeRef} placement="left" diverges={diverges(e.elementTypeRef)}>
                  <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#6c757d' }}>{e.elementTypeRef}</span>
                </UsagePopover>
                {e.inSpec && (
                  <span className="rounded px-1" style={{ fontSize: 9, background: '#d1e7dd', color: '#0f5132' }}
                    title="This manufacturer + product code already names an ElementType in the Product Spec">
                    in the spec
                  </span>
                )}
              </div>
              {e.note && <div className="text-muted" style={{ fontSize: 10 }}>{e.note}</div>}
              {/* A matched row says where it was found. A missing one should say where it
                  will go — before you tick it, not after the store refuses the row. */}
              {isMissing && (
                <div className="text-muted" style={{ fontSize: 10 }}>
                  <MaterialIcon name="subdirectory_arrow_right" size={10} /> will be added {destLabel}
                </div>
              )}
              {isMissing
                ? <span className="text-danger" style={{ fontSize: 10 }}>
                    {e.inSpec ? 'already an ElementType — tick to add it' : 'missing from the recipe'}
                  </span>
                : <FoundIn foundIn={e.foundIn} container={container} />}
            </div>
          </div>
        )
      })}

      {/* Tick, choose where, preview. Nothing is written until you confirm. */}
      {ticked.size > 0 && (
        <div className="mt-2 px-2 py-2 rounded" style={{ background: '#e7f1ff', border: '1px solid #b6d4fe' }}>
          <div className="mb-1" style={{ fontSize: 11 }}>Add {ticked.size} to:</div>
          <Form.Check type="radio" name={`dest-${posRef}`} id={`dest-pos-${posRef}`}
            checked={effectiveDest === 'position'} onChange={() => setDest('position')}
            label={<span style={{ fontSize: 11 }}>PositionType Level</span>} />
          <Form.Check type="radio" name={`dest-${posRef}`} id={`dest-int-${posRef}`}
            checked={effectiveDest === 'internal'} onChange={() => setDest('internal')}
            disabled={!container}
            label={
              <span style={{ fontSize: 11 }}>
                inside <span style={{ fontFamily: 'monospace' }}>{container || '—'}</span>
                {!container && <span className="text-muted"> (no wrapper on this position)</span>}
              </span>
            } />
          <Button size="sm" variant="primary" className="mt-2" style={{ fontSize: 11 }}
            onClick={() => setPreview(buildPlan())}>
            Preview {ticked.size} change{ticked.size === 1 ? '' : 's'}
          </Button>
        </div>
      )}

      {/* Codes that have left the Form. A soft hint — never a validation error. */}
      {orphaned.length > 0 && open.has('orphaned') && (
        <div className="mt-3">
          <SectionLabel>No longer in the Form</SectionLabel>
          {orphaned.map(o => {
            const alsoRemove = assoc.get(o.elementTypeRef.toLowerCase()) || []
            return (
              <div key={o.elementTypeRef} className="py-1 border-bottom" style={{ fontSize: 11 }}>
                <div className="d-flex align-items-center gap-1">
                  <MaterialIcon name="warning" size={12} style={{ color: '#856404', flexShrink: 0 }} />
                  <Ref>{o.elementTypeRef}</Ref>
                  <Button size="sm" variant="outline-danger" className="ms-auto" style={{ fontSize: 9, padding: '0 5px' }}
                    onClick={() => o.rows.forEach(r => removeRecipeRow(posRef, r._id))}>
                    Remove
                  </Button>
                </div>
                {alsoRemove.length > 0 && (
                  <div className="text-muted ps-3" style={{ fontSize: 10 }}>
                    <MaterialIcon name={ACTION_ICONS.suggest} size={10} />{' '}
                    {alsoRemove.map(y => y.ref).join(', ')} accompanies it in all {alsoRemove[0].support} positions
                    that use it — check whether it goes too.
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Derived detail. The Form never mentions it, and that is correct. */}
      {extra.length > 0 && open.has('extra') && (
        <div className="mt-3">
          <SectionLabel>Not specified by the Form</SectionLabel>
          <div className="text-muted mb-1" style={{ fontSize: 10 }}>
            Derived from what the Form asks for — not a problem.
          </div>
          {extra.map(x => (
            <div key={x.elementTypeRef} className="d-flex align-items-baseline gap-2 py-1" style={{ fontSize: 11 }}>
              <UsagePopover etRef={x.elementTypeRef} placement="left" diverges={diverges(x.elementTypeRef)}>
                <span style={{ fontFamily: 'monospace', color: '#6c757d' }}>{x.elementTypeRef}</span>
              </UsagePopover>
              <span className="ms-auto text-muted" style={{ fontSize: 9 }}>{KIND_LABEL[x.kind]}</span>
            </div>
          ))}
        </div>
      )}

      {nextUnreconciled && (
        <div className="mt-3 pt-2 border-top">
          <Button size="sm" variant="outline-primary" className="w-100" style={{ fontSize: 10 }}
            onClick={() => setActivePosition(nextUnreconciled)}
            title="Jump to the next position the Form is not yet satisfied on">
            Next unreconciled: <span style={{ fontFamily: 'monospace' }}>{nextUnreconciled}</span> →
          </Button>
        </div>
      )}

      <BulkApplyModal
        show={!!preview}
        plan={preview}
        title={`Add ${preview?.actions.length ?? 0} Form ${preview?.actions.length === 1 ? 'product' : 'products'} to ${posRef}`}
        onHide={() => setPreview(null)}
        onConfirm={applyPlan}
      />

      {/* duplicateET repoints this position onto the fork. onDuplicated fires only on a
          real fork (never on cancel), so the question is marked settled exactly then. */}
      {/* Reuses the import's own modal, with the import's own evidence: the code, the
          maker, the note. The note is how you tell two similar codes apart. */}
      {creating && (
        <NewETModal
          show
          onHide={() => setCreating(null)}
          contextLabel={`for ${creating.code}`}
          draftKey={`pending::${posRef}::${creating.code}`}
          importContext={{
            code: creating.code,
            manufacturer: creating.manufacturer,
            note: creating.note,
            positionTypes: [creating.formRef || posRef],
            rowCount: 1,
          }}
          prefill={{
            manufacturer: creating.manufacturer,
            productCode: creating.code,
            description: creating.note,
          }}
          onCreated={etRef => {
            promotePendingCapture(posRef, creating.code, etRef)
            setCreating(null)
          }}
        />
      )}

      <DuplicateETModal
        show={forking}
        etRef={divergence?.wrapper}
        posRef={posRef}
        onClose={() => setForking(false)}
        onDuplicated={() => dismissDivergence(divergence.wrapper)}
      />

      <ColumnPicker
        show={choosingCols}
        onHide={() => setChoosingCols(false)}
        available={offerCols}
        shown={shownCols}
        onChange={chooseCols}
        onReset={() => { clearVisible(projectId); setColPref(null) }}
      />
    </div>
  )
}
