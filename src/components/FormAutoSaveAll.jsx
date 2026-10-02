import React, { useRef } from 'react'
import useStore from '../store/useStore'
import ProductCodeImportScreen from '../screens/ProductCodeImportScreen'
import { positionPaintStatus } from '../utils/formPositions'
import { buildRefMap, targetFor } from '../utils/ptResolve'

/**
 * FormAutoSaveAll — the Form is loaded for the whole project, so every position whose rows
 * are all known codes is saved to it at once (2K4TCY), not only the ones you happen to open:
 * the progress chip and the dots count the whole Form. Rows with new codes are left for you.
 * Runs Import's own save, hidden; tried once per set of positions.
 */
export default function FormAutoSaveAll() {
  const importDraft = useStore(s => s.importDraft)
  const formCaptures = useStore(s => s.formCaptures)
  const positionTypes = useStore(s => s.positionTypes)
  const tried = useRef(new Set())
  if (!importDraft?.rows?.length) return null
  const waiting = positionTypes.map(pt => pt.PositionTypeRef).filter(ref =>
    !formCaptures?.byPosition?.[ref] && positionPaintStatus(importDraft, ref, { buildRefMap, targetFor }).state === 'ready')
  const key = waiting.join(',')
  if (!waiting.length || tried.current.has(key)) return null
  return (
    <div style={{ display: 'none' }} data-testid="form-autosave-all">
      <ProductCodeImportScreen onBack={() => {}} embedded={{ autoSaveAll: true, onStaged: () => tried.current.add(key) }} />
    </div>
  )
}
