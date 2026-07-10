import React, { useMemo, useState } from 'react'
import { Button, Form } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import BulkApplyModal from './BulkApplyModal'
import DuplicateETModal from './DuplicateETModal'
import UsagePopover from './UsagePopover'
import { compareFormToRecipe, associations, formWorklist } from '../utils/formSpec'
import { findProductET } from '../utils/productCodes'
import { ACTION_ICONS } from '../utils/entityStyle'

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
  const where = foundIn === 'position' ? 'at position level'
    : foundIn === 'internal' ? `inside ${container || 'the wrapper'}`
    : 'at position level and inside the wrapper'
  return <span className="text-muted" style={{ fontSize: 10 }}>{where}</span>
}

/** "2h ago" — enough to know whether the spec you're reading is the current one. */
function ago(iso) {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return null
  const m = Math.round(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

/**
 * Which workbook is attached, when it was imported, and the two things you can do
 * about it. `clearFormCaptures` had no UI caller at all before this.
 */
function FormStrip({ formCaptures, onReimport, onDetach }) {
  const when = ago(formCaptures.importedAt)
  return (
    <div className="d-flex align-items-center gap-1 mb-2 px-2 py-1 rounded"
      style={{ background: '#f8f9fa', border: '1px solid #e9ecef', fontSize: 10 }}>
      <MaterialIcon name="description" size={12} style={{ flexShrink: 0, color: '#6c757d' }} />
      <span className="text-truncate" style={{ minWidth: 0, flex: 1 }}
        title={`${formCaptures.source?.name || 'Form template'}${formCaptures.source?.sheet ? ` · ${formCaptures.source.sheet}` : ''}`}>
        {formCaptures.source?.name || 'Form template'}
        {when && <span className="text-muted"> · {when}</span>}
      </span>
      <Button size="sm" variant="link" className="p-0" style={{ fontSize: 9 }}
        onClick={onReimport} title="Re-import the Form; changes are shown as a diff">
        Re-import
      </Button>
      <Button size="sm" variant="link" className="p-0 text-danger" style={{ fontSize: 9 }}
        onClick={onDetach} title="Detach the Form template from this project">
        Detach
      </Button>
    </div>
  )
}

export default function FormSpecPane({ posRef, embedded = false }) {
  const recipes = useStore(s => s.recipes)
  const psRows = useStore(s => s.psRows)
  const containerETRefs = useStore(s => s.containerETRefs)
  const formCaptures = useStore(s => s.formCaptures)
  const addRecipeRow = useStore(s => s.addRecipeRow)
  const removeRecipeRow = useStore(s => s.removeRecipeRow)
  const clearFormCaptures = useStore(s => s.clearFormCaptures)
  const dismissDivergence = useStore(s => s.dismissDivergence)
  const requestScreen = useStore(s => s.requestScreen)
  const setActivePosition = useStore(s => s.setActivePosition)

  const [ticked, setTicked] = useState(() => new Set())
  const [dest, setDest] = useState('auto')      // 'position' | 'internal'
  const [preview, setPreview] = useState(null)
  const [forking, setForking] = useState(false)

  const captured = formCaptures?.byPosition?.[posRef] ?? []
  const context = formCaptures?.contextByPosition?.[posRef] ?? {}
  const orphanRefs = formCaptures?.orphansByPosition?.[posRef] ?? []

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

  // "X consistently has Y" — learned, advisory, only consulted for orphans.
  const assoc = useMemo(
    () => (result.orphaned.length ? associations(recipes, formCaptures) : new Map()),
    [recipes, formCaptures, result.orphaned.length]
  )

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
  if (formEts.length === 0 && result.orphaned.length === 0) {
    return (
      <div className="border-start ps-3" style={{ width: 340, flexShrink: 0, overflowY: 'auto' }}>
        <SectionLabel>Form spec</SectionLabel>
        <FormStrip formCaptures={formCaptures} onReimport={handleReimport} onDetach={handleDetach} />
        <div className="text-muted fst-italic" style={{ fontSize: 11 }}>
          The Form says nothing about {posRef}.
        </div>
        {nextUnreconciled && (
          <Button size="sm" variant="outline-primary" className="mt-2" style={{ fontSize: 10 }}
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
      <div className="d-flex align-items-baseline gap-1 mb-1">
        <SectionLabel className="mb-0">Form spec</SectionLabel>
        <span className="ms-auto text-muted" style={{ fontSize: 10 }}>
          {coverage.present}/{coverage.total} present
        </span>
      </div>
      <FormStrip formCaptures={formCaptures} onReimport={handleReimport} onDetach={handleDetach} />

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

      {/* The same context columns the import wizard shows above the paint surface. */}
      {Object.keys(context).length > 0 && (
        <div className="mb-2 px-2 py-1 rounded" style={{ background: '#f8f9fa', fontSize: 11 }}>
          {Object.entries(context).map(([k, v]) => (
            <div key={k}><span className="text-muted">{k}:</span> {String(v)}</div>
          ))}
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
        return (
          <div key={e.elementTypeRef} className="d-flex align-items-start gap-2 py-1 border-bottom" style={{ fontSize: 11 }}>
            {isMissing
              ? <input type="checkbox" className="form-check-input mt-1" style={{ flexShrink: 0 }}
                  checked={ticked.has(e.elementTypeRef)}
                  onChange={() => toggle(e.elementTypeRef)}
                  title="Tick to add" aria-label={`Add ${e.elementTypeRef}`} />
              : <MaterialIcon name={ACTION_ICONS.complete} size={13} style={{ color: '#198754', flexShrink: 0, marginTop: 1 }} />}
            <div style={{ minWidth: 0, flex: 1 }}>
              {/* Manufacturer and product code are one thing, and always shown together. */}
              <div className="d-flex align-items-baseline gap-1">
                <Ref>{e.code || e.elementTypeRef}</Ref>
                {e.formRef && <span className="text-muted" style={{ fontSize: 9 }}>{e.formRef}</span>}
              </div>
              <div className="text-truncate" style={{ fontSize: 10, color: e.manufacturer ? '#495057' : '#adb5bd' }}>
                {e.manufacturer || 'no manufacturer'}
              </div>
              <div className="d-flex align-items-baseline gap-1 text-truncate">
                <UsagePopover etRef={e.elementTypeRef} placement="left">
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
            label={<span style={{ fontSize: 11 }}>Position level</span>} />
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
      {orphaned.length > 0 && (
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
      {extra.length > 0 && (
        <div className="mt-3">
          <SectionLabel>Not specified by the Form</SectionLabel>
          <div className="text-muted mb-1" style={{ fontSize: 10 }}>
            Derived from what the Form asks for — not a problem.
          </div>
          {extra.map(x => (
            <div key={x.elementTypeRef} className="d-flex align-items-baseline gap-2 py-1" style={{ fontSize: 11 }}>
              <UsagePopover etRef={x.elementTypeRef} placement="left">
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
