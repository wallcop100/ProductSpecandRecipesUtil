import { useMemo } from 'react'
import useStore from '../store/useStore'
import { templateRecords, templatesFor, specificityScope } from '../utils/templateRules'
import { readDismissed, writeDismissed } from './RecipeSuggestions'

const hintKey = posRef => `template-hint|${posRef}`

/** Templates that fit each of `refs` (Map posRef → { matches, others }), computed once per change of the data. */
export default function useTemplateMatches(refs) {
  const templates = useStore(s => s.templates)
  const positionTypes = useStore(s => s.positionTypes)
  const recipes = useStore(s => s.recipes)
  const psRows = useStore(s => s.psRows)
  const elementTypes = useStore(s => s.elementTypes)
  const positionUI = useStore(s => s.positionUI)
  const formCaptures = useStore(s => s.formCaptures)
  const key = refs.join('|')
  return useMemo(() => {
    const out = new Map()
    if (!refs.length || !templates?.length) return out
    const state = { templates, positionTypes, recipes, psRows, elementTypes, positionUI, formCaptures }
    const records = templateRecords(state)
    const scope = specificityScope(records.values())
    for (const ref of refs) out.set(ref, templatesFor(ref, { ...state, records, scope }))
    return out
  }, [key, templates, positionTypes, recipes, psRows, elementTypes, positionUI, formCaptures])   // eslint-disable-line react-hooks/exhaustive-deps
}

/** Positions whose hint was dismissed (this project, this browser — as the suggestion hides are). */
export function useHintsOff() {
  const projectNumber = useStore(s => s.projectNumber)
  const version = useStore(s => s.templateHintVersion)
  return useMemo(() => readDismissed(projectNumber), [projectNumber, version])   // eslint-disable-line react-hooks/exhaustive-deps
}

export function dismissTemplateHint(posRef) {
  const n = useStore.getState().projectNumber
  writeDismissed(n, new Set([...readDismissed(n), hintKey(posRef)]))
  useStore.setState(s => ({ templateHintVersion: (s.templateHintVersion || 0) + 1 }))
}

export const hintOff = (off, posRef) => off.has(hintKey(posRef))

/** Open the drawer on the Templates tab for a position. */
export function openTemplates(posRef) {
  const st = useStore.getState()
  if (posRef) st.setActivePosition(posRef)
  st.setDrawerTab('templates')
}

/**
 * The store's `_templateRecOf()` / `_connectorOpts()`, subscribed to everything they read. Calling
 * them through getState() inside a useMemo goes stale: the memo keeps the old answer until an
 * unrelated dependency changes (a click elsewhere).
 */
export function useTemplateRecOf() {
  const positionTypes = useStore(s => s.positionTypes)
  const recipes = useStore(s => s.recipes)
  const psRows = useStore(s => s.psRows)
  const elementTypes = useStore(s => s.elementTypes)
  const positionUI = useStore(s => s.positionUI)
  const connectorFamilies = useStore(s => s.connectorFamilies)
  const formCaptures = useStore(s => s.formCaptures)
  return useMemo(() => useStore.getState()._templateRecOf(),
    [positionTypes, recipes, psRows, elementTypes, positionUI, connectorFamilies, formCaptures])   // eslint-disable-line react-hooks/exhaustive-deps
}

export function useConnectorOpts() {
  const elementTypes = useStore(s => s.elementTypes)
  const connectorFamilies = useStore(s => s.connectorFamilies)
  return useMemo(() => useStore.getState()._connectorOpts(), [elementTypes, connectorFamilies])   // eslint-disable-line react-hooks/exhaustive-deps
}

/** The store's alignmentGaps(), recomputed when any slice it reads changes (see useTemplateRecOf). */
export function useAlignmentGaps(on = true) {
  const elementTypes = useStore(s => s.elementTypes); const psRows = useStore(s => s.psRows)
  const recipes = useStore(s => s.recipes); const containerETRefs = useStore(s => s.containerETRefs)
  const dbCollectionRefs = useStore(s => s.dbCollectionRefs); const positionTypes = useStore(s => s.positionTypes)
  const positionUI = useStore(s => s.positionUI); const ignored = useStore(s => s.ignoredPositionFamilies)
  return useMemo(() => (on ? useStore.getState().alignmentGaps() : null),
    [on, elementTypes, psRows, recipes, containerETRefs, dbCollectionRefs, positionTypes, positionUI, ignored])   // eslint-disable-line react-hooks/exhaustive-deps
}
