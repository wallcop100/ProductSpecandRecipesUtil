import React from 'react'

/**
 * FormContext — the Form's own columns for one row, as a readable list.
 *
 * Used in two places, deliberately identically: above the paint surface while you review,
 * and in the Side-by-Side pane. It is the same sheet saying the same thing, so it should
 * not look like two different features.
 *
 * The old rendering was `Key: value` in muted grey, one line each, in a single block — a
 * wall you could not scan. The label is now bold and the value sits beside it, truncated
 * with the whole text on hover: the Form does put paragraphs in cells (a FurtherInfo can
 * run to several sentences) and a paragraph must never be allowed to push the actual work
 * off the panel.
 *
 * `columns` fixes the order — sheet order, so the panel reads the way the Form reads.
 */
export default function FormContext({ context = {}, columns = null, style }) {
  const keys = (columns ?? Object.keys(context)).filter(k => {
    const v = context[k]
    return v != null && String(v).trim() !== ''
  })
  if (keys.length === 0) return null

  return (
    <div className="px-2 py-1 rounded" style={{ background: '#f8f9fa', fontSize: 11, ...style }}>
      {keys.map(k => (
        <div key={k} className="d-flex align-items-baseline gap-2" style={{ lineHeight: 1.5 }}>
          <span className="fw-semibold flex-shrink-0" style={{ minWidth: 84 }}>{k}</span>
          <span className="text-truncate" style={{ minWidth: 0, color: '#495057' }}
            title={`${k}: ${String(context[k])}`}>
            {String(context[k])}
          </span>
        </div>
      ))}
    </div>
  )
}
