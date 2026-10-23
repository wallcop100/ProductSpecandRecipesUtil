import React, { useMemo, useState } from 'react'
import { Button, Form } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import ProposalTable from './ProposalTable'
import useTemplateMatches, { dismissTemplateHint } from './useTemplateMatches'
import { useCompanion } from '../platform/companion'
import { shareOutcomes } from '../platform/outcomes'
import { proposalContext, proposalFromTemplate } from '../utils/recipeProposal'
import { describeRule } from '../utils/templateRules'
import { positionRecipeWithWrapperInternals } from '../utils/collectionStatus'
import { buildPresence, ingredientPresence, wantedSlots } from '../utils/recipePresence'
import { indexes as kindIndexes, rowJob, jobLabel, anchorOf, fitFor, positionMakeup, sectionFor } from '../utils/recipeKinds'
import { jobKey, familyForJob } from '../utils/codeJobs'
import { nextRef } from '../utils/etSeed'
import { ACTION_ICONS } from '../utils/entityStyle'
import { C } from '../styles/tokens'

const mono = { fontFamily: 'monospace' }
const live = r => (r.IsDeleted || r.isDeleted) !== 'Y'
const originOf = t => (t._served ? 'Global' : t.scope === 'project' ? 'project' : t.scope === 'global' ? 'built-in' : 'mine')
const checksOf = p => (p.rows || []).filter(r => r.check || r.missing).map(r => r.check || `${r.role.toLowerCase()} is empty`)

/**
 * TemplatesPane — the templates whose rule fits ONE position, in the builder's right drawer.
 * Apply is the Form-ingest method (applyTaughtTemplate / proposalFromTemplate): preview the rows
 * with this position's Form products, confirm the template is right (an outcome, so Orion learns
 * from it), write in one Undo. Rows that need checking are remembered in `templateChecks`.
 */
/**
 * A template's parts against the position's recipe → one status per ingredient (present / misplaced /
 * short / missing), or null where the part comes from the Form and there is nothing to compare.
 * A job slot ("PROFILE") counts as present when a live row on the position does that job.
 */
function alignment(ings, rows, wrapperRefs, idx) {
  const presence = buildPresence(rows, wrapperRefs)
  const wanted = wantedSlots(ings)
  const jobs = rows.filter(r => (r.IsDeleted || r.isDeleted) !== 'Y').map(r => [jobKey(rowJob(r, idx)), r])
  return ings.map(i => {
    if (i.fromForm) return null
    if (i.newWrapper) return { status: wrapperRefs.length ? 'present' : 'missing' }
    if (i.slotKey && !i.exact) {
      const hit = jobs.find(([j]) => j === i.slotKey || j.split(':')[0] === i.slotKey)
      return { status: hit ? 'present' : 'missing', rows: hit ? [hit[1]] : [] }
    }
    return ingredientPresence(presence, i, { wanted })
  })
}
const TICK = { present: [ACTION_ICONS.complete, C.success, 'In the recipe'], missing: [ACTION_ICONS.incomplete, C.danger, 'Not in the recipe'] }

