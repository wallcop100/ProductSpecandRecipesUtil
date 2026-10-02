import React, { useEffect, useRef, useState } from 'react'
import useStore from '../store/useStore'
import ProductCodeImportScreen from '../screens/ProductCodeImportScreen'
import { positionPaintStatus } from '../utils/formPositions'
import { buildRefMap, targetFor } from '../utils/ptResolve'
import { draftKnownEntries } from '../utils/formDone'

/**
 * FormAutoSaveAll — the Form is loaded for the whole project, so every position is brought
 * up to date with it at once (2K4TCY), not only the ones you happen to open: the chip, the
 * ticks and the pane show the true status BEFORE you open the painter, and opening and
 * closing it changes nothing.
 *   - positions whose codes are all known and not saved yet are saved;
 *   - entries whose codes all have an ElementType (spec, this import, an earlier project)
 *     are confirmed, then saved (WYZ3NN);
 *   - a saved position the Form now gives a known product it hasn't got is saved afresh.
 * Rows with codes still to give an ElementType are left for you. Runs Import's own save,
 * hidden; tried once per set of positions.
 */
export default function FormAutoSaveAll() {
  const importDraft = useStore(s => s.importDraft)
  const formCaptures = useStore(s => s.formCaptures)
  const positionTypes = useStore(s => s.positionTypes)
  const psRows = useStore(s => s.psRows)
  const tried = useRef(new Set())
  const refreshed = useRef(new Set())
  const [, bump] = useState(0)
  const loaded = !!importDraft?.rows?.length

  const status = ref => positionPaintStatus(importDraft, ref, { buildRefMap, targetFor })
  // Saved, but the Form now names a known product the save hasn't got: save it afresh.
  const stale = loaded ? positionTypes.map(pt => pt.PositionTypeRef).filter(ref => {
    const saved = formCaptures?.byPosition?.[ref]
    if (!saved || refreshed.current.has(ref)) return false
    const st = status(ref)
    if (!['ready', 'added'].includes(st.state)) return false
    const have = new Set(saved.map(c => String(c.elementTypeRef || '').toUpperCase()))
    return draftKnownEntries(st.formRows, psRows).some(e => !have.has(String(e.elementTypeRef).toUpperCase()))
  }) : []
  const staleKey = stale.join(',')
  useEffect(() => {
    if (!stale.length) return
    for (const ref of stale) refreshed.current.add(ref)
    const formRefs = new Set(stale.flatMap(ref => status(ref).formRefs || []))
    const { saveImportDraft, dropFormCaptures } = useStore.getState()
    const d = useStore.getState().importDraft
    saveImportDraft({ ...d, stagedRefs: (d.stagedRefs || []).filter(f => !formRefs.has(f)) })
      .then(() => dropFormCaptures(stale))
  }, [staleKey])   // eslint-disable-line react-hooks/exhaustive-deps

  if (!loaded) return null
  const waiting = positionTypes.map(pt => pt.PositionTypeRef).filter(ref => {
    const st = status(ref).state
    return st === 'todo' || (st === 'ready' && !formCaptures?.byPosition?.[ref])
  })
  const key = waiting.join(',')
  if (!waiting.length || tried.current.has(key)) return null
  return <OnePass key={key} onDone={() => { tried.current.add(key); bump(n => n + 1) }} />
}

/** One hidden pass, then out of the way: it must not sit beside a painter you open. */
function OnePass({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4000)
    return () => clearTimeout(t)
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div style={{ display: 'none' }} data-testid="form-autosave-all">
      <ProductCodeImportScreen onBack={() => {}} embedded={{ autoSaveAll: true, onStaged: onDone }} />
    </div>
  )
}
