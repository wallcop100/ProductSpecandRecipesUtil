/**
 * validationTasks.js — turn validation ISSUES into the ACTIONS that resolve them.
 *
 * The panel used to list 59 issues on the real project, of which 57 were fixed by two
 * buttons that already existed. It presented a backlog as an emergency. Users reason
 * about *things they must do*, not about *rules that fired*.
 *
 * Three ideas, and they are the whole file:
 *
 *   GROUP BY ACTION   Every issue belongs to the one action that resolves it. 59 rows
 *                     become a handful of tasks with the detail folded underneath.
 *
 *   ONE ACTION, ONE ROW
 *                     Where a single action fixes two rules on the same object, the
 *                     object appears once. A wrapper with no spec row is ALSO absent
 *                     from the DesignDB master; fillWrapperSpecRows() fixes both, so it
 *                     is one task, not two. (Two different actions ⇒ honestly two rows.)
 *
 *   QUEUED ≠ BROKEN   Most fixes mutate psRows/recipes in memory, so their issue simply
 *                     disappears. ELEMENT_TYPE_NOT_IN_DB does not: queueMissingDbRows()
 *                     only fills the patch script, and the workbook stays ignorant until
 *                     you paste it. That issue gets a third state — your obligation is
 *                     discharged, Excel's is not.
 *
 * Pure. Takes issues + the change queues; returns tasks.
 */

const lc = s => String(s ?? '').toLowerCase()

/**
 * Rules whose presence means a pasted patch would produce a WRONG spreadsheet, rather
 * than merely an incomplete one. Everything else is advisory, however loudly it used to
 * render. 45 red errors that block nothing teach a user to ignore red.
 */
export const BLOCKING_RULES = new Set([
  'BLANK_RECIPE_CONTAINER',    // the patch skips blank cells; the row never lands
  'MISSING_IS_DESIGN',         // a position with no design element
  'DUPLICATE_IS_DESIGN',       // a position with two
  'ELEMENT_TYPE_NOT_IN_DB',    // the three documents would ship disagreeing
])

/** The action that resolves a task, and where the bulk button lives. */
export const ACTIONS = {
  COMPLETE_WRAPPERS: 'fillWrapperSpecRows',
  TEACH_MASTER: 'queueMissingDbRows',
  OPEN_SPEC: null,      // per-item: only a human can supply a manufacturer and a code
  GO_TO_POSITION: null, // per-item: the fix is a recipe edit
}

/** Refs already sitting in a change queue, keyed by which workbook they patch. */
export function queuedRefs({ psChanges = [], rsChanges = [], dbChanges = [] } = {}) {
  return {
    ps: new Set(psChanges.map(c => lc(c.elementTypeRef))),
    rs: new Set(rsChanges.map(c => lc(c.positionTypeRef))),
    db: new Set(dbChanges.map(c => lc(c.elementTypeRef))),
  }
}

/**
 * buildTasks(issues, changes) → [{ key, title, hint, action, blocking, items, queued }]
 *
 * `items` are { ref, rule, message, severity, queued }. A task is `queued` when every
 * item in it is.
 */
export function buildTasks(issues = [], changes = {}) {
  const queued = queuedRefs(changes)

  // Which refs a wrapper-completion click would resolve. It appends the Ideaworks / N/A
  // spec row AND queues the DesignDB row, so it absorbs that ref's NOT_IN_DB issue too.
  const wrapperRefs = new Set(
    issues.filter(i => i.rule === 'MISSING_PRODUCT_SPEC_ROW' && i.severity === 'warning').map(i => lc(i.ref))
  )

  const buckets = new Map()
  const put = (key, def, item) => {
    if (!buckets.has(key)) buckets.set(key, { ...def, key, items: [] })
    buckets.get(key).items.push(item)
  }

  for (const issue of issues) {
    const ref = issue.ref
    const base = { ref, rule: issue.rule, message: issue.message, severity: issue.severity, queued: false }

    switch (issue.rule) {
      case 'MISSING_PRODUCT_SPEC_ROW':
        if (issue.severity === 'warning') {
          put('completeWrappers', {
            title: 'wrappers need their Ideaworks / N/A spec row',
            titleOne: 'wrapper needs its Ideaworks / N/A spec row',
            hint: 'A wrapper is a virtual assembly — its contents are what you buy. Nothing here needs deciding.',
            action: ACTIONS.COMPLETE_WRAPPERS,
            blocking: false,
          }, { ...base, queued: queued.ps.has(lc(ref)) })
        } else {
          put('specifyProducts', {
            title: 'products used in a recipe with no Product Spec row',
            titleOne: 'product used in a recipe with no Product Spec row',
            hint: 'Each needs a manufacturer and a product code, which only you know.',
            action: ACTIONS.OPEN_SPEC,
            blocking: false,
          }, base)
        }
        break

      case 'ELEMENT_TYPE_NOT_IN_DB':
        // Absorbed: completing the wrapper teaches the master in the same click.
        if (wrapperRefs.has(lc(ref))) break
        put('teachMaster', {
          title: 'ElementTypes missing from the DesignDB master',
          titleOne: 'ElementType missing from the DesignDB master',
          hint: 'The DesignDB is the master list. These reach it through the ElementTypes patch.',
          action: ACTIONS.TEACH_MASTER,
          blocking: true,
        }, { ...base, queued: queued.db.has(lc(ref)) })
        break

      case 'MISSING_PRODUCT_CODE':
        put('completeSpecRows', {
          title: 'spec rows with no product code',
          titleOne: 'spec row with no product code',
          hint: 'The row exists but says nothing about what to buy. Mark TBC if that is deliberate.',
          action: ACTIONS.OPEN_SPEC,
          blocking: false,
        }, base)
        break

      case 'DUPLICATE_PRODUCT_CODE':
        put('duplicateCodes', {
          title: 'duplicate products',
          titleOne: 'duplicate product',
          hint: 'The same manufacturer and product code on two ElementTypes.',
          action: ACTIONS.OPEN_SPEC,
          blocking: false,
        }, base)
        break

      default:
        // Recipe rules: one task per rule, fixed by going to the position.
        put(`rule:${issue.rule}`, {
          title: issue.rule.toLowerCase().replace(/_/g, ' '),
          hint: null,
          action: ACTIONS.GO_TO_POSITION,
          blocking: BLOCKING_RULES.has(issue.rule),
          fixKind: issue.fixKind,
        }, base)
    }
  }

  const tasks = [...buckets.values()].map(t => ({
    ...t,
    count: t.items.length,
    queued: t.items.length > 0 && t.items.every(i => i.queued),
  }))

  // Blocking first, then the biggest pile: what stops a correct patch, then what costs
  // the most clicks. A fully queued task sinks — it is waiting on Excel, not on you.
  const rank = t => (t.queued ? 2 : t.blocking ? 0 : 1)
  return tasks.sort((a, b) => rank(a) - rank(b) || b.count - a.count || a.key.localeCompare(b.key))
}

/** The task's label for its count. English, not string concatenation. */
export const taskLabel = task => (task.count === 1 && task.titleOne ? task.titleOne : task.title)

/** Headline counts for the panel header and the "am I done" question. */
export function taskSummary(tasks = []) {
  const open = tasks.filter(t => !t.queued)
  return {
    tasks: tasks.length,
    open: open.length,
    blocking: open.filter(t => t.blocking).length,
    issues: tasks.reduce((n, t) => n + t.count, 0),
    queued: tasks.filter(t => t.queued).length,
  }
}
