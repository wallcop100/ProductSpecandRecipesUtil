/**
 * readiness.js — "Am I done?"
 *
 * The end state was fully computable and never stated. Every part of the answer already
 * existed, in four different places, and the user had to assemble it by eye:
 *
 *   1. Every non-ignored position has a recipe.        (recipes)
 *   2. Every product the Form asks for is placed.      (formProgress)
 *   3. Nothing blocks a correct patch.                 (validationTasks)
 *   4. Every ElementType exists in all three documents. (alignmentGaps)
 *
 * A clause is `done` when there is nothing left for the USER to do. Clause 4 is `queued`
 * when the fix is sitting in a patch script waiting to be pasted — discharged by you,
 * outstanding for Excel. That distinction is the whole reason this is not a percentage.
 *
 * Pure. Everything is passed in; nothing is recomputed that a caller already has.
 */

const lc = s => String(s ?? '').toLowerCase()
const live = r => (r.IsDeleted || r.isDeleted) !== 'Y'
const posOf = r => r.PositionTypeRef || r.positionTypeRef || ''

export const CLAUSE = {
  RECIPES: 'recipes',
  FORM: 'form',
  VALIDATION: 'validation',
  ALIGNMENT: 'alignment',
}

/**
 * readiness({ positionTypes, recipes, ignoredPosRefs, formProgress, tasks, gaps })
 *   → { clauses: [{ key, label, done, queued, detail, remaining }], done, blocking }
 *
 * `formProgress` may be null — no Form attached, so the clause does not apply and is
 * reported as such rather than silently passing.
 */
export function readiness({
  positionTypes = [],
  recipes = [],
  ignoredPosRefs = new Set(),
  formProgress = null,
  tasks = [],
  gaps = null,
} = {}) {
  const clauses = []

  // 1 — every non-ignored position has a recipe.
  //
  // A PositionType claimed as someone else's ExtRef has DELEGATED its recipe: the
  // DesignDB says C01r answers to C01, and the recipe lives on C01r. C01 having no
  // recipe of its own is the convention working, not a gap. Eight of project 5642's
  // "21 positions with no recipe" are exactly this, and reporting them would teach the
  // user to distrust the panel.
  const delegated = new Set(
    positionTypes.map(p => lc(p.ExtRef || p.extRef)).filter(Boolean)
  )
  const withRecipe = new Set(recipes.filter(live).map(r => lc(posOf(r))).filter(Boolean))
  const inScope = positionTypes
    .map(p => p.PositionTypeRef || p.positionTypeRef)
    .filter(ref => ref && !ignoredPosRefs.has(lc(ref)) && !delegated.has(lc(ref)))
  const without = inScope.filter(ref => !withRecipe.has(lc(ref)))
  clauses.push({
    key: CLAUSE.RECIPES,
    label: 'Every position has a recipe',
    done: without.length === 0 && inScope.length > 0,
    queued: false,
    remaining: without.length,
    detail: inScope.length === 0
      ? 'No positions in scope.'
      : without.length === 0
        ? `All ${inScope.length} positions.`
        : `${without.length} of ${inScope.length} have none: ${without.slice(0, 4).join(', ')}${without.length > 4 ? '…' : ''}`,
    refs: without,
  })

  // 2 — every Form product is placed. Pending products are blocked on an ElementType,
  //     which is still your work, so they count against you.
  if (!formProgress) {
    clauses.push({
      key: CLAUSE.FORM,
      label: 'Every Form product is placed',
      done: false, queued: false, notApplicable: true, remaining: 0,
      detail: 'No Form template attached.',
      refs: [],
    })
  } else {
    const left = formProgress.missing + (formProgress.pending || 0)
    clauses.push({
      key: CLAUSE.FORM,
      label: 'Every Form product is placed',
      done: left === 0,
      queued: false,
      remaining: left,
      detail: left === 0
        ? `All ${formProgress.total} positions reconciled.`
        : `${formProgress.complete}/${formProgress.total} positions · ${formProgress.missing} to add`
          + (formProgress.pending ? `, ${formProgress.pending} still need an ElementType` : ''),
      refs: [],
    })
  }

  // 3 — nothing blocks a correct patch. Advisory tasks do not stop you shipping.
  const blocking = tasks.filter(t => t.blocking && !t.queued)
  clauses.push({
    key: CLAUSE.VALIDATION,
    label: 'Nothing blocks a correct patch',
    done: blocking.length === 0,
    queued: false,
    remaining: blocking.reduce((n, t) => n + t.count, 0),
    detail: blocking.length === 0
      ? 'No blocking issues.'
      : blocking.map(t => `${t.count} ${t.title}`).join(' · '),
    refs: [],
  })

  // 4 — the three documents agree. Queued means you have done your part.
  if (gaps) {
    const specGaps = gaps.specRows.wrappers.length + gaps.specRows.products.length
    const dbGaps = gaps.dbRows.length
    const dbTask = tasks.find(t => t.key === 'teachMaster')
    const dbQueued = dbGaps > 0 && !!dbTask?.queued
    clauses.push({
      key: CLAUSE.ALIGNMENT,
      label: 'Every ElementType exists in all three documents',
      done: specGaps === 0 && dbGaps === 0,
      queued: specGaps === 0 && dbQueued,
      remaining: specGaps + dbGaps,
      detail: specGaps === 0 && dbGaps === 0
        ? 'DesignDB, Product Spec and Recipes agree.'
        : dbQueued && specGaps === 0
          ? `${dbGaps} queued in the ElementTypes patch — paste it in Excel.`
          : [
              specGaps > 0 && `${specGaps} need a Product Spec row`,
              dbGaps > 0 && `${dbGaps} missing from the DesignDB`,
            ].filter(Boolean).join(' · '),
      refs: [],
    })
  }

  const actionable = clauses.filter(c => !c.notApplicable)
  return {
    clauses,
    // Done means nothing is left for YOU. A queued clause is done on your side.
    done: actionable.length > 0 && actionable.every(c => c.done || c.queued),
    blocking: blocking.reduce((n, t) => n + t.count, 0),
    waiting: clauses.filter(c => c.queued && !c.done).length,
  }
}
