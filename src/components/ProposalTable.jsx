import React, { useMemo } from 'react'
import { Button, Form, Table } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import { C } from '../styles/tokens'

/**
 * The proposed rows. With a wrapper, each part says whether it ships INSIDE it (with the
 * assembly) or SEPARATELY (position level, e.g. a first-fix socket); `onPlace` lets you flip it.
 */
export default function ProposalTable({ proposal, onPlace, onInclude }) {
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
            <tr key={i} style={r.missing ? { background: C.dangerTint } : r.include === false ? { opacity: 0.55 } : undefined}>
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
                {r.check && <div style={{ color: C.attnInk }}><MaterialIcon name="warning" size={11} /> {r.check}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
      {proposal.notes.map((n, i) => <div key={i} className="text-muted" style={{ fontSize: 10 }}><MaterialIcon name="info" size={11} /> {n}</div>)}
    </>
  )
}

