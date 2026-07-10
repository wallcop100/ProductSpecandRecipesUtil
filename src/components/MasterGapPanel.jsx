import React, { useMemo, useState } from 'react'
import { Button, Form } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'

/**
 * MasterGapPanel — the ElementTypes the DesignDB has never heard of, and where each one
 * would be filed.
 *
 * The parent of an ElementType is not a prefix of its ref: `ET-CCR-D-300-1CH-01` sits
 * under `ET-REMOTE-DRIVERS`. So a family is either read from the nearest sibling — and
 * the number of shared ref segments IS the confidence — or it comes from the house style
 * guide, which this workbook may simply lack. On project 5642 there is no `ET-DL`, no
 * `ET-LIN` and no `ET-PS`, which is exactly why the wrappers and the point sources have
 * nowhere to go.
 *
 * Nothing is applied on its own. A two-segment guess is frequently wrong (it would file
 * the assembled `ET-LIN-01` under `ET-LIN-COMPONENTS`, alongside the end caps that go
 * inside it), so every family is shown, editable, and approved before it enters the patch.
 */
const CONF = {
  confident: { bg: '#d1e7dd', fg: '#0f5132', label: 'confident' },
  guess: { bg: '#fff3cd', fg: '#856404', label: 'guess' },
  none: { bg: '#f1f3f5', fg: '#6c757d', label: 'no family' },
}

export default function MasterGapPanel({ gaps }) {
  const dbRowProposals = useStore(s => s.dbRowProposals)
  const proposedFamilies = useStore(s => s.proposedFamilies)
  const queueMissingDbRows = useStore(s => s.queueMissingDbRows)
  const createFamilies = useStore(s => s.createFamilies)

  const proposals = useMemo(() => dbRowProposals(), [dbRowProposals, gaps])
  const families = useMemo(() => proposedFamilies(), [proposedFamilies, gaps])

  // Which family each ref will actually get. Seeded from the confident guesses only —
  // a weak guess is shown but not adopted unless you say so.
  const [chosen, setChosen] = useState(() => {
    const m = {}
    for (const p of proposals) if (p.guess?.confident) m[p.ref] = p.guess.parent
    return m
  })
  const [expanded, setExpanded] = useState(false)

  if (gaps.dbRows.length === 0) return null

  const options = [...new Set([
    ...proposals.map(p => p.guess?.parent).filter(Boolean),
    ...families.map(f => f.ref),
  ])].sort()

  const withFamily = Object.values(chosen).filter(Boolean).length
  const adoptable = families.reduce((n, f) => n + f.adopts.length, 0)

  return (
    <div className="mb-3 px-2 py-2 rounded" style={{ background: '#cfe2ff', border: '1px solid #b6d4fe' }}>
      <div className="fw-semibold d-flex align-items-center gap-1" style={{ fontSize: 11, color: '#084298' }}>
        <MaterialIcon name="hub" size={13} />
        {gaps.dbRows.length} ElementType{gaps.dbRows.length === 1 ? '' : 's'} missing from the DesignDB master
      </div>
      <div className="text-muted my-1" style={{ fontSize: 11 }}>
        The DesignDB is the master list: everything in the Product Spec or a recipe must exist in it.
        These reach it through the ElementTypes patch, which is safe to run twice.
      </div>

      {/* The house style would add the families this workbook never had. */}
      {families.length > 0 && (
        <div className="px-2 py-2 rounded mb-2" style={{ background: '#fff', border: '1px solid #b6d4fe' }}>
          <div className="fw-semibold" style={{ fontSize: 10, color: '#084298' }}>
            <MaterialIcon name="account_tree" size={11} /> {families.length} famil
            {families.length === 1 ? 'y' : 'ies'} from the house style would give {adoptable} of them a home
          </div>
          {families.map(f => (
            <div key={f.ref} className="d-flex align-items-baseline gap-2 mt-1" style={{ fontSize: 10 }}>
              <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{f.ref}</span>
              <span className="text-muted text-truncate" style={{ minWidth: 0, flex: 1 }} title={f.name}>
                {f.name}{f.parent ? ` · under ${f.parent}` : ''}
              </span>
              <span className="text-muted" style={{ flexShrink: 0 }}>adopts {f.adopts.length}</span>
            </div>
          ))}
          <Button size="sm" variant="outline-primary" className="mt-2" style={{ fontSize: 10, padding: '1px 8px' }}
            onClick={() => createFamilies(families)}
            title="Adds the collection rows to the ElementTypes patch and files their members under them">
            Create {families.length} famil{families.length === 1 ? 'y' : 'ies'} and file {adoptable}
          </Button>
        </div>
      )}

      <div className="d-flex align-items-center gap-2">
        <Button size="sm" variant="outline-primary" style={{ fontSize: 11 }}
          onClick={() => queueMissingDbRows(null, { families: chosen })}>
          <MaterialIcon name="playlist_add_check" size={13} /> Add {gaps.dbRows.length} to the ElementTypes patch
        </Button>
        <span className="text-muted" style={{ fontSize: 10 }}>
          {withFamily} of {gaps.dbRows.length} have a family
        </span>
        <Button size="sm" variant="link" className="ms-auto p-0" style={{ fontSize: 10 }}
          onClick={() => setExpanded(v => !v)}>
          {expanded ? 'Hide' : 'Review'} each row
        </Button>
      </div>

      {expanded && (
        <div className="mt-2" style={{ maxHeight: 260, overflowY: 'auto' }}>
          {proposals.map(p => {
            const style = p.guess ? (p.guess.confident ? CONF.confident : CONF.guess) : CONF.none
            return (
              <div key={p.ref} className="d-flex align-items-center gap-2 py-1 border-top" style={{ fontSize: 10 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{p.ref}</span>
                  <div className="text-muted text-truncate" title={`${p.name || ''} ${p.details || ''}`}>
                    {p.name || <em>no name</em>}{p.details ? ` · ${p.details}` : ''}
                  </div>
                </div>
                <span className="rounded px-1" style={{ background: style.bg, color: style.fg, flexShrink: 0 }}
                  title={p.guess ? `matched ${p.guess.segments} ref segments against ${p.guess.via}` : 'nothing in the DesignDB resembles this ref'}>
                  {style.label}
                </span>
                <Form.Select size="sm" style={{ width: 190, fontSize: 10, flexShrink: 0 }}
                  value={chosen[p.ref] ?? ''}
                  onChange={e => setChosen(c => ({ ...c, [p.ref]: e.target.value || undefined }))}>
                  <option value="">— no family —</option>
                  {options.map(o => <option key={o} value={o}>{o}</option>)}
                </Form.Select>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
