import React, { useMemo, useState, useEffect } from 'react'
import { Modal, Button, Form } from 'react-bootstrap'
import useStore, { collectAllETRefs } from '../store/useStore'
import ETRefSelect from './ETRefSelect'
import { CONNECTION_TYPES, composeConnection, suggestRefForPart } from '../utils/connectors'

const SECTION_LABEL = {
  position: 'Position level',
  dl_internal: 'Inside DL',
  lin_internal: 'Inside LIN',
}
const PIN_OPTIONS = ['5', '4', '3', '2']
const partKey = p => `${p.slotKey}-${p.section}`

/**
 * ConnectorWizardModal — attribute-driven connector configurator.
 *
 * Pick a connection type, then shape it with attributes (pin count, IP-rated,
 * twin-spot, and a single Include-strain-reliefs toggle). The parts recompute
 * live; each row's element type can be overridden. Works in two contexts:
 *   - 'position' (default): sockets at position level, plugs inside the DL/LIN.
 *   - 'element': editing an ET — all parts land in the ET's internal recipe.
 * Inserts as one undoable step via addConnection.
 */
export default function ConnectorWizardModal({ show, posRef, context = 'position', onClose }) {
  const elementTypes = useStore(s => s.elementTypes)
  const psRows = useStore(s => s.psRows)
  const recipes = useStore(s => s.recipes)
  const positionUI = useStore(s => s.positionUI)
  const addConnection = useStore(s => s.addConnection)

  const knownRefs = useMemo(
    () => collectAllETRefs(elementTypes, psRows, recipes),
    [elementTypes, psRows, recipes]
  )
  const posTags = context === 'position' && posRef ? (positionUI[posRef]?.tags || []) : []

  const hasDesign = useMemo(
    () => recipes.some(r =>
      (r.PositionTypeRef || r.positionTypeRef) === posRef &&
      (r.ContextType || r.contextType) === 'PositionType' &&
      (r.IsDesign || r.isDesign) === 'Y'
    ),
    [recipes, posRef]
  )

  const [typeId, setTypeId] = useState(null)
  const [pins, setPins] = useState('5')
  const [ip, setIp] = useState(false)
  const [twinSpot, setTwinSpot] = useState(false)
  const [includeSR, setIncludeSR] = useState(false)
  const [refs, setRefs] = useState({}) // { partKey: ref }

  const parts = useMemo(
    () => (typeId ? composeConnection({ typeId, pins, ip, twinSpot, includeSR, context }) : []),
    [typeId, pins, ip, twinSpot, includeSR, context]
  )

  // Re-seed suggested refs whenever the composed parts change (a reconfigure)
  useEffect(() => {
    const next = {}
    for (const p of parts) next[partKey(p)] = suggestRefForPart(p, knownRefs)
    setRefs(next)
  }, [parts]) // eslint-disable-line react-hooks/exhaustive-deps

  function pickType(t) {
    setTypeId(t.id)
    setPins(t.defaultPins)
  }

  const attrSig = `${typeId}-${pins}-${ip}-${twinSpot}-${includeSR}-${context}`

  const blockedByDesign =
    context === 'position' && !hasDesign &&
    parts.some(p => p.section !== 'position' && (refs[partKey(p)] || '').trim())

  function handleInsert() {
    if (!typeId || blockedByDesign) return
    const finalParts = parts
      .map(p => ({ section: p.section, elementTypeRef: (refs[partKey(p)] || '').trim(), quantity: p.quantity }))
      .filter(p => p.elementTypeRef)
    addConnection(posRef, finalParts)
    onClose()
  }

  return (
    <Modal show={show} onHide={onClose} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 18 }}>
          Add a connector — {posRef}{context === 'element' ? ' (element internals)' : ''}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {/* Connection type */}
        <div className="mb-3">
          <div className="text-uppercase text-muted fw-bold mb-2" style={{ fontSize: 10, letterSpacing: 0.5 }}>
            Connection type
          </div>
          <div className="d-flex flex-wrap gap-2">
            {CONNECTION_TYPES.map(t => {
              const relevant = t.tags.some(tag => posTags.includes(tag))
              const active = t.id === typeId
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`btn btn-sm ${active ? 'btn-primary' : relevant ? 'btn-outline-primary' : 'btn-outline-secondary'}`}
                  style={{ fontSize: 12 }}
                  onClick={() => pickType(t)}
                  title={relevant ? 'Matches this position’s tags' : undefined}
                >
                  {t.label}{relevant && !active ? ' ★' : ''}
                </button>
              )
            })}
          </div>
        </div>

        {/* Attributes */}
        {typeId && (
          <div className="mb-3 d-flex flex-wrap align-items-center gap-3">
            <div className="d-flex align-items-center gap-1">
              <span className="text-muted" style={{ fontSize: 11 }}>Pins</span>
              <div className="btn-group btn-group-sm">
                {PIN_OPTIONS.map(p => (
                  <button
                    key={p}
                    type="button"
                    className={`btn btn-sm ${pins === p ? 'btn-secondary' : 'btn-outline-secondary'}`}
                    style={{ fontSize: 11, padding: '1px 8px' }}
                    onClick={() => setPins(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <Form.Check type="switch" id="conn-ip" label="IP-rated" checked={ip}
              onChange={e => setIp(e.target.checked)} style={{ fontSize: 12 }} />
            <Form.Check type="switch" id="conn-twin" label="Twin-spot (×2)" checked={twinSpot}
              onChange={e => setTwinSpot(e.target.checked)} style={{ fontSize: 12 }} />
            <Form.Check type="switch" id="conn-sr" label="Include strain reliefs" checked={includeSR}
              onChange={e => setIncludeSR(e.target.checked)} style={{ fontSize: 12 }} />
          </div>
        )}

        {/* Parts */}
        {typeId && (
          <div>
            <div className="text-uppercase text-muted fw-bold mb-2" style={{ fontSize: 10, letterSpacing: 0.5 }}>
              Parts
            </div>
            {context === 'element' && (
              <div className="text-muted mb-2" style={{ fontSize: 11 }}>
                All parts will be inserted into this element’s internal recipe.
              </div>
            )}
            {parts.map(part => (
              <div key={`${partKey(part)}-${attrSig}`} className="d-flex align-items-center gap-2 mb-2">
                <div style={{ width: 150 }}>
                  <span className="fw-semibold" style={{ fontSize: 12 }}>{part.role}</span>
                  <span className="text-muted ms-1" style={{ fontSize: 10 }}>{part.slotKey}</span>
                  {part.optional && <span className="text-muted ms-1 fst-italic" style={{ fontSize: 10 }}>opt</span>}
                </div>
                <span className="badge bg-light text-dark border" style={{ fontSize: 10, width: 110 }}>
                  {SECTION_LABEL[part.section]}
                </span>
                <div style={{ flex: 1 }}>
                  <ETRefSelect
                    initial={refs[partKey(part)] || ''}
                    autoFocus={false}
                    placeholder="Pick or type an element type…"
                    onCommit={ref => setRefs(prev => ({ ...prev, [partKey(part)]: ref }))}
                    onCancel={() => setRefs(prev => ({ ...prev, [partKey(part)]: '' }))}
                  />
                </div>
                {part.quantity != null && (
                  <span className="text-muted" style={{ fontSize: 10, width: 28 }}>×{part.quantity}</span>
                )}
              </div>
            ))}

            {blockedByDesign && (
              <div className="mt-2 px-2 py-1 rounded" style={{ background: '#fdeaea', border: '1px solid #f1b0b0', fontSize: 12 }}>
                This connection places parts inside the DL/LIN element, but this position has no
                design element (IsDesign) yet. Add the DL/LIN design element first.
              </div>
            )}
          </div>
        )}

        {!typeId && (
          <div className="text-muted small">Choose a connection type to configure its parts.</div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="link" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleInsert} disabled={!typeId || blockedByDesign}>
          Insert connection
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
