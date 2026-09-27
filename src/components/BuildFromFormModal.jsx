import React, { useEffect, useMemo, useState } from 'react'
import { Modal, Button, Form, Table } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import InfoTip from './InfoTip'
import { planFormBuild } from '../utils/formBuild'

/**
 * BuildFromFormModal — build every imported position's recipe in one go.
 *
 * One row per position: its Form products, and what it will be built with — a Form
 * template (its wrapper, driver and cables, with this position's own products dropped
 * in), just the Form products, or nothing. Positions that already have a recipe are
 * skipped unless you pick otherwise. One Undo takes the whole build back.
 */
export default function BuildFromFormModal({ show, onHide, posRefs, onBuilt }) {
  const formCaptures = useStore(s => s.formCaptures)
  const templates = useStore(s => s.templates)
  const recipes = useStore(s => s.recipes)
  const elementTypes = useStore(s => s.elementTypes)
  const buildFromForm = useStore(s => s.buildFromForm)
  const [rows, setRows] = useState([])

  useEffect(() => {
    if (!show) return
    setRows(planFormBuild({ posRefs, formCaptures, templates, recipes, elementTypes }))
  }, [show])   // eslint-disable-line react-hooks/exhaustive-deps

  const building = rows.filter(r => r.choice !== 'skip')
  const anyTemplate = useMemo(() => rows.some(r => r.candidates.length > 0), [rows])
  const choose = (posRef, choice) => setRows(rs => rs.map(r => (r.posRef === posRef ? { ...r, choice } : r)))

  function build() {
    buildFromForm(building)
    onBuilt?.(building.map(r => r.posRef))
  }

  return (
    <Modal show={show} onHide={onHide} size="lg" scrollable>
      <Modal.Header closeButton>
        <Modal.Title style={{ fontSize: 15 }}>
          <MaterialIcon name="auto_awesome" size={16} /> Build recipes from the Form{' '}
          <InfoTip size={12}>
            Save a finished recipe as a template (the bookmark in the builder): its Form products become
            slots, so on every other position they are that position&apos;s own products. Wrapper, driver
            and cables come as saved.
          </InfoTip>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body style={{ fontSize: 12 }}>
        {!anyTemplate && (
          <div className="mb-2 px-2 py-1 rounded" style={{ background: '#fff3cd', color: '#856404' }}>
            <MaterialIcon name="lightbulb" size={13} /> No Form template fits yet. Build one position by hand, save it
            as a template, then come back: every position like it builds in one click.
          </div>
        )}
        <Table size="sm" hover className="mb-0" data-testid="form-build">
          <thead>
            <tr><th>Position</th><th>From the Form</th><th>Build with</th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.posRef}>
                <td style={{ fontFamily: 'monospace' }}>{r.posRef}</td>
                <td>
                  {r.lead
                    ? <><span style={{ fontFamily: 'monospace' }}>{r.lead.code}</span>
                        <span className="text-muted"> → {r.lead.elementTypeRef}</span>
                        {r.extras.length > 0 && <span className="text-muted"> +{r.extras.length} extra{r.extras.length === 1 ? '' : 's'}</span>}</>
                    : <span className="text-muted fst-italic">no product with an ElementType yet</span>}
                </td>
                <td>
                  <Form.Select size="sm" value={r.choice} disabled={!r.lead} aria-label={`Build ${r.posRef} with`}
                    onChange={e => choose(r.posRef, e.target.value)} style={{ fontSize: 11, minWidth: 180 }}>
                    {r.candidates.map(t => <option key={t.id} value={t.id}>Template: {t.name}</option>)}
                    <option value="products">Form products only</option>
                    <option value="skip">Skip</option>
                  </Form.Select>
                  {r.hasRecipe && r.choice !== 'skip' && (
                    <div className="text-danger" style={{ fontSize: 10 }}>replaces its recipe</div>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={3} className="text-muted fst-italic">Nothing imported from a Form yet.</td></tr>
            )}
          </tbody>
        </Table>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="link" size="sm" className="text-muted me-auto" onClick={onHide}>Not now</Button>
        <Button variant="primary" size="sm" disabled={building.length === 0} onClick={build}>
          Build {building.length} recipe{building.length === 1 ? '' : 's'}
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
