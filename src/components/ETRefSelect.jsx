import React, { useId, useMemo, useState } from 'react'
import { Form } from 'react-bootstrap'
import useStore, { collectAllETRefs } from '../store/useStore'

/**
 * ETRefSelect — typeahead for choosing (or typing) an element type ref.
 *
 * Backed by a native datalist over every known ref (element types, product-spec
 * rows, and refs already used in recipes), but free text is allowed so a brand
 * new ref can be defined inline. Commits on Enter or blur; Escape cancels.
 *
 * Props:
 *   initial      - starting text (default '')
 *   onCommit(ref)- called with the trimmed ref when committed (ignored if empty)
 *   onCancel()   - optional; called on Escape or blur-with-empty
 *   placeholder, autoFocus, size ('sm' default), style
 */
export default function ETRefSelect({
  initial = '',
  onCommit,
  onCancel,
  placeholder = 'Element type ref…',
  autoFocus = true,
  size = 'sm',
  style,
}) {
  const elementTypes = useStore(s => s.elementTypes)
  const psRows = useStore(s => s.psRows)
  const recipes = useStore(s => s.recipes)

  const listId = useId()
  const [value, setValue] = useState(initial)

  const candidates = useMemo(
    () => collectAllETRefs(elementTypes, psRows, recipes).sort((a, b) => a.localeCompare(b)),
    [elementTypes, psRows, recipes]
  )

  function commit() {
    const trimmed = value.trim()
    if (trimmed) onCommit?.(trimmed)
    else onCancel?.()
  }

  return (
    <>
      <Form.Control
        size={size}
        list={listId}
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        style={style}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit() }
          else if (e.key === 'Escape') { e.preventDefault(); onCancel?.() }
        }}
        onBlur={commit}
      />
      <datalist id={listId}>
        {candidates.map(ref => <option key={ref} value={ref} />)}
      </datalist>
    </>
  )
}
