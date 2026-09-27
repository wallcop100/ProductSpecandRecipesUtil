import React from 'react'
import { roleStyle } from '../CodeChips'

const NEXT = { code: 'note', note: 'discard', discard: 'code' }

/**
 * CellTokens — a Form cell as it reads, with each word painted by its role. Click a word
 * to cycle it code → note → discard, for this row only. The full painter (drag, brushes,
 * teach every row) lives in the expanded row.
 */
export default function CellTokens({ row, onSetRole, suggested = [] }) {
  const sug = new Set(suggested)
  const parts = []
  let cursor = 0
  row.tokens.forEach((tok, i) => {
    if (tok.start > cursor) parts.push(<span key={`g${i}`} style={{ color: '#868e96' }}>{row.rawText.slice(cursor, tok.start)}</span>)
    const role = row.roles[i]
    // Pre-selected by the tool and not yet touched: dashed, so a guess reads as a guess.
    const pre = role === 'code' && row.pre?.[i] === 'code' && !row.overrides?.[i]
    parts.push(
      <span key={i} role="button" tabIndex={-1}
        onClick={e => { e.stopPropagation(); onSetRole?.(i, NEXT[role] || 'code') }}
        title={`“${tok.text}” — ${role}${pre ? ' (pre-selected)' : ''}. Click to make it ${NEXT[role]}.`}
        data-role={role}
        style={{
          ...roleStyle(role), cursor: 'pointer', padding: '0 1px',
          boxShadow: role === 'note' && sug.has(i) ? 'inset 0 -2px 0 #198754' : 'none',
          ...(pre ? { outline: '1px dashed currentColor', outlineOffset: -1 } : {}),
        }}>
        {tok.text}
      </span>
    )
    cursor = tok.end
  })
  if (cursor < row.rawText.length) parts.push(<span key="tail" style={{ color: '#868e96' }}>{row.rawText.slice(cursor)}</span>)
  return (
    <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12, lineHeight: 1.7 }}>
      {parts}
    </div>
  )
}
