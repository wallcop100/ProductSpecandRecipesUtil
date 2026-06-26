import React, { useState } from 'react'
import { Form, Badge } from 'react-bootstrap'

/**
 * TagInput — free-form tag editor. Type a tag and press Enter to add; click a
 * chip's × to remove. A datalist of palette suggestions aids consistency, but
 * any string is allowed. All chips render as Bootstrap `secondary`.
 *
 * Props:
 *   value: string[]            — current tags
 *   onChange(next: string[])   — called with the updated list
 *   palette: string[]          — suggestions for the datalist + quick-add row
 *   placeholder, disabled
 */
let listSeq = 0
export default function TagInput({ value = [], onChange, palette = [], placeholder = 'Add tag…', disabled = false }) {
  const [text, setText] = useState('')
  const [listId] = useState(() => `taginput-list-${++listSeq}`)

  function add(tag) {
    const t = (tag ?? '').trim()
    if (!t || value.includes(t)) { setText(''); return }
    onChange([...value, t])
    setText('')
  }
  function remove(tag) {
    onChange(value.filter(t => t !== tag))
  }

  const suggestions = palette.filter(p => !value.includes(p))

  return (
    <div>
      <div className="d-flex flex-wrap gap-1 mb-2">
        {value.length === 0 && <span className="text-muted small fst-italic">no tags</span>}
        {value.map(t => (
          <Badge key={t} bg="secondary" style={{ fontWeight: 500, cursor: disabled ? 'default' : 'pointer' }}
            onClick={() => !disabled && remove(t)} title={disabled ? '' : 'Remove'}>
            {t}{!disabled && ' ×'}
          </Badge>
        ))}
      </div>
      {!disabled && (
        <>
          <Form.Control
            size="sm"
            list={listId}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(text) } }}
            placeholder={placeholder}
            style={{ maxWidth: 280 }}
          />
          <datalist id={listId}>
            {suggestions.map(p => <option key={p} value={p} />)}
          </datalist>
          {suggestions.length > 0 && (
            <div className="d-flex flex-wrap gap-1 mt-2">
              {suggestions.slice(0, 12).map(p => (
                <Badge key={p} bg="light" text="dark" style={{ cursor: 'pointer', border: '1px solid #dee2e6', fontWeight: 400 }}
                  onClick={() => add(p)} title="Add">
                  + {p}
                </Badge>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
