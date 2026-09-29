import React, { useMemo, useRef, useState } from 'react'
import { Button, ButtonGroup, Form } from 'react-bootstrap'
import MaterialIcon from '../MaterialIcon'

const DOT = {
  todo:  { color: '#adb5bd', label: 'to do' },
  ready: { color: '#0d6efd', label: 'ready to add' },
  done:  { color: '#198754', label: 'done' },
}

/**
 * FormPositionList — the Form's positions for "By position" import: pick one (click) or
 * several (Ctrl/⌘-click, Shift-click for a range), and take them end to end.
 *
 *   positions [{ formRef, target, rows, status: 'todo' | 'ready' | 'done' }]
 *   selected  Set of formRefs · onSelect(Set)
 */
export default function FormPositionList({ positions, selected, onSelect }) {
  const [show, setShow] = useState('all')   // all | todo | ready | done
  const [q, setQ] = useState('')
  const anchor = useRef(null)
  const counts = useMemo(() => positions.reduce((c, p) => ({ ...c, [p.status]: (c[p.status] || 0) + 1 }), {}), [positions])
  const list = positions.filter(p => (show === 'all' || p.status === show)
    && (!q || `${p.formRef} ${p.target || ''}`.toLowerCase().includes(q.toLowerCase())))

  function click(e, p) {
    const refs = list.map(x => x.formRef)
    if (e.shiftKey && anchor.current != null) {
      const [a, b] = [refs.indexOf(anchor.current), refs.indexOf(p.formRef)].sort((x, y) => x - y)
      if (a >= 0) { onSelect(new Set([...selected, ...refs.slice(a, b + 1)])); return }
    }
    anchor.current = p.formRef
    if (e.ctrlKey || e.metaKey) {
      const next = new Set(selected)
      if (next.has(p.formRef)) next.delete(p.formRef); else next.add(p.formRef)
      onSelect(next)
    } else onSelect(new Set([p.formRef]))
  }

  const nextTodo = positions.find(p => p.status !== 'done')
  const done = counts.done || 0

  return (
    <div className="d-flex flex-column h-100" style={{ fontSize: 12 }} data-testid="form-position-list">
      <div className="d-flex align-items-center gap-1 mb-1">
        <strong style={{ fontSize: 12 }}>Positions</strong>
        <span className="text-muted ms-1" style={{ fontSize: 11 }}>{done}/{positions.length} done</span>
      </div>
      <div className="progress mb-2" style={{ height: 4 }}>
        <div className="progress-bar bg-success" style={{ width: `${positions.length ? (100 * done) / positions.length : 0}%` }} />
      </div>
      <Form.Control size="sm" value={q} onChange={e => setQ(e.target.value)} placeholder="Find a position…"
        aria-label="Find a position" style={{ fontSize: 12 }} className="mb-1" />
      <ButtonGroup size="sm" className="mb-1" aria-label="Show positions">
        {[['all', 'All'], ['todo', 'To do'], ['ready', 'Ready'], ['done', 'Done']].map(([k, label]) => (
          <Button key={k} variant={show === k ? 'primary' : 'outline-secondary'} style={{ fontSize: 10, padding: '1px 5px' }}
            onClick={() => setShow(k)}>{label}{k !== 'all' ? ` ${counts[k] || 0}` : ''}</Button>
        ))}
      </ButtonGroup>
      {nextTodo && (
        <Button size="sm" variant="link" className="p-0 mb-1 text-start" style={{ fontSize: 11 }}
          onClick={() => { anchor.current = nextTodo.formRef; onSelect(new Set([nextTodo.formRef])) }}>
          <MaterialIcon name="arrow_forward" size={12} /> Next to do: {nextTodo.formRef}
        </Button>
      )}
      <div style={{ overflowY: 'auto', flex: 1 }} role="listbox" aria-multiselectable="true" aria-label="Form positions">
        {list.map(p => {
          const on = selected.has(p.formRef)
          return (
            <div key={p.formRef} role="option" aria-selected={on} data-status={p.status} data-ref={p.formRef}
              onClick={e => click(e, p)} title={`${p.formRef}: ${DOT[p.status].label} · ${p.rows.length} row${p.rows.length === 1 ? '' : 's'}`}
              className="d-flex align-items-center gap-2 px-2 py-1 rounded"
              style={{ cursor: 'pointer', background: on ? '#cfe2ff' : undefined, userSelect: 'none' }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: DOT[p.status].color, flexShrink: 0 }} />
              <span style={{ fontFamily: 'monospace' }}>{p.formRef || '(no ref)'}</span>
              {p.target && p.target !== p.formRef && <span className="text-muted" style={{ fontSize: 10 }}>→ {p.target}</span>}
              <span className="ms-auto text-muted" style={{ fontSize: 10 }}>{p.rows.length}</span>
            </div>
          )
        })}
        {list.length === 0 && <div className="text-muted fst-italic p-2">None.</div>}
      </div>
      <div className="text-muted mt-1" style={{ fontSize: 10 }}>Click one; Ctrl-click or Shift-click for several.</div>
    </div>
  )
}
