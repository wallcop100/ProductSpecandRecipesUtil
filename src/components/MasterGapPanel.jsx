import React, { useMemo, useState, useEffect } from 'react'
import { Button, Form } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'

/**
 * MasterGapPanel — the ElementTypes the DesignDB has never heard of, and where each one
 * would be filed.
 *
 * The parent of an ElementType is not a prefix of its ref: `ET-CCR-D-300-1CH-01` sits
 * under `ET-REMOTE-DRIVERS`. So a family is read from the nearest sibling (the number of
 * shared ref segments IS the confidence), or from the house style guide — which this
 * workbook may simply lack. On project 5642 there is no `ET-DL`, `ET-LIN` or `ET-PS`,
 * which is exactly why the wrappers and point sources have nowhere to go, so we offer to
 * seed those families and file the refs under them.
 *
 * QUEUED ≠ OPEN. Adding a row to the ElementTypes patch does not put it in the master —
 * that happens when you paste the patch. So a queued ref is not an open gap any more; it
 * is discharged on your side, waiting on Excel. It drops out of the count and shows in a
 * quiet "queued" line, or the whole panel collapses to "all queued" once nothing is left.
 */
const CONF = {
  confident: { bg: '#d1e7dd', fg: '#0f5132', label: 'confident' },
  house:     { bg: '#cfe2ff', fg: '#084298', label: 'house style' },
  guess:     { bg: '#fff3cd', fg: '#856404', label: 'guess' },
  none:      { bg: '#f1f3f5', fg: '#6c757d', label: 'no family' },
}

const lc = s => String(s ?? '').toLowerCase()

