import React, { useMemo, useState } from 'react'
import { Button } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import NewETModal from './NewETModal'
import { WordDiff } from './import/FormTable'
import { formImpact } from '../utils/formImpact'
import { buildMaster } from '../utils/productCodes'
import { buildRefMap, targetFor } from '../utils/ptResolve'

const mono = { fontFamily: 'monospace' }
const list = refs => refs.join(', ')

/**
 * FormDiffBlock — "Changed since <older Form>" for THIS position, at the top of the Form
 * spec pane (JQSFCU). Each line is what changed in the Form and what it means here, with
 * the one action that fits (formImpact):
 *   - a code swapped for one the spec knows → Swap;
 *   - a code that changed, for an ElementType every user changes and the old code is gone
 *     from the Form → Update it in place;
 *   - otherwise (it is shared and others keep it, or the old code is still in the Form) →
 *     Fork it for the positions that change, or make a New ElementType.
 * Nothing happens without a click; each click is one Undo.
 */
export default function FormDiffBlock({ posRef }) {
  const importDraft = useStore(s => s.importDraft)
  const recipes = useStore(s => s.recipes)
  const psRows = useStore(s => s.psRows)
  const applyFormChange = useStore(s => s.applyFormChange)
  const addRecipeRow = useStore(s => s.addRecipeRow)
  const removeRecipeRow = useStore(s => s.removeRecipeRow)
  const setCompareBase = useStore(s => s.setCompareBase)
  const [creating, setCreating] = useState(null)   // the change a New ElementType is for

  const base = importDraft?.compareBase
  const changes = useMemo(() => {
    if (!base?.rows?.length || !importDraft?.rows?.length) return []
    const refMap = importDraft.map?.pt ? buildRefMap(importDraft.resolutions || [], importDraft.refOverrides || {}) : null
    return formImpact({
      posRef, baseRows: base.rows, newRows: importDraft.rows, recipes, master: buildMaster(psRows),
      targetOf: f => (refMap ? targetFor(refMap, f) : f),
    })
  }, [base, importDraft, recipes, psRows, posRef])

  if (!base || !changes.length) return null

  const who = c => [posRef, ...c.changing]
  return (
    <div className="mb-2 p-2 rounded" style={{ background: '#fff8e1', border: '1px solid #ffe08a', fontSize: 11 }} data-testid="form-diff-block">
      <div className="d-flex align-items-center gap-1 mb-1" style={{ color: '#5c4400' }}>
        <MaterialIcon name="difference" size={13} />
        <strong>Changed since</strong> <span className="text-truncate" title={base.name}>{base.name}</span>
        <Button size="sm" variant="link" className="p-0 ms-auto text-muted" style={{ fontSize: 10 }}
          onClick={() => setCompareBase(null)} title="Stop comparing with the older Form">clear</Button>
      </div>
      {changes.map((c, i) => (
        <div key={i} className="py-1 border-top" style={{ borderColor: '#ffe08a' }} data-testid="form-diff-line">
          {(c.oldText != null || c.newText != null) && (
            <div className="mb-1">
              {c.oldText != null && c.newText != null ? <WordDiff before={c.oldText} after={c.newText} />
                : c.newText != null ? <span style={{ ...mono, background: '#d1e7dd' }}>{c.newText}</span>
                  : <span style={{ ...mono, background: '#f8d7da', textDecoration: 'line-through' }}>{c.oldText}</span>}
            </div>
          )}

          {c.kind === 'swap' && (
            <>
              <div><span style={mono}>{c.fromEt}</span> → <span style={mono}>{c.toEt}</span>{c.container && <span className="text-muted"> · inside {c.container}</span>}</div>
              {c.inRecipe ? (
                <>
                  {c.container && c.wrapperUsers.some(u => !c.changing.includes(u)) && (
                    <div className="text-muted">{c.container} is shared with {list(c.wrapperUsers.filter(u => !c.changing.includes(u)))}, who keep{c.wrapperUsers.length === 1 ? 's' : ''} it: {posRef} gets its own copy of the wrapper.</div>
                  )}
                  <Button size="sm" variant="primary" className="mt-1 py-0" style={{ fontSize: 10 }} data-testid="diff-swap"
                    onClick={() => applyFormChange(c, posRef, 'swap')}>
                    Swap in {list(who(c))}
                  </Button>
                </>
              ) : <div className="text-muted">Not in this recipe.</div>}
            </>
          )}

          {c.kind === 'respec' && (
            <>
              <div>
                <span style={mono}>{c.fromEt}</span> → new code <span style={{ ...mono, fontWeight: 600 }}>{c.toCode}</span>
                {c.container && <span className="text-muted"> · inside {c.container}</span>}
              </div>
              {!c.inRecipe ? <div className="text-muted">Not in this recipe.</div> : c.canUpdate ? (
                <>
                  <div className="text-muted">
                    {c.sharers.length ? `Every position using it changes the same way (${list([posRef, ...c.sharers])})` : `Only ${posRef} uses it`}, and the old code is gone from the Form.
                  </div>
                  <Button size="sm" variant="primary" className="mt-1 py-0" style={{ fontSize: 10 }} data-testid="diff-update"
                    onClick={() => applyFormChange(c, posRef, 'update')}>
                    Update {c.fromEt} to {c.toCode}
                  </Button>
                </>
              ) : (
                <>
                  <div className="text-muted">
                    {c.notChanging.length ? <>{list(c.notChanging)} keep{c.notChanging.length === 1 ? 's' : ''} {c.fromEt}. </> : null}
                    {c.stillInForm && <>The old code is still in the Form. </>}
                    So {c.fromEt} stays; {list(who(c))} move{who(c).length === 1 ? 's' : ''} to:
                  </div>
                  <div className="d-flex gap-1 mt-1">
                    <Button size="sm" variant="primary" className="py-0" style={{ fontSize: 10 }} data-testid="diff-fork"
                      onClick={() => applyFormChange(c, posRef, 'fork')}
                      title={`A copy of ${c.fromEt} (same family, name and description) carrying ${c.toCode}`}>
                      Fork {c.fromEt}
                    </Button>
                    <Button size="sm" variant="outline-primary" className="py-0" style={{ fontSize: 10 }} data-testid="diff-new"
                      onClick={() => setCreating(c)}>New ElementType…</Button>
                  </div>
                </>
              )}
            </>
          )}

          {c.kind === 'remove' && (
            <>
              <div><span style={mono}>{c.fromEt}</span> is no longer in the Form here</div>
              {c.inRecipe && !c.container && (
                <Button size="sm" variant="outline-danger" className="mt-1 py-0" style={{ fontSize: 10 }} data-testid="diff-remove"
                  onClick={() => recipes.filter(r => (r.IsDeleted || r.isDeleted) !== 'Y' && r.PositionTypeRef === posRef
                    && String(r.ElementTypeRef || '').toLowerCase() === String(c.fromEt).toLowerCase())
                    .forEach(r => removeRecipeRow(posRef, r._id))}>
                  Remove from {posRef}
                </Button>
              )}
              {c.inRecipe && c.container && <div className="text-muted">It sits inside {c.container}: remove it in Edit internals.</div>}
            </>
          )}

          {c.kind === 'add' && (
            <>
              <div><span style={mono}>{c.toEt}</span> is new in the Form here</div>
              {!c.inRecipe && (
                <Button size="sm" variant="outline-primary" className="mt-1 py-0" style={{ fontSize: 10 }} data-testid="diff-add"
                  onClick={() => addRecipeRow(posRef, 'position', { elementTypeRef: c.toEt, _origin: 'form', _formCode: c.toCode }, { asPosition: true })}>
                  Add to {posRef}
                </Button>
              )}
            </>
          )}
        </div>
      ))}

      {creating && (
        <NewETModal
          show
          onHide={() => setCreating(null)}
          contextLabel={`for ${creating.toCode}`}
          draftKey={`diff::${posRef}::${creating.toCode}`}
          importContext={{ code: creating.toCode, manufacturer: creating.maker, positionTypes: who(creating), rowCount: 1 }}
          prefill={{ manufacturer: creating.maker, productCode: creating.toCode }}
          onCreated={etRef => { applyFormChange(creating, posRef, 'swap', { toEt: etRef }); setCreating(null) }}
        />
      )}
    </div>
  )
}
