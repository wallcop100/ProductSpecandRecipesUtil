import InfoTip from './InfoTip'
import React, { useEffect, useMemo, useState } from 'react'
import { Modal, Button, Form, Dropdown } from 'react-bootstrap'
import {
  DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors, useDraggable, useDroppable,
} from '@dnd-kit/core'
import MaterialIcon from './MaterialIcon'
import IconButton from './IconButton'
import { refamily, ACCESSORIES, nextRef } from '../utils/etSeed'
import { useCompanion } from '../platform/companion'
import { shareOutcomes } from '../platform/outcomes'
import { familyForJob } from '../utils/codeJobs'
import { jobLabel, ruleText } from '../utils/recipeKinds'
import useStore from '../store/useStore'
import { CANON_FAMILIES } from '../data/etCanon'
import { C } from '../styles/tokens'

/**
 * BulkCreateETModal — every code that still needs an ElementType, proposed at once.
 *
 * Everything starts ticked: the job is weeding out the wrong ones, not building the
 * right ones by hand. Proposals are grouped by family. A wrong family is fixed for the whole
 * group from its header, or for one code by dragging its grip onto another family (or its
 * ⇄ menu, which also reaches families with no codes yet). Every move renumbers the ref.
 *
 * A family that does not exist yet is created with its members: its header shows the ref,
 * description and parent it will get, all editable, and it can be unticked. "+ New family"
 * adds one of your own. A code no rule could place sits in "Needs a family", and blocks
 * Apply until it has one or is unticked.
 *
 * A code placed by a firm rule shows a green tick (the rule on hover) — no repeated text.
 * Only a guess worth checking says so in words.
 *
 * Props:
 *   proposals, newFamilies — from proposeElementTypes (etSeed.js)
 *   families      — every family ref the project already has
 *   elementTypes  — the project's ETs, for clash checks and re-numbering
 *   onApply({ families, items }) — the ticked new families and proposals, as edited
 */

const WHY = {
  stem: 'same product line',
  shape: r => `code shaped like ${r.shapedOn?.example} (${r.shapedOn?.n} known)`,
  canon: r => `company family — ${r.canon}`,
  style: r => `styled like ${r.styledOn?.ref}${r.styledOn?.source ? ` (${r.styledOn.source})` : ''}`,
  line: 'known product line',
  track: r => `track — ${r.canon}`,
  library: r => `same product on ${r.styledOn?.source || 'an earlier project'} (${r.styledOn?.ref})`,
  design: "position's design element",
  parent: p => `position parent ${p} (not a company family)`,
  extra: 'extra code in its cell',
  you: 'you chose it',
  kit: r => `usually with ${r.kitOf}`,
  job: r => `${JOB_LABEL[r.job?.slot === 'TAPE' ? `TAPE:${r.job.variant}` : r.job?.slot] || 'its job'}${r.wasFamily ? ` (not ${r.wasFamily})` : ''}`,
}
const JOB_LABEL = { 'TAPE:tape': 'LED tape', 'TAPE:flex': 'neon / flex', 'TAPE:fixed': 'fixed linear', PROFILE: 'a profile', DIFFUSER: 'a diffuser',
  END_CAPS: 'end caps', CLIPS: 'clips', MOUNT_CHANNEL: 'a mounting channel', MOUNT_COLLAR: 'a mounting collar / frame', LOCAL_DRIVER: 'a driver',
  REMOTE_DRIVER: 'a driver', EMERGENCY: 'an emergency pack', OPTIC_ACCESSORY: 'an optic accessory', ACCESSORY: 'an accessory', FIRE_HOOD: 'a fire hood',
  LOCKING_LEVER: 'a locking lever', TRACK_ACCESSORY: 'a track accessory' }
const whyText = r => (typeof WHY[r.why] === 'function' ? WHY[r.why](r.why === 'parent' ? r.parent : r) : WHY[r.why] || '')
/** Placed by a firm rule: shown as a tick, not a sentence. */
const verified = r => !!r.why && !r.checkRef && r.why !== 'parent' && r.why !== 'you'
const canonByRef = new Map(CANON_FAMILIES.map(f => [f.ref.toLowerCase(), f]))
const NONE = '__none'
const REUSE = '__reuse'
const SKIP = '__skip'

