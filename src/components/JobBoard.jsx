import React from 'react'
import { Form, Button } from 'react-bootstrap'
import { DndContext, PointerSensor, useSensor, useSensors, useDraggable, useDroppable } from '@dnd-kit/core'
import MaterialIcon from './MaterialIcon'
import { JOB_LABEL, jobLabel, ruleText } from '../utils/recipeKinds'
import { C } from '../styles/tokens'

const WRAPPERS = [
  { id: 'LIN', label: 'a LIN wrapper', slotLabel: 'LIN Virtual Element' },
  { id: 'DL', label: 'a DL wrapper', slotLabel: 'DL Virtual Element' },
  { id: '', label: 'no wrapper' },
]
const LANES = [
  { id: 'position', label: 'Site', hint: 'Position level: goes to site on its own' },
  { id: 'internal', label: 'Inside wrapper', hint: 'Ships inside the DL or LIN assembly' },
]
const PALETTE = Object.keys(JOB_LABEL)
// The companion's slots say TAPE where the jobs say TAPE:tape.
const jobOfSlot = k => (JOB_LABEL[k] ? k : JOB_LABEL[`${k}:tape`] ? `${k}:tape` : null)
const nameOf = job => (job === 'LOCAL_DRIVER' ? 'driver (local)' : job === 'REMOTE_DRIVER' ? 'driver (remote)' : jobLabel(jobOfSlot(job) || job))
const laneOf = i => (i.section === 'position' ? 'position' : 'internal')
const isWrap = i => i.slotKey === 'DESIGN_ELEMENT' || i.newWrapper
const wrapperOf = ings => { const w = ings.find(isWrap); return !w ? '' : (w.newWrapper || (/DL/i.test(w.slotLabel) ? 'DL' : 'LIN')) }
/** The kinds' slot shape, so ruleText words it the same as the suggestions do. */
const asSlot = i => ({ qty: i.quantity ?? null, dim: i.dimQtyMultiplier ?? null, integer: i.isInteger === 'Y' ? 1 : 0 })

/**
 * JobBoard — what a template adds, by JOB (codeJobs.js), set up like the ConnectorBoard: drag a job
 * from the palette into Site or Inside wrapper. Applying fills each job from the position's Form
 * products, so a template names no product. Each chip: each / per m, the number, whole numbers.
 *
 * ingredients: [{ slotKey, slotLabel, section, isDesign, isContractItem, quantity, dimQtyMultiplier, isInteger }]
 */
export default function JobBoard({ ingredients, onChange, readOnly }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const wrapper = wrapperOf(ingredients)
  const inside = wrapper === 'DL' ? 'dl_internal' : 'lin_internal'
  const parts = ingredients.filter(i => !isWrap(i))

  const setWrapper = id => {
    const w = WRAPPERS.find(x => x.id === id)
    const rest = parts.map(i => (laneOf(i) === 'internal' ? { ...i, section: id ? (id === 'DL' ? 'dl_internal' : 'lin_internal') : 'position' } : i))
    onChange(id ? [{ slotKey: 'DESIGN_ELEMENT', slotLabel: w.slotLabel, section: 'position', isDesign: 'Y' }, ...rest] : rest)
  }
  const put = next => onChange([...ingredients.filter(isWrap), ...next])
  const add = (job, lane) => {
    if (parts.some(i => i.slotKey === job && laneOf(i) === lane)) return
    put([...parts, { slotKey: job, slotLabel: nameOf(job), section: lane === 'position' ? 'position' : inside, isContractItem: 'Y', quantity: 1 }])
  }
  const patch = (i, p) => put(parts.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const remove = i => put(parts.filter((_, j) => j !== i))

  function onDragEnd({ active, over }) {
    if (!over || readOnly) return
    const a = active.data.current || {}
    if (a.from === 'palette') add(a.job, over.id)
    else if (a.from === 'lane') patch(a.index, { section: over.id === 'position' ? 'position' : inside })
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="d-flex align-items-center gap-2 mb-2" style={{ fontSize: 12 }}>
        <span className="text-muted">Built in</span>
        <Form.Select size="sm" aria-label="Wrapper" value={wrapper} disabled={readOnly} onChange={e => setWrapper(e.target.value)} style={{ width: 160, fontSize: 12 }}>
          {WRAPPERS.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
        </Form.Select>
      </div>
      <div className="d-flex gap-3" data-testid="job-board">
        {!readOnly && (
          <div style={{ width: 200, flexShrink: 0 }}>
            <div className="border rounded p-1" style={{ overflowY: 'auto', maxHeight: 320, background: C.subtle }} data-testid="job-palette">
              {PALETTE.map(job => <PaletteChip key={job} job={job} onAdd={add} wrapped={!!wrapper} />)}
            </div>
          </div>
        )}
        <div className="d-flex flex-column gap-2 flex-grow-1">
          {LANES.filter(l => l.id === 'position' || wrapper).map(l => (
            <Lane key={l.id} lane={l} parts={parts} readOnly={readOnly} onPatch={patch} onRemove={remove} />
          ))}
        </div>
      </div>
    </DndContext>
  )
}

function PaletteChip({ job, onAdd, wrapped }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `pal:${job}`, data: { from: 'palette', job } })
  return (
    <div ref={setNodeRef} className="d-flex align-items-center gap-1 px-1 py-1 mb-1 bg-white border rounded"
      style={{ fontSize: 11, opacity: isDragging ? 0.4 : 1 }} data-testid={`pal-${job}`}>
      <span {...listeners} {...attributes} style={{ cursor: 'grab', display: 'inline-flex' }} title="Drag into a lane">
        <MaterialIcon name="drag_indicator" size={14} style={{ color: C.faint }} />
      </span>
      <span className="text-truncate" style={{ flex: 1, minWidth: 0 }}>{nameOf(job)}</span>
      <Button size="sm" variant="link" className="p-0" style={{ fontSize: 10 }} aria-label={`Add ${nameOf(job)} to Site`} onClick={() => onAdd(job, 'position')}>Site</Button>
      {wrapped && <Button size="sm" variant="link" className="p-0" style={{ fontSize: 10 }} aria-label={`Add ${nameOf(job)} inside wrapper`} onClick={() => onAdd(job, 'internal')}>Wrapper</Button>}
    </div>
  )
}

