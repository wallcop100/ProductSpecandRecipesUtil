import React, { useState } from 'react'
import { Button, Form } from 'react-bootstrap'
import MaterialIcon from '../MaterialIcon'
import IconButton from '../IconButton'
import CellTokens from './CellTokens'

/**
 * CompactPositionPainter — one position's Form rows, condensed to fit the builder's Form
 * spec pane (D4Z9CX). Each row is a card: the cell's words (click one to cycle code →
 * note → discard), each code with its ElementType or "needs ET", and a confirm tick.
 * Rows the Product Spec already settles (confirmed, every code with an ElementType) fold
 * into one line: on an existing spec you are here for the NEW codes.
 * The import screen owns the state; this only draws it.
 */
export default function CompactPositionPainter(props) {
  const [showDone, setShowDone] = useState(false)
  return <Painter {...props} showDone={showDone} setShowDone={setShowDone} />
}

function Painter({ showDone, setShowDone,
  posRef, rows, info, selection, easyLeft, adding,
  onSetRole, onToggleConfirm, onNeedsET, onMakeMain, onConfirmObvious, onAdd, onUndo, onRedo, canUndo, canRedo,
}) {
  if (!rows.length) {
    return <div className="text-muted fst-italic" style={{ fontSize: 11 }} data-testid="embedded-no-rows">The Form has no rows for {posRef}.</div>
  }
  const unconfirmed = rows.filter(r => !r.confirmed).length
  const settled = r => r.confirmed && (() => { const c = info(r).codes; return c.length > 0 && c.every(x => x.etRef) })()
  const done = rows.filter(settled)
  // Every row says "n/a", "by others"…: no product, so no Add to call for attention (859SCF).
  const nothing = rows.every(r => info(r).codes.length === 0 && info(r).status?.icon === 'block')
  const shown = showDone ? rows : rows.filter(r => !settled(r))
  return (
    <div style={{ fontSize: 11 }} data-testid="compact-painter">
      <div className="d-flex align-items-center gap-2 mb-1">
        <span className="text-muted">{rows.length} row{rows.length === 1 ? '' : 's'}{unconfirmed ? ` · ${unconfirmed} to confirm` : ''}</span>
        {easyLeft > 0 && (
          <Button size="sm" variant="link" className="p-0" style={{ fontSize: 11 }} onClick={onConfirmObvious}>
            confirm {easyLeft} obvious
          </Button>
        )}
        <span className="ms-auto d-inline-flex">
          <IconButton icon="undo" size={14} title="Undo" aria-label="Undo" disabled={!canUndo} onClick={onUndo} />
          <IconButton icon="redo" size={14} title="Redo" aria-label="Redo" disabled={!canRedo} onClick={onRedo} />
        </span>
      </div>

      {done.length > 0 && (
        <div className="d-flex align-items-center gap-1 py-1 border-bottom" style={{ color: '#0f5132' }} data-testid="compact-done">
          <MaterialIcon name="check_circle" size={13} />
          <span>{done.length === rows.length ? 'Every row is' : `${done.length} row${done.length === 1 ? ' is' : 's are'}`} in the Product Spec already</span>
          <Button size="sm" variant="link" className="p-0 ms-auto" style={{ fontSize: 10 }} onClick={() => setShowDone(v => !v)}>
            {showDone ? 'hide' : 'show'}
          </Button>
        </div>
      )}
      {shown.map(row => {
        const inf = info(row)
        return (
          <div key={row.id} className="py-1 border-bottom" data-testid="compact-row">
            <div className="d-flex align-items-start gap-1">
              <div style={{ flex: 1, minWidth: 0 }}>
                {row.manufacturer && <div className="text-muted" style={{ fontSize: 10 }}>{row.manufacturer}</div>}
                <CellTokens row={row} suggested={inf.suggested} onSetRole={(i, role) => onSetRole(row.id, i, role)} />
              </div>
              <Form.Check type="checkbox" checked={!!row.confirmed} onChange={() => onToggleConfirm(row.id)}
                aria-label={`Confirm row ${row.id + 1}`} title={row.confirmed ? 'Confirmed' : 'Confirm this row'} />
            </div>
            {inf.codes.length === 0 && (inf.suggested?.length && !row.confirmed
              ? <div style={{ fontSize: 10, color: '#198754' }}>tick to take the {inf.suggested.length} suggested (underlined)</div>
              : <div className="text-muted" style={{ fontSize: 10 }}>{inf.status?.label || 'no code'}</div>)}
            {inf.codes.map(c => (
              <div key={c.code} className="d-flex align-items-center gap-1 flex-wrap" style={{ fontSize: 10 }}>
                {inf.codes.length > 1 && (
                  <span role={c.main ? undefined : 'button'} title={c.main ? 'Main product' : 'Extra: click to make it the main product'}
                    style={{ color: c.main ? '#0d6efd' : '#adb5bd', cursor: c.main ? 'default' : 'pointer' }}
                    onClick={c.main ? undefined : () => onMakeMain(row.id, c.code)}>
                    <MaterialIcon name={c.main ? 'star' : 'star_border'} size={11} />
                  </span>
                )}
                <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{c.code}</span>
                <span className="text-muted">→</span>
                {c.etRef
                  ? <span style={{ fontFamily: 'monospace', color: '#0f5132' }}>{c.etRef}</span>
                  : <Button size="sm" variant="link" className="p-0" style={{ fontSize: 10, color: '#856404' }}
                      onClick={() => onNeedsET(c.code)}>needs an ElementType</Button>}
              </div>
            ))}
          </div>
        )
      })}

      {nothing ? (
        <div className="text-muted mt-1" data-testid="compact-nothing">
          <MaterialIcon name="block" size={12} /> Nothing to add: the Form has no product for {posRef}.
        </div>
      ) : (<>
      <Button size="sm" variant="primary" className="mt-2" style={{ fontSize: 11 }} disabled={!selection?.ready || adding}
        onClick={onAdd} data-testid="add-and-build"
        title={selection?.ready ? `Write ${posRef}'s Product Spec rows` : 'Confirm every row and give every code an ElementType first'}>
        <MaterialIcon name="playlist_add" size={13} /> Add to Product Spec
      </Button>
      {selection && !selection.ready && (selection.noEt > 0 || selection.clashes > 0) && (
        <span className="text-muted ms-2" style={{ fontSize: 10 }}>
          {[selection.noEt && `${selection.noEt} need an ElementType`, selection.clashes && `${selection.clashes} clash${selection.clashes === 1 ? '' : 'es'}`].filter(Boolean).join(' · ')}
        </span>
      )}
      </>)}
    </div>
  )
}
