import React, { useState } from 'react'
import { Form } from 'react-bootstrap'
import MaterialIcon from '../MaterialIcon'
import StatusChip from '../StatusChip'
import CellTokens from './CellTokens'

const CHUNK = 200

/**
 * FormTable — the Form, as the Form: its rows in its order, its columns in its order,
 * with the import's work done in the cells.
 *
 *   columns   [{ key: 'pt' | 'mfr' | 'code' | 'ctx:<name>', label }]
 *   info(row) → { status: { tone, icon, label, tip }, codes: [{ code, main, etRef }],
 *                 pt: { target, state: 'ok' | 'redirect' | 'missing' | 'ambiguous' } }
 *
 * Dumb on purpose: the screen owns the state and passes callbacks. `renderExpanded(row)`
 * is the full painter, shown under an expanded row.
 */
export default function FormTable({
  rows, columns, info, onSetRole, onToggleConfirm, onNeedsET, onFixRef, onMakeMain,
  expandedId, onExpand, renderExpanded, focusId, onFocus,
}) {
  const [limit, setLimit] = useState(CHUNK)
  const shown = rows.slice(0, limit)

  const cell = (row, col, inf) => {
    if (col.key === 'pt') {
      const pt = inf.pt || {}
      return (
        <span className="d-inline-flex align-items-center gap-1" style={{ fontFamily: 'monospace' }}>
          {row.positionType}
          {pt.state === 'redirect' && <span className="text-muted" title="The DesignDB PositionType this Form ref resolves to">→ {pt.target}</span>}
          {(pt.state === 'missing' || pt.state === 'ambiguous') && (
            <StatusChip size="xs" tone="warn" icon="link_off" label={pt.state === 'missing' ? 'no match' : 'which?'}
              tip={pt.state === 'missing' ? 'No PositionType in the DesignDB for this Form ref. Click to choose one.' : 'More than one PositionType claims this ref. Click to choose.'}
              onClick={e => { e.stopPropagation(); onFixRef?.(row.positionType) }} style={{ cursor: 'pointer' }} />
          )}
        </span>
      )
    }
    if (col.key === 'mfr') return row.manufacturer || <span className="text-muted fst-italic">—</span>
    if (col.key === 'code') {
      return (
        <>
          <CellTokens row={row} suggested={inf.suggested} onSetRole={(i, role) => onSetRole(row.id, i, role)} />
          {inf.codes.length > 1 && (
            <div className="d-flex flex-wrap gap-1 mt-1">
              {inf.codes.map(c => (
                <StatusChip key={c.code} size="xs" tone={c.main ? 'info' : 'neutral'} icon={c.main ? 'star' : 'add_link'}
                  aria-label={`${c.code} ${c.main ? 'main' : 'extra — make main'}`} role={c.main ? undefined : 'button'}
                  label={<><span style={{ fontFamily: 'monospace' }}>{c.code}</span> · {c.main ? 'main' : 'extra'}</>}
                  tip={c.main ? 'The main product of this cell' : 'An extra (accessory) of the main product. Click to make it main.'}
                  onClick={c.main ? undefined : e => { e.stopPropagation(); onMakeMain?.(row.id, c.code) }}
                  style={c.main ? undefined : { cursor: 'pointer' }} />
              ))}
            </div>
          )}
        </>
      )
    }
    const v = row.context?.[col.key.slice(4)]
    return v == null ? '' : String(v)
  }

  return (
    <div>
      <table className="table table-sm mb-0" style={{ fontSize: 12 }} data-testid="form-table">
        <thead style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <tr>
            <th style={{ width: 24 }} />
            {columns.map(c => <th key={c.key} className="text-muted fw-semibold" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{c.label}</th>)}
            <th className="text-muted fw-semibold" style={{ fontSize: 11 }}>Status</th>
            <th className="text-muted fw-semibold" style={{ fontSize: 11 }}>ElementType</th>
            <th className="text-muted fw-semibold text-center" style={{ fontSize: 11, width: 40 }} title="Confirmed">
              <MaterialIcon name="check" size={14} />
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.map(row => {
            const inf = info(row)
            const open = expandedId === row.id
            return (
              <React.Fragment key={row.id}>
                <tr data-row-id={row.id} onClick={() => onFocus?.(row.id)}
                  style={{
                    background: focusId === row.id ? '#f1f6ff' : row.confirmed ? '#fafafa' : undefined,
                    opacity: row.confirmed && !open ? 0.75 : 1,
                  }}>
                  <td>
                    <button type="button" className="btn btn-link p-0" aria-label={open ? 'Close painter' : 'Open painter'}
                      aria-expanded={open} title="Paint this cell in detail"
                      onClick={e => { e.stopPropagation(); onExpand(open ? null : row.id) }}>
                      <MaterialIcon name={open ? 'expand_more' : 'chevron_right'} size={16} />
                    </button>
                  </td>
                  {columns.map(c => (
                    <td key={c.key} style={{ verticalAlign: 'top', maxWidth: c.key === 'code' ? 360 : 200 }}>{cell(row, c, inf)}</td>
                  ))}
                  <td style={{ verticalAlign: 'top' }}>
                    <StatusChip size="xs" {...inf.status} />
                  </td>
                  <td style={{ verticalAlign: 'top' }}>
                    {inf.codes.length === 0 && <span className="text-muted">—</span>}
                    {inf.codes.map(c => (
                      <div key={c.code} style={{ fontFamily: 'monospace', fontSize: 11 }}>
                        {c.etRef
                          ? c.etRef
                          : <StatusChip size="xs" tone="warn" icon="help" label="needs ET"
                              tip={`${c.code} has no ElementType yet. Click to choose or create one.`}
                              onClick={e => { e.stopPropagation(); onNeedsET?.(c.code) }} style={{ cursor: 'pointer' }} />}
                      </div>
                    ))}
                  </td>
                  <td className="text-center" style={{ verticalAlign: 'top' }}>
                    <Form.Check type="checkbox" checked={!!row.confirmed} aria-label={`Confirm row ${row.positionType || row.id}`}
                      onClick={e => e.stopPropagation()} onChange={() => onToggleConfirm(row.id)} />
                  </td>
                </tr>
                {open && (
                  <tr>
                    <td colSpan={columns.length + 4} style={{ background: '#fcfcfd' }}>{renderExpanded(row)}</td>
                  </tr>
                )}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
      {rows.length > limit && (
        <button type="button" className="btn btn-link btn-sm" onClick={() => setLimit(l => l + CHUNK)}>
          Show {Math.min(CHUNK, rows.length - limit)} more of {rows.length - limit}
        </button>
      )}
      {rows.length === 0 && <div className="text-muted fst-italic p-2">No rows match.</div>}
    </div>
  )
}