export default function MasterGapPanel({ gaps }) {
  const dbRowProposals = useStore(s => s.dbRowProposals)
  const proposedFamilies = useStore(s => s.proposedFamilies)
  const queueMissingDbRows = useStore(s => s.queueMissingDbRows)
  const createFamilies = useStore(s => s.createFamilies)
  const dbChanges = useStore(s => s.dbChanges)
  const dbCollectionRefs = useStore(s => s.dbCollectionRefs)
  const elementTypes = useStore(s => s.elementTypes)

  const proposals = useMemo(() => dbRowProposals(), [dbRowProposals, gaps])
  const families = useMemo(() => proposedFamilies(), [proposedFamilies, gaps])

  // Refs whose fix is already sitting in the ElementTypes patch.
  const queued = useMemo(() => new Set(dbChanges.map(c => lc(c.elementTypeRef))), [dbChanges])

  // The house guide's ref → family adoption. This is the "can't determine from siblings"
  // answer, and it must reach the per-row choice, not just the bulk button.
  const styleFamilyOf = useMemo(() => {
    const m = {}
    for (const f of families) for (const r of f.adopts) m[r] = f.ref
    return m
  }, [families])

  // Which family each ref gets: a confident sibling guess, else the house-style family.
  // Never clobber a choice the user has already made.
  const [chosen, setChosen] = useState({})
  useEffect(() => {
    setChosen(prev => {
      const next = { ...prev }
      for (const p of proposals) {
        if (next[p.ref] !== undefined) continue
        if (p.guess?.confident) next[p.ref] = p.guess.parent
        else if (styleFamilyOf[p.ref]) next[p.ref] = styleFamilyOf[p.ref]
      }
      return next
    })
  }, [proposals, styleFamilyOf])

  if (proposals.length === 0) return null

  const open = proposals.filter(p => !queued.has(lc(p.ref)))
  const queuedN = proposals.length - open.length

  // Every collection worth offering: those the workbook already has, those the guesses
  // point at, and the house-style families — so a family stays selectable even after it
  // has been created.
  const collOptions = [...new Set([
    ...dbCollectionRefs,
    ...elementTypes.filter(e => (e.IsCollection || e.isCollection) === 'Y').map(e => e.ElementTypeRef || e.elementTypeRef),
    ...proposals.map(p => p.guess?.parent).filter(Boolean),
    ...families.map(f => f.ref),
    ...Object.values(chosen).filter(Boolean),
  ].filter(Boolean))].sort()

  const familyLabel = p => {
    if (p.guess?.confident) return CONF.confident
    if (chosen[p.ref] && chosen[p.ref] === styleFamilyOf[p.ref]) return CONF.house
    if (p.guess) return CONF.guess
    return CONF.none
  }

  const withFamily = open.filter(p => chosen[p.ref]).length

  function apply() {
    if (open.length === 0) return
    // Create any house-style family that an open ref is being filed under and the
    // workbook lacks; createFamilies queues those members with their family set.
    const need = families.filter(f => open.some(p => chosen[p.ref] === f.ref))
    if (need.length) createFamilies(need)
    // Queue the rest (and re-affirm the created ones — mergeDbChanges coalesces) with the
    // chosen family. Idempotent.
    queueMissingDbRows(open.map(p => p.ref), { families: chosen })
  }

  const [expanded, setExpanded] = useState(false)
  const editable = expanded ? open : []

  return (
    <div className="mb-3 px-2 py-2 rounded" style={{ background: '#cfe2ff', border: '1px solid #b6d4fe' }}>
      {open.length === 0 ? (
        <div className="d-flex align-items-center gap-1" style={{ fontSize: 11, color: '#0f5132' }}>
          <MaterialIcon name="schedule" size={13} />
          {queuedN} ElementType{queuedN === 1 ? '' : 's'} queued for the ElementTypes patch — paste it in Excel.
        </div>
      ) : (
        <>
          <div className="fw-semibold d-flex align-items-center gap-1" style={{ fontSize: 11, color: '#084298' }}>
            <MaterialIcon name="hub" size={13} />
            {open.length} ElementType{open.length === 1 ? '' : 's'} missing from the DesignDB master
            {queuedN > 0 && <span className="fw-normal text-muted">· {queuedN} already queued</span>}
          </div>
          <div className="text-muted my-1" style={{ fontSize: 11 }}>
            The DesignDB is the master list: everything in the Product Spec or a recipe must exist in it.
            These reach it through the ElementTypes patch, which is safe to run twice.
          </div>

          {/* The house style would add the families this workbook never had. */}
          {families.length > 0 && (
            <div className="px-2 py-1 rounded mb-2" style={{ background: '#fff', border: '1px solid #b6d4fe' }}>
              <div className="fw-semibold" style={{ fontSize: 10, color: '#084298' }}>
                <MaterialIcon name="account_tree" size={11} /> {families.length} house-style famil
                {families.length === 1 ? 'y' : 'ies'} will be created to file the ones with no sibling:
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
            </div>
          )}

          <div className="d-flex align-items-center gap-2">
            <Button size="sm" variant="outline-primary" style={{ fontSize: 11 }} onClick={apply}>
              <MaterialIcon name="playlist_add_check" size={13} /> Add {open.length} to the ElementTypes patch
            </Button>
            <span className="text-muted" style={{ fontSize: 10 }}>
              {withFamily} of {open.length} have a family
            </span>
            <Button size="sm" variant="link" className="ms-auto p-0" style={{ fontSize: 10 }}
              onClick={() => setExpanded(v => !v)}>
              {expanded ? 'Hide' : 'Review'} each row
            </Button>
          </div>

          {expanded && (
            <div className="mt-2" style={{ maxHeight: 260, overflowY: 'auto' }}>
              {editable.map(p => {
                const style = familyLabel(p)
                return (
                  <div key={p.ref} className="d-flex align-items-center gap-2 py-1 border-top" style={{ fontSize: 10 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{p.ref}</span>
                      <div className="text-muted text-truncate" title={`${p.name || ''} ${p.details || ''}`}>
                        {p.name || <em>no name</em>}{p.details ? ` · ${p.details}` : ''}
                      </div>
                    </div>
                    <span className="rounded px-1" style={{ background: style.bg, color: style.fg, flexShrink: 0 }}
                      title={p.guess ? `matched ${p.guess.segments} ref segments against ${p.guess.via}`
                        : chosen[p.ref] ? 'from the house style guide' : 'nothing in the DesignDB resembles this ref'}>
                      {style.label}
                    </span>
                    <Form.Select size="sm" style={{ width: 190, fontSize: 10, flexShrink: 0 }}
                      value={chosen[p.ref] ?? ''}
                      onChange={e => setChosen(c => ({ ...c, [p.ref]: e.target.value || undefined }))}>
                      <option value="">— no family —</option>
                      {collOptions.map(o => <option key={o} value={o}>{o}</option>)}
                    </Form.Select>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
