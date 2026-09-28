import React, { useMemo, useState } from 'react'
import { Form, Button } from 'react-bootstrap'
import { DndContext, PointerSensor, useSensor, useSensors, useDraggable, useDroppable } from '@dnd-kit/core'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { looksLikeConnector } from '../utils/connectorGroups'

const LANES = [
  { id: 'position', label: 'Site', hint: 'Position level, first-fix: goes to site on its own' },
  { id: 'internal', label: 'Inside wrapper', hint: 'Driver / fitting side: ships inside the DL or LIN assembly' },
]
const lc = s => String(s ?? '').toLowerCase()

/**
 * ConnectorBoard — set a connector template up by dragging parts from a palette into
 * two lanes (Site / Inside wrapper). The lane is the section, so nothing is picked per row.
 * Each part has a quantity (−/+) and ✕. Buttons on each palette chip do the same as a drag.
 *
 * parts: [{ ref, section: 'position'|'internal', quantity }] · onChange(parts)
 */
export default function ConnectorBoard({ parts, onChange }) {
  const elementTypes = useStore(s => s.elementTypes)
  const psRows = useStore(s => s.psRows)
  const connectorFamilies = useStore(s => s.connectorFamilies)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const families = useMemo(() => [...new Set(elementTypes.map(e => e.Family || e.family).filter(Boolean))].sort(), [elementTypes])
  // Default palette: the chosen connector families, else every family holding a socket/plug/SR/lever.
  const defaultFams = useMemo(() => {
    if (connectorFamilies?.length) return connectorFamilies
    return [...new Set(elementTypes.filter(e => looksLikeConnector(e.ElementTypeRef)).map(e => e.Family || e.family).filter(Boolean))]
  }, [elementTypes, connectorFamilies])
  const [family, setFamily] = useState('')     // '' = connector families
  const [q, setQ] = useState('')

  const specOf = useMemo(() => {
    const m = new Map()
    for (const r of psRows) m.set(lc(r.ElementTypeRef), [r.Manufacturer, r.ProductCode].filter(Boolean).join(' · '))
    return m
  }, [psRows])

  const palette = useMemo(() => {
    const inFam = e => {
      const f = e.Family || e.family || ''
      if (family === '*') return true
      if (family) return f === family
      return defaultFams.includes(f) || looksLikeConnector(e.ElementTypeRef)
    }
    const query = lc(q.trim())
    return elementTypes
      .filter(e => (e.IsCollection || e.isCollection) !== 'Y' && (e.IsDeleted || e.isDeleted) !== 'Y' && e.ElementTypeRef)
      .filter(inFam)
      .filter(e => !query || [e.ElementTypeRef, e.Name, specOf.get(lc(e.ElementTypeRef))].some(v => lc(v).includes(query)))
      .map(e => e.ElementTypeRef)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }, [elementTypes, family, defaultFams, q, specOf])

  const add = (ref, section) => {
    const hit = parts.find(p => p.section === section && lc(p.ref) === lc(ref))
    onChange(hit ? parts.map(p => (p === hit ? { ...p, quantity: p.quantity + 1 } : p)) : [...parts, { ref, section, quantity: 1 }])
  }
  const setQty = (i, n) => onChange(n < 1 ? parts.filter((_, j) => j !== i) : parts.map((p, j) => (j === i ? { ...p, quantity: n } : p)))
  const moveTo = (i, section) => {
    const p = parts[i]
    if (p.section === section) return
    onChange(parts.filter((_, j) => j !== i).concat([{ ...p, section }]))
  }

  function onDragEnd({ active, over }) {
    if (!over) return
    const a = active.data.current || {}
    if (a.from === 'palette') add(a.ref, over.id)
    else if (a.from === 'lane') moveTo(a.index, over.id)
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="d-flex gap-3" data-testid="connector-board" style={{ minHeight: 280 }}>
        <div style={{ width: 260, flexShrink: 0 }} className="d-flex flex-column">
          <div className="d-flex gap-1 mb-1">
            <Form.Select size="sm" aria-label="Palette family" value={family} onChange={e => setFamily(e.target.value)} style={{ fontSize: 11 }}>
              <option value="">Connector families</option>
              <option value="*">All ElementTypes</option>
              {families.map(f => <option key={f} value={f}>{f}</option>)}
            </Form.Select>
          </div>
          <Form.Control size="sm" placeholder="Search…" aria-label="Search parts" value={q} onChange={e => setQ(e.target.value)} className="mb-1" style={{ fontSize: 11 }} />
          <div className="border rounded p-1" style={{ overflowY: 'auto', maxHeight: 320, background: '#f8f9fa' }} data-testid="connector-palette">
            {palette.length === 0 && <div className="text-muted small p-2">Nothing here. Pick another family.</div>}
            {palette.map(ref => <PaletteChip key={ref} refName={ref} spec={specOf.get(lc(ref))} onAdd={add} />)}
          </div>
        </div>
        <div className="d-flex flex-column gap-2 flex-grow-1">
          {LANES.map(l => (
            <Lane key={l.id} lane={l} parts={parts} onQty={setQty} />
          ))}
        </div>
      </div>
    </DndContext>
  )
}

