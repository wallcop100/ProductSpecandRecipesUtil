import React, { useState } from 'react'
import { Button, Offcanvas } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import StatusChip from './StatusChip'
import ProductCodeImportScreen from '../screens/ProductCodeImportScreen'
import { positionPaintStatus } from '../utils/formPositions'
import { buildRefMap, targetFor } from '../utils/ptResolve'

const LABEL = {
  noForm: null,
  absent: { tone: 'neutral', icon: 'remove', text: 'no Form rows' },
  todo: { tone: 'warn', icon: 'brush', text: n => `${n} row${n === 1 ? '' : 's'} to confirm` },
  ready: { tone: 'info', icon: 'playlist_add', text: 'confirmed, not added' },
  added: { tone: 'ok', icon: 'check_circle', text: 'added' },
}

/**
 * FormPaintBar — the Form painter for THIS position, from the builder (D4Z9CX).
 *
 * Loading the Form is global (the import session, importDraft, and the remembered file):
 * once loaded, every position — here or in Import — paints from it without picking the
 * file again. Painting is one position at a time: Import's By position mode, embedded and
 * locked to posRef, in a panel over the recipe. "Add to Product Spec" closes it; the Form
 * spec pane below then shows what to add to the recipe and what is no longer in the Form.
 */
export default function FormPaintBar({ posRef, onStaged }) {
  const importDraft = useStore(s => s.importDraft)
  const formCaptures = useStore(s => s.formCaptures)
  const [open, setOpen] = useState(false)
  const st = positionPaintStatus(importDraft, posRef, { buildRefMap, targetFor })
  // A Form added as a whole (not position by position) still counts as added here.
  const state = st.state === 'ready' && formCaptures?.byPosition?.[posRef] ? 'added' : st.state
  const label = LABEL[state]
  const work = state === 'todo' || state === 'ready'

  return (
    <div className="mb-2" data-testid="form-paint-bar">
      <div className="d-flex align-items-center gap-1 flex-wrap">
        <Button size="sm" variant={work || state === 'noForm' ? 'primary' : 'outline-secondary'} style={{ fontSize: 10 }}
          onClick={() => setOpen(true)} data-testid="paint-position"
          title={state === 'noForm'
            ? 'Load the Form spreadsheet once for the project, then paint just this position'
            : `Paint ${posRef}'s rows of the Form, give its codes ElementTypes, and add them to the Product Spec`}>
          <MaterialIcon name={state === 'noForm' ? 'upload_file' : 'brush'} size={12} />{' '}
          {state === 'noForm' ? 'Load the Form and paint this position' : `Paint ${posRef} from the Form`}
        </Button>
        {label && (
          <StatusChip size="xs" tone={label.tone} icon={label.icon} data-testid="paint-status"
            label={typeof label.text === 'function' ? label.text(st.unconfirmed) : label.text} />
        )}
      </div>
      {/* Mounted only while open: the import session behind it is heavy. */}
      {open && <Offcanvas show onHide={() => setOpen(false)} placement="end" style={{ width: '80vw' }} data-testid="paint-panel">
        <Offcanvas.Header closeButton style={{ padding: '8px 16px' }}>
          <Offcanvas.Title style={{ fontSize: 14 }}>
            <MaterialIcon name="brush" size={16} /> {posRef}: paint its Form rows
          </Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
          <ProductCodeImportScreen onBack={() => setOpen(false)}
            embedded={{ posRef, onStaged: targets => { setOpen(false); onStaged?.(targets) } }} />
        </Offcanvas.Body>
      </Offcanvas>}
    </div>
  )
}
