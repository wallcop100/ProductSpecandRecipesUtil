import { useMemo } from 'react'
import useStore from '../store/useStore'
import { formWorklist } from '../utils/formSpec'
import { positionFamilyOf } from '../utils/positionFamily'
import { positionPaintStatus } from '../utils/formPositions'
import { buildRefMap, targetFor } from '../utils/ptResolve'

/**
 * usePositionList — the PositionTypes list, filtered, sorted and grouped by family, with a
 * status per position. One source for the overview and the recipe-view sidebar, so the two
 * can never disagree about what is shown or what state a position is in.
 *
 * status: 'empty' (no recipe rows) · 'form' (the Form asks for something it lacks) ·
 *         'done' (has a recipe, nothing outstanding) · 'ignored' ·
 *         'notInForm' (no recipe, and the loaded Form asks for no product there: F8T5XM)
 */
export const NO_FAMILY = '(no family)'

// Natural, case-insensitive: A2 before A10.
export const byRef = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })

export default function usePositionList() {
  const positionTypes = useStore(s => s.positionTypes)
  const recipes = useStore(s => s.recipes)
  const positionUI = useStore(s => s.positionUI)
  const ignoredPositionFamilies = useStore(s => s.ignoredPositionFamilies)
  const formCaptures = useStore(s => s.formCaptures)
  const containerETRefs = useStore(s => s.containerETRefs)
  const view = useStore(s => s.positionList)
  const importDraft = useStore(s => s.importDraft)

  const countByRef = useMemo(() => {
    const map = {}
    for (const r of recipes) {
      if ((r.IsDeleted || r.isDeleted) === 'Y') continue
      const pr = r.PositionTypeRef || r.positionTypeRef
      if (pr) map[pr] = (map[pr] || 0) + 1
    }
    return map
  }, [recipes])

  const ignoredFamilySet = useMemo(() => new Set(ignoredPositionFamilies || []), [ignoredPositionFamilies])
  const isIgnored = pt => !!positionUI[pt.PositionTypeRef]?.ignored
    || (ignoredFamilySet.size > 0 && ignoredFamilySet.has(positionFamilyOf(pt)))

  const incompleteRefs = useMemo(
    () => new Set(formWorklist(recipes, formCaptures, containerETRefs).map(w => w.posRef)),
    [recipes, formCaptures, containerETRefs])

  // With a Form loaded, an empty position the Form never mentions has nothing to build.
  const formLoaded = !!formCaptures || !!importDraft?.rows?.length
  // "In the Form" means it asks for a product here; rows of only "n/a" ask for nothing.
  const inForm = ref => !!(formCaptures?.byPosition?.[ref]?.length || formCaptures?.pendingByPosition?.[ref]?.length)
    || !['absent', 'noForm', 'nothing'].includes(positionPaintStatus(importDraft, ref, { buildRefMap, targetFor }).state)
  // A Form code here with no ElementType yet (YCU5SZ): saved as pending, or a row of the
  // loaded Form still to confirm (codes the spec knows confirm themselves).
  const needsEt = ref => !!formCaptures?.pendingByPosition?.[ref]?.length
    || positionPaintStatus(importDraft, ref, { buildRefMap, targetFor }).state === 'todo'
  const statusOf = pt => {
    if (isIgnored(pt)) return 'ignored'
    if (!countByRef[pt.PositionTypeRef]) return formLoaded && !inForm(pt.PositionTypeRef) ? 'notInForm' : 'empty'
    if (incompleteRefs.has(pt.PositionTypeRef) || needsEt(pt.PositionTypeRef)) return 'form'
    return 'done'
  }

  const availableTags = useMemo(() => {
    const present = new Set()
    for (const ui of Object.values(positionUI)) for (const t of (ui.tags || [])) present.add(t)
    return [...present].sort((a, b) => a.localeCompare(b))
  }, [positionUI])

  const q = view.text.trim().toLowerCase()
  const visible = positionTypes.filter(pt => {
    const ref = pt.PositionTypeRef || ''
    const name = pt.Name || pt.name || ''
    const tags = positionUI[ref]?.tags || []
    if (view.tags.length > 0 && !view.tags.every(t => tags.includes(t))) return false
    if (view.formOnly && !incompleteRefs.has(ref)) return false
    if (view.emptyOnly && countByRef[ref]) return false
    if (!q) return true
    return ref.toLowerCase().includes(q) || name.toLowerCase().includes(q) || tags.some(t => t.toLowerCase().includes(q))
  })

  const STATUS_ORDER = { form: 0, empty: 1, done: 2, notInForm: 3, ignored: 4 }
  const sortPts = pts => [...pts].sort((a, b) => (view.sort === 'status'
    ? (STATUS_ORDER[statusOf(a)] - STATUS_ORDER[statusOf(b)]) : 0) || byRef(a.PositionTypeRef, b.PositionTypeRef))

  const group = pts => {
    const map = new Map()
    for (const pt of pts) {
      const fam = positionFamilyOf(pt) || NO_FAMILY
      if (!map.has(fam)) map.set(fam, [])
      map.get(fam).push(pt)
    }
    return [...map.entries()].sort(([a], [b]) => byRef(a, b)).map(([fam, list]) => [fam, sortPts(list)])
  }

  const active = visible.filter(pt => !isIgnored(pt))
  const ignored = visible.filter(pt => isIgnored(pt))
  return {
    view, countByRef, incompleteRefs, availableTags, statusOf, isIgnored, ignoredFamilySet,
    active, ignored, groups: group(active), ignoredGroups: group(ignored),
    // Every visible position in display order (families, then within), for ↑ / ↓.
    order: [...group(active), ...(view.showIgnored ? group(ignored) : [])].flatMap(([, list]) => list.map(pt => pt.PositionTypeRef)),
  }
}
