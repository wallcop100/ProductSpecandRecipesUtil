import React, { useEffect, useMemo, useState } from 'react'
import { Modal, Button, Form, Table, Badge } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import InfoTip from './InfoTip'
import { formGroups, proposalContext, proposalFromTemplate, proposeRecipe, KIND_LABEL } from '../utils/recipeProposal'
import { styleRecords, styleRuleOf, ruleForDims, GROUP_DIMS } from '../utils/recipeStyles'
import RecipeStylesWindow from './RecipeStylesWindow'

/**
 * FormRecipesModal — recipes for the imported positions, the way process.md builds them:
 * one person-checked recipe per group, then the rest of the group copies it.
 *
 *   1. Groups: positions of the same kind (wrapper, driver location, interior/exterior —
 *      from the DesignDB) and the same kinds of Form product.
 *   2. The first of a group is PROPOSED: the shape from precedent (this project, projects
 *      opened before, finished projects), the products from the Form, every row saying
 *      where it came from and any part nobody can vouch for left empty. Build it, then fix
 *      it in the builder.
 *   3. "Use it for the rest": it is saved as the group's template, and the rest are shown
 *      with their own products before anything is written. Wrappers are shared where the
 *      contents match. One Undo per build.
 */

const groupTag = key => `form-group:${key}`
const tagsOf = t => { const a = t.applicable_tags; if (Array.isArray(a)) return a; try { return JSON.parse(a || '[]') } catch { return [] } }
const hasRecipe = (recipes, pos) => recipes.some(r => (r.PositionTypeRef || r.positionTypeRef) === pos && (r.IsDeleted || r.isDeleted) !== 'Y')

/**
 * The proposed rows. With a wrapper, each part says whether it ships INSIDE it (with the
 * assembly) or SEPARATELY (position level, e.g. a first-fix socket); `onPlace` lets you flip it.
 */
