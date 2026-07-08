import React, { useEffect, useRef, useState } from 'react'

/**
 * CodeChips — the paint surface.
 *
 * The field renders as CONTINUOUS TEXT, exactly as typed. Tokens are invisible
 * hit-targets, not chips: you must be able to read "(FPS2020BG2000 (old code
 * 021-1102))" as a sentence to judge that 021-1102 is an old code, not one you want.
 *
 * You pick a colour from the palette, then drag over the text. No modifier keys.
 * Painting is idempotent — to unmark a code, pick Note and paint over it.
 *
 * Props:
 *   row
 *   brush            — 'code' | 'note' | 'discard', the colour you're painting with
 *   onSweep(idxs)    — the tokens the drag covered; the parent applies the brush
 *   suggested        — token indices that look like codes you've already marked
 *   showBoundaries   — reveal token edges
 */

export const BRUSH = {
  code:    { label: 'Code',    bg: '#d1e7dd', fg: '#0f5132', swatch: '#198754' },
  note:    { label: 'Note',    bg: 'transparent', fg: '#212529', swatch: '#adb5bd' },
  discard: { label: 'Discard', bg: 'transparent', fg: '#c7ccd1', swatch: '#dc3545' },
}

/** Tint and weight, never borders — the sentence has to stay readable. */
function roleStyle(role) {
  if (role === 'code') return { background: BRUSH.code.bg, color: BRUSH.code.fg, fontWeight: 700, borderRadius: 2 }
  if (role === 'discard') return { color: BRUSH.discard.fg, textDecoration: 'line-through' }
  return { color: BRUSH.note.fg }
}

export default function CodeChips({ row, brush = 'code', onSweep, suggested = [], showBoundaries = false }) {
  const [drag, setDrag] = useState(null)
  const [hover, setHover] = useState(-1)
  const dragRef = useRef(null)
  dragRef.current = drag

  useEffect(() => {
    function up() {
      const d = dragRef.current
      if (!d) return
      setDrag(null)
      const lo = Math.min(d.from, d.to)
      const hi = Math.max(d.from, d.to)
      const idxs = []
      for (let i = lo; i <= hi; i++) idxs.push(i)
      onSweep(idxs)
    }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [onSweep])

  const suggestedSet = new Set(suggested)
  const inSweep = i => drag && i >= Math.min(drag.from, drag.to) && i <= Math.max(drag.from, drag.to)

  // Rebuild the original string: gaps between tokens render verbatim, so spacing,
  // newlines and punctuation read exactly as typed.
  const parts = []
  let cursor = 0
  row.tokens.forEach((tok, i) => {
    if (tok.start > cursor) {
      parts.push(<span key={`g${i}`} style={{ color: '#868e96' }}>{row.rawText.slice(cursor, tok.start)}</span>)
    }
    const role = row.roles[i]
    const sweeping = inSweep(i)
    const isSuggested = role === 'note' && !sweeping && suggestedSet.has(i)
    const base = roleStyle(sweeping ? brush : role)

    parts.push(
      <span
        key={i}
        onPointerDown={e => { e.preventDefault(); setDrag({ from: i, to: i }) }}
        onPointerEnter={() => { setHover(i); if (drag) setDrag(d => ({ ...d, to: i })) }}
        onPointerLeave={() => setHover(h => (h === i ? -1 : h))}
        title={`“${tok.text}” — ${role}`}
        style={{
          ...base,
          cursor: 'pointer',
          padding: showBoundaries ? '1px 2px' : '1px 0',
          margin: showBoundaries ? '0 1px' : 0,
          outline: showBoundaries ? '1px dotted #ced4da' : 'none',
          // A suggestion looks like a faint version of the Code colour — "this could
          // be a code" — rather than an unexplained blue underline.
          boxShadow: isSuggested
            ? `inset 0 -2px 0 ${BRUSH.code.swatch}`
            : hover === i && !drag && !sweeping
              ? 'inset 0 -2px 0 #adb5bd'
              : 'none',
          opacity: isSuggested ? 0.9 : 1,
        }}
      >
        {tok.text}
      </span>
    )

    cursor = tok.end
  })
  if (cursor < row.rawText.length) {
    parts.push(<span key="tail" style={{ color: '#868e96' }}>{row.rawText.slice(cursor)}</span>)
  }

  return (
    <div style={{
      userSelect: 'none', touchAction: 'none',
      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 15, lineHeight: 2.0,
      cursor: 'crosshair',
    }}>
      {parts}
    </div>
  )
}