function Lane({ lane, parts, readOnly, onPatch, onRemove }) {
  const { setNodeRef, isOver } = useDroppable({ id: lane.id })
  const mine = parts.map((p, i) => ({ p, i })).filter(x => laneOf(x.p) === lane.id)
  return (
    <div ref={setNodeRef} data-testid={`lane-${lane.id}`} className="rounded p-2"
      style={{ border: `2px dashed ${isOver ? C.accent : C.border}`, background: isOver ? C.accentTint : C.surface, minHeight: 90 }}>
      <div className="fw-semibold mb-1" style={{ fontSize: 12 }}>
        {lane.label} <span className="text-muted fw-normal" style={{ fontSize: 10 }}>{lane.hint}</span>
      </div>
      {mine.length === 0 && <div className="text-muted fst-italic" style={{ fontSize: 11 }}>{readOnly ? 'Nothing.' : 'Drag parts here.'}</div>}
      <div className="d-flex flex-wrap gap-1">
        {mine.map(({ p, i }) => <JobChip key={`${p.slotKey}|${i}`} ing={p} index={i} readOnly={readOnly} onPatch={onPatch} onRemove={onRemove} />)}
      </div>
    </div>
  )
}

function JobChip({ ing, index, readOnly, onPatch, onRemove }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `lane:${index}`, data: { from: 'lane', index }, disabled: readOnly })
  const perM = ing.dimQtyMultiplier != null
  const n = perM ? ing.dimQtyMultiplier : (ing.quantity ?? 1)
  const name = jobOfSlot(ing.slotKey) ? nameOf(ing.slotKey) : (ing.slotLabel || ing.slotKey)
  if (readOnly) {
    return (
      <span className="d-inline-flex align-items-center gap-1 px-2 py-1 border rounded bg-light" style={{ fontSize: 11 }} data-testid={`job-${ing.slotKey}`}>
        {name} <span className="text-muted">{ruleText(asSlot(ing)) || '×1'}</span>
      </span>
    )
  }
  const setN = v => onPatch(index, perM ? { dimQtyMultiplier: v } : { quantity: v })
  return (
    <div ref={setNodeRef} className="d-inline-flex align-items-center gap-1 px-2 py-1 border rounded bg-light"
      style={{ fontSize: 11, opacity: isDragging ? 0.4 : 1 }} data-testid={`job-${ing.slotKey}`}>
      <span {...listeners} {...attributes} style={{ cursor: 'grab', display: 'inline-flex' }} title="Drag to the other lane">
        <MaterialIcon name="drag_indicator" size={13} style={{ color: C.faint }} />
      </span>
      <span>{name}</span>
      <Form.Control size="sm" type="number" min={0} step="any" value={n} aria-label={`${name} amount`}
        onChange={e => setN(e.target.value === '' ? null : Number(e.target.value))} style={{ width: 52, fontSize: 11, padding: '0 4px' }} />
      <Form.Select size="sm" value={perM ? 'm' : 'each'} aria-label={`${name} per`} style={{ width: 70, fontSize: 11, padding: '0 18px 0 4px' }}
        onChange={e => onPatch(index, e.target.value === 'm' ? { dimQtyMultiplier: n, quantity: null } : { quantity: n, dimQtyMultiplier: null })}>
        <option value="each">each</option><option value="m">per m</option>
      </Form.Select>
      <Form.Check type="checkbox" label="whole" title="Round up to whole numbers" checked={ing.isInteger === 'Y'} className="mb-0"
        onChange={e => onPatch(index, { isInteger: e.target.checked ? 'Y' : null })} style={{ fontSize: 10 }} />
      <Button size="sm" variant="link" className="p-0 text-danger" aria-label={`Remove ${name}`} onClick={() => onRemove(index)}>
        <MaterialIcon name="close" size={12} />
      </Button>
    </div>
  )
}
