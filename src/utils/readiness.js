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
    label: 'Nothing that would make the export patch wrong',
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

/** Short labels for the error-severity rules, as [one, many]. Unlisted rules say their id. */
const RULE_LABEL = {
  BLANK_RECIPE_CONTAINER: ['row names no container', 'rows name no container'],
  MISSING_PRODUCT_SPEC_ROW: ['ElementType has no Product Spec row', 'ElementTypes have no Product Spec row'],
  ELEMENT_TYPE_NOT_IN_DB: ['ElementType missing from the DesignDB', 'ElementTypes missing from the DesignDB'],
  MISSING_IS_DESIGN: ['position has no design item', 'positions have no design item'],
  DUPLICATE_IS_DESIGN: ['position has more than one design item', 'positions have more than one design item'],
  ROW_HAS_NO_ROLE: ['row is neither design nor contract item', 'rows are neither design nor contract item'],
  ROW_HAS_BOTH_ROLES: ['row is both design and contract item', 'rows are both design and contract item'],
  DUPLICATE_PRODUCT_CODE: ['product code is used more than once', 'product codes are used more than once'],
  MISSING_LOCKING_LEVER: ['LIN position has no locking lever', 'LIN positions have no locking lever'],
  QTY_AND_DIM_MULT: ['row has both Quantity and a multiplier', 'rows have both Quantity and a multiplier'],
  UNRESOLVED_TEMPLATE_SLOT: ['position has unfilled template slots', 'positions have unfilled template slots'],
  DANGLING_ELEMENT_TYPE_REF: ['reference to a deleted ElementType', 'references to deleted ElementTypes'],
}

/**
 * exportChecklist({ positionTypes, recipes, ignoredPosRefs, worklist, issues, dbQueued, blockingRules })
 *   → [{ key, label, count, posRef, blocking }]
 *
 * The pre-export list: positions without a recipe, Form products not placed, and every
 * error-severity rule, one short line each. `posRef` is the first position to jump to
 * (an ElementType issue resolves to the first position using it), null when none does.
 * `worklist` is formWorklist(); `dbQueued` the lower-cased refs already in the DesignDB
 * patch, whose NOT_IN_DB issue is discharged. Warnings are not listed.
 */
export function exportChecklist({
  positionTypes = [], recipes = [], ignoredPosRefs = new Set(), worklist = [],
  issues = [], dbQueued = new Set(), blockingRules = new Set(),
} = {}) {
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
  const posRefs = new Set(positionTypes.map(p => lc(p.PositionTypeRef || p.positionTypeRef)))
  const firstPos = ref => {
    if (!ref) return null
    if (posRefs.has(lc(ref))) return ref
    const row = recipes.find(r => live(r) && lc(r.ElementTypeRef || r.elementTypeRef) === lc(ref) && posOf(r))
    return row ? posOf(row) : null
  }

  const items = []
  const noRecipe = readiness({ positionTypes, recipes, ignoredPosRefs }).clauses[0]
  if (noRecipe.refs.length) {
    items.push({ key: 'recipes', count: noRecipe.refs.length, posRef: noRecipe.refs[0], blocking: false,
      label: plural(noRecipe.refs.length, 'position has no recipe', 'positions have no recipe') })
  }
  const formLeft = worklist.filter(w => w.missing + (w.pending || 0) > 0)
  const formCount = formLeft.reduce((n, w) => n + w.missing + (w.pending || 0), 0)
  if (formCount) {
    items.push({ key: 'form', count: formCount, posRef: formLeft[0].posRef, blocking: false,
      label: plural(formCount, 'Form product not placed', 'Form products not placed') })
  }

  const byRule = new Map()
  for (const i of issues) {
    if (i.severity !== 'error') continue
    if (i.rule === 'ELEMENT_TYPE_NOT_IN_DB' && dbQueued.has(lc(i.ref))) continue
    if (!byRule.has(i.rule)) byRule.set(i.rule, [])
    byRule.get(i.rule).push(i)
  }
  for (const [rule, list] of byRule) {
    const [one, many] = RULE_LABEL[rule] || [rule, rule]
    items.push({ key: rule, count: list.length, blocking: blockingRules.has(rule),
      posRef: list.map(i => firstPos(i.ref)).find(Boolean) || null,
      label: plural(list.length, one, many) })
  }
  return items
}