export default function TemplatesPane({ posRef }) {
  const state = useStore(s => s)
  const { recipes, positionTypes, library, projectNumber, templateChecks } = state
  const applyTaughtTemplate = useStore(s => s.applyTaughtTemplate)
  const setTemplateChecks = useStore(s => s.setTemplateChecks)
  const setActivePosition = useStore(s => s.setActivePosition)
  const companion = useCompanion()
  const [showAll, setShowAll] = useState(false)
  const [whyOpen, setWhyOpen] = useState(() => new Set())
  const [preview, setPreview] = useState(null)   // { template, refs }
  const [sure, setSure] = useState(false)
  const [msg, setMsg] = useState(null)

  const emptyRefs = useMemo(() => {
    const has = new Set(recipes.filter(live).map(r => r.PositionTypeRef || r.positionTypeRef))
    return positionTypes.map(p => p.PositionTypeRef).filter(r => !has.has(r))
  }, [recipes, positionTypes])
  // Every position, so a part's share across the template's positions can be shown (#70).
  // shortcut: matches every position on each data change; scope it to shown templates if big projects lag.
  const refs = useMemo(() => [...new Set([posRef, ...positionTypes.map(p => p.PositionTypeRef)])], [posRef, positionTypes])
  const byPos = useTemplateMatches(refs)
  const { matches = [], others = [] } = byPos.get(posRef) || {}
  const isEmpty = emptyRefs.includes(posRef)
  const own = useMemo(() => {
    const { combined, wrapperRefs } = positionRecipeWithWrapperInternals(recipes, posRef)
    const ctx = proposalContext(state, library)
    return { rows: combined, wrapperRefs, ctx, idx: kindIndexes(ctx) }
  }, [recipes, posRef, library])   // eslint-disable-line react-hooks/exhaustive-deps
  // Report #48: the design ingredient names the position's own design ElementType, not "design element".
  const designRef = own.rows.find(r => live(r) && (r.IsDesign || r.isDesign) === 'Y')
  const designName = designRef && (designRef.ElementTypeRef || designRef.elementTypeRef)
  const shown = showAll ? [...matches.map(t => ({ t, fits: true })), ...others.map(t => ({ t, fits: false }))] : matches.map(t => ({ t, fits: true }))
  // Report #49: which ET holds a ticked part; for a missing one, the ET and code it would become.
  const makeup = useMemo(() => positionMakeup(posRef, own.ctx, own.idx), [posRef, own])
  const anchor = useMemo(() => anchorOf(makeup, own.idx), [makeup, own])
  const codeOf = ref => { const ps = own.idx.psByRef.get(String(ref).toUpperCase()); return ps ? `${ps.Manufacturer || ps.manufacturer || ''} ${ps.ProductCode || ps.productCode || 'no code'}`.trim() : 'not in the Product Spec' }
  const holderRef = mark => { const row = mark?.rows?.[0]; return row && (row.ElementTypeRef || row.elementTypeRef) }
  // What a missing part's Add writes: the template's own ElementType, one the project's data points to, or a TBC placeholder.
  function target(i) {
    if (i.newWrapper || i.fromForm || String(i.slotKey || '').startsWith('DESIGN_ELEMENT')) return null
    if (i.exact || !i.slotKey) return own.idx.etByRef.has(String(i.slotLabel).toUpperCase()) ? { ref: i.slotLabel, kind: 'template' } : null
    const fit = fitFor(i.slotKey, anchor, own.ctx, own.idx)
    if (fit) return { ref: fit.etRef, kind: 'learned', why: fit.why }
    return familyForJob({ slot: i.slotKey }) ? { kind: 'placeholder' } : null
  }
  function add(i, t) {
    const st = useStore.getState()
    let ref = t.ref
    if (t.kind === 'placeholder') {
      const label = `TBC - ${jobLabel(i.slotKey)} for ${posRef}`
      ref = st.elementTypes.find(e => e.Name === label)?.ElementTypeRef
      if (!ref) {
        const house = familyForJob({ slot: i.slotKey })
        ref = nextRef(house.head, st.elementTypes.map(e => e.ElementTypeRef))
        st.createElementType({ ref, name: label, family: house.family })
        st.addPSRow(ref, { IsTBC: 'Y', ComponentDescription: label.replace(/^TBC - /, '') })
      }
    }
    st.addRecipeRow(posRef, sectionFor(i, makeup.design), { elementTypeRef: ref, quantity: i.quantity ?? null }, { asPosition: true })
  }
  // For each fitting template: per part, how many of its positions with a recipe have it (#70).
  const shareOf = useMemo(() => {
    const cache = new Map()
    return t => {
      if (cache.has(t.id)) return cache.get(t.id)
      const members = refs.filter(r => !emptyRefs.includes(r) && (byPos.get(r)?.matches || []).some(m => m.id === t.id))
      const have = (t.ingredients || []).map(() => 0)
      for (const r of members) {
        const { combined, wrapperRefs } = positionRecipeWithWrapperInternals(recipes, r)
        alignment(t.ingredients || [], combined, wrapperRefs, own.idx).forEach((m, k) => { if (m?.status === 'present') have[k]++ })
      }
      const out = { of: members.length, have }
      cache.set(t.id, out)
      return out
    }
  }, [refs, emptyRefs, byPos, recipes, own])
  const alsoEmpty = t => emptyRefs.filter(r => r !== posRef && (byPos.get(r)?.matches || []).some(m => m.id === t.id))

  const toCheck = Object.keys(templateChecks || {}).filter(r => !emptyRefs.includes(r) && positionTypes.some(p => p.PositionTypeRef === r))

  function start(template, targets) { setPreview({ template, refs: targets }); setSure(false); setMsg(null) }
  const ctx = useMemo(() => (preview ? proposalContext(useStore.getState(), library) : null), [preview, library])   // eslint-disable-line react-hooks/exhaustive-deps
  const proposals = useMemo(() => (preview ? preview.refs.map(r => proposalFromTemplate(preview.template, r, ctx)) : []), [preview, ctx])

  function confirm() {
    const { template, refs: targets } = preview
    const flagged = Object.fromEntries(proposals.filter(p => !p.skip && checksOf(p).length).map(p => [p.posRef, checksOf(p)]))
    const res = applyTaughtTemplate(template.id, targets)
    const next = { ...templateChecks }
    for (const r of res.built) { if (flagged[r]) next[r] = flagged[r]; else delete next[r] }
    setTemplateChecks(next)
    shareOutcomes(companion, projectNumber, res.built.map(r => ({
      kind: 'template', key: `${String(template.id).replace(/^served:/, '')}|${r}`, tier: 'template', source: originOf(template),
      supplied: template.id, final: template.id, outcome: 'accepted',
    })))
    setMsg(`Applied ${template.name} to ${res.built.length}${res.skipped.length ? `; left ${res.skipped.length} alone (${res.skipped.map(s => s.posRef).join(', ')})` : ''}. One Undo takes it back.`)
    setPreview(null)
  }

  return (
    <div className="p-2" style={{ fontSize: 12 }} data-testid="templates-pane">
      <div className="d-flex align-items-center gap-2 mb-2">
        <strong>{showAll ? 'All templates' : 'Matches this position'}</strong>
        <Button size="sm" variant="link" className="p-0 ms-auto" style={{ fontSize: 11 }} onClick={() => setShowAll(v => !v)}>
          {showAll ? 'Only matches' : 'All templates'}
        </Button>
      </div>
      {msg && <div className="mb-2 px-2 py-1 rounded" style={{ background: C.subtle, color: C.ink }}>{msg}</div>}

      {preview && (
        <div className="mb-2 p-2 rounded border" data-testid="template-preview">
          <div className="mb-1"><strong>{preview.template.name}</strong> on {preview.refs.join(', ')} (nothing is written yet)</div>
          {proposals.map(p => (
            <div key={p.posRef} className="mb-2">
              {preview.refs.length > 1 && <div style={mono}>{p.posRef}</div>}
              <ProposalTable proposal={p} />
            </div>
          ))}
          <Form.Check type="checkbox" id="tpl-sure" className="mb-1" checked={sure} onChange={e => setSure(e.target.checked)}
            label={`This template is right for ${preview.refs.length === 1 ? preview.refs[0] : `these ${preview.refs.length} positions`}`} />
          <Button size="sm" disabled={!sure} onClick={confirm}>Apply</Button>{' '}
          <Button size="sm" variant="link" className="text-muted" onClick={() => setPreview(null)}>Cancel</Button>
        </div>
      )}

      {shown.length === 0 && (
        <div className="text-muted fst-italic mb-2">
          {showAll ? 'No templates yet.' : `No template's rule fits ${posRef}.`}
        </div>
      )}
      {shown.map(({ t, fits }) => {
        const more = fits ? alsoEmpty(t) : []
        const marks = fits && !isEmpty ? alignment(t.ingredients || [], own.rows, own.wrapperRefs, own.idx) : []
        return (
          <div key={t.id} className={`mb-2 p-2 rounded border${t._served ? ' companion-card' : ''}`} data-testid="template-card" data-source={t._served ? 'companion' : t.scope === 'global' ? 'app' : 'user-template'} style={fits ? undefined : { opacity: 0.8 }}>
            <div className="d-flex align-items-center gap-2">
              <strong>{t.name}</strong>
              <span className="badge" style={{ background: C.subtle, color: C.muted, border: `1px solid ${C.border}`, fontSize: 10 }}>{t._served && <MaterialIcon name="cloud" size={11} />} {originOf(t)}</span>
              {fits && isEmpty && (
                <Button size="sm" className="ms-auto py-0" style={{ fontSize: 11 }} onClick={() => start(t, [posRef])}>Apply…</Button>
              )}
            </div>
            <div className="text-muted" style={{ fontSize: 11 }}>{describeRule(t.rule)}</div>
            <div style={{ fontSize: 11 }}>
              {(t.ingredients || []).map((i, k) => {
                const mark = marks[k]
                const held = mark?.status !== 'missing' && holderRef(mark)
                const isDesign = String(i.slotKey || '').startsWith('DESIGN_ELEMENT')
                const t2 = mark?.status === 'missing' ? target(i) : null
                const sh = mark ? shareOf(t) : null
                const n = sh ? sh.have[k] : 0
                return (
                  <div key={k} className="d-flex align-items-center gap-1" style={{ minHeight: 22 }} data-testid="tpl-line">
                    {mark && (() => {
                      const [icon, color, tip] = TICK[mark.status] || ['warning', C.attnInk, mark.status === 'short' ? `Only ${mark.have} of ${mark.need}` : 'In the recipe, but in the wrong place']
                      return <span title={tip} data-testid={`tpl-${mark.status}`} style={{ color }}><MaterialIcon name={icon} size={13} /></span>
                    })()}
                    <span>{i.fromForm ? `from the Form (${i.fromForm})` : i.newWrapper ? 'new wrapper'
                      : isDesign ? (['LIN', 'DL'].includes(makeup.design) ? `${makeup.design} Wrapper` : 'design element')
                        : i.slotKey ? jobLabel(i.slotKey) : (own.idx.etByRef.get(String(i.slotLabel).toUpperCase())?.Name || i.slotLabel)}</span>
                    {sh && sh.of > 1 && n < sh.of && (
                      <span className="ms-auto text-nowrap" style={{ fontSize: 10, color: C.muted }} data-testid="tpl-share"
                        title={`${n} of the ${sh.of} positions on this template have it`}>{n} of {sh.of} · {Math.round((100 * n) / sh.of)}%</span>
                    )}
                    {(held || (isDesign && designName)) && (
                      <span className={`${sh && sh.of > 1 && n < sh.of ? '' : 'ms-auto '}rounded-pill px-2`} style={{ ...mono, fontSize: 10, background: C.refTint, color: C.refInk }}
                        title={codeOf(held || designName)} data-testid="tpl-holder">{held || designName}</span>
                    )}
                    {t2 && (
                      <Button size="sm" variant={t2.kind === 'placeholder' ? 'outline-secondary' : 'outline-primary'}
                        className={sh && sh.of > 1 && n < sh.of ? '' : 'ms-auto'} data-testid={`tpl-add-${t2.kind}`}
                        style={{ fontSize: 10, padding: '0 6px', ...(t2.kind === 'template' ? {} : { borderStyle: 'dashed' }) }}
                        title={t2.kind === 'template' ? `Add ${t2.ref} (${codeOf(t2.ref)}), the template's part`
                          : t2.kind === 'learned' ? `Add ${t2.ref} (${codeOf(t2.ref)}): ${t2.why}`
                            : `Nothing known fits: adds a TBC placeholder ElementType for you to fill in`}
                        onClick={() => add(i, t2)}>
                        {t2.kind === 'learned' && <MaterialIcon name="auto_awesome" size={11} />}{' '}
                        {t2.kind === 'placeholder' ? '+ TBC placeholder' : <>+ <span style={mono}>{t2.ref}</span></>}
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
            {fits && !isEmpty && <div className="text-muted fst-italic" style={{ fontSize: 11 }}>{posRef} already has a recipe.</div>}
            {fits && isEmpty && more.length > 0 && (
              <Button size="sm" variant="link" className="p-0" style={{ fontSize: 11 }} onClick={() => start(t, [posRef, ...more])}>
                {more.length} more empty position{more.length === 1 ? ' matches' : 's match'}: apply to all {more.length + 1}…
              </Button>
            )}
            {!fits && (
              <>
                <Button size="sm" variant="link" className="p-0 d-block" style={{ fontSize: 11 }}
                  onClick={() => setWhyOpen(s => { const n = new Set(s); n.has(t.id) ? n.delete(t.id) : n.add(t.id); return n })}>
                  {whyOpen.has(t.id) ? 'Hide why not' : 'Why not?'}
                </Button>
                {whyOpen.has(t.id) && (
                  <div style={{ fontSize: 11 }}>
                    {t.why.length === 0 && <div className="text-muted">It has no rule yet.</div>}
                    {t.why.map((w, k) => (
                      <div key={k} style={{ color: w.ok ? C.muted : C.attnInk }}>
                        <MaterialIcon name={w.ok ? 'check' : 'close'} size={11} /> {describeRule({ match: 'all', conditions: [w.cond] })}
                        {!w.ok && <span> (here: {Array.isArray(w.has) ? w.has.join(', ') || 'none' : String(w.has || 'empty')})</span>}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )
      })}
      {isEmpty && matches.length > 0 && (
        <Button size="sm" variant="link" className="p-0 text-muted" style={{ fontSize: 11 }} onClick={() => dismissTemplateHint(posRef)}>
          Don&apos;t hint templates for {posRef}
        </Button>
      )}

      {toCheck.length > 0 && (
        <div className="mt-3 pt-2 border-top" data-testid="still-to-check">
          <strong>Still to check</strong>
          {toCheck.map(r => (
            <div key={r} className="d-flex align-items-center gap-2">
              <Button size="sm" variant="link" className="p-0" style={mono} onClick={() => setActivePosition(r)}>{r}</Button>
              <span style={{ color: C.attnInk, fontSize: 11 }}>{templateChecks[r].length} to check</span>
              <Button size="sm" variant="link" className="p-0 ms-auto text-muted" style={{ fontSize: 11 }} aria-label={`Checked ${r}`}
                onClick={() => { const { [r]: _x, ...rest } = templateChecks; setTemplateChecks(rest) }}>checked</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
