import React, { useSyncExternalStore } from 'react'
import { ProgressBar } from 'react-bootstrap'
import { onParsing, parsingCount } from '../utils/backend'
import { C } from '../styles/tokens'

/** Thin bar pinned to the top while a spreadsheet is being read (the read runs in a worker). */
export default function ParsingBar() {
  const busy = useSyncExternalStore(onParsing, parsingCount) > 0
  if (!busy) return null
  return (
    <div role="status" aria-live="polite" data-testid="parsing-bar"
      style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 2100 }}>
      <ProgressBar animated striped now={100} style={{ height: 4, borderRadius: 0 }} aria-label="Reading spreadsheet" />
      <span style={{ position: 'absolute', top: 6, left: '50%', transform: 'translateX(-50%)', fontSize: 12,
        padding: '2px 10px', borderRadius: 10, background: 'var(--bs-primary)', color: C.surface }}>Reading spreadsheet…</span>
    </div>
  )
}
