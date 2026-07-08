import React from 'react'
import NewETModal from './NewETModal'

/**
 * NewETWizardModal — the position-flavoured framing of NewETModal.
 *
 * All create-ET behaviour lives in NewETModal (one create path, no drift); this
 * only supplies the position context label and the caller's confirm wording.
 *
 * Props:
 *   show, onHide
 *   posRef      — originating position (for context label)
 *   sectionKey  — section the new row will land in (unused here; kept for callers)
 *   onDone(etRef) — called on save; caller inserts the row + opens AddAnywhereModal
 */
export default function NewETWizardModal({ show, onHide, posRef, onDone }) {
  return (
    <NewETModal
      show={show}
      onHide={onHide}
      onCreated={onDone}
      contextLabel={posRef ? `into ${posRef}` : null}
      confirmLabel="Create + Add to positions →"
    />
  )
}
