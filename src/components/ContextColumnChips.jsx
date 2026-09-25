import React, { useState } from 'react'
import MaterialIcon from './MaterialIcon'

/**
 * The Form's other columns for this row, one click from being shown. Only columns this
 * row actually has a value in are offered; ticking one shows it for every row, and the
 * choice becomes the Side-by-Side pane's default when the import is staged.
 */
export default function ContextColumnChips({ context = {}, available = [], shown = [], onChange }) {
  const [open, setOpen] = useState(false)
  const offer = available.filter(c => context[c] != null && String(context[c]).trim() !== '')
  const hidden = offer.filter(c => !shown.includes(c)).length
  if (offer.length === 0) return null
  return (
    <div className="mb-2" style={{ fontSize: 10 }}>
      <button type="button" className="btn btn-link p-0 text-muted" style={{ fontSize: 10 }}
        onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <MaterialIcon name="view_column" size={12} /> {open ? 'Hide column list' : `Columns (${hidden} more)`}
      </button>
      {open && (
        <div className="d-flex flex-wrap gap-1 mt-1" data-testid="context-column-chips">
          {offer.map(c => {
            const on = shown.includes(c)
            return (
              <button key={c} type="button" aria-pressed={on}
                className="btn btn-sm py-0 px-1"
                style={{
                  fontSize: 10, borderRadius: 10,
                  background: on ? '#cfe2ff' : '#fff', color: on ? '#084298' : '#6c757d',
                  border: `1px solid ${on ? '#9ec5fe' : '#dee2e6'}`,
                }}
                onClick={() => onChange(on ? shown.filter(x => x !== c) : available.filter(x => x === c || shown.includes(x)))}>
                {on ? '✓ ' : '+ '}{c}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
