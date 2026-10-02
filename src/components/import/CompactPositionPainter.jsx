import React from 'react'
import { Button, Form } from 'react-bootstrap'
import useStore from '../../store/useStore'
import MaterialIcon from '../MaterialIcon'
import CellTokens from './CellTokens'
import { positionRecipeWithWrapperInternals } from '../../utils/collectionStatus'

const mono = { fontFamily: 'monospace' }
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

/**
 * CompactPositionPainter — one position's Form, in the builder's Form spec pane (D4Z9CX),
 * reduced to ONE call to action: give each new product code an ElementType.
 *
 *   - known codes are always listed, one line each: code → ElementType · in the recipe or not;
 *   - each new code has the one primary button, "Give <code> an ElementType" (it confirms
 *     the code's Form entry and opens the ElementTypes window at it);
 *   - no Save: once every code has an ElementType the import screen saves the position
 *     itself (embedded auto-save), and the pane moves on to the recipe check.
 * Clicking a word still switches it code / note / discard, for a code read wrongly. A tick
 * box is only offered where an entry holds no code at all — there it is the one action.
 * The import screen owns the state; this only draws it.
 */
export default function CompactPositionPainter({ posRef, rows, info, onSetRole, onToggleConfirm, onNeedsET, onMakeMain }) {
  const recipes = useStore(s => s.recipes)
  if (!rows.length) {
    return <div className="text-muted fst-italic" style={{ fontSize: 11 }} data-testid="embedded-no-rows">The Form gives no product code for {posRef}.</div>
  }
  const have = new Set(positionRecipeWithWrapperInternals(recipes, posRef).combined
    .filter(r => (r.IsDeleted || r.isDeleted) !== 'Y').map(r => String(r.ElementTypeRef || r.elementTypeRef || '').toLowerCase()))
  const inRecipe = ref => have.has(String(ref).toLowerCase())

  const infos = rows.map(r => ({ row: r, inf: info(r) }))
  // Every entry says "n/a", "by others"…: nothing to add, nothing to ask (859SCF).
  if (infos.every(({ inf }) => inf.codes.length === 0 && inf.status?.icon === 'block')) {
    return (
      <div className="text-muted" style={{ fontSize: 11 }} data-testid="compact-nothing">
        <MaterialIcon name="block" size={12} /> Nothing to add: the Form has no product for {posRef}.
      </div>
    )
  }
  const needEt = infos.flatMap(({ inf }) => inf.codes.filter(c => !c.etRef)).length

  // Every Form entry, with its words to paint (5FGNH2: also the ones already settled, so
  // opening the painter always shows something to paint), then each code it reads:
  // settled ones as code → ElementType · in the recipe or not, new ones with the button.
  return (
    <div style={{ fontSize: 11 }} data-testid="compact-painter">
      {needEt > 0 && (
        <div className="fw-semibold mb-1" style={{ color: '#664d03' }} data-testid="compact-summary">
          <MaterialIcon name="warning" size={13} /> {plural(needEt, 'code')} need{needEt === 1 ? 's' : ''} an ElementType
        </div>
      )}

      {infos.map(({ row, inf }) => (
        <div key={row.id} className="py-1 border-bottom" data-testid="compact-row">
          <div className="d-flex align-items-start gap-1">
            <div style={{ flex: 1, minWidth: 0 }}>
              {row.manufacturer && <div className="text-muted" style={{ fontSize: 10 }}>{row.manufacturer}</div>}
              <CellTokens row={row} suggested={inf.suggested} onSetRole={(i, role) => onSetRole(row.id, i, role)} />
            </div>
            {/* No code in this entry at all: the tick is the only thing to do with it. */}
            {inf.codes.length === 0 && (
              <Form.Check type="checkbox" checked={!!row.confirmed} onChange={() => onToggleConfirm(row.id)}
                aria-label={`Confirm row ${row.id + 1}`} title={row.confirmed ? 'Confirmed' : 'Confirm: no product here'} />
            )}
          </div>
          {inf.codes.length === 0 && (
            <div className="text-muted" style={{ fontSize: 10 }}>
              {inf.suggested?.length && !row.confirmed ? 'Underlined words look like codes: click one to use it' : (inf.status?.label || 'no code')}
            </div>
          )}
          {inf.codes.some(c => c.etRef) && (
            <div className="mt-1" data-testid="compact-known">
              {inf.codes.filter(c => c.etRef).map(c => (
                <div key={c.code} className="d-flex align-items-center gap-1" style={{ fontSize: 10 }} data-testid="known-code">
                  {inf.codes.length > 1 && <MainStar c={c} onMakeMain={() => onMakeMain(row.id, c.code)} />}
                  <MaterialIcon name="check_circle" size={12} style={{ color: '#198754' }} />
                  <span style={{ ...mono, fontWeight: 600 }}>{c.code}</span> → <span style={mono}>{c.etRef}</span>
                  <span className="text-muted">· {inRecipe(c.etRef) ? 'in the recipe' : 'not in the recipe yet'}</span>
                </div>
              ))}
            </div>
          )}
          {inf.codes.filter(c => !c.etRef).map(c => (
            <div key={c.code} className="d-flex align-items-center gap-1 flex-wrap mt-1">
              {inf.codes.length > 1 && <MainStar c={c} onMakeMain={() => onMakeMain(row.id, c.code)} />}
              <Button size="sm" variant="primary" className="py-0" style={{ fontSize: 11 }} data-testid="give-et"
                onClick={() => onNeedsET(c.code)}>
                Give <span style={mono}>{c.code}</span> an ElementType
              </Button>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

/** Main product or extra, for an entry with several codes: click an extra to make it main. */
function MainStar({ c, onMakeMain }) {
  return (
    <span role={c.main ? undefined : 'button'} title={c.main ? 'Main product' : 'Extra: click to make it the main product'}
      style={{ color: c.main ? '#0d6efd' : '#adb5bd', cursor: c.main ? 'default' : 'pointer' }}
      onClick={c.main ? undefined : onMakeMain}>
      <MaterialIcon name={c.main ? 'star' : 'star_border'} size={11} />
    </span>
  )
}
