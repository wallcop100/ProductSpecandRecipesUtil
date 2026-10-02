import React, { useEffect, useRef, useState } from 'react'
import { Button } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import StatusChip from './StatusChip'
import IconButton from './IconButton'
import ProductCodeImportScreen from '../screens/ProductCodeImportScreen'
import { positionPaintStatus } from '../utils/formPositions'
import { buildRefMap, targetFor } from '../utils/ptResolve'
import { findProductET } from '../utils/productCodes'

const LABEL = {
  noForm: null,
  absent: { tone: 'neutral', icon: 'remove', text: 'not in the Form' },
  todo: { tone: 'warn', icon: 'category', text: n => `${n} code${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} an ElementType` },
  ready: { tone: 'info', icon: 'playlist_add', text: 'ready to add' },
  added: { tone: 'ok', icon: 'check_circle', text: 'added' },
  nothing: { tone: 'neutral', icon: 'block', text: 'nothing to add' },
}

/**
 * FormPaintBar — the Form painter for THIS position, from the builder (D4Z9CX).
 *
 * Loading the Form is global (the import session, importDraft, and the remembered file):
 * once loaded, every position — here or in Import — paints from it without picking the
 * file again. Painting is one position at a time: Import's By position mode, embedded and
 * locked to posRef, INLINE in the Form spec pane and condensed to fit it (`open` is the
 * pane's). "Add to Product Spec" closes it; the pane then shows what to add to the
 * recipe and what is no longer in the Form.
 */
export default function FormPaintBar({ posRef, open = false, onOpenChange = () => {}, onStaged }) {
  const importDraft = useStore(s => s.importDraft)
  const formCaptures = useStore(s => s.formCaptures)
  const setOpen = onOpenChange
  // Opened on a Form already loaded (not to load one): a re-save on opening keeps it open.
  const onLoaded = useRef(false)
  const [allCols, setAllCols] = useState(false)    // the Form's other columns, behind ⋯
  const psRows = useStore(s => s.psRows)
  const st = positionPaintStatus(importDraft, posRef, { buildRefMap, targetFor, knows: (m, c) => !!findProductET(psRows, m, c) })
  // On each position: the painter is open, inline, when it has Form rows to confirm;
  // otherwise closed (known codes save themselves, below).
  useEffect(() => { setOpen(st.state === 'todo') }, [posRef])   // eslint-disable-line react-hooks/exhaustive-deps
  // Detached (for the whole project): the painter closes with it (S3JLGL).
  const formGen = useStore(s => s.formGen)
  const seenGen = useRef(formGen)
  useEffect(() => { if (formGen !== seenGen.current) { seenGen.current = formGen; setOpen(false) } }, [formGen])   // eslint-disable-line react-hooks/exhaustive-deps
  // A Form added as a whole (not position by position) still counts as added here.
  const state = st.state === 'ready' && formCaptures?.byPosition?.[posRef] ? 'added' : st.state
  const label = LABEL[state]
  const work = state === 'todo' || state === 'ready'
  const autoSave = st.state === 'ready' && !formCaptures?.byPosition?.[posRef]

  // Nothing to paint here: no button, just what the Form says (n/a, by others) or that it is
  // not in the Form at all.
  if (state === 'nothing' || state === 'absent') {
    return (
      <div className="mb-2 text-muted d-flex align-items-center gap-1 flex-wrap" style={{ fontSize: 11 }} data-testid="form-paint-bar">
        <MaterialIcon name={state === 'nothing' ? 'block' : 'remove'} size={12} />
        {state === 'nothing'
          ? <>Nothing to add. The Form says: <span style={{ fontFamily: 'monospace', color: '#495057' }} data-testid="form-says">{(st.texts || []).join(' · ') || 'n/a'}</span></>
          : <span data-testid="paint-status">{posRef} is not in the Form</span>}
      </div>
    )
  }

  return (
    <div className="mb-2" data-testid="form-paint-bar">
      <div className="d-flex align-items-center gap-1 flex-wrap">
        {state !== 'noForm' ? (
          // Paint mode is a toggle: the brush, lit while painting (W24D3V).
          <IconButton bsSize="sm" variant={open ? 'primary' : work ? 'outline-primary' : 'outline-secondary'} icon="brush" size={13}
            onClick={() => { onLoaded.current = true; setOpen(!open) }} data-testid="paint-position" aria-pressed={open}
            aria-label={open ? 'Stop painting' : `Paint ${posRef} from the Form`}
            title={open ? 'Stop painting' : `Paint ${posRef}'s product codes from the Form: give each an ElementType, then it goes in the recipe`} />
        ) : <Button size="sm" variant="primary" style={{ fontSize: 10 }}
          onClick={() => { onLoaded.current = false; setOpen(true) }} data-testid="paint-position"
          title="Load the Form spreadsheet once for the project, then paint just this position">
          <MaterialIcon name="upload_file" size={12} /> Load the Form and paint this position
        </Button>}
        {label && !open && (
          <StatusChip size="xs" tone={label.tone} icon={label.icon} data-testid="paint-status"
            label={typeof label.text === 'function' ? label.text(st.newCodes || st.unconfirmed) : label.text} />
        )}
      </div>
      {/* What the Form says here, raw and plain; the painter (the brush) only when needed. */}
      {!open && state !== 'noForm' && st.cells?.some(c => c.length) && (() => {
        const more = st.cells.some(row => row.some(c => c.more))
        return (
          <div className="mt-1 d-flex align-items-start gap-1" style={{ fontSize: 11 }} data-testid="form-raw">
            <div style={{ flex: 1, minWidth: 0 }}>
              {st.cells.map(row => row.filter(c => allCols || !c.more)).filter(row => row.length).map((row, i) => (
                <div key={i} className={i ? 'border-top pt-1 mt-1' : ''}
                  style={{ display: 'grid', gridTemplateColumns: 'minmax(0, max-content) 1fr', columnGap: 8 }}>
                  {row.map(({ col, value, more: m }) => (
                    <React.Fragment key={col}>
                      <span className="text-muted text-truncate" style={{ fontSize: 10, maxWidth: 120, fontStyle: m ? 'italic' : undefined }} title={col}>{col}</span>
                      <span style={{ fontFamily: 'monospace', color: m ? '#6c757d' : '#495057', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{value}</span>
                    </React.Fragment>
                  ))}
                </div>
              ))}
            </div>
            {more && (
              <IconButton bsSize="sm" variant={allCols ? 'secondary' : 'outline-secondary'} icon="more_horiz" size={12}
                onClick={() => setAllCols(v => !v)} aria-pressed={allCols} data-testid="form-raw-more"
                aria-label={allCols ? 'Fewer Form columns' : 'All Form columns'} title={allCols ? 'Just manufacturer, product code and accessories' : 'Show the Form\'s other columns'} />
            )}
          </div>
        )
      })()}
      {/* Every row already known, not saved here yet: save it without asking, out of sight,
          so the comparison below appears. Nothing to paint, so the painter stays shut. */}
      {!open && autoSave && (
        <div style={{ display: 'none' }} data-testid="form-autosave">
          <ProductCodeImportScreen onBack={() => {}} embedded={{ posRef, autoSave: true, onStaged }} />
        </div>
      )}
      {open && (
        <div className="mt-1 ps-2" style={{ borderLeft: '2px solid #0d6efd' }} data-testid="paint-panel">
          <ProductCodeImportScreen onBack={() => setOpen(false)}
            embedded={{ posRef, quiet: onLoaded.current, onStaged: targets => { setOpen(false); onStaged?.(targets) } }} />
        </div>
      )}
    </div>
  )
}
