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
 *   placeIn     — position the footer offers to place it in (NewETModal placeIn)
 *   onDone(etRef, where) — called on save; without placeIn the caller inserts the row
 */
export default function NewETWizardModal({ show, onHide, posRef, onDone, placeIn = null }) {
  return (
    <NewETModal
      show={show}
      onHide={onHide}
      formRefs={posRef ? [posRef] : null}
      onCreated={onDone}
      placeIn={placeIn}
      contextLabel={posRef ? `into ${posRef}` : null}
      confirmLabel="Create + add to recipe →"
    />
  )
}