function ProposalTable({ proposal, onPlace, onInclude }) {
  const elementTypes = useStore(s => s.elementTypes)
  const familyRefs = useMemo(() => new Set(elementTypes.flatMap(e => [
    (e.IsCollection || e.isCollection) === 'Y' ? (e.ElementTypeRef || '').toLowerCase() : '',
    (e.Family || e.family || '').toLowerCase(),
  ]).filter(Boolean)), [elementTypes])
  if (!proposal || proposal.skip) return <div className="text-muted fst-italic">{proposal?.skip}</div>
  const lead = proposal.products?.find(x => x.lead)?.ref
  const where = r => {
    if (!proposal.wrapper) return <span className="text-muted">position</span>
    if (r.role === 'WRAPPER') return <span className="text-muted">position</span>
    const inside = r.section === 'internal'
    if (!onPlace || r.ref === lead) return <span className="text-muted">{inside ? 'inside wrapper' : 'separately'}</span>
    return (
      <Button size="sm" variant={inside ? 'outline-primary' : 'outline-secondary'} className="py-0 px-1" style={{ fontSize: 10 }}
        title={inside ? 'Ships inside the wrapper, with the assembly. Click to send it separately.' : 'Goes to site separately (position level). Click to put it inside the wrapper.'}
        onClick={() => onPlace(r.role, inside ? 'position' : 'internal')}>
        {inside ? 'inside wrapper' : 'separately'}
      </Button>
    )
  }
  return (
    <>
      <Table size="sm" className="mb-1" style={{ fontSize: 11 }}>
        <thead><tr><th title="Only ticked rows are added">Add</th><th>Ships</th><th>What</th><th>ElementType</th><th>Flags</th><th>From</th></tr></thead>
        <tbody>
          {proposal.rows.map((r, i) => (
            <tr key={i} style={r.missing ? { background: '#fff5f5' } : r.include === false ? { opacity: 0.55 } : undefined}>
              <td>
                {r.include !== undefined && (
                  <Form.Check type="checkbox" aria-label={`Add ${r.role.toLowerCase()}`} checked={r.include !== false}
                    disabled={!onInclude} onChange={e => onInclude?.(r.role, e.target.checked)}
                    title={r.suggested ? 'A suggestion from elsewhere: tick to add it' : 'Untick to leave it out'} />
                )}
              </td>
              <td>{where(r)}</td>
              <td>{r.role.toLowerCase()}</td>
              <td style={{ fontFamily: 'monospace' }}>
                {r.role === 'WRAPPER' && !r.ref ? <span className="text-success">new {proposal.wrapper?.family === 'ET-LIN' ? 'ET-LIN-NN' : 'ET-DL-NN'}</span>
                  : r.ref || <span className="text-danger">empty — add it in the builder</span>}
              </td>
              <td className="text-muted">
                {[r.isDesign === 'Y' && 'design', r.isContractItem === 'Y' && 'contract', r.quantity != null && `×${r.quantity}`,
                  r.dimQtyMultiplier != null && (r.isInteger === 'Y' ? `${r.dimQtyMultiplier}/m, whole` : `×length`)].filter(Boolean).join(' · ')}
              </td>
              <td className="text-muted">
                {r.from || ''}{r.from === 'the Form' && r.code ? <span>: <span style={{ fontFamily: 'monospace' }}>{r.code}</span></span> : null}
                {r.share ? <span> ({r.share})</span> : null}
                {r.ref && familyRefs?.has(r.ref.toLowerCase()) && (
                  <div className="text-danger"><MaterialIcon name="error" size={11} /> {r.ref} is a family, not a product: give {r.code || 'this code'} its own ElementType in Import product codes</div>
                )}
                {r.check && <div style={{ color: '#856404' }}><MaterialIcon name="warning" size={11} /> {r.check}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      {proposal.notes.map((n, i) => <div key={i} className="text-muted" style={{ fontSize: 10 }}><MaterialIcon name="info" size={11} /> {n}</div>)}
    </>
  )
}

export default function FormRecipesModal({ show, onHide, posRefs, onOpenPosition, focusGroup = null }) {
  const state = useStore(s => s)
  const { recipes, templates, formCaptures, library } = state
  const loadLibrary = useStore(s => s.loadLibrary)
  const buildProposedRecipe = useStore(s => s.buildProposedRecipe)
  const teachGroup = useStore(s => s.teachGroup)
  const startTeaching = useStore(s => s.startTeaching)
  const setRecipeChoice = useStore(s => s.setRecipeChoice)
  const recipeChoices = useStore(s => s.recipeChoices)
  const applyTaughtTemplate = useStore(s => s.applyTaughtTemplate)
  const [open, setOpen] = useState(null)           // group key being looked at
  const [picked, setPicked] = useState(() => new Set())
  const [msg, setMsg] = useState(null)
  const setRecipeSource = useStore(s => s.setRecipeSource)
  const [by, setBy] = useState(['main', 'kind', 'extras'])      // what splits the groups no style takes
  const [stylesOpen, setStylesOpen] = useState(null)             // { focusId } | null
  const [useStyle, setUseStyle] = useState({})                   // posRef -> template id (switched style)

  useEffect(() => {
    if (!show) return
    loadLibrary(); setMsg(null); setOpen(focusGroup)
    // Where recipes come from: remembered per project; else this project's styles when it has
    // recipes, the company style guide when it is new (the company rule).
    const pid = useStore.getState().projectId
    Promise.resolve(pid != null ? window.electronAPI?.db?.getPref?.(pid, 'recipe_source') : null).then(v => {
      const has = useStore.getState().recipes.some(r => (r.IsDeleted || r.isDeleted) !== 'Y')
      useStore.setState({ recipeSource: v === 'guide' || v === 'styles' ? v : (has ? 'styles' : 'guide') })
    }).catch(() => {})
  }, [show])   // eslint-disable-line react-hooks/exhaustive-deps

  const source = state.recipeSource || 'styles'
  const ctx = useMemo(() => proposalContext(state, library), [state, library])
  const refs = posRefs?.length ? posRefs : Object.keys(formCaptures?.byPosition || {})
  const records = useMemo(() => styleRecords(state), [state.positionTypes, state.elementTypes, state.formCaptures, state.positionUI])   // eslint-disable-line react-hooks/exhaustive-deps
  const styles = useMemo(() => (source === 'guide' ? [] : templates.filter(t => styleRuleOf(t))), [templates, source])
  const { groups: rawGroups, skipped } = useMemo(() => (show ? formGroups(refs, ctx, { records, styles, by }) : { groups: [], skipped: [] }),
    [show, refs.join('|'), ctx, records, styles, by.join('|')])   // eslint-disable-line react-hooks/exhaustive-deps
  const sourceNames = ctx.sources.map(s => s.name)
  const phantoms = useMemo(() => (show ? useStore.getState().phantomWrappers() : []), [show, state.elementTypes, state.psRows])   // eslint-disable-line react-hooks/exhaustive-deps
  const taughtFor = g => (typeof g === 'string' ? templates.find(t => tagsOf(t).includes(groupTag(g)))
    : g.style || templates.find(t => tagsOf(t).includes(groupTag(g.key))))
  const choiceKey = g => g.sig || g.key
  // What each group still needs a person for: its first proposal's empty parts, or the rows its
  // style could not vouch for. Groups with work to do come first.
  const groups = useMemo(() => rawGroups.map(g => {
    const t = taughtFor(g)
    const gaps = t
      ? g.positions.filter(p => !hasRecipe(recipes, p)).reduce((n, p) => n + (proposalFromTemplate(t, p, ctx).rows?.filter(r => r.check || r.missing).length || 0), 0)
      : (proposeRecipe(g.first, ctx).rows?.filter(r => r.missing).length || 0)
    return { ...g, gaps }
  }).sort((a, b) => (b.gaps > 0) - (a.gaps > 0)), [rawGroups, templates, recipes, ctx])   // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = p => setPicked(s => { const n = new Set(s); n.has(p) ? n.delete(p) : n.add(p); return n })

  // Checking the first one happens in the builder; a bar there says what is still empty and
  // brings you back here (see TeachBar).
  function goCheck(g, missing) {
    startTeaching({ groupKey: g.key, label: g.label, posRef: g.first, others: g.positions.filter(p => p !== g.first), refs, missing,
      rule: ruleForDims(records.get(g.first) || {}, by) })
    onOpenPosition?.(g.first)
  }
  function buildFirst(g) {
    const res = buildProposedRecipe(g.first)
    if (!res) return
    goCheck(g, res.skipped.filter(r => !r.ref && r.role !== 'WRAPPER').map(r => r.role))
  }
  function openFirst(g) {
    const missing = useStore.getState().proposeRecipeFor(g.first).rows?.filter(r => r.missing).map(r => r.role) || []
    goCheck(g, missing)
  }
  async function teach(g) {
    // Saved as a STYLE: its rule, prefilled from what this group has in common, picks its
    // positions from now on (edit it in Recipe styles).
    const rule = source === 'styles' || !g.style ? ruleForDims(records.get(g.first) || {}, by) : null
    const t = await teachGroup({ groupKey: g.key, label: g.label, posRef: g.first, rule })
    setPicked(new Set(g.positions.filter(p => p !== g.first && !hasRecipe(useStore.getState().recipes, p))))
    if (t?.id && rule) setOpen(`style:${t.id}`)
    setMsg({ text: `${g.first} is now the recipe for this group, saved as a style. Tick the rest and build.`, styleId: t?.id })
  }
  // Back from the builder having used the first one: the rest ready to tick. Applied once per
  // return, when its group is there (taught from the builder, the group is now its style's).
  const focusDone = React.useRef(null)
  useEffect(() => { if (!show) focusDone.current = null }, [show])
  useEffect(() => {
    if (!show || !focusGroup) return
    const lt = useStore.getState().lastTaught
    const key = lt?.groupKey === focusGroup && lt.id && groups.some(x => x.key === `style:${lt.id}`) ? `style:${lt.id}` : focusGroup
    // Once per group it lands on (the style's group can appear a moment later, once the
    // project's build source is read).
    if (focusDone.current === key) return
    const g = groups.find(x => x.key === key)
    if (!g) return
    focusDone.current = key
    setOpen(key)
    if (taughtFor(g)) setPicked(new Set(g.positions.filter(p => !hasRecipe(recipes, p))))
  }, [show, focusGroup, groups])   // eslint-disable-line react-hooks/exhaustive-deps
  function buildRest(g) {
    const t = taughtFor(g)
    if (!t) return
    // Positions switched to another style are built from that one.
    const byTpl = new Map()
    for (const p of picked) {
      const id = useStyle[p] || t.id
      if (!byTpl.has(id)) byTpl.set(id, [])
      byTpl.get(id).push(p)
    }
    let built = [], sk = []
    for (const [id, ps] of byTpl) {
      const r = applyTaughtTemplate(id, ps)
      built = built.concat(r.built); sk = sk.concat(r.skipped)
    }
    setMsg(`Built ${built.length} from ${t.name || g.first}${sk.length ? `; left ${sk.length} alone (${sk.map(s => s.posRef).join(', ')})` : ''}. One Undo takes it back.`)
    setPicked(new Set())
  }

  return (
    <Modal show={show} onHide={onHide} size="xl" scrollable>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 15 }}>
          <MaterialIcon name="auto_awesome" size={16} /> Recipes from the Form{' '}
          <InfoTip size={12}>
            One recipe per group is built and checked by you; the rest of the group copies it with their own
            Form products. Shapes follow process.md and precedent: {sourceNames.join(', ') || 'the rules only'}.
          </InfoTip>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ fontSize: 12 }}>
        <div className="d-flex align-items-center gap-2 flex-wrap mb-2 pb-2 border-bottom" data-testid="build-options">
          <span className="text-muted">Build from</span>
          <div className="btn-group btn-group-sm" role="group" aria-label="Build from">
            <Button variant={source === 'styles' ? 'primary' : 'outline-secondary'} style={{ fontSize: 11 }} onClick={() => setRecipeSource('styles')}
              title="This project's recipe styles and its own recipes first (an existing project follows its own precedent)">This project’s styles</Button>
            <Button variant={source === 'guide' ? 'primary' : 'outline-secondary'} style={{ fontSize: 11 }} onClick={() => setRecipeSource('guide')}
              title="The company's patterns from other projects, ignoring this project's recipes (a new project follows the style guide)">Company style guide</Button>
          </div>
          <span className="text-muted ms-2">Group by</span>
          {GROUP_DIMS.map(d => (
            <Button key={d.key} size="sm" variant={by.includes(d.key) ? 'secondary' : 'outline-secondary'} style={{ fontSize: 11 }}
              aria-pressed={by.includes(d.key)} onClick={() => setBy(b => (b.includes(d.key) ? b.filter(x => x !== d.key) : [...b, d.key]))}>
              {d.label}
            </Button>
          ))}
          <span className="text-muted" data-testid="group-count">{groups.length} group{groups.length === 1 ? '' : 's'}</span>
          <Button size="sm" variant="link" className="ms-auto p-0" style={{ fontSize: 11 }} onClick={() => setStylesOpen({})}>
            <MaterialIcon name="style" size={13} /> Recipe styles…
          </Button>
        </div>
        {msg && (
          <div className="mb-2 px-2 py-1 rounded" style={{ background: '#d1e7dd', color: '#0f5132' }}>
            {typeof msg === 'string' ? msg : msg.text}
            {msg?.styleId && <Button size="sm" variant="link" className="p-0 ms-2 align-baseline" style={{ fontSize: 12 }}
              onClick={() => setStylesOpen({ focusId: msg.styleId })}>Edit its rule</Button>}
          </div>
        )}
        {phantoms.length > 0 && (
          <div className="mb-2 px-2 py-1 rounded d-flex align-items-center gap-2" style={{ background: '#f8d7da', color: '#842029' }} data-testid="phantoms">
            <MaterialIcon name="report" size={14} />
            <span>{phantoms.length} part{phantoms.length === 1 ? ' was' : 's were'} wrongly made into wrappers (Ideaworks N/A):{' '}
              <span style={{ fontFamily: 'monospace' }}>{phantoms.slice(0, 4).map(p => p.ref).join(', ')}{phantoms.length > 4 ? '…' : ''}</span></span>
            <Button size="sm" variant="danger" className="ms-auto py-0" style={{ fontSize: 11 }}
              onClick={() => { const n = useStore.getState().repairPhantomWrappers(); setMsg(`Fixed ${n}: no longer wrappers; their Form product is back on the spec where known.`) }}>
              Fix them
            </Button>
          </div>
        )}
        {groups.map(g => {
          const firstBuilt = g.style ? true : hasRecipe(recipes, g.first)
          const taught = taughtFor(g)
          // A style group is built entirely from the style; otherwise the first seeds the rest.
          const rest = g.style ? g.positions : g.positions.filter(p => p !== g.first)
          const done = g.positions.filter(p => hasRecipe(recipes, p)).length
          const isOpen = open === g.key
          return (
            <div key={g.key} className="mb-2 rounded border" data-testid="form-group">
              <div className="d-flex align-items-center gap-2 px-2 py-1" style={{ background: '#f8f9fa', cursor: 'pointer' }}
                onClick={() => setOpen(isOpen ? null : g.key)}>
                <MaterialIcon name={isOpen ? 'expand_more' : 'chevron_right'} size={16} />
                {g.style && <Badge bg="primary" style={{ fontWeight: 500 }}><MaterialIcon name="style" size={11} /> style</Badge>}
                <strong>{g.label}</strong>
                <span className="text-muted">{g.positions.length} position{g.positions.length === 1 ? '' : 's'}</span>
                {g.gaps > 0 && <span style={{ color: '#856404' }} data-testid="group-gaps"><MaterialIcon name="warning" size={12} /> {g.gaps} to check</span>}
                <Badge bg={done === g.positions.length ? 'success' : taught ? 'info' : firstBuilt ? 'warning' : 'secondary'} className="ms-auto">
                  {done === g.positions.length ? 'all built' : taught ? `taught · ${done}/${g.positions.length}` : firstBuilt ? `check ${g.first}` : 'not started'}
                </Badge>
              </div>
              {isOpen && (
                <div className="p-2">
                  {!firstBuilt && (
                    <>
                      <div className="mb-1">
                        <strong>Step 1 of 2.</strong> <span style={{ fontFamily: 'monospace' }}>{g.first}</span> is built first, as proposed below
                        (nothing is written yet). You check it in the builder and fill anything empty; a bar at the top of the
                        builder brings you back here{rest.length ? ` to copy it to the other ${rest.length}` : ''}.
                      </div>
                      {(() => {
                        const prop = useStore.getState().proposeRecipeFor(g.first)
                        const choice = recipeChoices[choiceKey(g)] || {}
                        const current = prop.wrapper ? prop.kind.wk : 'none'
                        const precedentText = prop.kind?.precedentSource && prop.kind.precedentSource !== 'rule'
                          ? `${KIND_LABEL[prop.kind.precedentWk] || prop.kind.precedentWk}${prop.kind.precedentShare ? `, ${prop.kind.precedentShare}` : ''} on ${prop.kind.precedentSource}`
                          : 'process.md §7'
                        return (
                          <>
                            <div className="d-flex align-items-center gap-2 mb-1">
                              <span>Wrapper:</span>
                              <Form.Select size="sm" style={{ width: 'auto', fontSize: 11 }} aria-label="Wrapper" value={current}
                                onChange={e => setRecipeChoice(choiceKey(g), { wrap: e.target.value })}>
                                <option value="DL">DL wrapper (point sources)</option>
                                <option value="LIN">LIN wrapper (linear)</option>
                                <option value="none">No wrapper</option>
                              </Form.Select>
                              <InfoTip size={11}>
                                A wrapper is what ships to site as one: parts inside it arrive together as an assembly;
                                parts outside it go separately (first-fix sockets, frames). Choose per group; flip each part below.
                              </InfoTip>
                              <span className="text-muted" style={{ fontSize: 11 }}>
                                Precedent: {precedentText}{choice.wrap ? ' — you changed it' : ''}
                              </span>
                            </div>
                            <ProposalTable proposal={prop}
                              onPlace={(role, place) => setRecipeChoice(choiceKey(g), { place: { ...(choice.place || {}), [role]: place } })}
                              onInclude={(role, on) => setRecipeChoice(choiceKey(g), { include: { ...(choice.include || {}), [role]: on } })} />
                          </>
                        )
                      })()}
                      <Button size="sm" onClick={() => buildFirst(g)}>Build {g.first} and check it in the builder</Button>
                    </>
                  )}
                  {firstBuilt && !taught && (
                    <div className="d-flex align-items-center gap-2">
                      <span><strong>Step 2 of 2.</strong> <span style={{ fontFamily: 'monospace' }}>{g.first}</span> is built. If it&apos;s right, copy it to the rest of the group; if not, fix it first.</span>
                      <Button size="sm" variant="outline-secondary" onClick={() => openFirst(g)}>Check {g.first} in the builder</Button>
                      <Button size="sm" disabled={rest.length === 0} onClick={() => teach(g)}>Use it for the other {rest.length}</Button>
                    </div>
                  )}
                  {taught && rest.length > 0 && (
                    <>
                      {g.style ? (
                        <div className="mb-1 text-muted">
                          From the style <strong>{g.style.name}</strong>, each with its own Form products.{' '}
                          <Button size="sm" variant="link" className="p-0 align-baseline" style={{ fontSize: 12 }} onClick={() => setStylesOpen({ focusId: g.style.id })}>Edit the style</Button>
                        </div>
                      ) : (
                        <div className="mb-1 text-muted">
                          From <span style={{ fontFamily: 'monospace' }}>{g.first}</span>, each with its own Form products.{' '}
                          Changed {g.first} in the builder?{' '}
                          <Button size="sm" variant="link" className="p-0 align-baseline" style={{ fontSize: 12 }} onClick={() => teach(g)}>Use it again</Button>
                        </div>
                      )}
                      {rest.map(p => {
                        const built = hasRecipe(recipes, p)
                        const tpl = (useStyle[p] && templates.find(t => t.id === useStyle[p])) || taught
                        const prop = built ? null : proposalFromTemplate(tpl, p, ctx)
                        const checks = prop?.rows?.filter(r => r.check || r.missing).length || 0
                        return (
                          <div key={p} className="mb-1">
                            <Form.Check type="checkbox" id={`fr-${p}`} disabled={built} checked={!built && picked.has(p)} onChange={() => toggle(p)}
                              label={<span><span style={{ fontFamily: 'monospace' }}>{p}</span>
                                {built ? <span className="text-success"> · built</span>
                                  : <span className="text-muted"> · {prop?.products?.find(x => x.lead)?.code} {prop?.wrapper && !prop.wrapper.isNew ? `· shares ${prop.wrapper.ref}` : ''}
                                    {checks > 0 && <span style={{ color: '#856404' }}> · {checks} to check</span>}</span>}</span>} />
                            {!built && styles.length > 1 && (
                              <Form.Select size="sm" className="ms-4 mb-1" style={{ width: 'auto', fontSize: 11 }} aria-label={`Style for ${p}`}
                                value={tpl.id} onChange={e => setUseStyle(u => ({ ...u, [p]: e.target.value }))}>
                                {[taught, ...styles.filter(t => t.id !== taught.id)].map(t => <option key={t.id} value={t.id}>{t === taught ? `${t.name} (matched)` : t.name}</option>)}
                              </Form.Select>
                            )}
                            {!built && picked.has(p) && checks > 0 && <div className="ms-4"><ProposalTable proposal={prop} /></div>}
                          </div>
                        )
                      })}
                      <Button size="sm" disabled={picked.size === 0} onClick={() => buildRest(g)}>Build {picked.size}</Button>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {skipped.length > 0 && (
          <div className="text-muted mt-2" style={{ fontSize: 11 }}>
            Not reciped here: {skipped.map(s => `${s.posRef} (${s.why})`).join('; ')}
          </div>
        )}
        {groups.length === 0 && skipped.length === 0 && <div className="text-muted fst-italic">Nothing imported from a Form yet.</div>}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" size="sm" onClick={onHide}>Close</Button>
      </Modal.Footer>
      <RecipeStylesWindow show={!!stylesOpen} focusId={stylesOpen?.focusId} onHide={() => setStylesOpen(null)} records={records} />
    </Modal>
  )
}