function PaletteChip({ refName, spec, onAdd }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `pal:${refName}`, data: { from: 'palette', ref: refName } })
  return (
    <div ref={setNodeRef} className="d-flex align-items-center gap-1 px-1 py-1 mb-1 bg-white border rounded"
      style={{ fontSize: 11, opacity: isDragging ? 0.4 : 1 }} data-testid={`pal-${refName}`}>
      <span {...listeners} {...attributes} style={{ cursor: 'grab', display: 'inline-flex' }} title="Drag into a lane">
        <MaterialIcon name="drag_indicator" size={14} style={{ color: '#adb5bd' }} />
      </span>
      <span className="text-truncate" style={{ fontFamily: 'monospace', flex: 1 }} title={spec || refName}>{refName}</span>
      <Button size="sm" variant="link" className="p-0" style={{ fontSize: 10 }} title={`Add ${refName} to Site`}
        aria-label={`Add ${refName} to Site`} onClick={() => onAdd(refName, 'position')}>Site</Button>
      <Button size="sm" variant="link" className="p-0" style={{ fontSize: 10 }} title={`Add ${refName} inside the wrapper`}
        aria-label={`Add ${refName} inside wrapper`} onClick={() => onAdd(refName, 'internal')}>Wrapper</Button>
    </div>
  )
}

function Lane({ lane, parts, onQty }) {
  const { setNodeRef, isOver } = useDroppable({ id: lane.id })
  const mine = parts.map((p, i) => ({ p, i })).filter(x => x.p.section === lane.id)
  return (
    <div ref={setNodeRef} data-testid={`lane-${lane.id}`} className="rounded p-2 flex-grow-1"
      style={{ border: `2px dashed ${isOver ? '#0d6efd' : '#dee2e6'}`, background: isOver ? '#e7f1ff' : '#fff', minHeight: 110 }}>
      <div className="fw-semibold mb-1" style={{ fontSize: 12 }}>
        {lane.label} <span className="text-muted fw-normal" style={{ fontSize: 10 }}>{lane.hint}</span>
      </div>
      {mine.length === 0 && <div className="text-muted fst-italic" style={{ fontSize: 11 }}>Drag parts here.</div>}
      <div className="d-flex flex-wrap gap-1">
        {mine.map(({ p, i }) => <LaneChip key={`${p.ref}|${i}`} part={p} index={i} onQty={onQty} />)}
      </div>
    </div>
  )
}

function LaneChip({ part, index, onQty }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `lane:${index}`, data: { from: 'lane', index } })
  return (
    <div ref={setNodeRef} className="d-inline-flex align-items-center gap-1 px-2 py-1 border rounded bg-light"
      style={{ fontSize: 11, opacity: isDragging ? 0.4 : 1 }} data-testid={`part-${part.section}-${part.ref}`}>
      <span {...listeners} {...attributes} style={{ cursor: 'grab', display: 'inline-flex' }} title="Drag to the other lane">
        <MaterialIcon name="drag_indicator" size={13} style={{ color: '#adb5bd' }} />
      </span>
      <span style={{ fontFamily: 'monospace' }}>{part.ref}</span>
      <Button size="sm" variant="link" className="p-0" aria-label={`Fewer ${part.ref}`} onClick={() => onQty(index, part.quantity - 1)}>−</Button>
      <span data-testid="qty">{part.quantity}</span>
      <Button size="sm" variant="link" className="p-0" aria-label={`More ${part.ref}`} onClick={() => onQty(index, part.quantity + 1)}>+</Button>
      <Button size="sm" variant="link" className="p-0 text-danger" aria-label={`Remove ${part.ref}`} onClick={() => onQty(index, 0)}>
        <MaterialIcon name="close" size={12} />
      </Button>
    </div>
  )
}
