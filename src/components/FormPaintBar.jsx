import React, { useEffect } from 'react'
import { Button } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import StatusChip from './StatusChip'
import IconButton from './IconButton'
import ProductCodeImportScreen from '../screens/ProductCodeImportScreen'
import { positionPaintStatus } from '../utils/formPositions'
import { buildRefMap, targetFor } from '../utils/ptResolve'

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
  const st = positionPaintStatus(importDraft, posRef, { buildRefMap, targetFor })
  // On each position: the painter is open, inline, when it has Form rows to confirm;
  // otherwise closed (known codes save themselves, below).
  useEffect(() => { setOpen(st.state === 'todo') }, [posRef])   // eslint-disable-line react-hooks/exhaustive-deps
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
        {open ? (
          <IconButton bsSize="sm" variant="outline-secondary" icon="close" size={13} onClick={() => setOpen(false)}
            data-testid="paint-close" title="Close the painter" aria-label="Close the painter" />
        ) : state !== 'noForm' ? (
          // Not the task here: a small brush, the explanation in its tooltip.
          <IconButton bsSize="sm" variant={work ? 'primary' : 'outline-secondary'} icon="brush" size={13}
            onClick={() => setOpen(true)} data-testid="paint-position" aria-label={`Paint ${posRef} from the Form`}
            title={`Paint ${posRef}'s product codes from the Form: give each an ElementType, then it goes in the recipe`} />
        ) : <Button size="sm" variant="primary" style={{ fontSize: 10 }}
          onClick={() => setOpen(true)} data-testid="paint-position"
          title="Load the Form spreadsheet once for the project, then paint just this position">
          <MaterialIcon name="upload_file" size={12} /> Load the Form and paint this position
        </Button>}
        {label && !open && (
          <StatusChip size="xs" tone={label.tone} icon={label.icon} data-testid="paint-status"
            label={typeof label.text === 'function' ? label.text(st.newCodes || st.unconfirmed) : label.text} />
        )}
      </div>
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
            embedded={{ posRef, onStaged: targets => { setOpen(false); onStaged?.(targets) } }} />
        </div>
      )}
    </div>
  )
}
