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
import { C } from '../styles/tokens'

const mono = { fontFamily: 'monospace' }
const live = r => (r.IsDeleted || r.isDeleted) !== 'Y'
const originOf = t => (t._served ? 'Global ☁️' : t.scope === 'project' ? 'project' : t.scope === 'global' ? 'built-in' : 'mine')
const checksOf = p => (p.rows || []).filter(r => r.check || r.missing).map(r => r.check || `${r.role.toLowerCase()} is empty`)

/**
 * TemplatesPane — the templates whose rule fits ONE position, in the builder's right drawer.
 * Apply is the Form-ingest method (applyTaughtTemplate / proposalFromTemplate): preview the rows
 * with this position's Form products, confirm the template is right (an outcome, so Orion learns
 * from it), write in one Undo. Rows that need checking are remembered in `templateChecks`.
 */
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
  const refs = useMemo(() => [...new Set([posRef, ...emptyRefs])], [posRef, emptyRefs])
  const byPos = useTemplateMatches(refs)
  const { matches = [], others = [] } = byPos.get(posRef) || {}
  const isEmpty = emptyRefs.includes(posRef)
  const shown = showAll ? [...matches.map(t => ({ t, fits: true })), ...others.map(t => ({ t, fits: false }))] : matches.map(t => ({ t, fits: true }))
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
        return (
          <div key={t.id} className="mb-2 p-2 rounded border" data-testid="template-card" style={fits ? undefined : { opacity: 0.8 }}>
            <div className="d-flex align-items-center gap-2">
              <strong>{t.name}</strong>
              <span className="badge" style={{ background: C.subtle, color: C.muted, border: `1px solid ${C.border}`, fontSize: 10 }}>{originOf(t)}</span>
              {fits && isEmpty && (
                <Button size="sm" className="ms-auto py-0" style={{ fontSize: 11 }} onClick={() => start(t, [posRef])}>Apply…</Button>
              )}
            </div>
            <div className="text-muted" style={{ fontSize: 11 }}>{describeRule(t.rule)}</div>
            <div style={{ fontSize: 11 }}>
              {(t.ingredients || []).map((i, k) => (
                <div key={k}><span style={mono}>{i.fromForm ? `from the Form (${i.fromForm})` : (i.newWrapper ? 'new wrapper' : i.slotLabel)}</span>
                  <span className="text-muted"> · {i.slotKey || ''} · {i.section === 'position' ? 'position' : 'inside'}</span></div>
              ))}
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