export default function BulkCreateETModal({
  show, onHide, proposals: initial, newFamilies: initialFamilies, families = [], elementTypes = [], onApply, tabs = null, animation = true, header = null, focusCode = null,
  onShowRows = null,
}) {
  const [rows, setRows] = useState(initial || [])
  const [fams, setFams] = useState(initialFamilies || [])
  useEffect(() => {
    if (show) { setRows(initial || []); setFams(initialFamilies || []) }
  }, [show, initial, initialFamilies])
  // Opened from one code ("needs ET"): bring it into view, highlighted.
  useEffect(() => {
    if (!show || !focusCode) return
    const t = setTimeout(() => {
      const el = [...document.querySelectorAll('[data-testid="bulk-et-row"]')].find(e => e.dataset.code === focusCode)
      el?.scrollIntoView?.({ block: 'center' })
    }, 50)
    return () => clearTimeout(t)
  }, [show, focusCode])

  const existing = useMemo(
    () => new Set(elementTypes.map(e => (e.ElementTypeRef || e.elementTypeRef || '').toLowerCase())),
    [elementTypes]
  )
  const famByRef = useMemo(() => new Map(fams.map((f, i) => [f.ref, i])), [fams])
  const [adding, setAdding] = useState(null)        // { ref, description, parent, moveIndex } while adding a family
  const [dragging, setDragging] = useState(null)    // row index being dragged
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  )
  const knownFamily = ref => families.some(f => f.toLowerCase() === ref.toLowerCase())
    || fams.some(f => f.ref.toLowerCase() === ref.toLowerCase())

  /** A family moved to that the project lacks joins the ones to create (canon ones with their parents). */
  function withFamily(fs, ref, extra = {}) {
    if (!ref || families.some(f => f.toLowerCase() === ref.toLowerCase())
      || fs.some(f => f.ref.toLowerCase() === ref.toLowerCase())) return fs
    const canon = canonByRef.get(ref.toLowerCase())
    const next = [...fs, {
      ref, include: true, from: null,
      description: canon?.description || '', parent: canon?.parent || null, ...extra,
    }]
    return canon?.parent ? withFamily(next, canon.parent) : next
  }

  /** Move rows to a family (dragged, from a row's menu, or a whole group): renumbered refs. */
  function moveTo(indices, family) {
    if (!family) return
    setFams(fs => withFamily(fs, family))
    setRows(rs => refamily(rs, indices, family, elementTypes))
  }

  function addFamily() {
    const ref = adding.ref.trim()
    if (!ref || knownFamily(ref)) return
    setFams(fs => withFamily(fs, ref, { description: adding.description.trim(), parent: adding.parent || null, custom: true }))
    if (adding.moveIndex != null) setRows(rs => refamily(rs, [adding.moveIndex], ref, elementTypes))
    setAdding(null)
  }

  function onDragEnd(e) {
    setDragging(null)
    const i = e.active?.data?.current?.index
    const family = e.over?.data?.current?.family
    if (i == null || !family || rows[i]?.family === family) return
    moveTo([i], family)
  }
  const creating = r => r.include && r.action === 'create'

  // A ref is bad when blank, already in the project, used twice here, or its family is unticked.
  const problems = useMemo(() => {
    const count = new Map()
    rows.forEach(r => { if (creating(r)) { const k = r.ref.trim().toLowerCase(); count.set(k, (count.get(k) || 0) + 1) } })
    const out = new Map()
    rows.forEach((r, i) => {
      if (!creating(r)) return
      const k = r.ref.trim().toLowerCase()
      const fi = famByRef.get(r.family)
      if (!r.family) out.set(i, 'needs a family')
      else if (fi !== undefined && !fams[fi].include) out.set(i, 'its new family is unticked')
      else if (!k) out.set(i, 'needs a ref')
      else if (existing.has(k)) out.set(i, 'already exists')
      else if (count.get(k) > 1) out.set(i, 'used twice here')
    })
    return out
  }, [rows, fams, famByRef, existing])

  const groups = useMemo(() => {
    const g = new Map()
    rows.forEach((r, i) => {
      const key = r.action === 'reuse' ? REUSE : r.action === 'skip' ? SKIP : (r.family || NONE)
      if (!g.has(key)) g.set(key, [])
      g.get(key).push(i)
    })
    // A family you added stays on screen, empty, as somewhere to drop codes.
    for (const f of fams) if (f.custom && !g.has(f.ref)) g.set(f.ref, [])
    const rank = k => (k === NONE ? 0 : k === REUSE ? 3 : k === SKIP ? 4 : k === ACCESSORIES ? 2 : 1)
    return [...g.entries()].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
  }, [rows, fams])

  const patch = (i, next) => setRows(rs => rs.map((r, k) => (k === i ? { ...r, ...next } : r)))
  // Kits, beside a companion: the parts used with a profile / channel on other projects. A line
  // each, never added unasked; Add proposes the part's ElementType with the rest.
  const companion = useCompanion()
  const projectNumber = useStore(s => s.projectNumber)
  const [kits, setKits] = useState([])
  const [kitAnswered, setKitAnswered] = useState(() => new Set())
  const anchorKey = rows.filter(r => r.include && ['PROFILE', 'MOUNT_CHANNEL'].includes(r.job?.slot)).map(r => `${r.manufacturer}|${r.code}`).sort().join(',')
  useEffect(() => {
    setKits([])
    if (!show || !companion?.kits || !anchorKey) return
    let live = true
    companion.kits(anchorKey.split(',').map(k => { const [manufacturer, code] = k.split('|'); return { code, manufacturer } }), projectNumber)
      .then(k => { if (live) setKits(k || []) })
    return () => { live = false }
  }, [show, companion, anchorKey, projectNumber])
  const kitLines = kits.filter(k => !kitAnswered.has(k.key) && !rows.some(r => String(r.code).toUpperCase() === k.part.code))
  function answerKit(k, outcome) {
    setKitAnswered(s => new Set(s).add(k.key))
    shareOutcomes(companion, projectNumber, [{ kind: 'kit', key: k.key, tier: 'kit', outcome, supplied: k.part.code, final: outcome === 'accepted' ? k.part.code : null }])
    if (outcome !== 'accepted') return
    const anchorRow = rows.find(r => String(r.code).toUpperCase() === k.anchor.code)
    const house = familyForJob({ slot: k.part.slot }) || { family: ACCESSORIES, head: ACCESSORIES }
    const taken = [...elementTypes.map(e => e.ElementTypeRef || e.elementTypeRef), ...rows.map(r => r.ref)].filter(Boolean)
    setRows(rs => [...rs, {
      code: k.part.code, manufacturer: anchorRow?.manufacturer || '', include: true, action: 'create', reuseRef: null,
      family: house.family, ref: nextRef(house.head, taken), name: k.part.name || `${anchorRow?.manufacturer || ''} - ${k.part.code}`.trim(),
      description: '', why: 'kit', kitOf: k.anchor.code, job: { slot: k.part.slot, variant: '' }, parent: null, spread: 0,
    }])
    setFams(fs => withFamily(fs, house.family))
  }

  const included = rows.filter(r => r.include && r.action !== 'skip')
  const notCodes = rows.filter(r => !r.include && r.notCode).map(r => r.code)
  const nCreate = included.filter(r => r.action === 'create').length
  const usedFams = new Set(rows.filter(creating).map(r => r.family))
  const famsToCreate = fams.filter(f => f.include && usedFams.has(f.ref))

  // Everywhere a code can go: the project's families, the ones proposed here, and the company's.
  const familyOptions = useMemo(
    () => [...new Set([...families, ...fams.map(f => f.ref), ...rows.map(r => r.family), ...CANON_FAMILIES.map(f => f.ref)]
      .filter(Boolean))].sort(),
    [families, fams, rows]
  )

  /** Rename a proposed new family: its members follow and are renumbered. */
  function renameFamily(fi, idxs, ref) {
    const old = fams[fi].ref
    setFams(fs => fs.map((f, k) => (k === fi ? { ...f, ref } : f)))
    setRows(rs => refamily(rs, idxs.filter(i => rs[i].family === old), ref, elementTypes))
  }

  return (
    <Modal animation={animation} show={show} onHide={onHide} size="xl" scrollable>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 16 }}>
          New ElementTypes for {rows.length} code{rows.length === 1 ? '' : 's'}
        </Modal.Title>
        {tabs}

      </Modal.Header>
      <Modal.Body style={{ fontSize: 12 }}>
        {header}
        {kitLines.length > 0 && (
          <div className="mb-2 px-2 py-1 rounded companion-card" data-testid="kit-suggestions" data-source="companion" style={{ background: C.accentTint, border: `1px solid ${C.accentEdge}` }}>
            {kitLines.map(k => (
              <div key={k.key} className="d-flex align-items-center gap-2 py-1">
                <MaterialIcon name="extension" size={13} style={{ color: C.accent }} />
                <span style={{ flex: 1 }}>Usually with <span className="font-monospace">{k.anchor.code}</span>: <b>{jobLabel(k.part.slot)}</b>{' '}
                  <span className="font-monospace">{k.part.code}</span>{k.part.name ? <span className="text-muted"> {k.part.name}</span> : null}
                  {ruleText({ qty: k.qty, dim: k.dim, integer: k.integer ? 1 : 0 }) ? `, ${ruleText({ qty: k.qty, dim: k.dim, integer: k.integer ? 1 : 0 })}` : ''}</span>
                <Button size="sm" variant="outline-primary" style={{ fontSize: 11, padding: '0px 8px' }} onClick={() => answerKit(k, 'accepted')}>Add</Button>
                <Button size="sm" variant="link" className="text-muted p-0" aria-label="Dismiss" onClick={() => answerKit(k, 'dismissed')}>
                  <MaterialIcon name="close" size={13} />
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="d-flex align-items-start gap-2 mb-2">
          <div className="text-muted d-flex align-items-center gap-2" style={{ fontSize: 11 }}>
            <span><MaterialIcon name="check_box" size={12} /> untick what is wrong</span>
            <span><MaterialIcon name="drag_indicator" size={12} /> drag to another family</span>
            <span><MaterialIcon name="verified" size={12} style={{ color: C.success }} /> firm rule</span>
            <InfoTip>
              Drag a code by its grip onto another family, or move a whole group from its header;
              refs renumber as you go. Edit any ref, name or description in place. A green tick means
              a firm rule placed it.
            </InfoTip>
          </div>
          {!adding && (
            <Button size="sm" variant="outline-primary" className="ms-auto text-nowrap" style={{ fontSize: 11 }}
              onClick={() => setAdding({ ref: 'ET-', description: '', parent: '', moveIndex: null })}>
              <MaterialIcon name="add" size={13} /> New family
            </Button>
          )}
        </div>

        {adding && (
          <div className="d-flex align-items-center gap-2 mb-3 p-2 border rounded flex-wrap" style={{ background: C.subtle }}
            data-testid="new-family-form">
            <span className="fw-semibold" style={{ fontSize: 11 }}>
              New family{adding.moveIndex != null ? ` for ${rows[adding.moveIndex]?.code}` : ''}
            </span>
            <Form.Control size="sm" autoFocus value={adding.ref} aria-label="New family ref"
              style={{ width: 220, fontFamily: 'monospace', fontSize: 11 }}
              isInvalid={adding.ref.trim().length > 3 && knownFamily(adding.ref.trim())}
              onChange={e => setAdding(a => ({ ...a, ref: e.target.value.toUpperCase() }))}
              onKeyDown={e => { if (e.key === 'Enter') addFamily() }} />
            <Form.Control size="sm" value={adding.description} aria-label="New family description" placeholder="description"
              style={{ width: 220, fontSize: 11 }} onChange={e => setAdding(a => ({ ...a, description: e.target.value }))} />
            <Form.Select size="sm" value={adding.parent} aria-label="New family parent" style={{ width: 200, fontSize: 11 }}
              onChange={e => setAdding(a => ({ ...a, parent: e.target.value }))}>
              <option value="">no parent</option>
              {familyOptions.map(f => <option key={f} value={f}>{f}</option>)}
            </Form.Select>
            <Button size="sm" variant="primary" style={{ fontSize: 11 }} onClick={addFamily}
              disabled={adding.ref.trim().length <= 3 || knownFamily(adding.ref.trim())}>Add</Button>
            <Button size="sm" variant="link" style={{ fontSize: 11 }} onClick={() => setAdding(null)}>Cancel</Button>
          </div>
        )}

        <DndContext sensors={sensors} onDragStart={e => setDragging(e.active?.data?.current?.index ?? null)}
          onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
        {groups.map(([key, idxs]) => {
          const special = key === REUSE || key === SKIP
          const fi = famByRef.get(key)
          const isNew = fi !== undefined
          const allOn = idxs.every(i => rows[i].include)
          return (
            <FamilyDrop key={key} family={special || key === NONE ? null : key} testid={`group-${key}`}
              style={key === NONE ? { borderColor: C.dangerTint } : undefined}>
              <div className="d-flex align-items-center gap-2 px-2 py-1 flex-wrap"
                style={{ background: key === NONE ? C.dangerTint : C.subtle }}>
                {key !== SKIP && (
                  <Form.Check type="checkbox" checked={allOn} aria-label={allOn ? 'Untick the group' : 'Tick the group'}
                    onChange={() => setRows(rs => rs.map((r, k) => (idxs.includes(k) ? { ...r, include: !allOn } : r)))} />
                )}
                {key === REUSE ? (
                  <span className="fw-semibold"><MaterialIcon name="link" size={13} /> Already in the project — reuse the existing ElementType</span>
                ) : key === SKIP ? (
                  <span className="text-muted">Not product codes (N/A, TBC) — nothing to create</span>
                ) : key === NONE ? (
                  <span className="fw-semibold" style={{ color: C.dangerInk }}>
                    <MaterialIcon name="help" size={13} /> Needs a family — no rule could place these
                    (usually a PositionType missing from the DesignDB)
                  </span>
                ) : isNew ? (
                  <>
                    <span className="rounded px-1" style={{ background: C.accentTint, color: C.accentInk, fontSize: 10 }}>new family</span>
                    <Form.Check type="checkbox" checked={fams[fi].include} label="create"
                      aria-label={`Create family ${key}`} className="small"
                      onChange={() => setFams(fs => fs.map((f, k) => (k === fi ? { ...f, include: !f.include } : f)))} />
                    <Form.Control size="sm" value={fams[fi].ref} aria-label={`Family ref ${key}`}
                      style={{ width: 260, fontFamily: 'monospace', fontSize: 11 }}
                      onChange={e => renameFamily(fi, idxs, e.target.value)} />
                    <Form.Control size="sm" value={fams[fi].description} aria-label={`Family description ${key}`}
                      style={{ width: 220, fontSize: 11 }} placeholder="description"
                      onChange={e => setFams(fs => fs.map((f, k) => (k === fi ? { ...f, description: e.target.value } : f)))} />
                    {fams[fi].parent && <span className="text-muted" style={{ fontSize: 10 }}>under {fams[fi].parent}</span>}
                  </>
                ) : (
                  <span className="fw-semibold" style={{ fontFamily: 'monospace' }}>{key}</span>
                )}
                {!special && (
                  <Form.Select size="sm" style={{ width: 190, fontSize: 11 }} value=""
                    aria-label={`Move ${key === NONE ? 'unplaced codes' : key} to family`}
                    onChange={e => e.target.value && moveTo(idxs, e.target.value)}>
                    <option value="">move all to…</option>
                    {familyOptions.filter(f => f !== key).map(f => <option key={f} value={f}>{f}</option>)}
                  </Form.Select>
                )}
                <span className="text-muted ms-auto" style={{ fontSize: 11 }}>{idxs.length}</span>
              </div>

              <table className="table table-sm mb-0" style={{ fontSize: 11 }}>
                <tbody>
                  {idxs.map(i => {
                    const r = rows[i]
                    const bad = problems.get(i)
                    return (
                      <tr key={i} data-testid="bulk-et-row" data-code={r.code}
                        style={{ opacity: r.include ? (dragging === i ? 0.35 : 1) : 0.45,
                          background: focusCode && r.code === focusCode ? C.attnTint : undefined }}>
                        <td style={{ width: 44, whiteSpace: 'nowrap' }}>
                          {r.action === 'create' ? <Grip index={i} code={r.code} /> : <span style={{ display: 'inline-block', width: 16 }} />}
                          {r.action !== 'skip' && (
                            <Form.Check inline type="checkbox" checked={r.include} aria-label={`Include ${r.code}`} className="me-0"
                              onChange={() => patch(i, { include: !r.include })} />
                          )}
                        </td>
                        <td style={{ width: 200 }}>
                          <div style={{ fontFamily: 'monospace', fontWeight: 600, wordBreak: 'break-all' }}>{r.code}</div>
                          <div className="text-muted">{r.manufacturer || <em>no maker</em>}</div>
                          {/* Unticked: say what that means, and offer the two ways out of it. */}
                          {!r.include && r.action === 'create' && (
                            <div className="mt-1" data-testid="unticked-note" style={{ fontSize: 10 }}>
                              {r.notCode ? (
                                <span style={{ color: C.danger }}>
                                  Not a code: its words become a note on every row.{' '}
                                  <Button variant="link" size="sm" className="p-0" style={{ fontSize: 10 }}
                                    onClick={() => patch(i, { notCode: false })}>undo</Button>
                                </span>
                              ) : (
                                <span className="text-muted">
                                  Left without an ElementType.{' '}
                                  <Button variant="link" size="sm" className="p-0" style={{ fontSize: 10 }}
                                    onClick={() => patch(i, { notCode: true })}>Not a code</Button>
                                  {onShowRows && (
                                    <>{' · '}<Button variant="link" size="sm" className="p-0" style={{ fontSize: 10 }}
                                      onClick={() => onShowRows(r.code)}>Show its rows</Button></>
                                  )}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        {r.action === 'skip' ? (
                          <td colSpan={3} className="text-muted">skipped</td>
                        ) : r.action === 'reuse' ? (
                          <td colSpan={3}>
                            Use <span style={{ fontFamily: 'monospace' }}>{r.reuseRef}</span>{' '}
                            <Button variant="link" size="sm" className="p-0" style={{ fontSize: 11 }}
                              onClick={() => patch(i, { action: 'create' })}>
                              create a new one instead
                            </Button>
                          </td>
                        ) : (
                          <>
                            <td style={{ width: 270 }}>
                              <div className="d-flex align-items-center gap-1">
                                <Form.Control size="sm" value={r.ref} aria-label={`Ref for ${r.code}`}
                                  isInvalid={!!bad && r.include} placeholder={r.family ? '' : 'pick a family'}
                                  style={{ fontFamily: 'monospace', fontSize: 11 }}
                                  onChange={e => patch(i, { ref: e.target.value })} />
                                {verified(r) && (
                                  <span title={whyText(r)} aria-label={`Placed by rule: ${whyText(r)}`} data-testid="verified">
                                    <MaterialIcon name="verified" size={14} style={{ color: C.success }} />
                                  </span>
                                )}
                                <Dropdown align="end">
                                  <Dropdown.Toggle as={IconButton} icon="swap_horiz" size={14} title={`Move ${r.code} to another family`}
                                    style={{ padding: 0, color: C.muted }} />
                                  <Dropdown.Menu style={{ fontSize: 11, maxHeight: 280, overflowY: 'auto' }}>
                                    <Dropdown.Item onClick={() => setAdding({ ref: 'ET-', description: '', parent: '', moveIndex: i })}>
                                      <MaterialIcon name="add" size={12} /> New family…
                                    </Dropdown.Item>
                                    <Dropdown.Divider />
                                    {familyOptions.filter(f => f !== r.family).map(f => (
                                      <Dropdown.Item key={f} onClick={() => moveTo([i], f)} style={{ fontFamily: 'monospace' }}>{f}</Dropdown.Item>
                                    ))}
                                  </Dropdown.Menu>
                                </Dropdown>
                              </div>
                              {bad && r.include && <div className="text-danger" style={{ fontSize: 10 }}>{bad}</div>}
                              {r.superseded && (
                                <div style={{ fontSize: 10, color: C.dangerInk }}
                                  title={`Codes shaped like ${r.superseded.example} are ${r.manufacturer}'s old numbering`}>
                                  <MaterialIcon name="history" size={10} /> old {r.manufacturer} numbering — check the current code
                                </div>
                              )}
                              {!bad && r.checkRef && (
                                <div style={{ fontSize: 10, color: C.attnInk }}
                                  title="A guess worth checking: part of an example's ref could not be confirmed, examples disagree, or no rule placed it firmly">
                                  <MaterialIcon name="warning" size={10} /> check ref
                                  {r.alternatives?.length > 0 && <> — or {r.alternatives.join(', ')}</>}
                                </div>
                              )}
                              {!verified(r) && whyText(r) && (
                                <div className="text-muted" style={{ fontSize: 9 }}>
                                  {whyText(r)}{r.spread > 1 ? ` · used under ${r.spread} families` : ''}
                                </div>
                              )}
                            </td>
                            <td>
                              <Form.Control size="sm" value={r.name} aria-label={`Name for ${r.code}`}
                                style={{ fontSize: 11 }} onChange={e => patch(i, { name: e.target.value })} />
                            </td>
                            <td>
                              <Form.Control size="sm" value={r.description} aria-label={`Description for ${r.code}`}
                                placeholder="description" style={{ fontSize: 11 }}
                                onChange={e => patch(i, { description: e.target.value })} />
                            </td>
                          </>
                        )}
                      </tr>
                    )
                  })}
                  {idxs.length === 0 && (
                    <tr><td colSpan={5} className="text-muted text-center py-2" style={{ fontSize: 11 }}>
                      Drop codes here
                    </td></tr>
                  )}
                </tbody>
              </table>
            </FamilyDrop>
          )
        })}
        <DragOverlay>
          {dragging != null && rows[dragging] && (
            <span className="px-2 py-1 rounded border bg-white shadow-sm" style={{ fontFamily: 'monospace', fontSize: 11, whiteSpace: 'nowrap', display: 'inline-block' }}>
              <MaterialIcon name="drag_indicator" size={12} /> {rows[dragging].code}
            </span>
          )}
        </DragOverlay>
        </DndContext>
      </Modal.Body>
      <Modal.Footer>
        <span className="text-muted me-auto" style={{ fontSize: 12 }}>
          {famsToCreate.length > 0 && `${famsToCreate.length} new famil${famsToCreate.length === 1 ? 'y' : 'ies'}, `}
          {nCreate} to create{included.length > nCreate ? `, ${included.length - nCreate} to reuse` : ''}
          {notCodes.length > 0 && `, ${notCodes.length} not a code`}
          {problems.size > 0 && <span className="text-danger"> · {problems.size} to fix</span>}
        </span>
        <Button variant="secondary" size="sm" onClick={onHide}>Cancel</Button>
        <Button variant="primary" size="sm" disabled={(included.length === 0 && notCodes.length === 0) || problems.size > 0}
          onClick={() => onApply({ families: famsToCreate, items: included, notCodes })}>
          Apply {included.length + notCodes.length}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}

/** A family group that accepts dropped codes. `family` null = not a drop target. */
function FamilyDrop({ family, testid, style, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: `fam:${family || testid}`, data: { family }, disabled: !family })
  return (
    <div ref={setNodeRef} className="mb-3 border rounded" data-testid={testid}
      style={{ ...style, ...(isOver ? { borderColor: C.accent, boxShadow: `0 0 0 2px ${C.accentTint}` } : {}) }}>
      {children}
    </div>
  )
}

/** The handle a code is dragged by. */
function Grip({ index, code }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: `row:${index}`, data: { index } })
  return (
    <span ref={setNodeRef} {...listeners} {...attributes} role="button" aria-label={`Drag ${code} to another family`}
      style={{ cursor: 'grab', color: C.faint, display: 'inline-block', width: 16, touchAction: 'none' }}>
      <MaterialIcon name="drag_indicator" size={14} />
    </span>
  )
}
