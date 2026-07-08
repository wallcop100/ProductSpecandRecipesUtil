import React from 'react'
import { Button, Form } from 'react-bootstrap'
import MaterialIcon from './MaterialIcon'
import { BRUSH } from './CodeChips'

/**
 * PaintPalette — pick a colour, drag over the text. That's the whole instruction.
 *
 * A persistent brush replaces modifier keys: you spend 99% of the time painting
 * codes, so holding Shift for the other 1% was backwards. The scope switch
 * ("every row" vs "this row") replaces holding Alt.
 */

const ORDER = ['code', 'note', 'discard']
const HINT = {
  code: 'part of a product code',
  note: 'kept as a note on the code',
  discard: 'thrown away',
}

export default function PaintPalette({
  brush, onBrush, scope, onScope,
  suggestedCount = 0, onAcceptSuggestions,
  showBoundaries, onShowBoundaries,
  undo, onUndo,
  showScope = true, showBoundaryToggle = true,
}) {
  return (
    <div className="mb-2">
      <div className="d-flex align-items-center flex-wrap gap-2">
        <div className="d-flex rounded overflow-hidden" style={{ border: '1px solid #dee2e6' }}>
          {ORDER.map((r, i) => {
            const b = BRUSH[r]
            const active = brush === r
            return (
              <button key={r} type="button" onClick={() => onBrush(r)}
                title={`Paint ${b.label.toLowerCase()} — ${HINT[r]}  (${i + 1})`}
                className="d-inline-flex align-items-center gap-2 px-3 py-1 border-0"
                style={{
                  background: active ? b.swatch : '#fff',
                  color: active ? '#fff' : '#495057',
                  fontWeight: active ? 600 : 400,
                  fontSize: 12,
                  borderRight: i < 2 ? '1px solid #dee2e6' : 'none',
                }}>
                <span style={{
                  width: 11, height: 11, borderRadius: 3, flexShrink: 0,
                  background: active ? '#fff' : b.swatch,
                  border: r === 'note' ? '1px solid #ced4da' : 'none',
                }} />
                {b.label}
                <kbd style={{ fontSize: 9, opacity: 0.7 }}>{i + 1}</kbd>
              </button>
            )
          })}
        </div>

        <span className="text-muted" style={{ fontSize: 12 }}>
          <MaterialIcon name="draw" size={14} style={{ verticalAlign: 'text-bottom' }} /> drag over the text
        </span>

        {/* Scope replaces holding Alt. */}
        {showScope && (
          <Form.Select size="sm" value={scope} onChange={e => onScope(e.target.value)}
            style={{ width: 'auto', fontSize: 11 }}
            title="Painting can teach the whole batch, or apply only here">
            <option value="batch">applies to every row</option>
            <option value="row">this row only</option>
          </Form.Select>
        )}

        {suggestedCount > 0 && (
          <Button size="sm" variant="outline-success" style={{ fontSize: 11 }} onClick={onAcceptSuggestions}
            title="Tokens underlined green look like codes you already marked">
            Accept {suggestedCount} suggested {suggestedCount === 1 ? 'code' : 'codes'} <kbd>A</kbd>
          </Button>
        )}

        {showBoundaryToggle && (
          <Form.Check type="switch" id="show-token-edges" className="ms-auto"
            checked={showBoundaries} onChange={e => onShowBoundaries(e.target.checked)}
            label={<span style={{ fontSize: 11 }}>Token edges</span>} />
        )}
      </div>

      {undo && (
        <div className="d-flex align-items-center gap-2 mt-2 px-2 py-1 rounded"
          style={{ background: '#fff3cd', border: '1px solid #ffe69c', fontSize: 11 }}>
          <MaterialIcon name="history" size={13} />
          <span>
            Painted <strong style={{ fontFamily: 'monospace' }}>{undo.label}</strong> as{' '}
            <strong>{undo.role}</strong> in {undo.scope}
          </span>
          <Button size="sm" variant="outline-secondary" className="ms-auto"
            style={{ fontSize: 10, padding: '0 6px' }} onClick={onUndo}>
            Undo
          </Button>
        </div>
      )}
    </div>
  )
}
