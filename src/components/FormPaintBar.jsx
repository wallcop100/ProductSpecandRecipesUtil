import React, { useEffect, useRef, useState } from 'react'
import { Button } from 'react-bootstrap'
import useStore from '../store/useStore'
import MaterialIcon from './MaterialIcon'
import ProductCodeImportScreen from '../screens/ProductCodeImportScreen'
import { positionPaintStatus } from '../utils/formPositions'
import { buildRefMap, targetFor } from '../utils/ptResolve'
import { findProductET } from '../utils/productCodes'
import { C } from '../styles/tokens'

/**
 * FormPaintBar — THIS position's Form entries, in the Form spec pane (D4Z9CX, design A).
 *
 * Loading the Form is global (the import session, importDraft): once loaded, every position
 * shows its entries without picking the file again. There is no paint mode: each entry has
 * its own Form data ⇄ Paint face (CompactPositionPainter), and opens in Paint by itself when
 * something there still needs painting. Rows that are all known codes save themselves
 * (`autoSave`), so the comparison below appears without a Save step.
 */
export default function FormPaintBar({ posRef, onStaged, painter = {} }) {
  const importDraft = useStore(s => s.importDraft)
  const formCaptures = useStore(s => s.formCaptures)
  const psRows = useStore(s => s.psRows)
  const [loading, setLoading] = useState(false)   // loading the Form from here, for this position
  const st = positionPaintStatus(importDraft, posRef, { buildRefMap, targetFor, knows: (m, c) => !!findProductET(psRows, m, c) || !!importDraft?.assignments?.[String(c || '').trim().toUpperCase()] })
  // Detached (for the whole project): stop loading with it (S3JLGL).
  const formGen = useStore(s => s.formGen)
  const seenGen = useRef(formGen)
  useEffect(() => { if (formGen !== seenGen.current) { seenGen.current = formGen; setLoading(false) } }, [formGen])

  if (st.state === 'nothing' || st.state === 'absent') {
    return (
      <div className="mb-2 text-muted d-flex align-items-center gap-1 flex-wrap" style={{ fontSize: 11 }} data-testid="form-paint-bar">
        <MaterialIcon name={st.state === 'nothing' ? 'block' : 'remove'} size={12} />
        {st.state === 'nothing'
          ? <>Nothing to add. The Form says: <span style={{ fontFamily: 'monospace', color: C.ink }} data-testid="form-says">{(st.texts || []).join(' · ') || 'n/a'}</span></>
          : <span data-testid="paint-status">{posRef} is not in the Form</span>}
      </div>
    )
  }
  // A Form saved earlier but not loaded in this session: the comparison below is all there is.
  if (st.state === 'noForm' && !loading && formCaptures) return null

  const autoSave = st.state === 'ready' && !formCaptures?.byPosition?.[posRef]
  return (
    <div className="mb-2" data-testid="form-paint-bar">
      {st.state === 'noForm' && !loading ? (
        <Button size="sm" variant="primary" style={{ fontSize: 10 }} onClick={() => setLoading(true)} data-testid="paint-position"
          title="Load the Form spreadsheet once for the project, then paint just this position">
          <MaterialIcon name="upload_file" size={12} /> Load the Form and paint this position
        </Button>
      ) : (
        <ProductCodeImportScreen onBack={() => setLoading(false)}
          embedded={{ posRef, autoSave, quiet: !loading, onStaged: targets => { setLoading(false); onStaged?.(targets) }, ...painter }} />
      )}
    </div>
  )
}
